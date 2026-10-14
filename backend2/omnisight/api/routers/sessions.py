"""Browser session API."""

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Response,
    status,
)

from omnisight.config import settings
from omnisight.api.deps import (
    get_active_session,
    get_session_store,
    require_mutation_header,
)
from omnisight.api.schemas.sessions import SessionResponse
from omnisight.services.sessions import (
    SessionCapacityError,
    SessionState,
    SessionStore,
)


router = APIRouter(
    prefix="/sessions",
    tags=["Sessions"],
)


def serialize_session(
    session: SessionState,
) -> SessionResponse:
    return SessionResponse(
        active=True,
        has_dataset=session.dataset is not None,
        created_at=session.created_at,
        idle_timeout_seconds=settings.session_ttl_seconds,
    )


@router.post("", response_model=SessionResponse)
def create_session(
    response: Response,
    token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
    store: SessionStore = Depends(get_session_store),
    _: None = Depends(require_mutation_header),
):
    # Reuse an existing active browser session.
    session = store.get(token)

    if session is None:
        try:
            session = store.create()
        except SessionCapacityError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Session capacity reached.",
            )

        response.status_code = status.HTTP_201_CREATED

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session.token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=settings.api_prefix,
    )

    return serialize_session(session)


@router.get(
    "/current",
    response_model=SessionResponse,
)
def current_session(
    session: SessionState = Depends(get_active_session),
):
    return serialize_session(session)


@router.delete(
    "/current",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_session(
    response: Response,
    token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
    store: SessionStore = Depends(get_session_store),
    _: None = Depends(require_mutation_header),
):
    store.delete(token)

    response.delete_cookie(
        key=settings.session_cookie_name,
        path=settings.api_prefix,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )