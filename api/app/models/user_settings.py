from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Selectable daily-streak goals (questions answered per day) and the default.
# A day only counts towards the study streak once this many questions have been
# answered on it. Kept here so the mutation can validate against the same set.
DAILY_STREAK_GOAL_CHOICES: tuple[int, ...] = (5, 10, 15, 25, 50)
DEFAULT_DAILY_STREAK_GOAL = 5


class UserSettings(Base):
    """Per-user preferences, kept out of the identity ``users`` table.

    A 1:1 companion to :class:`~app.models.user.User` (keyed by ``user_id``) that
    holds the user's mutable account preferences -- the colour scheme and the
    daily-streak goal so far. Splitting these out keeps the auth/identity row
    stable and gives preferences room to grow without churning that table.
    """

    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE", name="fk_user_settings_user_id_users"),
        primary_key=True,
    )
    # Preferred colour scheme: a ThemePreference value ("SYSTEM"/"LIGHT"/"DARK").
    # "SYSTEM" follows the browser preference.
    theme_preference: Mapped[str] = mapped_column(
        String(16), nullable=False, default="SYSTEM", server_default="SYSTEM"
    )
    # How many questions must be answered in a (local) day for it to count
    # towards the study streak -- one of ``DAILY_STREAK_GOAL_CHOICES``.
    daily_streak_goal: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=DEFAULT_DAILY_STREAK_GOAL,
        server_default=str(DEFAULT_DAILY_STREAK_GOAL),
    )

    user: Mapped["User"] = relationship(back_populates="settings")
