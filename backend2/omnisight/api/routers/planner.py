"""Question-driven analytical planner endpoints."""

from __future__ import annotations

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