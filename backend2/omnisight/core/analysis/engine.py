"""Dispatch validated analytical plans to executors."""

from __future__ import annotations

from dataclasses import replace
from typing import Callable

import pandas as pd

from omnisight.core.analysis.contracts import (
    AnalysisResult,
)

from omnisight.core.analysis.charts import (
    build_chart_spec,
)

from omnisight.core.analysis.statistics import (
    run_descriptive_statistics,
)

from omnisight.core.analysis.numeric import (
    run_histogram,
    run_pairwise_relationship,
)

from omnisight.core.analysis.grouping import (
    run_value_counts,
    run_grouped_aggregation,
)

from omnisight.core.analysis.temporal import (
    run_time_counts,
    run_time_aggregation,
)

from omnisight.core.analysis.quality import (
    run_missing_values,
)

from omnisight.services.planner import (
    ValidatedAnalysisPlan,
)


class AnalysisMethodNotImplemented(Exception):
    """An approved analytical method has no executor."""


Executor = Callable[
    [pd.DataFrame, list[str], ValidatedAnalysisPlan],
    AnalysisResult,
]


ANALYSIS_EXECUTORS: dict[str, Executor] = {
    "descriptive_statistics": run_descriptive_statistics,
    "histogram": run_histogram,
    "value_counts": run_value_counts,
    "grouped_aggregation": run_grouped_aggregation,
    "pairwise_relationship": run_pairwise_relationship,
    "time_counts": run_time_counts,
    "time_aggregation": run_time_aggregation,
    "missing_values": run_missing_values,
}


def execute_validated_plan(
    *,
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """
    Execute a validated analytical question and
    build its library-independent visualization.

    The caller is responsible for session locking
    and authoritative question validation.

    This function must not mutate the dataset.
    """

    if len(column_ids) != len(dataframe.columns):
        raise ValueError(
            "Column identifiers do not match the DataFrame."
        )

    executor = ANALYSIS_EXECUTORS.get(
        plan.analysis_method
    )

    if executor is None:
        raise AnalysisMethodNotImplemented(
            "The selected analytical method "
            f"'{plan.analysis_method}' "
            "has no registered executor."
        )

    # Stage 1: Execute statistical calculations.
    statistical_result = executor(
        dataframe,
        column_ids,
        plan,
    )

    # Stage 2: Derive visualization instructions
    # from the already computed statistical result.
    chart = build_chart_spec(
        plan,
        statistical_result,
    )

    # Stage 3: Return one unified analysis result.
    # The statistical result remains immutable.
    return replace(
        statistical_result,
        chart=chart,
    )