"""Short-lived authorization records for cleaning previews."""

from __future__ import annotations

import copy
import secrets
import time

from dataclasses import dataclass
from typing import Any

from omnisight.services.datasets import DatasetState


@dataclass(frozen=True)
class CleaningPreviewTicket:
    token: str

    dataset_id: str
    dataset_version: int

    kind: str
    parameters: dict[str, Any]

    expires_at: float


class PreviewTicketError(Exception):
    """Raised when a preview token cannot be used."""


def create_preview_ticket(
    dataset: DatasetState,
    kind: str,
    parameters: dict[str, Any],
    ttl_seconds: int,
) -> CleaningPreviewTicket:
    """Bind a preview to the current dataset revision."""

    if ttl_seconds <= 0:
        raise ValueError(
            "Preview expiration must be positive."
        )

    return CleaningPreviewTicket(
        token=secrets.token_urlsafe(32),
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        kind=kind,
        parameters=copy.deepcopy(parameters),
        expires_at=time.monotonic() + ttl_seconds,
    )


def validate_preview_ticket(
    ticket: CleaningPreviewTicket | None,
    token: str,
    dataset: DatasetState,
) -> CleaningPreviewTicket:
    """
    Validate a pending preview.

    The caller must also hold the owning session's lock.
    """

    if ticket is None:
        raise PreviewTicketError(
            "No pending cleaning preview exists."
        )

    if not secrets.compare_digest(ticket.token, token):
        raise PreviewTicketError(
            "Invalid preview token."
        )

    if time.monotonic() >= ticket.expires_at:
        raise PreviewTicketError(
            "Cleaning preview has expired."
        )

    if ticket.dataset_id != dataset.id:
        raise PreviewTicketError(
            "Preview belongs to another dataset."
        )

    if ticket.dataset_version != dataset.version:
        raise PreviewTicketError(
            "Dataset changed after preview generation."
        )

    return ticket