"""study goal source

Records where each exam's study goal came from via a ``study_goal_source``
column ("MANUAL" / "AUTO"). "AUTO" goals are recomputed from the certification
exam date; "MANUAL" goals are left untouched. Existing goals predate the column
and were all set by hand, so they are backfilled as "MANUAL". A check constraint
keeps the source in sync with the goal (set exactly when a goal exists).

Revision ID: 0010_study_goal_source
Revises: 0009_certification_exam_date
Create Date: 2026-06-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_study_goal_source"
down_revision: Union[str, None] = "0009_certification_exam_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exams", sa.Column("study_goal_source", sa.String(length=16), nullable=True)
    )
    # Goals that predate this column were all entered manually.
    op.execute(
        "UPDATE exams SET study_goal_source = 'MANUAL' "
        "WHERE study_goal_period IS NOT NULL"
    )
    op.create_check_constraint(
        "ck_exams_study_goal_source_paired",
        "exams",
        "(study_goal_period IS NULL) = (study_goal_source IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_exams_study_goal_source_paired", "exams", type_="check"
    )
    op.drop_column("exams", "study_goal_source")
