"""Cleaning preview request and response contracts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from omnisight.api.schemas.datasets import (
    DatasetSummary,
    DatasetHistoryResponse,
)

class CleaningPreviewRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=100)

    parameters: dict[str, Any] = Field(
        default_factory=dict
    )

    expected_version: int = Field(ge=0)


class PreviewSnapshot(BaseModel):
    column_ids: list[str]
    columns: list[str]
    rows: list[list[Any]]

    truncated_columns: int


class InvalidValueExample(BaseModel):
    row: int
    original_value: Any


class CleaningImpact(BaseModel):
    rows_before: int
    rows_after: int

    missing_before: int
    missing_after: int

    affected_rows: int
    removed_rows: int
    introduced_nulls: int

    conversion_success_percent: float | None = None

    estimated_result_memory_bytes: int


class CleaningPreviewResponse(BaseModel):
    dataset_id: str
    dataset_version: int

    kind: str
    label: str
    parameters: dict[str, Any]

    preview_token: str | None = None
    expires_in_seconds: int | None = None

    can_apply: bool
    changes_detected: bool

    validation_error: str | None = None
    warnings: list[str]

    simulated_policy: str | None = None
    comparison_mode: str

    impact: CleaningImpact
    details: dict[str, Any]

    invalid_examples: list[InvalidValueExample]

    before: PreviewSnapshot
    after: PreviewSnapshot

class CleaningCommitRequest(BaseModel):
    """Commit one previously previewed operation."""

    preview_token: str = Field(
        min_length=10,
        max_length=256,
    )

    expected_version: int = Field(ge=0)


class CleaningVersionRequest(BaseModel):
    """Request for Undo or Reset."""

    expected_version: int = Field(ge=0)


class CleaningMutationResponse(BaseModel):
    """Unified response for dataset mutation endpoints."""

    action: Literal["apply", "undo", "reset"]

    dataset: DatasetSummary
    history: DatasetHistoryResponse

    # ID of the committed or undone operation.
    # Reset has no individual operation ID.
    operation_id: str | None = None

class CleaningOperationDefinition(BaseModel):
    kind: str
    label: str
    category: str
    requires_preview: bool
    changes_schema: bool