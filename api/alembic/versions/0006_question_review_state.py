"""spaced-repetition question review state

Adds a per-question Leitner schedule so questions can resurface for review at
growing intervals. One row per question, created the first time the question is
answered (see ``app.graphql.review``). ``box`` is the Leitner level and
``due_at`` is when the question is next due; both drive the DUE_REVIEW session
mode and the per-exam "due" counts.

Revision ID: 0006_question_review_state
Revises: 0005_study_goals
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_question_review_state"
down_revision: Union[str, None] = "0005_study_goals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "question_review_states",
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("box", sa.Integer(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("lapses", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"], ["questions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("question_id"),
        sa.CheckConstraint(
            "box >= 1", name="ck_question_review_states_box_positive"
        ),
    )
    op.create_index(
        "ix_question_review_states_due_at", "question_review_states", ["due_at"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_question_review_states_due_at", table_name="question_review_states"
    )
    op.drop_table("question_review_states")
