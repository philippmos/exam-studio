"""yes/no question type

Adds support for ``YES_NO`` questions, where each statement (an answer row) is
answered with Yes or No and the question is correct only when every statement's
verdict matches:

* ``answers.correct_verdict`` holds a statement's expected verdict (``True`` =
  "Yes", ``False`` = "No"; null for every choice/allocation/select-and-place
  answer);
* ``session_item_answers.verdict`` records the Yes/No answer the user gave (null
  for choice, allocation and select-and-place selections).

Revision ID: 0017_yes_no_questions
Revises: 0016_select_and_place_questions
Create Date: 2026-07-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_yes_no_questions"
down_revision: Union[str, None] = "0016_select_and_place_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "answers",
        sa.Column("correct_verdict", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "session_item_answers",
        sa.Column("verdict", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_item_answers", "verdict")
    op.drop_column("answers", "correct_verdict")
