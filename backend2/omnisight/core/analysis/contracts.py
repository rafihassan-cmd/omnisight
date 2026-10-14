"""Library-independent analytical result contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, TypeAlias


# Values allowed inside an analytical JSON result.
#
# Numpy values must be converted to ordinary Python
# scalars before entering these structures.
JsonScalar: TypeAlias = str | int | float | bool | None

DataType: TypeAlias = Literal[
    "nominal",
    "quantitative",
    "temporal",
    "boolean",
]

ChartKind: TypeAlias = Literal[
    "bar",
    "line",
    "scatter",
    "histogram",
]


@dataclass(frozen=True)
class AnalysisMetric:
    """One labeled result value."""

    key: str
    label: str
    value: JsonScalar

    unit: str | None = None


@dataclass(frozen=True)
class TableColumn:
    """Metadata for one result-table column."""

    key: str
    label: str
    data_type: DataType


@dataclass(frozen=True)
class AnalysisTable:
    """
    Tabular analytical output.

    Row dictionaries use TableColumn.key as their keys.
    """

    columns: list[TableColumn]
    rows: list[dict[str, JsonScalar]]

    total_rows: int
    truncated: bool = False


@dataclass(frozen=True)
class ChartAxis:
    """Dataset field used by one chart axis."""

    field: str
    label: str
    data_type: DataType


@dataclass(frozen=True)
class ChartSpec:
    """
    Visualization instructions independent of Plotly.

    data contains chart-ready, JSON-safe records.
    The frontend decides how to render them.
    """

    kind: ChartKind
    title: str

    x: ChartAxis
    y: ChartAxis

    data: list[dict[str, JsonScalar]]

    series_field: str | None = None

    metadata: dict[str, JsonScalar] = field(
        default_factory=dict
    )

    schema_version: Literal["1.0"] = "1.0"


@dataclass(frozen=True)
class AnalysisResult:
    """Standard result returned by a statistical executor."""

    metrics: list[AnalysisMetric] = field(
        default_factory=list
    )

    table: AnalysisTable | None = None
    chart: ChartSpec | None = None

    warnings: list[str] = field(
        default_factory=list
    )

    metadata: dict[str, JsonScalar] = field(
        default_factory=dict
    )