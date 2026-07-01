"""User account-settings use cases (colour scheme, daily-streak goal)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.core.errors import ValidationError
from app.domain.enums import ThemePreference
from app.models import DAILY_STREAK_GOAL_CHOICES
from app.repositories import users as users_repo


async def get_or_create_settings(
    db: AsyncSession, user: models.User
) -> models.UserSettings:
    """The user's settings row, creating it with defaults on first access.

    New users get a row at provisioning time, but users that predate the
    settings table (or were created via a login race) may lack one; this
    backfills it lazily so every resolver can rely on the row existing.
    """
    settings = await users_repo.get_settings(db, user.id)
    if settings is None:
        settings = models.UserSettings(user_id=user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def set_theme_preference(
    db: AsyncSession, user: models.User, theme: ThemePreference
) -> models.UserSettings:
    """Persist the user's colour-scheme preference."""
    settings = await get_or_create_settings(db, user)
    settings.theme_preference = theme.value
    await db.commit()
    return settings


async def set_daily_streak_goal(
    db: AsyncSession, user: models.User, goal: int
) -> models.UserSettings:
    """Set how many questions a day needs for it to count towards the streak."""
    if goal not in DAILY_STREAK_GOAL_CHOICES:
        allowed = ", ".join(str(choice) for choice in DAILY_STREAK_GOAL_CHOICES)
        raise ValidationError(f"The daily streak goal must be one of: {allowed}.")
    settings = await get_or_create_settings(db, user)
    settings.daily_streak_goal = goal
    await db.commit()
    return settings
