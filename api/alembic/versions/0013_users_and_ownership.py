"""users + exam ownership

* adds a ``users`` table (registered users, keyed by the Auth0 ``sub`` claim)
* adds ``exams.user_id`` (the owning user) and makes it NOT NULL

Existing exams predate authentication, so when there is data to keep a
placeholder "legacy" user is created and every existing exam is backfilled to it
before the column is tightened. Re-assign or delete those exams once real users
have logged in. A fresh database gets no placeholder.

Revision ID: 0013_users_and_ownership
Revises: 0012_shuffle_answer_order
Create Date: 2026-06-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_users_and_ownership"
down_revision: Union[str, None] = "0012_shuffle_answer_order"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Stable id + sub for the placeholder owner of pre-auth exams.
LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"
LEGACY_USER_SUB = "legacy|placeholder"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("auth0_sub", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_auth0_sub", "users", ["auth0_sub"], unique=True)

    op.add_column("exams", sa.Column("user_id", sa.Uuid(), nullable=True))

    # Only mint the placeholder + backfill when there are existing exams to keep,
    # so a fresh install is not left with an orphan user.
    conn = op.get_bind()
    has_exams = conn.execute(sa.text("SELECT 1 FROM exams LIMIT 1")).first() is not None
    if has_exams:
        conn.execute(
            sa.text(
                "INSERT INTO users (id, auth0_sub, name) "
                "VALUES (:id, :sub, :name)"
            ),
            {"id": LEGACY_USER_ID, "sub": LEGACY_USER_SUB, "name": "Legacy (pre-auth) data"},
        )
        conn.execute(
            sa.text("UPDATE exams SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": LEGACY_USER_ID},
        )

    op.alter_column("exams", "user_id", existing_type=sa.Uuid(), nullable=False)
    op.create_index("ix_exams_user_id", "exams", ["user_id"])
    op.create_foreign_key(
        "fk_exams_user_id_users",
        "exams",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_exams_user_id_users", "exams", type_="foreignkey")
    op.drop_index("ix_exams_user_id", table_name="exams")
    op.drop_column("exams", "user_id")
    op.drop_index("ix_users_auth0_sub", table_name="users")
    op.drop_table("users")
