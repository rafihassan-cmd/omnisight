"""Build library-independent chart specifications.

This module does not perform statistical calculations.
It converts existing analysis result tables into
structured visualization instructions.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from omnisight.core.analysis.contracts import (
    AnalysisResult,
    ChartAxis,
    ChartSpec,
)

if TYPE_CHECKING:
    from omnisight.services.planner import (
        ValidatedAnalysisPlan,
    )


class ChartSpecificationError(RuntimeError):
    """An executor returned an incompatible result table."""


def require_table(
    result: AnalysisResult,
    required_fields: set[str],
):
    """Validate the table contract expected by a chart."""

    table = result.table

    if table is None:
        raise ChartSpecificationError(
            "This analysis requires a result table "
            "to construct its chart."
        )

    available_fields = {
        column.key
        for column in table.columns
    }

    missing_fields = required_fields - available_fields

    if missing_fields:
        raise ChartSpecificationError(
            "The result table is missing required fields: "
            + ", ".join(sorted(missing_fields))
        )

    for index, row in enumerate(table.rows):
        if not required_fields.issubset(row):
            raise ChartSpecificationError(
                f"Result row {index} is missing chart fields."
            )

    return table


def make_chart(
    *,
    result: AnalysisResult,
    plan: ValidatedAnalysisPlan,
    kind: str,
    x_field: str,
    x_label: str,
    x_type: str,
    y_field: str,
    y_label: str,
    y_type: str = "quantitative",
    required_fields: set[str] | None = None,
    metadata: dict | None = None,
) -> ChartSpec:
    """
    Construct a chart from an existing result table.

    Result rows are copied, not recomputed.
    """

    fields = {
        x_field,
        y_field,
    }

    if required_fields:
        fields.update(required_fields)

    table = require_table(
        result,
        fields,
    )

    return ChartSpec(
        kind=kind,
        title=plan.title,

        x=ChartAxis(
            field=x_field,
            label=x_label,
            data_type=x_type,
        ),

        y=ChartAxis(
            field=y_field,
            label=y_label,
            data_type=y_type,
        ),

        data=[
            dict(row)
            for row in table.rows
        ],

        series_field=None,

        metadata={
            "analysis_method": plan.analysis_method,
            "question_id": plan.question_id,
            "dataset_version": plan.dataset_version,
            "total_result_rows": table.total_rows,
            "displayed_rows": len(table.rows),
            "truncated": table.truncated,
            **(metadata or {}),
        },
    )


def build_chart_spec(
    plan: ValidatedAnalysisPlan,
    result: AnalysisResult,
) -> ChartSpec | None:
    """
    Build the appropriate visualization for a
    successfully executed analytical question.

    Supported methods:
      - histogram
      - value_counts
      - grouped_aggregation
      - pairwise_relationship
      - time_counts
      - time_aggregation
      - missing_values

    Descriptive statistics intentionally have no chart.
    """

    method = plan.analysis_method
    metadata = result.metadata

    # ----------------------------------------------
    # Numerical descriptive summary
    # ----------------------------------------------

    if method == "descriptive_statistics":
        return None

    # ----------------------------------------------
    # Numerical distribution
    # ----------------------------------------------

    if method == "histogram":
        return make_chart(
            result=result,
            plan=plan,
            kind="histogram",

            x_field="bin_start",
            x_label=metadata["column_name"],
            x_type="quantitative",

            y_field="count",
            y_label="Frequency",

            required_fields={
                "bin_start",
                "bin_end",
                "count",
            },

            metadata={
                # This is NOT a set of raw observations.
                # The statistical executor already
                # calculated histogram frequencies.
                "representation": "prebinned",

                # A renderer must use BOTH edges to
                # construct accurate bar positions.
                "bin_end_field": "bin_end",
                "bin_interval": (
                    "left_closed_right_open_"
                    "except_final"
                ),

                "bin_count": metadata["bin_count"],
                "valid_observations": (
                    metadata["valid_observations"]
                ),
            },
        )

    # ----------------------------------------------
    # Categorical frequency
    # ----------------------------------------------

    if method == "value_counts":
        return make_chart(
            result=result,
            plan=plan,
            kind="bar",

            x_field="category",
            x_label=metadata["column_name"],
            x_type="nominal",

            y_field="count",
            y_label="Record Count",

            required_fields={
                "percent",
            },

            metadata={
                "percentage_field": "percent",
                "percentage_denominator": (
                    metadata["percentage_denominator"]
                ),
                "sort_order": metadata["sort_order"],
            },
        )

    # ----------------------------------------------
    # Grouped numerical aggregation
    # ----------------------------------------------

    if method == "grouped_aggregation":
        aggregation = plan.parameters["aggregation"]

        return make_chart(
            result=result,
            plan=plan,
            kind="bar",

            x_field="category",
            x_label=metadata["group_column_name"],
            x_type="nominal",

            y_field="value",
            y_label=(
                f"{aggregation.title()} of "
                f"{metadata['measure_column_name']}"
            ),

            required_fields={
                "count",
            },

            metadata={
                "aggregation": aggregation,
                "measure_column_id": (
                    metadata["measure_column_id"]
                ),
                "group_column_id": (
                    metadata["group_column_id"]
                ),
                "sort_order": metadata["sort_order"],
            },
        )

    # ----------------------------------------------
    # Pairwise numerical relationship
    # ----------------------------------------------

    if method == "pairwise_relationship":
        return make_chart(
            result=result,
            plan=plan,
            kind="scatter",

            x_field="x",
            x_label=metadata["x_column_name"],
            x_type="quantitative",

            y_field="y",
            y_label=metadata["y_column_name"],

            metadata={
                "sampling": metadata["sampling"],
                "x_column_id": metadata["x_column_id"],
                "y_column_id": metadata["y_column_id"],
            },
        )

    # ----------------------------------------------
    # Temporal record counts
    # ----------------------------------------------

    if method == "time_counts":
        return make_chart(
            result=result,
            plan=plan,
            kind="line",

            x_field="period",
            x_label=metadata["time_column_name"],
            x_type="temporal",

            y_field="count",
            y_label="Record Count",

            metadata={
                "frequency": metadata["frequency"],
                "timezone_basis": (
                    metadata["timezone_basis"]
                ),
                "week_starts_on": (
                    metadata["week_starts_on"]
                ),
            },
        )

    # ----------------------------------------------
    # Temporal numerical aggregation
    # ----------------------------------------------

    if method == "time_aggregation":
        aggregation = plan.parameters["aggregation"]

        return make_chart(
            result=result,
            plan=plan,
            kind="line",

            x_field="period",
            x_label=metadata["time_column_name"],
            x_type="temporal",

            y_field="value",
            y_label=(
                f"{aggregation.title()} of "
                f"{metadata['measure_column_name']}"
            ),

            required_fields={
                "count",
            },

            metadata={
                "aggregation": aggregation,
                "frequency": metadata["frequency"],
                "timezone_basis": (
                    metadata["timezone_basis"]
                ),
                "week_starts_on": (
                    metadata["week_starts_on"]
                ),
            },
        )

    # ----------------------------------------------
    # Dataset missingness
    # ----------------------------------------------

    if method == "missing_values":
        return make_chart(
            result=result,
            plan=plan,
            kind="bar",

            x_field="column",
            x_label="Dataset Column",
            x_type="nominal",

            y_field="missing_count",
            y_label="Missing Values",

            required_fields={
                "column_id",
                "missing_percent",
            },

            metadata={
                "percentage_field": "missing_percent",
                "sort_order": metadata["sort_order"],
            },
        )

    raise ChartSpecificationError(
        f"No chart specification rule exists "
        f"for analysis method '{method}'."
    )