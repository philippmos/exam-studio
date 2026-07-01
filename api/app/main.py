"""FastAPI application factory and request wiring."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import GraphQLRouter

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestIDMiddleware
from app.core.observability import configure_observability
from app.core.security import AuthError, verify_access_token
from app.db.session import engine, get_db_session, ping
from app.graphql.schema import schema
from app.services.auth import get_or_create_user

logger = structlog.get_logger("app.auth")


async def get_context(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """Authenticate the request and expose db + user to GraphQL resolvers.

    Requires a valid Auth0 Bearer access token for the configured audience.
    Authentication failures become HTTP 401 before any resolver runs.
    """
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if not token or scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = verify_access_token(token)
        user = await get_or_create_user(db, claims)
    except AuthError as exc:
        # Log the reason (not the token) so token-rejection causes are diagnosable.
        logger.warning("access token rejected", reason=exc.detail)
        raise HTTPException(
            status_code=401,
            detail=exc.detail,
            headers={"WWW-Authenticate": f'Bearer error="{exc.error}"'},
        ) from exc

    return {"db": db, "user": user, "claims": claims}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Dispose the database engine's connection pool on shutdown."""
    yield
    await engine.dispose()


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
