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

Revision ID: 0004_remove_numbers
Revises: 0003_multiple_choice
Create Date: 2026-06-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_remove_numbers"
down_revision: Union[str, None] = "0003_multiple_choice"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("questions", "number")


def downgrade() -> None:
    # Restore the number column; the original file order is gone, so questions
    # are renumbered per section.
    op.add_column(
        "questions", sa.Column("number", sa.Integer(), nullable=True)
    )
    op.execute(
        """
        UPDATE questions q
        SET number = sub.rn
        FROM (
            SELECT id, row_number() OVER (PARTITION BY section_id ORDER BY id) AS rn
            FROM questions
        ) sub
        WHERE q.id = sub.id
        """
    )
    op.alter_column("questions", "number", nullable=False)
