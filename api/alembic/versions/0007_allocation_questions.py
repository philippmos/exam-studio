"""allocation question type

Adds support for ``ALLOCATION`` questions, where the user sorts every item into
one of the question's categories (drag & drop into baskets):

* a new ``question_categories`` table holds an allocation question's baskets
  (``key`` + ``label``); choice questions have none;
* ``answers.correct_category_id`` points an allocation item at the category it
  belongs to (null for choice options, whose correctness is ``is_correct``);
* ``session_item_answers.category_id`` records which basket the user dropped an
  item into (null for choice selections).

Revision ID: 0007_allocation_questions
Revises: 0006_question_review_state
Create Date: 2026-06-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_allocation_questions"
down_revision: Union[str, None] = "0006_question_review_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "question_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_id", "key", name="uq_question_categories_question_key"
        ),
    )
    op.create_index(
        "ix_question_categories_question_id", "question_categories", ["question_id"]
    )

    op.add_column(
        "answers",
        sa.Column("correct_category_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "answers_correct_category_id_fkey",
        "answers",
        "question_categories",
        ["correct_category_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "session_item_answers",
        sa.Column("category_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "session_item_answers_category_id_fkey",
        "session_item_answers",
        "question_categories",
        ["category_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "session_item_answers_category_id_fkey",
        "session_item_answers",
        type_="foreignkey",
    )
    op.drop_column("session_item_answers", "category_id")

    op.drop_constraint(
        "answers_correct_category_id_fkey", "answers", type_="foreignkey"
    )
    op.drop_column("answers", "correct_category_id")

    op.drop_index(
        "ix_question_categories_question_id", table_name="question_categories"
    )
    op.drop_table("question_categories")
