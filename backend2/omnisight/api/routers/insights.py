"""Session-scoped Gemini insight endpoints."""

from __future__ import annotations

import hashlib
import json
import time

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from omnisight.config import settings

from omnisight.api.deps import (
    get_active_session,
    require_mutation_header,
)

from omnisight.api.schemas.planner import (
    AnalysisValidationRequest,
)

from omnisight.api.schemas.insights import (
    InsightGenerationResponse,
    InsightStatusResponse,
)

from omnisight.core.analysis.engine import (
    AnalysisMethodNotImplemented,
    execute_validated_plan,
)

from omnisight.core.analysis.statistics import (
    AnalysisNotApplicable,
)

from omnisight.core.insights.context import (
    CONTEXT_VERSION,
    build_insight_context,
)

from omnisight.core.planner.validation import (
    InvalidAnalysisParameters,
)

from omnisight.services.datasets import (
    DatasetVersionConflict,
)

from omnisight.services.gemini import (
    GeminiNotConfigured,
    GeminiServiceError,
    generate_gemini_insights,
)

from omnisight.services.planner import (
    QuestionNotAvailable,
    validate_analysis_request,
)

from omnisight.services.sessions import (
    SessionState,
)


router = APIRouter(
    prefix="/insights",
    tags=["AI Insights"],
)


def make_cache_key(plan) -> str:
    """Identify one analytical request and AI model."""

    identity = {
        "dataset_id": plan.dataset_id,
        "dataset_version": plan.dataset_version,
        "question_id": plan.question_id,
        "parameters": plan.parameters,
        "model": settings.gemini_model,
        "context_version": CONTEXT_VERSION,
    }

    serialized = json.dumps(
        identity,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        serialized.encode("utf-8")
    ).hexdigest()


@router.get(
    "/status",
    response_model=InsightStatusResponse,
)
def get_insight_status(
    session: SessionState = Depends(get_active_session),
):
    return InsightStatusResponse(
        configured=bool(settings.gemini_api_key.strip()),
        model=settings.gemini_model,
    )


@router.post(
    "/generate",
    response_model=InsightGenerationResponse,
    dependencies=[Depends(require_mutation_header)],
)
def generate_insights(
    body: AnalysisValidationRequest,
    session: SessionState = Depends(get_active_session),
):
    """
    Interpret the current analysis using Gemini.

    Dataset and cache access are protected by the
    session lock. The external Gemini request runs
    outside that lock.
    """

    if not settings.gemini_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured on the server.",
        )

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            # Validate against the CURRENT dataset.
            plan = validate_analysis_request(
                dataset=dataset,
                question_id=body.question_id,
                expected_version=body.expected_version,
                parameters=body.parameters,
                max_questions=settings.planner_max_questions,
            )

            cache_key = make_cache_key(plan)

            cached = dataset.insights_cache.get(
                cache_key
            )

            if (
                cached is not None
                and cached["expires_at"] > time.monotonic()
            ):
                return InsightGenerationResponse(
                    cached=True,
                    **cached["payload"],
                )

            # Run the same statistical executor used
            # by /analysis/execute.
            result = execute_validated_plan(
                dataframe=dataset.current,
                column_ids=dataset.column_ids,
                plan=plan,
            )

            # Produce a bounded, aggregate-only payload.
            context = build_insight_context(
                plan,
                result,
            )

        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": str(exc),
                    "current_version": dataset.version,
                },
            ) from exc

        except QuestionNotAvailable as exc:
            raise HTTPException(
                status_code=404,
                detail=str(exc),
            ) from exc

        except (
            InvalidAnalysisParameters,
            AnalysisNotApplicable,
        ) as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        except AnalysisMethodNotImplemented as exc:
            raise HTTPException(
                status_code=501,
                detail=str(exc),
            ) from exc

    # IMPORTANT:
    # Never hold the session lock during a network
    # request to Gemini.
    try:
        insight_content = generate_gemini_insights(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_ms=settings.gemini_timeout_ms,
            context=context,
        )

    except GeminiNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except GeminiServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc

    with session.lock:
        current_dataset = session.dataset

        # A cleaning operation may have completed
        # while Gemini was generating an explanation.
        if (
            current_dataset is not dataset
            or current_dataset.version != plan.dataset_version
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Dataset changed during AI generation. "
                    "Execute the question again."
                ),
            )

        payload = {
            "dataset_id": plan.dataset_id,
            "dataset_version": plan.dataset_version,
            "question_id": plan.question_id,
            "model": settings.gemini_model,
            "generated_at": datetime.now(timezone.utc),
            "insights": insight_content.model_dump(),
        }

        cache = dataset.insights_cache

        # Prune expired cache entries.
        current_time = time.monotonic()

        for key in list(cache):
            if cache[key]["expires_at"] <= current_time:
                del cache[key]

        # Bound memory usage within this session.
        maximum = max(
            1,
            settings.insights_cache_max_entries,
        )

        while len(cache) >= maximum:
            oldest_key = next(iter(cache))
            del cache[oldest_key]

        cache[cache_key] = {
            "expires_at": (
                current_time
                + max(
                    1,
                    settings.insights_cache_ttl_seconds,
                )
            ),
            "payload": payload,
        }

        return InsightGenerationResponse(
            cached=False,
            **payload,
        )