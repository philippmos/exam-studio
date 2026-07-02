"""Data access for users and their settings rows."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models


async def get_by_sub(db: AsyncSession, sub: str) -> models.User | None:
    """The user with this Auth0 ``sub``, or ``None``."""
    return await db.scalar(select(models.User).where(models.User.auth0_sub == sub))


async def get_settings(
    db: AsyncSession, user_id: uuid.UUID
) -> models.UserSettings | None:
    """The user's settings row, or ``None`` if it has not been created yet."""
    return await db.scalar(
        select(models.UserSettings).where(models.UserSettings.user_id == user_id)
    )
