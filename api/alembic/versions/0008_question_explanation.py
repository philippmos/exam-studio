"""question explanation

Adds an optional ``explanation`` column to ``questions``: a description of the
question/answer that the UI reveals once the question has been answered. Null
for questions imported without one.

Revision ID: 0008_question_explanation
Revises: 0007_allocation_questions
Create Date: 2026-06-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_question_explanation"
down_revision: Union[str, None] = "0007_allocation_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("questions", "explanation")
