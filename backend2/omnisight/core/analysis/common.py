"""Shared helpers for read-only statistical executors."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from pandas.api.types import (
    is_bool_dtype,
    is_numeric_dtype,
)

from omnisight.core.analysis.contracts import (
    AnalysisMetric,
    AnalysisTable,
    TableColumn,
)

from omnisight.core.analysis.statistics import (
    AnalysisNotApplicable,
)


def get_column(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    column_id: str,
) -> pd.Series:
    """Resolve a column by its stable identifier."""

    if len(column_ids) != len(dataframe.columns):
        raise AnalysisNotApplicable(
            "Dataset column metadata is inconsistent."
        )

    try:
        position = column_ids.index(column_id)
    except ValueError as exc:
        raise AnalysisNotApplicable(
            "The selected column no longer exists."
        ) from exc

    return dataframe.iloc[:, position]


def numeric_array(series: pd.Series) -> np.ndarray:
    """
    Convert a numeric column to float64.

    Missing values become NaN. Infinite values remain
    infinite so the executor can count exclusions.
    """

    if (
        is_bool_dtype(series.dtype)
        or not is_numeric_dtype(series.dtype)
        or series.dtype.kind not in "iuf"
    ):
        raise AnalysisNotApplicable(
            "This analysis requires a real numeric column."
        )

    try:
        return pd.to_numeric(
            series,
            errors="coerce",
        ).to_numpy(
            dtype="float64",
            na_value=np.nan,
        )

    except (TypeError, ValueError, OverflowError) as exc:
        raise AnalysisNotApplicable(
            "The numeric column could not be processed."
        ) from exc


def finite_float(value) -> float | None:
    """Return a finite Python float or null-equivalent."""

    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None

    return result if math.isfinite(result) else None


def make_metric(
    key: str,
    label: str,
    value: str | int | float | bool | None,
) -> AnalysisMetric:
    return AnalysisMetric(
        key=key,
        label=label,
        value=value,
    )


def make_table(
    columns: list[tuple[str, str, str]],
    rows: list[dict],
    *,
    total_rows: int | None = None,
) -> AnalysisTable:
    """Create a result table with consistent metadata."""

    return AnalysisTable(
        columns=[
            TableColumn(
                key=key,
                label=label,
                data_type=data_type,
            )
            for key, label, data_type in columns
        ],
        rows=rows,
        total_rows=(
            len(rows)
            if total_rows is None
            else total_rows
        ),
        truncated=(
            total_rows is not None
            and total_rows > len(rows)
        ),
    )


def exclusion_warning(
    count: int,
    reason: str,
) -> list[str]:
    if count <= 0:
        return []

    return [
        f"{count} observations were excluded: {reason}."
    ]