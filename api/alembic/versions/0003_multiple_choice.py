"""multiple choice support + new import schema

* adds ``questions.question_type`` (SINGLE_CHOICE / MULTIPLE_CHOICE)
* drops the partial unique index that limited every question to one correct
  answer -- multiple-choice questions have several
* replaces ``session_items.selected_answer_id`` with the ``session_item_answers``
  table so an item can store several selected answers; existing selections are
  migrated over
* drops ``questions.number`` -- the import JSON no longer carries question
  numbers and the value was never used (session order comes from
  ``session_items.position``)

Revision ID: 0003_multiple_choice
Revises: 0002_integrity
Create Date: 2026-06-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_multiple_choice"
down_revision: Union[str, None] = "0002_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "question_type",
            sa.String(length=32),
            nullable=False,
            server_default="SINGLE_CHOICE",
        ),
    )

    op.drop_index("uq_answers_one_correct", table_name="answers")

    op.create_table(
        "session_item_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_item_id", sa.Uuid(), nullable=False),
        sa.Column("answer_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_item_id"], ["session_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["answer_id"], ["answers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_item_id", "answer_id", name="uq_session_item_answers_item_answer"
        ),
    )
    op.create_index(
        "ix_session_item_answers_session_item_id",
        "session_item_answers",
        ["session_item_id"],
    )
    op.create_index(
        "ix_session_item_answers_answer_id", "session_item_answers", ["answer_id"]
    )

    # Carry over the previously stored single selections.
    op.execute(
        """
        INSERT INTO session_item_answers (id, session_item_id, answer_id)
        SELECT gen_random_uuid(), id, selected_answer_id
        FROM session_items
        WHERE selected_answer_id IS NOT NULL
        """
    )

    op.drop_column("session_items", "selected_answer_id")


def downgrade() -> None:
    op.add_column(
        "session_items",
        sa.Column("selected_answer_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "session_items_selected_answer_id_fkey",
        "session_items",
        "answers",
        ["selected_answer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Best effort: keep one of the selected answers per item.
    op.execute(
        """
        UPDATE session_items si
        SET selected_answer_id = (
            SELECT answer_id FROM session_item_answers sia
            WHERE sia.session_item_id = si.id
            LIMIT 1
        )
        """
    )

    op.drop_index(
        "ix_session_item_answers_answer_id", table_name="session_item_answers"
    )
    op.drop_index(
        "ix_session_item_answers_session_item_id", table_name="session_item_answers"
    )
    op.drop_table("session_item_answers")

    # Fails if multiple-choice data (several correct answers) exists -- delete
    # those exams first.
    op.create_index(
        "uq_answers_one_correct",
        "answers",
        ["question_id"],
        unique=True,
        postgresql_where=sa.text("is_correct"),
    )

    op.drop_column("questions", "question_type")
