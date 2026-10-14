"""Public API schemas for analytical execution results."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from omnisight.core.analysis.contracts import (
    ChartKind,
    DataType,
    JsonScalar,
)

from omnisight.api.schemas.planner import (
    ValidatedAnalysisPlanResponse,
)


class AnalysisResponseModel(BaseModel):
    """
    Base model for analysis output.

    Non-finite numbers such as NaN and Infinity
    are not valid analytical JSON values.
    """

    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )


class AnalysisMetricResponse(AnalysisResponseModel):
    key: str
    label: str
    value: JsonScalar

    unit: str | None = None


class AnalysisTableColumnResponse(AnalysisResponseModel):
    key: str
    label: str
    data_type: DataType


class AnalysisTableResponse(AnalysisResponseModel):
    columns: list[AnalysisTableColumnResponse]

    rows: list[dict[str, JsonScalar]]

    total_rows: int = Field(ge=0)
    truncated: bool = False


class AnalysisChartAxisResponse(AnalysisResponseModel):
    field: str
    label: str
    data_type: DataType


class AnalysisChartSpecResponse(AnalysisResponseModel):
    schema_version: Literal["1.0"]

    kind: ChartKind
    title: str

    x: AnalysisChartAxisResponse
    y: AnalysisChartAxisResponse

    data: list[dict[str, JsonScalar]]

    series_field: str | None = None

    metadata: dict[str, JsonScalar] = Field(
        default_factory=dict
    )


class AnalysisResultResponse(AnalysisResponseModel):
    metrics: list[AnalysisMetricResponse] = Field(
        default_factory=list
    )

    table: AnalysisTableResponse | None = None
    chart: AnalysisChartSpecResponse | None = None

    warnings: list[str] = Field(
        default_factory=list
    )

    metadata: dict[str, JsonScalar] = Field(
        default_factory=dict
    )


class AnalysisExecutionResponse(AnalysisResponseModel):
    schema_version: Literal["1.0"] = "1.0"

    execution_id: str
    executed_at: datetime

    plan: ValidatedAnalysisPlanResponse
    result: AnalysisResultResponse