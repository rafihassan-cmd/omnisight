"""Prepare bounded, aggregate-only context for AI interpretation."""

from __future__ import annotations

import json
import math
from typing import Any

from omnisight.core.analysis.contracts import (
    AnalysisResult,
)
from omnisight.services.planner import (
    ValidatedAnalysisPlan,
)


CONTEXT_VERSION = "insights-v1"
MAX_SERIES_ROWS = 60
MAX_CONTEXT_CHARACTERS = 14000
MIN_GROUP_OBSERVATIONS = 3


def short_text(value: Any, limit: int = 120) -> str:
    return str(value)[:limit]


def safe_number(value: Any):
    if type(value) is bool:
        return value

    if type(value) is int:
        return value

    if type(value) is float:
        return value if math.isfinite(value) else None

    return None


def extract_series(
    method: str,
    result: AnalysisResult,
) -> tuple[list[dict], str, int]:
    """
    Return a bounded set of aggregated observations.

    Individual scatter points are deliberately excluded.
    """

    table = result.table

    if table is None:
        return [], "no_result_table", 0

    source_rows = table.rows

    if method == "pairwise_relationship":
        return [], "pairwise_records_withheld", 0

    records = []

    for row in source_rows:
        if method == "histogram":
            records.append({
                "bin_start": safe_number(
                    row["bin_start"]
                ),
                "bin_end": safe_number(
                    row["bin_end"]
                ),
                "count": safe_number(
                    row["count"]
                ),
            })

        elif method == "value_counts":
            if row["count"] < MIN_GROUP_OBSERVATIONS:
                continue

            records.append({
                "category": short_text(row["category"], 80),
                "count": safe_number(row["count"]),
                "percent": safe_number(row["percent"]),
            })

        elif method == "grouped_aggregation":
            if row["count"] < MIN_GROUP_OBSERVATIONS:
                continue

            records.append({
                "category": short_text(row["category"], 80),
                "value": safe_number(row["value"]),
                "count": safe_number(row["count"]),
            })

        elif method == "time_counts":
            records.append({
                "period": short_text(row["period"], 30),
                "count": safe_number(row["count"]),
            })

        elif method == "time_aggregation":
            if row["count"] < MIN_GROUP_OBSERVATIONS:
                continue

            records.append({
                "period": short_text(row["period"], 30),
                "value": safe_number(row["value"]),
                "count": safe_number(row["count"]),
            })

        elif method == "missing_values":
            records.append({
                "column": short_text(row["column"], 80),
                "missing_count": safe_number(
                    row["missing_count"]
                ),
                "missing_percent": safe_number(
                    row["missing_percent"]
                ),
            })

    # For temporal data, prefer recent periods.
    if method in ("time_counts", "time_aggregation"):
        return (
            records[-MAX_SERIES_ROWS:],
            "latest_time_periods",
            len(records),
        )

    # Other statistical result tables are already
    # ordered by the responsible analysis executor.
    return (
        records[:MAX_SERIES_ROWS],
        "first_aggregated_records",
        len(records),
    )


def build_insight_context(
    plan: ValidatedAnalysisPlan,
    result: AnalysisResult,
) -> dict[str, Any]:
    """
    Build a JSON-compatible interpretation context.

    Never include:
      - raw DataFrame rows
      - raw CSV contents
      - scatter-plot observation pairs
      - session cookies or API keys
    """

    metrics = [
        {
            "key": short_text(metric.key, 50),
            "label": short_text(metric.label, 80),
            "value": (
                short_text(metric.value, 120)
                if isinstance(metric.value, str)
                else safe_number(metric.value)
            ),
        }
        for metric in result.metrics[:24]
    ]

    series, selection, eligible_rows = extract_series(
        plan.analysis_method,
        result,
    )

    context = {
        "context_version": CONTEXT_VERSION,

        "question": short_text(plan.title, 200),
        "template_id": plan.template_id,
        "analysis_method": plan.analysis_method,
        "visualization_intent": (
            plan.visualization_intent
        ),

        "parameters": dict(plan.parameters),

        "metrics": metrics,

        "warnings": [
            short_text(warning, 240)
            for warning in result.warnings[:10]
        ],

        "aggregation_details": {
            key: value
            for key, value in result.metadata.items()
            if key in {
                "aggregation",
                "frequency",
                "sampling",
                "sort_order",
                "valid_observations",
                "finite_observations",
                "total_rows",
                "excluded_rows",
                "excluded_non_finite",
            }
            and type(value) in (str, int, float, bool)
        },

        "series": {
            "records": series,
            "selection": selection,
            "eligible_rows": eligible_rows,
            "total_result_rows": (
                result.table.total_rows
                if result.table
                else 0
            ),
            "result_was_truncated": (
                result.table.truncated
                if result.table
                else False
            ),
        },

        "privacy_notes": [
            "Raw dataset rows were not included.",
            "Individual scatter observations were withheld.",
            "Grouped numeric values with fewer than "
            "three observations were excluded.",
            "Some aggregated values or labels may "
            "still be sensitive.",
        ],
    }

    # Bound the serialized payload, without breaking JSON.
    # Drop the least-prioritized trailing records.
    while (
        len(json.dumps(context, ensure_ascii=False))
        > MAX_CONTEXT_CHARACTERS
        and context["series"]["records"]
    ):
        context["series"]["records"].pop()

    context["series"]["records_sent"] = len(
        context["series"]["records"]
    )

    return context