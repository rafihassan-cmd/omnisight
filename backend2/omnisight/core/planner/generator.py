"""Deterministic analytical question generation."""

from __future__ import annotations

import hashlib
import json

from dataclasses import asdict
from itertools import combinations
from typing import Any

from omnisight.core.planner.registry import (
    get_question_template,
)


GENERATOR_VERSION = "rules-v1"


# Prevent excessive question generation on wide datasets.
PER_TEMPLATE_LIMITS = {
    "dataset.missingness": 1,
    "numeric.summary": 8,
    "numeric.distribution": 8,
    "category.frequency": 8,
    "category.numeric": 18,
    "numeric.relationship": 12,
    "time.record_count": 4,
    "time.metric_trend": 12,
}


def make_question_id(
    dataset_id: str,
    dataset_version: int,
    template_id: str,
    bindings: dict[str, str],
) -> str:
    """
    Create a reproducible identifier for a question.

    Identifiers change when the dataset version changes.
    """

    identity = {
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "generator_version": GENERATOR_VERSION,
        "template_id": template_id,
        "bindings": bindings,
    }

    canonical = json.dumps(
        identity,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )

    digest = hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()[:24]

    return f"q_{digest}"


def is_numeric(
    column: dict[str, Any],
) -> bool:
    return (
        column["semantic_type"] == "numeric"
        and column["non_null_count"] > 0
    )


def is_categorical(
    column: dict[str, Any],
) -> bool:
    """
    Limit categorical questions to manageable
    numbers of distinct groups.
    """

    return (
        column["semantic_type"] in (
            "categorical",
            "boolean",
        )
        and column["non_null_count"] > 0
        and 1 <= column["unique_count"] <= 25
    )


def is_datetime(
    column: dict[str, Any],
) -> bool:
    """
    A datetime_candidate is deliberately excluded.

    The user must explicitly convert it during cleaning.
    """

    return (
        column["semantic_type"] == "datetime"
        and column["non_null_count"] >= 2
        and column["unique_count"] >= 2
    )


def has_numeric_variation(
    column: dict[str, Any],
) -> bool:
    return (
        is_numeric(column)
        and column["non_null_count"] >= 2
        and column["unique_count"] >= 2
    )


def generate_questions(
    *,
    dataset_id: str,
    dataset_version: int,
    profile: dict[str, Any],
    max_questions: int = 80,
) -> dict[str, Any]:
    """
    Generate eligible questions from dataset metadata.

    No DataFrame mutation or analysis execution occurs.
    """

    columns = profile["columns"]

    numeric_columns = [
        column for column in columns
        if is_numeric(column)
    ][:12]

    categorical_columns = [
        column for column in columns
        if is_categorical(column)
    ][:8]

    datetime_columns = [
        column for column in columns
        if is_datetime(column)
    ][:4]

    questions: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    limit = max(1, min(max_questions, 150))

    def add_question(
        template_id: str,
        title: str,
        description: str,
        bindings: dict[str, str],
    ) -> None:
        """Append an eligible question within configured limits."""

        if len(questions) >= limit:
            return

        current_count = counts.get(template_id, 0)

        if current_count >= PER_TEMPLATE_LIMITS[template_id]:
            return

        template = get_question_template(template_id)

        parameter_schema = [
            asdict(parameter)
            for parameter in template.parameters
        ]

        default_parameters = {
            parameter.name: parameter.default
            for parameter in template.parameters
        }

        questions.append({
            "id": make_question_id(
                dataset_id,
                dataset_version,
                template_id,
                bindings,
            ),
            "template_id": template_id,
            "category": template.category,
            "title": title,
            "description": description,
            "bindings": bindings,
            "parameters": default_parameters,
            "parameter_schema": parameter_schema,
            "analysis_method": template.analysis_method,
            "visualization_intent": (
                template.visualization_intent
            ),
        })

        counts[template_id] = current_count + 1

    # ------------------------------------------------
    # Dataset quality
    # ------------------------------------------------

    if profile["missing_cells"] > 0:
        add_question(
            "dataset.missingness",
            "Which columns contain missing values?",
            "Compare missing-value counts across columns.",
            {},
        )

    # ------------------------------------------------
    # Numeric summaries
    # ------------------------------------------------

    for column in numeric_columns:
        name = column["name"]

        add_question(
            "numeric.summary",
            f"What are the key statistics of {name}?",
            "Review central tendency, spread and range.",
            {"measure": column["id"]},
        )

    # ------------------------------------------------
    # Numeric distributions
    # ------------------------------------------------

    for column in numeric_columns:
        if not has_numeric_variation(column):
            continue

        add_question(
            "numeric.distribution",
            f"How is {column['name']} distributed?",
            "Examine the frequency of numeric values "
            "across intervals.",
            {"measure": column["id"]},
        )

    # ------------------------------------------------
    # Categorical composition
    # ------------------------------------------------

    for column in categorical_columns:
        add_question(
            "category.frequency",
            f"How are records distributed across {column['name']}?",
            "Compare record counts by category.",
            {"group_by": column["id"]},
        )

    # ------------------------------------------------
    # Numeric measure by category
    # ------------------------------------------------

    for category in categorical_columns:
        for numeric in numeric_columns:
            add_question(
                "category.numeric",
                (
                    f"How does average {numeric['name']} "
                    f"vary by {category['name']}?"
                ),
                "Compare an aggregated numeric measure "
                "across categories.",
                {
                    "group_by": category["id"],
                    "measure": numeric["id"],
                },
            )

    # ------------------------------------------------
    # Relationships between numeric variables
    # ------------------------------------------------

    varying_numeric = [
        column for column in numeric_columns
        if (
            column["non_null_count"] >= 3
            and column["unique_count"] >= 2
        )
    ]

    for x_column, y_column in combinations(
        varying_numeric,
        2,
    ):
        add_question(
            "numeric.relationship",
            (
                f"How are {x_column['name']} and "
                f"{y_column['name']} related?"
            ),
            "Explore paired observations and their "
            "statistical relationship.",
            {
                "x": x_column["id"],
                "y": y_column["id"],
            },
        )

    # ------------------------------------------------
    # Temporal record counts
    # ------------------------------------------------

    for date_column in datetime_columns:
        add_question(
            "time.record_count",
            (
                f"How does the number of records "
                f"change over {date_column['name']}?"
            ),
            "Count records by time period.",
            {"time": date_column["id"]},
        )

    # ------------------------------------------------
    # Temporal numeric trends
    # ------------------------------------------------

    for date_column in datetime_columns:
        for numeric in numeric_columns:
            add_question(
                "time.metric_trend",
                (
                    f"How has {numeric['name']} changed "
                    f"over {date_column['name']}?"
                ),
                "Aggregate a numeric measure by time period.",
                {
                    "time": date_column["id"],
                    "measure": numeric["id"],
                },
            )

    return {
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "generator_version": GENERATOR_VERSION,
        "total_questions": len(questions),
        "questions": questions,
    }