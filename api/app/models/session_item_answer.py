from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.answer import Answer
    from app.models.session_item import SessionItem


class SessionItemAnswer(Base):
    """One answer the user selected for a session item.

    Single-choice questions have at most one row per item, multiple-choice
    questions can have several. Allocation questions store one row per item
    (answer), with ``category_id`` recording the basket it was dropped into.
    Select-and-place questions store one row per placed option, with ``position``
    recording the 0-based slot it was dropped into. Yes/No questions store one
    row per statement, with ``verdict`` recording the Yes/No answer given.
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
    # Allocation questions only: the basket the item was sorted into. Null for
    # choice questions, where the mere presence of the row is the selection.
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_categories.id", ondelete="CASCADE"), nullable=True
    )
    # Select-and-place questions only: the 0-based slot the option was placed
    # into. Null for choice and allocation selections.
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Yes/No questions only: the verdict the user gave (True = "Yes", False =
    # "No"). Null for choice, allocation and select-and-place selections.
    verdict: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    session_item: Mapped[SessionItem] = relationship(back_populates="selected_answers")
    answer: Mapped[Answer] = relationship()
