"""Distribution and numeric relationship analyses."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

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


def run_histogram(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Calculate a numerical frequency distribution."""

    column_id = plan.bindings["measure"]

    series = get_column(
        dataframe,
        column_ids,
        column_id,
    )

    bins = plan.parameters["bins"]

    values = numeric_array(series)

    valid_mask = np.isfinite(values)
    finite_values = values[valid_mask]

    valid_count = int(len(finite_values))

    if valid_count == 0:
        raise AnalysisNotApplicable(
            "No finite numeric observations are available "
            "for the distribution."
        )

    try:
        counts, edges = np.histogram(
            finite_values,
            bins=bins,
        )
    except (ValueError, OverflowError) as exc:
        raise AnalysisNotApplicable(
            "The numerical range cannot be divided "
            "into valid histogram intervals."
        ) from exc

    if not np.isfinite(edges).all():
        raise AnalysisNotApplicable(
            "Histogram boundaries are not finite."
        )

    rows = []

    for index, count in enumerate(counts):
        rows.append({
            "bin_start": float(edges[index]),
            "bin_end": float(edges[index + 1]),
            "count": int(count),
        })

    missing_count = int(series.isna().sum())

    excluded_nonfinite = (
        int(len(series))
        - missing_count
        - valid_count
    )

    warnings = exclusion_warning(
        missing_count,
        "missing values",
    )

    warnings.extend(
        exclusion_warning(
            excluded_nonfinite,
            "non-finite numeric values",
        )
    )

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_count",
                "Finite Observations",
                valid_count,
            ),
            make_metric(
                "missing_count",
                "Missing Values",
                missing_count,
            ),
            make_metric(
                "nonfinite_count",
                "Non-finite Values",
                excluded_nonfinite,
            ),
            make_metric(
                "bin_count",
                "Number of Bins",
                int(bins),
            ),
            make_metric(
                "min",
                "Minimum",
                finite_float(finite_values.min()),
            ),
            make_metric(
                "max",
                "Maximum",
                finite_float(finite_values.max()),
            ),
        ],
        table=make_table(
            [
                ("bin_start", "Bin Start", "quantitative"),
                ("bin_end", "Bin End", "quantitative"),
                ("count", "Frequency", "quantitative"),
            ],
            rows,
        ),
        warnings=warnings,
        metadata={
            "column_id": column_id,
            "column_name": str(series.name),
            "valid_observations": valid_count,
            "bin_count": int(bins),
        },
    )


def run_pairwise_relationship(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """
    Calculate paired observations and Pearson correlation.

    Plotting points are selected deterministically
    from their original row order.
    """

    x_id = plan.bindings["x"]
    y_id = plan.bindings["y"]

    if x_id == y_id:
        raise AnalysisNotApplicable(
            "Relationship analysis requires two columns."
        )

    x_series = get_column(
        dataframe, column_ids, x_id
    )

    y_series = get_column(
        dataframe, column_ids, y_id
    )

    x_all = numeric_array(x_series)
    y_all = numeric_array(y_series)

    valid_mask = (
        np.isfinite(x_all)
        & np.isfinite(y_all)
    )

    x = x_all[valid_mask]
    y = y_all[valid_mask]

    valid_pairs = int(len(x))

    if valid_pairs < 2:
        raise AnalysisNotApplicable(
            "At least two valid paired observations "
            "are required."
        )

    excluded = int(len(dataframe)) - valid_pairs

    correlation = None
    warnings = exclusion_warning(
        excluded,
        "one or both variables were missing or non-finite",
    )

    if (
        np.unique(x).size >= 2
        and np.unique(y).size >= 2
    ):
        with np.errstate(
            invalid="ignore",
            divide="ignore",
            over="ignore",
        ):
            coefficient = np.corrcoef(x, y)[0, 1]

        correlation = finite_float(coefficient)

        if correlation is None:
            warnings.append(
                "Pearson correlation could not be "
                "computed reliably for these values."
            )
    else:
        warnings.append(
            "Pearson correlation is undefined when "
            "either variable has zero variation."
        )

    max_points = plan.parameters["max_points"]

    if valid_pairs > max_points:
        # Deterministic row-order subsampling,
        # not a random or statistically representative sample.
        positions = np.linspace(
            0,
            valid_pairs - 1,
            num=max_points,
            dtype=int,
        )

        warnings.append(
            f"Only {max_points} of {valid_pairs} valid "
            "pairs are included in the result table."
        )
    else:
        positions = np.arange(valid_pairs)

    rows = [
        {
            "x": float(x[position]),
            "y": float(y[position]),
        }
        for position in positions
    ]

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_pairs",
                "Valid Observation Pairs",
                valid_pairs,
            ),
            make_metric(
                "excluded_rows",
                "Excluded Rows",
                excluded,
            ),
            make_metric(
                "pearson_r",
                "Pearson Correlation",
                correlation,
            ),
            make_metric(
                "displayed_points",
                "Returned Points",
                len(rows),
            ),
        ],
        table=make_table(
            [
                ("x", str(x_series.name), "quantitative"),
                ("y", str(y_series.name), "quantitative"),
            ],
            rows,
            total_rows=valid_pairs,
        ),
        warnings=warnings,
        metadata={
            "x_column_id": x_id,
            "x_column_name": str(x_series.name),
            "y_column_id": y_id,
            "y_column_name": str(y_series.name),
            "sampling": (
                "evenly_spaced_row_order"
                if valid_pairs > max_points
                else "none"
            ),
        },
    )