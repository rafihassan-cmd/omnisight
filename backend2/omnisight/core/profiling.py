"""Read-only dataset profiling and semantic inference."""

from __future__ import annotations

import json
import math
import re
from typing import Any

import pandas as pd

from pandas.api.types import (
    is_bool_dtype,
    is_datetime64_any_dtype,
    is_numeric_dtype,
)


PREVIEW_LIMIT = 5
DATE_SAMPLE_LIMIT = 25


def safe_number(value: Any) -> float | None:
    """Convert a numerical statistic to a JSON-safe float."""

    if value is None:
        return None

    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None

    return result if math.isfinite(result) else None


def is_datetime_candidate(
    series: pd.Series,
    column_name: str,
) -> bool:
    """
    Detect likely datetime text without changing the column.

    This is only a suggestion, not full-column validation.
    """

    sample = series.dropna().head(DATE_SAMPLE_LIMIT)

    if len(sample) < 3:
        return False

    sample_text = sample.astype(str).str.strip()

    name = column_name.lower()

    # Dates can be suggested by the column name.
    name_hint = (
        "date" in name
        or "timestamp" in name
        or name in {
            "time",
            "created_at",
            "updated_at",
        }
    )

    # Alternatively, recognize an ISO-like date pattern.
    iso_pattern = (
        r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}"
        r"(?:[ T].*)?$"
    )

    iso_ratio = float(
        sample_text.str.match(iso_pattern).mean()
    )

    if not name_hint and iso_ratio < 0.90:
        return False

    try:
        parsed = pd.to_datetime(
            sample_text,
            errors="coerce",
            format="mixed",
        )
    except (ValueError, TypeError, OverflowError):
        return False

    success_ratio = float(parsed.notna().mean())

    return success_ratio >= 0.90


def infer_semantic_type(
    series: pd.Series,
    column_name: str,
    unique_count: int,
    non_null_count: int,
) -> str:
    """
    Infer an analytical type without mutating source values.
    """

    dtype = series.dtype

    if is_bool_dtype(dtype):
        return "boolean"

    if is_datetime64_any_dtype(dtype):
        return "datetime"

    if is_numeric_dtype(dtype):
        return "numeric"

    if non_null_count == 0:
        return "text"

    if is_datetime_candidate(series, column_name):
        return "datetime_candidate"

    unique_ratio = unique_count / non_null_count

    # Heuristic only: low-cardinality text often acts
    # as a categorical variable.
    if (
        unique_count <= 50
        and unique_ratio <= 0.85
    ):
        return "categorical"

    return "text"


def calculate_numeric_stats(
    series: pd.Series,
) -> dict[str, Any]:
    """
    Calculate descriptive statistics for a numeric column.

    Missing and non-finite values are excluded from
    statistical computations.
    """

    values = pd.to_numeric(
        series,
        errors="coerce",
    ).astype("float64")

    values = values.replace(
        [float("inf"), float("-inf")],
        float("nan"),
    ).dropna()

    count = len(values)

    if count == 0:
        return {
            "valid_count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "std": None,
            "q1": None,
            "q3": None,
        }

    return {
        "valid_count": count,
        "min": safe_number(values.min()),
        "max": safe_number(values.max()),
        "mean": safe_number(values.mean()),
        "median": safe_number(values.median()),
        "std": (
            safe_number(values.std(ddof=1))
            if count > 1
            else None
        ),
        "q1": safe_number(values.quantile(0.25)),
        "q3": safe_number(values.quantile(0.75)),
    }


def profile_column(
    series: pd.Series,
    column_id: str,
    column_name: str,
    total_rows: int,
) -> dict[str, Any]:
    """Generate metadata for one dataset column."""

    missing_count = int(series.isna().sum())
    non_null_count = total_rows - missing_count

    unique_count = int(
        series.nunique(dropna=True)
    )

    semantic_type = infer_semantic_type(
        series=series,
        column_name=column_name,
        unique_count=unique_count,
        non_null_count=non_null_count,
    )

    column_profile = {
        "id": column_id,
        "name": column_name,
        "dtype": str(series.dtype),
        "semantic_type": semantic_type,
        "non_null_count": non_null_count,
        "missing_count": missing_count,
        "missing_percent": round(
            missing_count / total_rows * 100,
            2,
        ) if total_rows else 0.0,
        "unique_count": unique_count,
        "memory_bytes": int(
            series.memory_usage(
                index=False,
                deep=True,
            )
        ),
        "numeric_stats": None,
    }

    if semantic_type == "numeric":
        column_profile["numeric_stats"] = (
            calculate_numeric_stats(series)
        )

    return column_profile


def build_profile(
    df: pd.DataFrame,
    column_ids: list[str],
) -> dict[str, Any]:
    """
    Profile the active dataset without changing it.

    Preview values are serialized independently of
    any frontend charting library.
    """

    row_count, column_count = df.shape

    if len(column_ids) != column_count:
        raise ValueError(
            "Column identifier count does not match "
            "the current DataFrame schema."
        )

    columns = []
    total_missing = 0

    for index, column_name in enumerate(df.columns):
        profile = profile_column(
            series=df.iloc[:, index],
            column_id=column_ids[index],
            column_name=str(column_name),
            total_rows=row_count,
        )

        columns.append(profile)
        total_missing += profile["missing_count"]

    total_cells = row_count * column_count

    # Positional rows avoid key collisions and preserve
    # column ordering. Pandas converts NaN/NaT to null.
    preview_json = df.head(PREVIEW_LIMIT).to_json(
        orient="values",
        date_format="iso",
    )

    preview_rows = json.loads(
        preview_json or "[]"
    )

    return {
        "row_count": int(row_count),
        "column_count": int(column_count),
        "total_cells": int(total_cells),
        "missing_cells": int(total_missing),
        "missing_percent": round(
            total_missing / total_cells * 100,
            2,
        ) if total_cells else 0.0,
        "columns": columns,
        "preview_rows": preview_rows,
        "preview_limit": PREVIEW_LIMIT,
    }