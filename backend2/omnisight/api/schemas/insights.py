"""Schemas for Gemini analytical interpretations."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InsightContent(BaseModel):
    """
    Structured Gemini-generated interpretation.

    The same model is used for SDK response validation
    and the public API contract.
    """

    headline: str
    summary: str
    findings: list[str]
    limitations: list[str]
    suggested_questions: list[str]


class InsightStatusResponse(BaseModel):
    configured: bool
    model: str


class InsightGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    dataset_version: int
    question_id: str

    model: str
    cached: bool
    generated_at: datetime

    insights: InsightContent