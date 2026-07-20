"""FastAPI application factory and request wiring."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import GraphQLRouter

from app.api.deps import authenticate
from app.api.imports import router as import_router
from app.core.config import get_settings
from app.core.errors import DomainError
from app.core.logging import configure_logging
from app.core.middleware import RequestIDMiddleware
from app.core.observability import configure_observability
from app.db.session import engine, get_db_session, ping
from app.graphql.schema import schema
from app.storage import MediaStorageError, close_media_storage

# Maps a domain error's stable code to the HTTP status the REST endpoints return.
_HTTP_STATUS_BY_CODE = {
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 400,
    "CONFLICT": 409,
}

logger = structlog.get_logger("app.auth")


async def get_context(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """Authenticate the request and expose db + user to GraphQL resolvers.

    Requires a valid Auth0 Bearer access token for the configured audience.
    Authentication failures become HTTP 401 before any resolver runs (see
    ``app.api.deps.authenticate``, shared with the REST upload endpoints).
    """
    user, claims = await authenticate(request, db)
    return {"db": db, "user": user, "claims": claims}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Release the database pool and media storage clients on shutdown."""
    yield
    await engine.dispose()
    await close_media_storage()


def create_app() -> FastAPI:
    """Build and wire the FastAPI application."""
    settings = get_settings()
    configure_logging()

    app = FastAPI(title="Exam Studio API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)

    graphql_app = GraphQLRouter(
        schema,
        # strawberry types context_getter as returning None; ours returns context.
        context_getter=get_context,  # type: ignore[arg-type]
        # The in-browser IDE cannot attach an access token, so only expose it in
        # debug builds. The secured endpoint still serves POST operations.
        graphql_ide="graphiql" if settings.debug else None,
    )
    app.include_router(graphql_app, prefix="/graphql")
    # REST endpoints for binary uploads (ZIP imports); GraphQL keeps JSON imports.
    app.include_router(import_router)

    @app.exception_handler(DomainError)
    async def _domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        """Map a domain error raised from a REST endpoint to its HTTP status.

        GraphQL resolvers never reach this — Strawberry turns their domain errors
        into GraphQL errors (see ``app.graphql.errors``).
        """
        return JSONResponse(
            status_code=_HTTP_STATUS_BY_CODE.get(exc.code, 400),
            content={"detail": str(exc)},
        )

    @app.exception_handler(MediaStorageError)
    async def _media_storage_error_handler(
        request: Request, exc: MediaStorageError
    ) -> JSONResponse:
        # Surface the (non-sensitive, actionable) reason — typically "not
        # configured" — so the operator can fix it without reading the logs.
        logger.error("media storage error", reason=str(exc))
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.get("/health/live", tags=["health"])
    async def liveness() -> dict[str, str]:
        """Liveness: the process is up (does not touch the database)."""
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    async def readiness() -> dict[str, str]:
        """Readiness: the database is reachable, so the API can serve requests."""
        try:
            await ping()
        except Exception as exc:  # any connection error means "not ready"
            raise HTTPException(
                status_code=503, detail="Database unavailable."
            ) from exc
        return {"status": "ready"}

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Backwards-compatible liveness alias."""
        return {"status": "ok"}

    # OpenTelemetry / Prometheus / Sentry — each gated on configuration.
    configure_observability(app)
    return app


app = create_app()
