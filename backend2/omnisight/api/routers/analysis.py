"""Authenticated, question-driven analysis execution API."""

from __future__ import annotations

import uuid

from dataclasses import asdict
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

from omnisight.api.schemas.analysis import (
    AnalysisExecutionResponse,
)

from omnisight.core.analysis.engine import (
    AnalysisMethodNotImplemented,
    execute_validated_plan,
)

from omnisight.core.analysis.statistics import (
    AnalysisNotApplicable,
)

from omnisight.core.planner.validation import (
    InvalidAnalysisParameters,
)

from omnisight.services.datasets import (
    DatasetVersionConflict,
)

from omnisight.services.planner import (
    QuestionNotAvailable,
    validate_analysis_request,
)

from omnisight.services.sessions import (
    SessionState,
)


router = APIRouter(
    prefix="/analysis",
    tags=["Analysis"],
)


@router.post(
    "/execute",
    response_model=AnalysisExecutionResponse,
    dependencies=[Depends(require_mutation_header)],
)
def execute_analysis(
    body: AnalysisValidationRequest,
    session: SessionState = Depends(get_active_session),
):
    """
    Validate and execute one generated question.

    Analyses are read-only.
    No dataset or history mutation occurs.
    """

    with session.lock:
        dataset = session.dataset

        if dataset is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset uploaded.",
            )

        try:
            # Revalidate every execution request.
            # Do not trust a previous validation result.
            plan = validate_analysis_request(
                dataset=dataset,
                question_id=body.question_id,
                expected_version=body.expected_version,
                parameters=body.parameters,
                max_questions=settings.planner_max_questions,
            )

            # Execute only the server-resolved method.
            result = execute_validated_plan(
                dataframe=dataset.current,
                column_ids=dataset.column_ids,
                plan=plan,
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

        except AnalysisNotApplicable as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        except AnalysisMethodNotImplemented as exc:
            raise HTTPException(
                status_code=501,
                detail=str(exc),
            ) from exc

        return AnalysisExecutionResponse(
            execution_id=f"run_{uuid.uuid4().hex}",
            executed_at=datetime.now(timezone.utc),
            plan=asdict(plan),
            result=asdict(result),
        )