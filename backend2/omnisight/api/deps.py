"""Shared API dependencies."""

from fastapi import (
    Cookie,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)

from omnisight.config import settings
from omnisight.services.sessions import (
    SessionState,
    SessionStore,
)


def get_session_store(request: Request) -> SessionStore:
    return request.app.state.session_store


def get_active_session(
    token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
    store: SessionStore = Depends(get_session_store),
) -> SessionState:
    session = store.get(token)

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session missing or expired.",
        )

    return session


def require_mutation_header(
    request_header: str | None = Header(
        default=None,
        alias="X-OmniSight-Request",
    ),
) -> None:
    if request_header != "1":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing required request header.",
        )