"""question media (images)

Adds support for images embedded in a question's HTML (text/explanation).

* a new ``question_media`` table records each image referenced by a question:
  its object path in blob storage (``blob_path``), sniffed ``content_type``,
  content hash (``sha256``) and size. The question HTML refers to an image as
  ``media://{id}``; that placeholder is swapped for a short-lived signed blob
  URL when the question is served.

The image bytes themselves live in Azure Blob Storage, not in the database.
Deleting a question cascades to its ``question_media`` rows; the blob objects
are removed separately (a prefix delete when the exam is deleted).

Revision ID: 0018_question_media
Revises: 0017_yes_no_questions
Create Date: 2026-07-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_question_media"
down_revision: Union[str, None] = "0017_yes_no_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "question_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("blob_path", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_id", "sha256", name="uq_question_media_question_sha256"
        ),
    )
    op.create_index(
        "ix_question_media_question_id", "question_media", ["question_id"]
    )
    op.create_index("ix_question_media_sha256", "question_media", ["sha256"])


def downgrade() -> None:
    op.drop_index("ix_question_media_sha256", table_name="question_media")
    op.drop_index("ix_question_media_question_id", table_name="question_media")
    op.drop_table("question_media")
