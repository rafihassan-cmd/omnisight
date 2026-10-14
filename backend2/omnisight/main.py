"""OmniSight FastAPI application."""

import asyncio

from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from omnisight.config import settings
from omnisight.services.sessions import SessionStore

from omnisight.api.routers.health import (
    router as health_router,
)
from omnisight.api.routers.sessions import (
    router as session_router,
)
from omnisight.api.routers.datasets import (
    router as dataset_router,
)
from omnisight.api.routers.cleaning import (
    router as cleaning_router,
)
from omnisight.api.routers.planner import (
    router as planner_router,
)
from omnisight.api.routers.analysis import (
    router as analysis_router,
)
from omnisight.api.routers.insights import (
    router as insights_router,
)


async def session_cleanup_worker(
    store: SessionStore,
) -> None:
    while True:
        await asyncio.sleep(
            settings.session_cleanup_seconds
        )

        store.cleanup_expired()


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = SessionStore(
        ttl_seconds=settings.session_ttl_seconds,
        max_sessions=settings.max_sessions,
    )

    app.state.session_store = store

    cleanup_task = asyncio.create_task(
        session_cleanup_worker(store)
    )

    try:
        yield
    finally:
        cleanup_task.cancel()

        with suppress(asyncio.CancelledError):
            await cleanup_task

        store.clear()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)


app.include_router(
    health_router,
    prefix=settings.api_prefix,
)

app.include_router(
    session_router,
    prefix=settings.api_prefix,
)

app.include_router(
    dataset_router,
    prefix=settings.api_prefix,
)
app.include_router(
    cleaning_router,
    prefix=settings.api_prefix,
)
app.include_router(
    planner_router,
    prefix=settings.api_prefix,
)
app.include_router(
    analysis_router,
    prefix=settings.api_prefix,
)
app.include_router(
    insights_router,
    prefix=settings.api_prefix,
)