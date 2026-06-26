"""persist session answer order

Store the shuffled answer-option order on each session item so reopening or
reloading an in-progress session keeps the exact same layout.

Revision ID: 0012_shuffle_answer_order
Revises: 0011_exam_archived
Create Date: 2026-06-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_shuffle_answer_order"
down_revision: Union[str, None] = "0011_exam_archived"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_items",
        sa.Column("answer_order", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_items", "answer_order")