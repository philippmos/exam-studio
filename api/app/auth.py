"""Lazy provisioning of the local ``User`` row from validated token claims.

Access-token *validation* lives in :mod:`app.core.security`; this module maps a
set of validated claims to a local user, creating it on first login. The data
access here is slated to move into the user repository/service in a later step.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.core.config import get_settings
from app.core.security import AuthError

# Only refresh a user's last_login_at at most this often, to avoid a write on
# every single GraphQL request.
_LOGIN_REFRESH_SECONDS = 300


def _claim(claims: dict[str, Any], name: str) -> str | None:
    """Read a (namespaced) custom claim such as the user's email/name."""
    namespace = get_settings().auth0_namespace
    return claims.get(f"{namespace}{name}") or claims.get(name)


async def get_or_create_user(db: AsyncSession, claims: dict[str, Any]) -> models.User:
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
    now = datetime.now(UTC)

    if user is None:
        user = models.User(auth0_sub=sub, email=email, name=name, last_login_at=now)
        # Give every new user a settings row up front (cascades on commit) so
        # resolvers always find their preferences.
        user.settings = models.UserSettings()
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
