from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from omnisight import __version__
from omnisight.config import settings
from omnisight.core.errors import CleaningError, VersionConflict
from omnisight.services.datasets import DatasetNotFound

from .routers import datasets


def create_app() -> FastAPI:
    app = FastAPI(title="OmniSight API", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(CleaningError)
    async def _cleaning_error(_: Request, exc: CleaningError):
        return JSONResponse(status_code=409 if isinstance(exc, VersionConflict) else 422,
                            content={"detail": str(exc), **exc.details})

    @app.exception_handler(DatasetNotFound)
    async def _not_found(_: Request, exc: DatasetNotFound):
        return JSONResponse(
            status_code=404,
            content={"detail": "Dataset not found (expired or never uploaded)."},
        )

    @app.get("/health")
    def health():
        return {"status": "online", "version": __version__}

    # Mount point for future phases: app.include_router(stats.router), charts.router, ...
    app.include_router(datasets.router)
    return app


app = create_app()
