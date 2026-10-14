"""Categorical frequencies and grouped numeric statistics."""

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


def run_value_counts(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Calculate category frequencies and percentages."""

    column_id = plan.bindings["group_by"]

    series = get_column(
        dataframe,
        column_ids,
        column_id,
    )

    top_n = plan.parameters["top_n"]

    counts = series.value_counts(
        dropna=True,
    )

    total_groups = int(len(counts))
    valid_count = int(series.notna().sum())

    if valid_count == 0:
        raise AnalysisNotApplicable(
            "No non-null categorical observations exist."
        )

    # A deterministic display order, with the most
    # frequent categories first.
    ordered = sorted(
        (
            (str(category), int(count))
            for category, count in counts.items()
        ),
        key=lambda item: (
            -item[1],
            item[0].casefold(),
        ),
    )

    selected = ordered[:top_n]

    rows = [
        {
            "category": label,
            "count": count,
            "percent": round(
                count / valid_count * 100,
                4,
            ),
        }
        for label, count in selected
    ]

    missing_count = int(
        len(series) - valid_count
    )

    warnings = exclusion_warning(
        missing_count,
        "missing category labels",
    )

    if total_groups > top_n:
        warnings.append(
            f"Only the top {top_n} of "
            f"{total_groups} categories are returned."
        )

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_count",
                "Categorized Records",
                valid_count,
            ),
            make_metric(
                "missing_count",
                "Missing Category Labels",
                missing_count,
            ),
            make_metric(
                "category_count",
                "Distinct Categories",
                total_groups,
            ),
            make_metric(
                "returned_categories",
                "Returned Categories",
                len(rows),
            ),
        ],
        table=make_table(
            [
                ("category", str(series.name), "nominal"),
                ("count", "Record Count", "quantitative"),
                ("percent", "Percentage", "quantitative"),
            ],
            rows,
            total_rows=total_groups,
        ),
        warnings=warnings,
        metadata={
            "column_id": column_id,
            "column_name": str(series.name),
            "percentage_denominator": valid_count,
            "sort_order": "frequency_descending",
        },
    )


def run_grouped_aggregation(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Aggregate a numeric measure by categorical groups."""

    group_id = plan.bindings["group_by"]
    measure_id = plan.bindings["measure"]

    category = get_column(
        dataframe, column_ids, group_id
    )

    measure = get_column(
        dataframe, column_ids, measure_id
    )

    aggregation = plan.parameters["aggregation"]
    top_n = plan.parameters["top_n"]

    numerical_values = numeric_array(measure)

    # Both a category and a finite measure are required.
    valid_mask = (
        category.notna().to_numpy()
        & np.isfinite(numerical_values)
    )

    valid_rows = int(valid_mask.sum())

    if valid_rows == 0:
        raise AnalysisNotApplicable(
            "No observations contain both a category "
            "and a finite numeric measure."
        )

    grouped_data = pd.DataFrame({
        "category": category.loc[
            valid_mask
        ].to_numpy(),
        "value": numerical_values[valid_mask],
    })

    groups = grouped_data.groupby(
        "category",
        observed=True,
        dropna=True,
    )

    aggregated = groups["value"].agg(
        aggregation
    )

    group_sizes = groups.size()

    ordered_groups = []

    for label, value in aggregated.items():
        numeric_value = finite_float(value)

        if numeric_value is None:
            raise AnalysisNotApplicable(
                "An aggregated group produced a "
                "non-finite statistical value."
            )

        ordered_groups.append({
            "category": str(label),
            "value": numeric_value,
            "count": int(group_sizes[label]),
        })

    ordered_groups.sort(
        key=lambda row: (
            -row["value"],
            row["category"].casefold(),
        )
    )

    total_groups = len(ordered_groups)
    rows = ordered_groups[:top_n]

    excluded = int(
        len(dataframe) - valid_rows
    )

    warnings = exclusion_warning(
        excluded,
        "missing category or invalid numeric measure",
    )

    if total_groups > top_n:
        warnings.append(
            f"Only the top {top_n} of "
            f"{total_groups} groups are returned."
        )

    return AnalysisResult(
        metrics=[
            make_metric(
                "valid_rows",
                "Valid Observations",
                valid_rows,
            ),
            make_metric(
                "excluded_rows",
                "Excluded Observations",
                excluded,
            ),
            make_metric(
                "group_count",
                "Distinct Groups",
                total_groups,
            ),
            make_metric(
                "returned_groups",
                "Returned Groups",
                len(rows),
            ),
        ],
        table=make_table(
            [
                (
                    "category",
                    str(category.name),
                    "nominal",
                ),
                (
                    "value",
                    f"{aggregation.title()} of {measure.name}",
                    "quantitative",
                ),
                (
                    "count",
                    "Valid Observations",
                    "quantitative",
                ),
            ],
            rows,
            total_rows=total_groups,
        ),
        warnings=warnings,
        metadata={
            "group_column_id": group_id,
            "group_column_name": str(category.name),
            "measure_column_id": measure_id,
            "measure_column_name": str(measure.name),
            "aggregation": aggregation,
            "sort_order": "value_descending",
        },
    )