from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionItemAnswer(Base):
    """One answer the user selected for a session item.

    Single-choice questions have at most one row per item, multiple-choice
    questions can have several.
    """

    __tablename__ = "session_item_answers"

    __table_args__ = (
        UniqueConstraint(
            "session_item_id", "answer_id", name="uq_session_item_answers_item_answer"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("session_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    answer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("answers.id", ondelete="CASCADE"), nullable=False, index=True
    )

    session_item: Mapped["SessionItem"] = relationship(
        back_populates="selected_answers"
    )
    answer: Mapped["Answer"] = relationship()
