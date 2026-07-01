"""Auth0 access-token validation (RS256 / JWKS).

The API is an OAuth2 resource server: every GraphQL request must carry a valid
Auth0-issued access token for the configured audience. Tokens are RS256-signed
and the signing keys are fetched (and cached) from the tenant JWKS endpoint.

This module only *validates* the token and returns its claims; mapping a token
to a local ``User`` row lives in the user repository/service.
"""

from __future__ import annotations

from typing import Any

import jwt
from jwt import PyJWKClient

from app.core.config import get_settings


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
        settings = get_settings()
        if not settings.auth_configured:
            raise AuthError(
                "Auth0 is not configured (set AUTH0_DOMAIN and AUTH0_AUDIENCE).",
                error="server_error",
            )
        _jwks_client = PyJWKClient(settings.auth0_jwks_url)
    return _jwks_client


def verify_access_token(token: str) -> dict[str, Any]:
    """Validate an Auth0 access token and return its claims.

    Verifies the RS256 signature against the tenant JWKS and checks the issuer,
    audience and standard time claims. The algorithm is never taken from the
    token header: only the configured algorithms (RS256) are accepted, so
    ``alg: none`` and key-confusion attacks are rejected. Raises
    :class:`AuthError` on any problem.
    """
    settings = get_settings()
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=settings.auth0_algorithms_list,
            audience=settings.auth0_audience,
            issuer=settings.auth0_issuer,
            # Tolerate small Auth0/host clock drift on iat/nbf/exp.
            leeway=settings.auth0_leeway_seconds,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except AuthError:
        raise
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid access token: {exc}") from exc
    except Exception as exc:  # e.g. JWKS fetch / signing-key errors
        raise AuthError(f"Could not validate access token: {exc}") from exc
