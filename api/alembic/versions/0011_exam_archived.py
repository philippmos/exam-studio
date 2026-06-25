"""exam archived

Adds an ``archived`` flag to ``exams``. Archived exams are hidden from the
dashboard and cannot start new sessions, but their data is kept so streaks,
statistics and past sessions still account for them. Existing exams predate the
column and are active, so they are backfilled to ``false``.

Revision ID: 0011_exam_archived
Revises: 0010_study_goal_source
Create Date: 2026-06-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_exam_archived"
down_revision: Union[str, None] = "0010_study_goal_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column(
            "archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("exams", "archived")
