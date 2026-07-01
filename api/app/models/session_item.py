from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.exam_session import ExamSession
    from app.models.question import Question
    from app.models.session_item_answer import SessionItemAnswer


class SessionItem(Base):
    """One question inside a session, plus the answers the user gave for it."""

    __tablename__ = "session_items"

    # A session is an ordered list of distinct questions.
    __table_args__ = (
        UniqueConstraint(
            "session_id", "question_id", name="uq_session_items_session_question"
        ),
        UniqueConstraint(
            "session_id", "position", name="uq_session_items_session_position"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Choice questions only: persisted shuffle order of the answer options.
    # Stored as answer ids so reopening a session keeps the same layout.
    answer_order: Mapped[list[str] | None] = mapped_column(JSON)

    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[ExamSession] = relationship(back_populates="items")
    question: Mapped[Question] = relationship()
    # The user's selection: one row for single choice, several for multiple choice.
    selected_answers: Mapped[list[SessionItemAnswer]] = relationship(
        back_populates="session_item", cascade="all, delete-orphan"
    )
