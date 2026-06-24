"""certification exam date

Adds an optional ``certification_exam_at`` column to ``exams``: the date and
time the user sits the real certification exam. Null until the exam is
scheduled.

Revision ID: 0009_certification_exam_date
Revises: 0008_question_explanation
Create Date: 2026-06-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_certification_exam_date"
down_revision: Union[str, None] = "0008_question_explanation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("certification_exam_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("exams", "certification_exam_at")
