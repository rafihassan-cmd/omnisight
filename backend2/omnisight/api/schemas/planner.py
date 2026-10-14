"""Schemas for generated analytical questions."""

from __future__ import annotations

from typing import Literal, Any

from pydantic import BaseModel, Field, ConfigDict


class QuestionParameterSpec(BaseModel):
    name: str
    label: str

    value_type: Literal["integer", "select"]
    default: int | str

    choices: list[str] = Field(default_factory=list)

    minimum: int | None = None
    maximum: int | None = None


class GeneratedQuestion(BaseModel):
    id: str

    template_id: str
    category: str

    title: str
    description: str

    # Bindings use stable dataset column IDs.
    bindings: dict[str, str]

    # Parameter defaults proposed by the backend.
    parameters: dict[str, int | str]

    # Frontend-renderable parameter definitions.
    parameter_schema: list[QuestionParameterSpec]

    # Independent of any plotting library.
    analysis_method: str
    visualization_intent: str


class QuestionCatalogResponse(BaseModel):
    dataset_id: str
    dataset_version: int

    generator_version: str
    total_questions: int

    questions: list[GeneratedQuestion]

class AnalysisValidationRequest(BaseModel):
    """Request to validate a selected generated question."""

    model_config = ConfigDict(
        extra="forbid",
    )

    question_id: str = Field(
        min_length=26,
        max_length=26,
        pattern=r"^q_[a-f0-9]{24}$",
    )

    expected_version: int = Field(
        ge=0,
        strict=True,
    )

    parameters: dict[str, Any] = Field(
        default_factory=dict,
    )


class ValidatedAnalysisPlanResponse(BaseModel):
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


class AnalysisValidationResponse(BaseModel):
    valid: bool
    plan: ValidatedAnalysisPlanResponse