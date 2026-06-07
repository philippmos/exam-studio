"""integrity constraints for answers and session items

Adds the invariants the learning-progress statistics rely on:
* at most one correct answer per question (partial unique index)
* each question appears at most once per session, and positions are unique

Revision ID: 0002_integrity
Revises: 0001_initial
Create Date: 2026-06-07

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "0002_integrity"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_answers_one_correct",
        "answers",
        ["question_id"],
        unique=True,
        postgresql_where=text("is_correct"),
    )
    op.create_unique_constraint(
        "uq_session_items_session_question",
        "session_items",
        ["session_id", "question_id"],
    )
    op.create_unique_constraint(
        "uq_session_items_session_position",
        "session_items",
        ["session_id", "position"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_session_items_session_position", "session_items", type_="unique"
    )
    op.drop_constraint(
        "uq_session_items_session_question", "session_items", type_="unique"
    )
    op.drop_index("uq_answers_one_correct", table_name="answers")
