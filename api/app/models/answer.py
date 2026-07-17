from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.question_category import QuestionCategory


class Answer(Base):
    """An option of a choice question, or an item of an allocation question.

    Choice questions flag the right options with ``is_correct``. Allocation
    questions instead point each item at the category it belongs to via
    ``correct_category_id`` (``is_correct`` is unused and stays ``False``).
    Select-and-place questions store the option's rank in the solution order in
    ``correct_position`` (``None`` for the distractor options never placed).
    """

    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Allocation items only: the category this item should be sorted into.
    correct_category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_categories.id", ondelete="SET NULL"), nullable=True
    )
    # Select-and-place options only: the option's 1-based rank in the correct
    # order. Null for the distractor options (never placed) and for every
    # choice/allocation answer.
    correct_position: Mapped[int | None] = mapped_column(Integer, nullable=True)

    question: Mapped[Question] = relationship(back_populates="answers")
    correct_category: Mapped[QuestionCategory | None] = relationship()
