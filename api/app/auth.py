"""Auth0 access-token validation and lazy user provisioning.

The API is an OAuth2 resource server: every GraphQL request must carry a valid
Auth0-issued access token for the configured audience. Tokens are RS256-signed
and the signing keys are fetched (and cached) from the tenant JWKS endpoint.

This module validates the access token and maps it to a local ``User`` row.
"""

from __future__ import annotations

from datetime import datetime, timezone

import jwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.config import settings

# Only refresh a user's last_login_at at most this often, to avoid a write on
# every single GraphQL request.
_LOGIN_REFRESH_SECONDS = 300


class AuthError(Exception):
    """Raised when authentication fails; surfaced to the client as HTTP 401."""

    def __init__(self, detail: str, error: str = "invalid_token") -> None:
        super().__init__(detail)
        self.detail = detail
        # OAuth2 error code for the WWW-Authenticate challenge.
        self.error = error


_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    """Process-wide JWKS client (caches signing keys between requests)."""
    global _jwks_client
    if _jwks_client is None:
        if not settings.auth_configured:
            raise AuthError(
                "Auth0 is not configured (set AUTH0_DOMAIN and AUTH0_AUDIENCE).",
                error="server_error",
            )
        _jwks_client = PyJWKClient(settings.auth0_jwks_url)
    return _jwks_client


def verify_access_token(token: str) -> dict:
    """Validate an Auth0 access token and return its claims.

    Verifies the RS256 signature against the tenant JWKS and checks the issuer,
    audience and standard time claims. The algorithm is never taken from the
    token header: only the configured algorithms (RS256) are accepted, so
    ``alg: none`` and key-confusion attacks are rejected. Raises
    :class:`AuthError` on any problem.
    """
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=settings.auth0_algorithms_list,
            audience=settings.auth0_audience,
            issuer=settings.auth0_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except AuthError:
        raise
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid access token: {exc}") from exc
    except Exception as exc:  # e.g. JWKS fetch / signing-key errors
        raise AuthError(f"Could not validate access token: {exc}") from exc


def _claim(claims: dict, name: str) -> str | None:
    """Read a (namespaced) custom claim such as the user's email/name."""
    return claims.get(f"{settings.auth0_namespace}{name}") or claims.get(name)


async def get_or_create_user(db: AsyncSession, claims: dict) -> models.User:
    """Find the user for these token claims, creating it on first login.

    Users are keyed by the immutable ``sub`` claim. Email/name are refreshed
    from the (optional) namespaced custom claims, and ``last_login_at`` is
    bumped at most every few minutes, so the common case does no write at all.
    """
    sub = claims.get("sub")
    if not sub:
        raise AuthError("Access token is missing the 'sub' claim.")

    user = await db.scalar(select(models.User).where(models.User.auth0_sub == sub))
    email = _claim(claims, "email")
    name = _claim(claims, "name")
    now = datetime.now(timezone.utc)

    if user is None:
        user = models.User(auth0_sub=sub, email=email, name=name, last_login_at=now)
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Two concurrent first-logins raced; the other won — reuse its row.
            await db.rollback()
            user = await db.scalar(
                select(models.User).where(models.User.auth0_sub == sub)
            )
            if user is None:
                raise
        return user

    changed = False
    if email is not None and email != user.email:
        user.email = email
        changed = True
    if name is not None and name != user.name:
        user.name = name
        changed = True
    if (
        user.last_login_at is None
        or (now - user.last_login_at).total_seconds() > _LOGIN_REFRESH_SECONDS
    ):
        user.last_login_at = now
        changed = True
    if changed:
        await db.commit()
    return user
