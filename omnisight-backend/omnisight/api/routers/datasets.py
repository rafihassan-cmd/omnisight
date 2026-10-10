from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile

from omnisight.core.errors import CleaningError
from omnisight.core.io import load_csv
from omnisight.core.operations import describe_operations, preview_operation
from omnisight.core.profiling import column_names, column_profile, duplicate_groups, preview, shape_stats
from omnisight.services.datasets import Dataset, DatasetStore

from ..deps import get_store
from ..schemas import (DatasetInfo, DatasetState, HistoryItem, OperationRequest,
                       OperationResult, PreviewOut, PreviewSelection, VersionRequest)

router = APIRouter(prefix="/api/v1", tags=["datasets"])


def _info(ds: Dataset) -> dict:
    groups = duplicate_groups(ds.current)
    return {"dataset_id": ds.id, "filename": ds.filename, "version": ds.version,
            "history_count": len(ds.history), **shape_stats(ds.current),
            "columns_info": column_profile(ds.current), "duplicate_column_groups": groups,
            "can_proceed": not groups}


def _preview(ds: Dataset, selection: PreviewSelection, after_change: bool = False) -> dict:
    ids = selection.column_ids
    # A mutation may discard a visible column. Keep the remaining visible columns.
    if after_change and ids is not None:
        ids = [cid for cid in ids if cid in ds.current.columns]
    return {"version": ds.version, **preview(ds.current,
            offset=0 if after_change else selection.offset, limit=selection.limit, column_ids=ids)}


def _state(ds: Dataset, selection: PreviewSelection, after_change: bool = False) -> dict:
    return {**_info(ds), "preview": _preview(ds, selection, after_change)}


@router.get("/meta")
def meta():
    return describe_operations()


@router.post("/datasets", response_model=DatasetState, status_code=201)
def upload_dataset(file: UploadFile = File(...), store: DatasetStore = Depends(get_store)):
    name = file.filename or "upload.csv"
    if not name.lower().endswith(".csv"):
        raise CleaningError("Only .csv files are supported right now.")
    return _state(store.create(name, load_csv(file.file)), PreviewSelection())


@router.get("/datasets/{dataset_id}", response_model=DatasetInfo)
def dataset_info(dataset_id: str, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        return _info(ds)


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, store: DatasetStore = Depends(get_store)):
    store.delete(dataset_id)


@router.get("/datasets/{dataset_id}/preview", response_model=PreviewOut)
def dataset_preview(dataset_id: str, offset: int = Query(0, ge=0),
                    limit: int = Query(20, ge=1, le=500),
                    column_ids: list[str] | None = Query(None),
                    store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        return _preview(ds, PreviewSelection(offset=offset, limit=limit, column_ids=column_ids))


@router.post("/datasets/{dataset_id}/operations", response_model=OperationResult)
def run_operation(dataset_id: str, req: OperationRequest, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        # Validate preview arguments BEFORE committing a modification.
        store.check_version(ds, req.expected_version)
        _preview(ds, req.preview)
        ds, rec = store.apply(dataset_id, req.name, req.params, req.expected_version)
        return {**_state(ds, req.preview, after_change=True), "operation": rec.name,
                "params": rec.params, "summary": rec.summary}


@router.post("/datasets/{dataset_id}/operations/preview")
def run_preview(dataset_id: str, req: OperationRequest, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        store.check_version(ds, req.expected_version)
        return {"version": ds.version,
                **preview_operation(ds.current, req.name, req.params)}


@router.get("/datasets/{dataset_id}/history", response_model=list[HistoryItem])
def history(dataset_id: str, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        return [{"index": i, "name": r.name, "params": r.params, "summary": r.summary, "at": r.at}
                for i, r in enumerate(ds.history)]


@router.post("/datasets/{dataset_id}/undo", response_model=DatasetState)
def undo(dataset_id: str, req: VersionRequest, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        store.check_version(ds, req.expected_version)
        _preview(ds, req.preview)
        return _state(store.undo(dataset_id, req.expected_version), req.preview, after_change=True)


@router.post("/datasets/{dataset_id}/reset", response_model=DatasetState)
def reset(dataset_id: str, req: VersionRequest, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        store.check_version(ds, req.expected_version)
        _preview(ds, req.preview)
        return _state(store.reset(dataset_id, req.expected_version), req.preview, after_change=True)


@router.get("/datasets/{dataset_id}/export")
def export_csv(dataset_id: str, store: DatasetStore = Depends(get_store)):
    ds = store.get(dataset_id)
    with ds.lock:
        labels = list(column_names(ds.current).values())
        return Response(content=ds.current.to_csv(index=False, header=labels), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="cleaned_data.csv"'})
