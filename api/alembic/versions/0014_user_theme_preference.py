"""user theme preference

Adds ``users.theme_preference`` — the user's chosen colour scheme
("SYSTEM" / "LIGHT" / "DARK"). It is the first persisted user setting. Existing
users predate the column and default to following the browser ("SYSTEM"), so the
column is backfilled with that server default.

Revision ID: 0014_user_theme_preference
Revises: 0013_users_and_ownership
Create Date: 2026-06-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_user_theme_preference"
down_revision: Union[str, None] = "0013_users_and_ownership"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "theme_preference",
            sa.String(length=16),
            nullable=False,
            server_default="SYSTEM",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "theme_preference")
