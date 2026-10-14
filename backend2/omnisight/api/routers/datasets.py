"""Dataset upload and lifecycle endpoints."""

from __future__ import annotations

from io import BytesIO
from urllib.parse import unquote

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
)
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from omnisight.config import settings
from omnisight.api.deps import (
    get_active_session,
    get_session_store,
    require_mutation_header,
)
from omnisight.core.changes.engine import (
    CannotDropLastColumn,
    ColumnNotFound,
)
from omnisight.api.schemas.datasets import (
    DatasetSummary,
    DatasetProfileResponse,
    RenameColumnRequest,
    serialize_dataset,
    DeleteColumnRequest,
)
from omnisight.core.io import (
    CSVParseError,
    DatasetMemoryLimitError,
    parse_csv,
)
from omnisight.services.datasets import (
    create_dataset,
    profile_dataset,
    rename_dataset_column,
    DatasetVersionConflict,
    DatasetMemoryLimitError,
    ColumnNotFound,
    ColumnNameConflict,
    InvalidColumnName,
    commit_dataset_change,
    
)
from omnisight.services.sessions import (
    SessionState,
    SessionStore,
)
from omnisight.api.schemas.datasets import (
    DatasetHistoryResponse,
    serialize_dataset_history,
)


router = APIRouter(
    prefix="/datasets",
    tags=["Datasets"],
)


def extract_filename(request: Request) -> str:
    """Read and validate the filename header."""

    raw_name = request.headers.get(
        "X-OmniSight-Filename"
    )

    if not raw_name:
        raise HTTPException(
            status_code=400,
            detail="CSV filename header is required.",
        )

    filename = unquote(raw_name)

    # Do not trust client-supplied paths.
    filename = filename.replace("\\", "/").split("/")[-1]

    if (
        not filename
        or len(filename) > 255
        or any(ord(char) < 32 or ord(char) == 127
               for char in filename)
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid CSV filename.",
        )

    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=415,
            detail="Only .csv files are supported.",
        )

    return filename


@router.post(
    "",
    response_model=DatasetSummary,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    request: Request,
    session: SessionState = Depends(get_active_session),
    store: SessionStore = Depends(get_session_store),
    _: None = Depends(require_mutation_header),
):
    """
    Accept a raw CSV request body without disk storage.
    """

    content_type = request.headers.get(
        "content-type", ""
    ).split(";")[0].strip().lower()

    if content_type not in (
        "text/csv",
        "application/octet-stream",
    ):
        raise HTTPException(
            status_code=415,
            detail="Expected a raw CSV request body.",
        )

    filename = extract_filename(request)

    max_bytes = settings.max_upload_bytes

    # Reject oversized requests immediately when the
    # client supplies a Content-Length header.
    content_length = request.headers.get(
        "content-length"
    )

    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid Content-Length header.",
            )

        if declared_size < 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid Content-Length header.",
            )

        if declared_size > max_bytes:
            raise HTTPException(
                status_code=413,
                detail="CSV exceeds the 50 MB upload limit.",
            )

    # BytesIO keeps uploaded bytes in application memory.
    with BytesIO() as buffer:
        total_bytes = 0

        try:
            async for chunk in request.stream():
                if not chunk:
                    continue

                if total_bytes + len(chunk) > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "CSV exceeds the 50 MB upload limit."
                        ),
                    )

                buffer.write(chunk)
                total_bytes += len(chunk)

        except ClientDisconnect:
            raise HTTPException(
                status_code=400,
                detail="Upload connection was interrupted.",
            )

        if total_bytes == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded CSV is empty.",
            )

        try:
            dataframe, memory_bytes = (
                await run_in_threadpool(
                    parse_csv,
                    buffer,
                    settings.max_dataset_memory_bytes,
                )
            )

        except CSVParseError as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

    # The CSV buffer is released after parsing.
    dataset = create_dataset(
        filename=filename,
        dataframe=dataframe,
        source_size_bytes=total_bytes,
        estimated_memory_bytes=memory_bytes,
    )

    # Attach only after parsing succeeds.
    # A concurrent logout or expiration is respected.
    attached = store.replace_dataset(
        session.token,
        dataset,
    )

    if not attached:
        raise HTTPException(
            status_code=401,
            detail="Session expired during upload.",
        )

    return serialize_dataset(dataset)


@router.get(
    "/current",
    response_model=DatasetSummary,
)
def get_current_dataset(
    session: SessionState = Depends(get_active_session),
):
    """Return metadata for the active dataset."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        return serialize_dataset(dataset)


@router.delete(
    "/current",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_current_dataset(
    session: SessionState = Depends(get_active_session),
    store: SessionStore = Depends(get_session_store),
    _: None = Depends(require_mutation_header),
):
    """Delete the dataset while preserving the session."""

    removed = store.remove_dataset(session.token)

    if not removed:
        raise HTTPException(
            status_code=401,
            detail="Session expired.",
        )

@router.get(
    "/current/profile",
    response_model=DatasetProfileResponse,
)
def get_current_dataset_profile(
    session: SessionState = Depends(get_active_session),
):
    """Return the current dataset's analytical profile."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        return profile_dataset(dataset)

@router.patch(
    "/current/columns/{column_id}",
    response_model=DatasetSummary,
    dependencies=[Depends(require_mutation_header)],
)
def rename_column(
    column_id: str,
    body: RenameColumnRequest,
    session: SessionState = Depends(get_active_session),
):
    """Rename a column in the current working dataset."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        previous_version = dataset.version

        try:
            updated = rename_dataset_column(
                dataset=dataset,
                column_id=column_id,
                new_name=body.name,
                expected_version=body.expected_version,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
            )

        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except ColumnNotFound as exc:
            raise HTTPException(
                status_code=404,
                detail=str(exc),
            ) from exc

        except ColumnNameConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except InvalidColumnName as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

        if updated.version != previous_version:
            session.pending_preview = None

        return serialize_dataset(updated)

@router.get(
    "/current/history",
    response_model=DatasetHistoryResponse,
)
def get_dataset_history(
    session: SessionState = Depends(get_active_session),
):
    """Retrieve the active dataset's mutation history."""

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        return serialize_dataset_history(dataset)

@router.delete(
    "/current/columns/{column_id}",
    response_model=DatasetSummary,
    dependencies=[Depends(require_mutation_header)],
)
def delete_dataset_column(
    column_id: str,
    body: DeleteColumnRequest,
    session: SessionState = Depends(get_active_session),
):
    """
    Delete one column from the working dataset.

    The operation is committed to unified history
    and can be reversed through the normal Undo API.
    """

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            updated, record = commit_dataset_change(
                dataset=dataset,
                kind="column.drop",
                parameters={
                    "column_id": column_id,
                },
                expected_version=body.expected_version,
                max_memory_bytes=(
                    settings.max_dataset_memory_bytes
                ),
            )

        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail=str(exc),
            ) from exc

        except ColumnNotFound as exc:
            raise HTTPException(
                status_code=404,
                detail=str(exc),
            ) from exc

        except CannotDropLastColumn as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        except DatasetMemoryLimitError as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc

        # An outstanding cleaning preview belongs to
        # the previous dataset revision.
        if record is not None:
            session.pending_preview = None

        return serialize_dataset(updated)