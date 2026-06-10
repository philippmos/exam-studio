from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionItem(Base):
    """One question inside a session, plus the answer the user gave for it."""

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

    selected_answer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("answers.id", ondelete="SET NULL")
    )
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped["ExamSession"] = relationship(back_populates="items")
    question: Mapped["Question"] = relationship()
    selected_answer: Mapped["Answer | None"] = relationship()
