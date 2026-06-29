"""user settings table

Moves per-user preferences out of the identity ``users`` table into a 1:1
``user_settings`` table and adds the daily-streak goal (``daily_streak_goal`` --
how many questions a day needs for it to count towards the study streak).

Every existing user gets a settings row: their current ``users.theme_preference``
is copied across and the daily-streak goal defaults to 5, before the now-unused
``users.theme_preference`` column is dropped.

Revision ID: 0015_user_settings_table
Revises: 0014_user_theme_preference
Create Date: 2026-06-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_user_settings_table"
down_revision: Union[str, None] = "0014_user_theme_preference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_DAILY_STREAK_GOAL = "5"


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "theme_preference",
            sa.String(length=16),
            nullable=False,
            server_default="SYSTEM",
        ),
        sa.Column(
            "daily_streak_goal",
            sa.Integer(),
            nullable=False,
            server_default=DEFAULT_DAILY_STREAK_GOAL,
        ),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_settings_user_id_users",
            ondelete="CASCADE",
        ),
    )

    # Carry every existing user's chosen theme into their new settings row; the
    # daily-streak goal falls back to the column's server default.
    op.execute(
        "INSERT INTO user_settings (user_id, theme_preference) "
        "SELECT id, theme_preference FROM users"
    )

    op.drop_column("users", "theme_preference")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "theme_preference",
            sa.String(length=16),
            nullable=False,
            server_default="SYSTEM",
        ),
    )
    # Restore each user's theme from their settings row before dropping the table.
    op.execute(
        "UPDATE users SET theme_preference = us.theme_preference "
        "FROM user_settings us WHERE us.user_id = users.id"
    )
    op.drop_table("user_settings")
