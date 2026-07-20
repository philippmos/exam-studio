"""select-and-place question type

Adds support for ``SELECT_AND_PLACE`` questions, where the user drags a subset
of the options into an answer area and puts them into the correct order:

* ``answers.correct_position`` holds an option's 1-based rank in the solution
  order (null for the distractor options and for every choice/allocation
  answer);
* ``session_item_answers.position`` records the 0-based slot the user placed an
  option into (null for choice and allocation selections).

Revision ID: 0016_select_and_place_questions
Revises: 0015_user_settings_table
Create Date: 2026-07-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_select_and_place_questions"
down_revision: Union[str, None] = "0015_user_settings_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "answers",
        sa.Column("correct_position", sa.Integer(), nullable=True),
    )
    op.add_column(
        "session_item_answers",
        sa.Column("position", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_item_answers", "position")
    op.drop_column("answers", "correct_position")
