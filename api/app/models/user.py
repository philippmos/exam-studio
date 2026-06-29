from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """A registered user, provisioned on first login from an Auth0 identity.

    Keyed by the Auth0 ``sub`` claim (a stable, unique subject identifier such
    as ``auth0|abc123`` or, for machine-to-machine clients, ``<id>@clients``).
    ``email`` / ``name`` are optional display copies of the profile, populated
    only when the access token carries the matching namespaced custom claims
    (see ``docs/auth0-setup.md``).
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    auth0_sub: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    email: Mapped[str | None] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Deleting a user removes everything they own (exams cascade to sections,
    # questions, sessions, ...).
    exams: Mapped[list["Exam"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
