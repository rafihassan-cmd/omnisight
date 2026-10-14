"""Read-only cleaning preview endpoints."""

from __future__ import annotations
from dataclasses import asdict

import copy

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from omnisight.config import settings

from omnisight.api.deps import (
    get_active_session,
    require_mutation_header,
)

from omnisight.api.schemas.datasets import (
    serialize_dataset,
    serialize_dataset_history,
)

from omnisight.api.schemas.cleaning import (
    CleaningPreviewRequest,
    CleaningPreviewResponse,
    CleaningCommitRequest,
    CleaningOperationDefinition,
    CleaningVersionRequest,
    CleaningMutationResponse,
)

from omnisight.core.changes.registry import (
    get_change_definition,
    list_change_definitions,
    UnsupportedChange,
)

from omnisight.core.changes.cleaning import (
    CleaningValidationError,
)

from omnisight.core.changes.engine import (
    ColumnNotFound,
    ColumnNameConflict,
    InvalidColumnName,
)

from omnisight.core.changes.preview import (
    build_cleaning_preview,
)

from omnisight.services.cleaning import (
    create_preview_ticket,
    validate_preview_ticket,
    PreviewTicketError,
)

from omnisight.services.datasets import (
    DatasetVersionConflict,
    DatasetMemoryLimitError,
    UndoUnavailable,
    check_dataset_version,
    commit_dataset_change,
    undo_dataset_change,
    reset_dataset_changes,
)

from omnisight.services.sessions import SessionState


router = APIRouter(
    prefix="/cleaning",
    tags=["Cleaning"],
)


@router.post(
    "/preview",
    response_model=CleaningPreviewResponse,
    dependencies=[Depends(require_mutation_header)],
)
def preview_cleaning(
    body: CleaningPreviewRequest,
    session: SessionState = Depends(get_active_session),
):
    """
    Simulate a dataset operation without committing it.
    """

    with session.lock:
        # A new preview attempt invalidates the previous one.
        session.pending_preview = None

        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        if dataset.version != body.expected_version:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Dataset version conflict.",
                    "current_version": dataset.version,
                },
            )

        try:
            definition = get_change_definition(
                body.kind
            )

            parameters = copy.deepcopy(
                body.parameters
            )

            report = build_cleaning_preview(
                dataframe=dataset.current,
                column_ids=dataset.column_ids,
                kind=body.kind,
                parameters=parameters,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
                sample_rows=(
                    settings.cleaning_preview_sample_rows
                ),
                sample_columns=(
                    settings.cleaning_preview_sample_columns
                ),
            )

        except (
            UnsupportedChange,
            CleaningValidationError,
            ColumnNotFound,
            ColumnNameConflict,
            InvalidColumnName,
        ) as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        preview_token = None
        expires_in = None

        if report["can_apply"]:
            ticket = create_preview_ticket(
                dataset=dataset,
                kind=body.kind,
                parameters=parameters,
                ttl_seconds=(
                    settings.cleaning_preview_ttl_seconds
                ),
            )

            session.pending_preview = ticket

            preview_token = ticket.token
            expires_in = (
                settings.cleaning_preview_ttl_seconds
            )

        return CleaningPreviewResponse(
            dataset_id=dataset.id,
            dataset_version=dataset.version,
            label=definition.label,
            preview_token=preview_token,
            expires_in_seconds=expires_in,
            **report,
        )

def mutation_response(
    action: str,
    dataset,
    operation_id: str | None = None,
) -> CleaningMutationResponse:
    """Build a consistent response after a mutation."""

    return CleaningMutationResponse(
        action=action,
        dataset=serialize_dataset(dataset),
        history=serialize_dataset_history(dataset),
        operation_id=operation_id,
    )

@router.post(
    "/apply",
    response_model=CleaningMutationResponse,
    dependencies=[Depends(require_mutation_header)],
)
def apply_cleaning(
    body: CleaningCommitRequest,
    session: SessionState = Depends(get_active_session),
):
    """Commit an operation authorized by a preview token."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            check_dataset_version(
                dataset,
                body.expected_version,
            )
        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        try:
            ticket = validate_preview_ticket(
                ticket=session.pending_preview,
                token=body.preview_token,
                dataset=dataset,
            )
        except PreviewTicketError as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        # Consume the ticket before executing the commit.
        # It cannot be reused, even if execution fails.
        session.pending_preview = None

        try:
            updated, record = commit_dataset_change(
                dataset=dataset,
                kind=ticket.kind,
                parameters=ticket.parameters,
                expected_version=ticket.dataset_version,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
            )

        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

        except (
            UnsupportedChange,
            CleaningValidationError,
            ColumnNotFound,
            ColumnNameConflict,
            InvalidColumnName,
        ) as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        if record is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "The operation produced no changes. "
                    "Generate a new preview."
                ),
            )

        return mutation_response(
            action="apply",
            dataset=updated,
            operation_id=record.id,
        )

@router.post(
    "/undo",
    response_model=CleaningMutationResponse,
    dependencies=[Depends(require_mutation_header)],
)
def undo_cleaning(
    body: CleaningVersionRequest,
    session: SessionState = Depends(get_active_session),
):
    """Undo the most recently committed dataset change."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            check_dataset_version(
                dataset,
                body.expected_version,
            )
        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        # Undo changes the effective dataset state,
        # so any pending preview must be discarded.
        session.pending_preview = None

        try:
            updated, undone_record = undo_dataset_change(
                dataset=dataset,
                expected_version=body.expected_version,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
            )

        except UndoUnavailable as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

        except (
            UnsupportedChange,
            CleaningValidationError,
            ColumnNotFound,
            ColumnNameConflict,
            InvalidColumnName,
        ) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot replay history: {exc}",
            ) from exc

        return mutation_response(
            action="undo",
            dataset=updated,
            operation_id=undone_record.id,
        )

@router.post(
    "/reset",
    response_model=CleaningMutationResponse,
    dependencies=[Depends(require_mutation_header)],
)
def reset_cleaning(
    body: CleaningVersionRequest,
    session: SessionState = Depends(get_active_session),
):
    """Restore the originally uploaded CSV dataset."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            check_dataset_version(
                dataset,
                body.expected_version,
            )
        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        session.pending_preview = None

        try:
            updated, _changed = reset_dataset_changes(
                dataset=dataset,
                expected_version=body.expected_version,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
            )

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

        return mutation_response(
            action="reset",
            dataset=updated,
        )

@router.get(
    "/operations",
    response_model=list[CleaningOperationDefinition],
)
def get_cleaning_operations(
    session: SessionState = Depends(get_active_session),
):
    """List cleaning operations available to the UI."""

    definitions = list_change_definitions()

    return [
        asdict(definition)
        for definition in definitions
        if definition.requires_preview
    ]