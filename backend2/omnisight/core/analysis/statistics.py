"""Statistical executors for numerical analyses."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from pandas.api.types import (
    is_bool_dtype,
    is_numeric_dtype,
)

from omnisight.core.analysis.contracts import (
    AnalysisMetric,
    AnalysisResult,
)

if TYPE_CHECKING:
    from omnisight.services.planner import (
        ValidatedAnalysisPlan,
    )


class AnalysisNotApplicable(ValueError):
    """The selected data cannot support this analysis."""


def finite_float(value) -> float | None:
    """Return a finite Python float or None."""

    if value is None:
        return None

    number = float(value)

    if not np.isfinite(number):
        return None

    return number


def run_descriptive_statistics(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """
    Compute descriptive statistics for one numeric column.

    Excludes missing, positive-infinite and
    negative-infinite values from calculations.
    """

    column_id = plan.bindings["measure"]

    try:
        index = column_ids.index(column_id)
    except ValueError as exc:
        raise AnalysisNotApplicable(
            "The selected numeric column no longer exists."
        ) from exc

    series = dataframe.iloc[:, index]

    if (
        is_bool_dtype(series.dtype)
        or not is_numeric_dtype(series.dtype)
    ):
        raise AnalysisNotApplicable(
            "Descriptive statistics require a numeric column."
        )

    total_rows = int(len(series))
    missing_count = int(series.isna().sum())
    non_null_count = total_rows - missing_count

    # Work with ordinary float64 NumPy values.
    # na_value allows nullable pandas numeric dtypes.
    numeric = pd.to_numeric(
        series,
        errors="coerce",
    )

    values = numeric.to_numpy(
        dtype="float64",
        na_value=np.nan,
    )

    finite_values = values[
        np.isfinite(values)
    ]

    finite_count = int(len(finite_values))

    if finite_count == 0:
        raise AnalysisNotApplicable(
            "This column has no finite numeric observations."
        )

    excluded_non_finite = (
        non_null_count - finite_count
    )

    mean = finite_float(
        np.mean(finite_values)
    )

    median = finite_float(
        np.median(finite_values)
    )

    minimum = finite_float(
        np.min(finite_values)
    )

    maximum = finite_float(
        np.max(finite_values)
    )

    q1 = finite_float(
        np.quantile(finite_values, 0.25)
    )

    q3 = finite_float(
        np.quantile(finite_values, 0.75)
    )

    standard_deviation = (
        finite_float(
            np.std(finite_values, ddof=1)
        )
        if finite_count > 1
        else None
    )

    metrics = [
        AnalysisMetric(
            key="total_rows",
            label="Total Rows",
            value=total_rows,
        ),
        AnalysisMetric(
            key="valid_count",
            label="Finite Observations",
            value=finite_count,
        ),
        AnalysisMetric(
            key="missing_count",
            label="Missing Values",
            value=missing_count,
        ),
        AnalysisMetric(
            key="mean",
            label="Mean",
            value=mean,
        ),
        AnalysisMetric(
            key="median",
            label="Median",
            value=median,
        ),
        AnalysisMetric(
            key="std",
            label="Sample Standard Deviation",
            value=standard_deviation,
        ),
        AnalysisMetric(
            key="min",
            label="Minimum",
            value=minimum,
        ),
        AnalysisMetric(
            key="max",
            label="Maximum",
            value=maximum,
        ),
        AnalysisMetric(
            key="q1",
            label="First Quartile",
            value=q1,
        ),
        AnalysisMetric(
            key="q3",
            label="Third Quartile",
            value=q3,
        ),
    ]

    warnings = []

    if excluded_non_finite > 0:
        warnings.append(
            f"{excluded_non_finite} non-finite numeric "
            "values were excluded from calculations."
        )

    if finite_count == 1:
        warnings.append(
            "Sample standard deviation requires at least "
            "two finite observations."
        )

    return AnalysisResult(
        metrics=metrics,
        table=None,
        chart=None,
        warnings=warnings,
        metadata={
            "column_id": column_id,
            "column_name": str(series.name),
            "total_rows": total_rows,
            "finite_observations": finite_count,
            "excluded_non_finite": (
                excluded_non_finite
            ),
            "standard_deviation_ddof": 1,
        },
    )