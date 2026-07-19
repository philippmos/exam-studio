"""FastAPI request dependencies shared by the REST endpoints.

The GraphQL context and the REST upload endpoints authenticate identically (an
Auth0 Bearer access token for the configured audience); the logic lives here so
both share one implementation.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.core.security import AuthError, verify_access_token
from app.db.session import get_db_session
from app.services.auth import get_or_create_user

logger = structlog.get_logger("app.auth")


async def authenticate(
    request: Request, db: AsyncSession
) -> tuple[models.User, dict[str, Any]]:
    """Validate the Bearer access token and load (or create) the user.

    Raises HTTP 401 for a missing or invalid token; the reason (never the token)
    is logged so rejections stay diagnosable.
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
        logger.warning("access token rejected", reason=exc.detail)
        raise HTTPException(
            status_code=401,
            detail=exc.detail,
            headers={"WWW-Authenticate": f'Bearer error="{exc.error}"'},
        ) from exc
    return user, claims


async def require_user(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> models.User:
    """Dependency resolving to the authenticated user for a REST endpoint."""
    user, _ = await authenticate(request, db)
    return user
