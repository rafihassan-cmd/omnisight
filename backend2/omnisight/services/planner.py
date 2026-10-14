"""Resolve and validate analysis requests against live datasets."""

from __future__ import annotations

import copy

from dataclasses import dataclass
from typing import Any

from omnisight.core.planner.generator import (
    GENERATOR_VERSION,
    generate_questions,
)

from omnisight.core.planner.registry import (
    get_question_template,
)

from omnisight.core.planner.validation import (
    normalize_analysis_parameters,
)

from omnisight.services.datasets import (
    DatasetState,
    check_dataset_version,
    profile_dataset,
)


class QuestionNotAvailable(ValueError):
    """The requested question is unavailable for this revision."""


@dataclass(frozen=True)
class ValidatedAnalysisPlan:
    """Authoritative instructions for a future analysis executor."""

    dataset_id: str
    dataset_version: int

    question_id: str
    template_id: str

    title: str
    category: str

    analysis_method: str
    visualization_intent: str

    bindings: dict[str, str]
    parameters: dict[str, int | str]

    generator_version: str


def validate_analysis_request(
    *,
    dataset: DatasetState,
    question_id: str,
    expected_version: int,
    parameters: dict[str, Any],
    max_questions: int,
) -> ValidatedAnalysisPlan:
    """
    Resolve a question using the current dataset.

    IMPORTANT:
    The caller must hold the owning session lock.

    No dataset mutation or statistical execution occurs.
    """

    # Check freshness before expensive catalog generation.
    check_dataset_version(
        dataset,
        expected_version,
    )

    # Profile and catalog are derived from current data.
    profile = profile_dataset(dataset)

    catalog = generate_questions(
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        profile=profile,
        max_questions=max_questions,
    )

    # The client may provide only a question ID.
    # Bindings and methods are resolved server-side.
    question = next(
        (
            item
            for item in catalog["questions"]
            if item["id"] == question_id
        ),
        None,
    )

    if question is None:
        raise QuestionNotAvailable(
            "This analytical question is not available "
            "for the current dataset revision. "
            "Refresh the question catalog."
        )

    template = get_question_template(
        question["template_id"]
    )

    normalized_parameters = (
        normalize_analysis_parameters(
            template=template,
            supplied=parameters,
        )
    )

    # Explicitly verify all bound column identifiers.
    # The generated catalog should already guarantee this.
    current_column_ids = set(dataset.column_ids)

    if any(
        column_id not in current_column_ids
        for column_id in question["bindings"].values()
    ):
        raise QuestionNotAvailable(
            "Question references an unavailable column."
        )

    return ValidatedAnalysisPlan(
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        question_id=question["id"],
        template_id=question["template_id"],
        title=question["title"],
        category=question["category"],
        analysis_method=template.analysis_method,
        visualization_intent=(
            template.visualization_intent
        ),
        bindings=copy.deepcopy(
            question["bindings"]
        ),
        parameters=normalized_parameters,
        generator_version=GENERATOR_VERSION,
    )