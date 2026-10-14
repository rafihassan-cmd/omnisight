"""Strict validation of analytical question parameters."""

from __future__ import annotations

from typing import Any

from omnisight.core.planner.registry import (
    QuestionTemplate,
)


class InvalidAnalysisParameters(ValueError):
    """The supplied analysis parameters are invalid."""


def normalize_analysis_parameters(
    template: QuestionTemplate,
    supplied: dict[str, Any],
) -> dict[str, int | str]:
    """
    Validate and normalize user-supplied parameters.

    - Reject unknown parameters.
    - Reject incorrect JSON types.
    - Enforce allowed choices and numeric bounds.
    - Supply defaults for omitted parameters.

    Returns a new dictionary containing only parameters
    explicitly defined by the authoritative template.
    """

    if not isinstance(supplied, dict):
        raise InvalidAnalysisParameters(
            "Analysis parameters must be an object."
        )

    allowed = {
        specification.name: specification
        for specification in template.parameters
    }

    unknown = set(supplied) - set(allowed)

    if unknown:
        raise InvalidAnalysisParameters(
            "Unknown analysis parameters: "
            + ", ".join(sorted(unknown))
        )

    normalized: dict[str, int | str] = {}

    for specification in template.parameters:
        name = specification.name

        value = supplied.get(
            name,
            specification.default,
        )

        if specification.value_type == "integer":
            # bool is a subclass of int in Python.
            # Exact type comparison rejects bool.
            if type(value) is not int:
                raise InvalidAnalysisParameters(
                    f"Parameter '{name}' must be an integer."
                )

            if (
                specification.minimum is not None
                and value < specification.minimum
            ):
                raise InvalidAnalysisParameters(
                    f"Parameter '{name}' must be at least "
                    f"{specification.minimum}."
                )

            if (
                specification.maximum is not None
                and value > specification.maximum
            ):
                raise InvalidAnalysisParameters(
                    f"Parameter '{name}' must be at most "
                    f"{specification.maximum}."
                )

            normalized[name] = value
            continue

        if specification.value_type == "select":
            if type(value) is not str:
                raise InvalidAnalysisParameters(
                    f"Parameter '{name}' must be a string."
                )

            if value not in specification.choices:
                choices = ", ".join(
                    specification.choices
                )

                raise InvalidAnalysisParameters(
                    f"Parameter '{name}' must be "
                    f"one of: {choices}."
                )

            normalized[name] = value
            continue

        raise InvalidAnalysisParameters(
            "Unsupported parameter type "
            f"'{specification.value_type}' "
            f"for '{name}'."
        )

    return normalized