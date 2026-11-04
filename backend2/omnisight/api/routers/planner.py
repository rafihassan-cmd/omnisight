"""Question-driven analytical planner endpoints."""

from __future__ import annotations

import json
from dataclasses import asdict

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from omnisight.config import settings

from omnisight.api.deps import (
    get_active_session,
    require_mutation_header
)

from omnisight.api.schemas.planner import (
    QuestionCatalogResponse,
    AnalysisValidationRequest,
    AnalysisValidationResponse,
    InterpretRequest,
    InterpretResponse,
)

from omnisight.core.planner.generator import (
    generate_questions,
)


from omnisight.services.planner import (
    QuestionNotAvailable,
    validate_analysis_request,
)

from omnisight.services.datasets import (
    profile_dataset,
    DatasetVersionConflict,
)


from omnisight.core.planner.validation import (
    InvalidAnalysisParameters,
)

from omnisight.services.sessions import SessionState

from omnisight.core.planner.interpreter import (
    SYSTEM_PROMPT,
    build_ai_context,
    resolve_interpretation,
)

from omnisight.services.datasets import check_dataset_version
from omnisight.services.groq_client import LLMServiceError, chat_json

router = APIRouter(
    prefix="/planner",
    tags=["Analysis Planner"],
)


@router.get(
    "/questions",
    response_model=QuestionCatalogResponse,
)
def get_generated_questions(
    session: SessionState = Depends(get_active_session),
):
    """
    Generate dataset-specific analytical questions.

    Does not execute analysis or mutate dataset state.
    """

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        # The profile cache is already version-aware.
        profile = profile_dataset(dataset)

        catalog = generate_questions(
            dataset_id=dataset.id,
            dataset_version=dataset.version,
            profile=profile,
            max_questions=settings.planner_max_questions,
        )

        return QuestionCatalogResponse(**catalog)

@router.post(
    "/validate",
    response_model=AnalysisValidationResponse,
    dependencies=[Depends(require_mutation_header)],
)
def validate_selected_question(
    body: AnalysisValidationRequest,
    session: SessionState = Depends(get_active_session),
):
    """
    Validate a selected analytical question.

    No analysis is executed and no dataset changes
    are committed.
    """

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            plan = validate_analysis_request(
                dataset=dataset,
                question_id=body.question_id,
                expected_version=body.expected_version,
                parameters=body.parameters,
                max_questions=settings.planner_max_questions,
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

        except InvalidAnalysisParameters as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        return AnalysisValidationResponse(
            valid=True,
            plan=asdict(plan),
        )

@router.post(
    "/interpret",
    response_model=InterpretResponse,
    dependencies=[Depends(require_mutation_header)],
)
def interpret_question(
    body: InterpretRequest,
    session: SessionState = Depends(get_active_session),
):
    """Interpret a typed question and verify it is answerable."""

    if not settings.groq_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="The question assistant is not configured "
                   "on the server (GROQ_API_KEY).",
        )

    text = body.text.strip()
    if len(text) < 3:
        raise HTTPException(status_code=422, detail="Type a longer question.")

    with session.lock:
        dataset = session.dataset
        if dataset is None:
            raise HTTPException(status_code=404, detail="No dataset uploaded.")

        try:
            check_dataset_version(dataset, body.expected_version)
        except DatasetVersionConflict as exc:
            raise HTTPException(
                status_code=409,
                detail={"message": str(exc),
                        "current_version": dataset.version},
            ) from exc

        profile = profile_dataset(dataset)
        aliases, context = build_ai_context(profile)
        dataset_id, version = dataset.id, dataset.version

    # Network call happens outside the session lock.
    try:
        ai = chat_json(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
            system=SYSTEM_PROMPT,
            user=json.dumps({"question": text, **context},
                            ensure_ascii=False),
            timeout=settings.groq_timeout_seconds,
        )
    except LLMServiceError as exc:
        raise HTTPException(status_code=exc.status_code,
                            detail=str(exc)) from exc

    result = resolve_interpretation(
        ai=ai,
        profile=profile,
        aliases=aliases,
        dataset_id=dataset_id,
        dataset_version=version,
    )

    with session.lock:
        if session.dataset is not dataset or dataset.version != version:
            raise HTTPException(
                status_code=409,
                detail="Dataset changed while interpreting. Ask again.",
            )

        question = result["question"]
        if question is not None:
            store = dataset.custom_questions
            for key in [k for k, v in store.items() if v["version"] != version]:
                del store[key]
            while len(store) >= 50:
                del store[next(iter(store))]
            store[question["id"]] = {"version": version, "question": question}

    return InterpretResponse(**result)