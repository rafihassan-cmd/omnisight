"""Declarative analytical question registry."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ParameterSpec:
    name: str
    label: str
    value_type: str

    default: int | str

    choices: tuple[str, ...] = ()

    minimum: int | None = None
    maximum: int | None = None


@dataclass(frozen=True)
class QuestionTemplate:
    id: str
    category: str

    analysis_method: str
    visualization_intent: str

    parameters: tuple[ParameterSpec, ...] = ()


QUESTION_TEMPLATES: dict[str, QuestionTemplate] = {

    "numeric.summary": QuestionTemplate(
        id="numeric.summary",
        category="summary",
        analysis_method="descriptive_statistics",
        visualization_intent="statistics",
    ),

    "numeric.distribution": QuestionTemplate(
        id="numeric.distribution",
        category="distribution",
        analysis_method="histogram",
        visualization_intent="histogram",
        parameters=(
            ParameterSpec(
                name="bins",
                label="Number of Bins",
                value_type="integer",
                default=20,
                minimum=5,
                maximum=60,
            ),
        ),
    ),

    "category.frequency": QuestionTemplate(
        id="category.frequency",
        category="composition",
        analysis_method="value_counts",
        visualization_intent="bar",
        parameters=(
            ParameterSpec(
                name="top_n",
                label="Maximum Categories",
                value_type="integer",
                default=10,
                minimum=1,
                maximum=30,
            ),
        ),
    ),

    "category.numeric": QuestionTemplate(
        id="category.numeric",
        category="comparison",
        analysis_method="grouped_aggregation",
        visualization_intent="bar",
        parameters=(
            ParameterSpec(
                name="aggregation",
                label="Aggregation",
                value_type="select",
                default="mean",
                choices=("mean", "sum", "median"),
            ),
            ParameterSpec(
                name="top_n",
                label="Maximum Categories",
                value_type="integer",
                default=10,
                minimum=1,
                maximum=30,
            ),
        ),
    ),

    "numeric.relationship": QuestionTemplate(
        id="numeric.relationship",
        category="relationship",
        analysis_method="pairwise_relationship",
        visualization_intent="scatter",
        parameters=(
            ParameterSpec(
                name="max_points",
                label="Maximum Displayed Points",
                value_type="integer",
                default=1000,
                minimum=100,
                maximum=5000,
            ),
        ),
    ),

    "time.metric_trend": QuestionTemplate(
        id="time.metric_trend",
        category="temporal",
        analysis_method="time_aggregation",
        visualization_intent="line",
        parameters=(
            ParameterSpec(
                name="frequency",
                label="Time Frequency",
                value_type="select",
                default="month",
                choices=("day", "week", "month", "year"),
            ),
            ParameterSpec(
                name="aggregation",
                label="Aggregation",
                value_type="select",
                default="sum",
                choices=("sum", "mean", "median"),
            ),
        ),
    ),

    "time.record_count": QuestionTemplate(
        id="time.record_count",
        category="temporal",
        analysis_method="time_counts",
        visualization_intent="line",
        parameters=(
            ParameterSpec(
                name="frequency",
                label="Time Frequency",
                value_type="select",
                default="month",
                choices=("day", "week", "month", "year"),
            ),
        ),
    ),

    "dataset.missingness": QuestionTemplate(
        id="dataset.missingness",
        category="quality",
        analysis_method="missing_values",
        visualization_intent="bar",
    ),
}


class UnknownQuestionTemplate(ValueError):
    pass


def get_question_template(
    template_id: str,
) -> QuestionTemplate:
    template = QUESTION_TEMPLATES.get(template_id)

    if template is None:
        raise UnknownQuestionTemplate(
            f"Unknown question template: {template_id}"
        )

    return template