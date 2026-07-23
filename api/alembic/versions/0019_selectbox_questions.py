"""selectbox question type

Adds support for ``SELECTBOX`` questions, where the user picks one option per
selectbox (a dropdown) and the question has one or more selectboxes:

* the selectboxes reuse the ``question_categories`` table (``key`` + ``label``),
  exactly like an allocation question's baskets;
* ``answers.selectbox_id`` groups each option (an answer row) under the selectbox
  it is listed in (null for every choice/allocation/select-and-place/yes-no
  answer); the one correct option of each selectbox is flagged with the existing
  ``answers.is_correct``.

No new column is needed on ``session_item_answers``: a selectbox selection is
stored the same way as a choice selection (one row per chosen option), so the
mere presence of the row is the pick.

Revision ID: 0019_selectbox_questions
Revises: 0018_question_media
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_selectbox_questions"
down_revision: Union[str, None] = "0018_question_media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "answers",
        sa.Column("selectbox_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "answers_selectbox_id_fkey",
        "answers",
        "question_categories",
        ["selectbox_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("answers_selectbox_id_fkey", "answers", type_="foreignkey")
    op.drop_column("answers", "selectbox_id")
