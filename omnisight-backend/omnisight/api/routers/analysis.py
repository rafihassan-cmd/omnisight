from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from omnisight.core.analysis import (
    DEFAULTS,
    GOALS,
    calculate,
    numeric_ids,
)
from omnisight.core.profiling import column_names
from omnisight.services.datasets import DatasetStore

from ..deps import get_store

router = APIRouter(
    prefix="/api/v1/datasets",
    tags=["analysis"],
)


class AnalysisContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field("", max_length=200)
    audience: str = Field("", max_length=200)
    unit: str = Field("", max_length=100)


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(
        ge=0,
        strict=True,
    )

    goal: Literal[
        "trends",
        "compare_groups",
        "relationships",
        "unusual_values",
    ]

    target_column_id: str
    date_column_id: str | None = None
    group_column_id: str | None = None
    date_format: str | None = None

    observation_structure: Literal[
        "independent",
        "repeated",
        "unknown",
    ] = "unknown"

    context: AnalysisContext = Field(
        default_factory=AnalysisContext
    )


@router.get("/{dataset_id}/analysis/options")
def analysis_options(
    dataset_id: str,
    store: DatasetStore = Depends(get_store),
):
    ds = store.get(dataset_id)

    with ds.lock:
        names = column_names(ds.current)
        numeric = numeric_ids(ds.current)

        return {
            "dataset_id": ds.id,
            "version": ds.version,
            "goals": list(GOALS),
            "defaults": DEFAULTS,
            "columns": [
                {
                    "id": cid,
                    "name": names[cid],
                    "is_numeric": cid in numeric,
                    "missing": int(
                        ds.current[cid].isna().sum()
                    ),
                }
                for cid in ds.current.columns
            ],
            "initial_request": {
                "expected_version": ds.version,
                "goal": None,
                "target_column_id": None,
                "date_column_id": None,
                "group_column_id": None,
                "date_format": None,
                "observation_structure": "unknown",
                "context": {
                    "topic": "",
                    "audience": "",
                    "unit": "",
                },
            },
            "future_requirements": [
                "categorical_targets",
                "prediction",
                "feature_importance",
                "custom_analysis_settings",
            ],
        }


@router.post("/{dataset_id}/analysis")
def run_analysis(
    dataset_id: str,
    req: AnalysisRequest,
    store: DatasetStore = Depends(get_store),
):
    ds = store.get(dataset_id)

    with ds.lock:
        store.check_version(
            ds,
            req.expected_version,
        )

        # Calculations use this dataset version.
        snapshot = ds.current.copy(deep=False)
        version = ds.version

    result = calculate(
        snapshot,
        req.model_dump(),
    )

    return {
        "dataset_id": dataset_id,
        "version": version,
        **result,
    }