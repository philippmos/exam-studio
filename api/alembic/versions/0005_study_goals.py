"""per-exam study goals

Adds an optional study goal to each exam: answer ``study_goal_target``
questions per ``study_goal_period`` (DAILY / WEEKLY). Both columns are kept in
sync by a check constraint -- a goal either exists completely or not at all.

Revision ID: 0005_study_goals
Revises: 0004_remove_numbers
Create Date: 2026-06-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_study_goals"
down_revision: Union[str, None] = "0004_remove_numbers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exams", sa.Column("study_goal_period", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "exams", sa.Column("study_goal_target", sa.Integer(), nullable=True)
    )
    op.create_check_constraint(
        "ck_exams_study_goal_paired",
        "exams",
        "(study_goal_period IS NULL) = (study_goal_target IS NULL)",
    )
    op.create_check_constraint(
        "ck_exams_study_goal_target_positive",
        "exams",
        "study_goal_target IS NULL OR study_goal_target > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_exams_study_goal_target_positive", "exams", type_="check"
    )
    op.drop_constraint("ck_exams_study_goal_paired", "exams", type_="check")
    op.drop_column("exams", "study_goal_target")
    op.drop_column("exams", "study_goal_period")
