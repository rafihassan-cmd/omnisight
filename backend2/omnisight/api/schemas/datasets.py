"""Dataset API response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field
from pydantic import BaseModel

from omnisight.services.datasets import DatasetState


class DatasetSummary(BaseModel):
    dataset_id: str
    filename: str

    version: int
    rows: int
    columns: int

    column_names: list[str]

    source_size_bytes: int
    estimated_memory_bytes: int

    uploaded_at: datetime


class NumericStatistics(BaseModel):
    valid_count: int

    min: float | None = None
    max: float | None = None
    mean: float | None = None
    median: float | None = None
    std: float | None = None

    q1: float | None = None
    q3: float | None = None


class ColumnProfile(BaseModel):
    id: str
    name: str
    dtype: str

    semantic_type: Literal[
        "numeric",
        "categorical",
        "text",
        "boolean",
        "datetime",
        "datetime_candidate",
    ]

    non_null_count: int
    missing_count: int
    missing_percent: float

    unique_count: int
    memory_bytes: int

    numeric_stats: NumericStatistics | None = None


class DatasetProfileResponse(BaseModel):
    dataset_id: str
    filename: str
    dataset_version: int

    row_count: int
    column_count: int
    total_cells: int

    missing_cells: int
    missing_percent: float

    columns: list[ColumnProfile]

    # Values remain ordered by the columns list.
    preview_rows: list[list[Any]]
    preview_limit: int


def serialize_dataset(
    dataset: DatasetState,
) -> DatasetSummary:
    df = dataset.current

    return DatasetSummary(
        dataset_id=dataset.id,
        filename=dataset.filename,
        version=dataset.version,
        rows=int(df.shape[0]),
        columns=int(df.shape[1]),
        column_names=[
            str(column) for column in df.columns
        ],
        source_size_bytes=dataset.source_size_bytes,
        estimated_memory_bytes=(
            dataset.estimated_memory_bytes
        ),
        uploaded_at=dataset.uploaded_at,
    )



class RenameColumnRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=128,
    )
    expected_version: int = Field(ge=0)

class DatasetChangeRecordResponse(BaseModel):
    id: str
    kind: str

    parameters: dict[str, Any]
    details: dict[str, Any]

    created_at: datetime


class DatasetHistoryResponse(BaseModel):
    dataset_id: str
    dataset_version: int

    history_count: int
    can_undo: bool
    can_reset: bool

    operations: list[DatasetChangeRecordResponse]


def serialize_dataset_history(
    dataset: DatasetState,
) -> DatasetHistoryResponse:
    """Serialize the unified mutation history."""

    operations = [
        DatasetChangeRecordResponse(
            id=record.id,
            kind=record.kind,
            parameters=record.parameters,
            details=record.details,
            created_at=record.created_at,
        )
        for record in dataset.history
    ]

    has_changes = len(operations) > 0

    return DatasetHistoryResponse(
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        history_count=len(operations),
        can_undo=has_changes,
        can_reset=has_changes,
        operations=operations,
    )