"""Calendar-based record counts and numeric time trends."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from pandas.api.types import (
    is_datetime64_any_dtype,
)

from omnisight.core.analysis.common import (
    exclusion_warning,
    finite_float,
    get_column,
    make_metric,
    make_table,
    numeric_array,
)

from omnisight.core.analysis.contracts import (
    AnalysisResult,
)

from omnisight.core.analysis.statistics import (
    AnalysisNotApplicable,
)

if TYPE_CHECKING:
    from omnisight.services.planner import (
        ValidatedAnalysisPlan,
    )


# Period frequencies, not resampling offset aliases.
FREQUENCIES = {
    "day": "D",
    "week": "W-SUN",
    "month": "M",
    "year": "Y",
}

# Limit the transmitted time-series table.
MAX_PERIOD_ROWS = 240


def resolve_periods(
    series: pd.Series,
    frequency: str,
) -> pd.Series:
    """Convert real datetimes to calendar periods."""

    if frequency not in FREQUENCIES:
        raise AnalysisNotApplicable(
            "Unsupported temporal frequency."
        )

    if not is_datetime64_any_dtype(series.dtype):
        raise AnalysisNotApplicable(
            "Temporal analysis requires a converted "
            "datetime column."
        )

    values = series

    try:
        if isinstance(
            series.dtype,
            pd.DatetimeTZDtype,
        ):
            values = (
                series.dt.tz_convert("UTC")
                .dt.tz_localize(None)
            )

        return values.dt.to_period(
            FREQUENCIES[frequency]
        )

    except (TypeError, ValueError, OverflowError) as exc:
        raise AnalysisNotApplicable(
            "The datetime column could not be grouped "
            "into the selected calendar periods."
        ) from exc


def period_start(period: pd.Period) -> str:
    """Use a standard ISO date for each period start."""

    return period.start_time.date().isoformat()


def limit_period_rows(
    rows: list[dict],
    warnings: list[str],
) -> tuple[list[dict], int]:
    """
    Preserve the most recent periods when the result
    exceeds the configured output limit.
    """

    total = len(rows)

    if total > MAX_PERIOD_ROWS:
        warnings.append(
            f"The result contains {total} time periods. "
            f"Only the latest {MAX_PERIOD_ROWS} "
            "periods are returned."
        )

        rows = rows[-MAX_PERIOD_ROWS:]

    return rows, total


def run_time_counts(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Count observations per calendar period."""

    time_id = plan.bindings["time"]
    frequency = plan.parameters["frequency"]

    series = get_column(
        dataframe,
        column_ids,
        time_id,
    )

    periods = resolve_periods(
        series,
        frequency,
    )

    valid_mask = periods.notna().to_numpy()

    valid_count = int(valid_mask.sum())
    excluded = int(len(series) - valid_count)

    if valid_count == 0:
        raise AnalysisNotApplicable(
            "No valid datetime observations are available."
        )

    frame = pd.DataFrame({
        "period": periods[valid_mask].to_numpy(),
    })

    grouped = frame.groupby(
        "period",
        observed=True,
        sort=True,
    ).size()

    all_rows = [
        {
            "period": period_start(period),
            "count": int(count),
        }
        for period, count in grouped.items()
    ]

    warnings = exclusion_warning(
        excluded,
        "missing datetime values",
    )

    rows, total_periods = limit_period_rows(
        all_rows,
        warnings,
    )

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_rows",
                "Valid Dated Records",
                valid_count,
            ),
            make_metric(
                "excluded_rows",
                "Missing Dates",
                excluded,
            ),
            make_metric(
                "period_count",
                "Observed Time Periods",
                total_periods,
            ),
        ],
        table=make_table(
            [
                ("period", "Period Start", "temporal"),
                ("count", "Record Count", "quantitative"),
            ],
            rows,
            total_rows=total_periods,
        ),
        warnings=warnings,
        metadata={
            "time_column_id": time_id,
            "time_column_name": str(series.name),
            "frequency": frequency,
            "week_starts_on": "Monday",
            "timezone_basis": (
                "UTC"
                if isinstance(
                    series.dtype,
                    pd.DatetimeTZDtype,
                )
                else "naive_calendar"
            ),
        },
    )


def run_time_aggregation(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Aggregate a numeric metric by calendar period."""

    time_id = plan.bindings["time"]
    measure_id = plan.bindings["measure"]

    frequency = plan.parameters["frequency"]
    aggregation = plan.parameters["aggregation"]

    time_series = get_column(
        dataframe,
        column_ids,
        time_id,
    )

    measure_series = get_column(
        dataframe,
        column_ids,
        measure_id,
    )

    periods = resolve_periods(
        time_series,
        frequency,
    )

    numeric = numeric_array(measure_series)

    valid_mask = (
        periods.notna().to_numpy()
        & np.isfinite(numeric)
    )

    valid_count = int(valid_mask.sum())
    excluded = int(len(dataframe) - valid_count)

    if valid_count == 0:
        raise AnalysisNotApplicable(
            "No observations contain both a valid date "
            "and a finite numeric measure."
        )

    frame = pd.DataFrame({
        "period": periods[valid_mask].to_numpy(),
        "value": numeric[valid_mask],
    })

    groups = frame.groupby(
        "period",
        observed=True,
        sort=True,
    )

    aggregated = groups["value"].agg(
        aggregation
    )

    group_sizes = groups.size()

    all_rows = []

    for period, value in aggregated.items():
        numeric_value = finite_float(value)

        if numeric_value is None:
            raise AnalysisNotApplicable(
                "A temporal aggregation produced "
                "a non-finite value."
            )

        all_rows.append({
            "period": period_start(period),
            "value": numeric_value,
            "count": int(group_sizes[period]),
        })

    warnings = exclusion_warning(
        excluded,
        "missing dates or invalid numeric measures",
    )

    rows, total_periods = limit_period_rows(
        all_rows,
        warnings,
    )

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_rows",
                "Valid Observations",
                valid_count,
            ),
            make_metric(
                "excluded_rows",
                "Excluded Observations",
                excluded,
            ),
            make_metric(
                "period_count",
                "Observed Time Periods",
                total_periods,
            ),
            make_metric(
                "returned_periods",
                "Returned Time Periods",
                len(rows),
            ),
        ],
        table=make_table(
            [
                ("period", "Period Start", "temporal"),
                (
                    "value",
                    f"{aggregation.title()} of {measure_series.name}",
                    "quantitative",
                ),
                ("count", "Valid Observations", "quantitative"),
            ],
            rows,
            total_rows=total_periods,
        ),
        warnings=warnings,
        metadata={
            "time_column_id": time_id,
            "time_column_name": str(time_series.name),
            "measure_column_id": measure_id,
            "measure_column_name": str(measure_series.name),
            "frequency": frequency,
            "aggregation": aggregation,
            "week_starts_on": "Monday",
            "timezone_basis": (
                "UTC"
                if isinstance(
                    time_series.dtype,
                    pd.DatetimeTZDtype,
                )
                else "naive_calendar"
            ),
        },
    )