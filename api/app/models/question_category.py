from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question import Question


class QuestionCategory(Base):
    """A target basket of an allocation question.

    Allocation questions ask the user to sort every item (stored as an
    ``Answer`` row) into one of these categories. Only allocation questions
    have categories; single/multiple-choice questions have none. ``key`` is the
    stable identifier from the import document (``Answer.correct_category_id``
    points at the category an item belongs to).
    """

    __tablename__ = "question_categories"

    __table_args__ = (
        UniqueConstraint(
            "question_id", "key", name="uq_question_categories_question_key"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    question: Mapped[Question] = relationship(back_populates="categories")
