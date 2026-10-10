from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PreviewSelection(BaseModel):
    offset: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=500)
    column_ids: list[str] | None = None


class VersionRequest(BaseModel):
    expected_version: int = Field(ge=0, strict=True)
    preview: PreviewSelection = Field(default_factory=PreviewSelection)


class OperationRequest(VersionRequest):
    name: str
    params: dict[str, Any] = Field(default_factory=dict)


class ColumnLabel(BaseModel):
    id: str
    name: str


class ColumnProfile(ColumnLabel):
    position: int
    dtype: str
    is_numeric: bool
    unique: int
    missing: int
    missing_pct: float


class DuplicateGroup(BaseModel):
    name: str
    column_ids: list[str]


class PreviewOut(BaseModel):
    version: int
    total_rows: int
    offset: int
    limit: int
    columns: list[ColumnLabel]
    rows: list[dict[str, Any]]


class DatasetInfo(BaseModel):
    dataset_id: str
    filename: str
    version: int
    history_count: int
    rows: int
    columns: int
    missing_cells: int
    columns_info: list[ColumnProfile]
    duplicate_column_groups: list[DuplicateGroup]
    can_proceed: bool


class DatasetState(DatasetInfo):
    preview: PreviewOut


class OperationResult(DatasetState):
    operation: str
    params: dict[str, Any]
    summary: dict[str, Any]


class HistoryItem(BaseModel):
    index: int
    name: str
    params: dict[str, Any]
    summary: dict[str, Any]
    at: str
