from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.enums import QuestionType

if TYPE_CHECKING:
    from app.models.answer import Answer
    from app.models.question_category import QuestionCategory
    from app.models.section import Section


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional description of the question/answer, revealed once the question
    # has been answered. Stored raw like ``text`` and rendered as HTML.
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stores a QuestionType value (kept as a plain string, like ExamSession.mode).
    question_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=QuestionType.SINGLE_CHOICE.value
    )

    section: Mapped[Section] = relationship(back_populates="questions")
    # For allocation questions the answers are the items to be sorted; for
    # choice questions they are the options. Their order is the import order.
    answers: Mapped[list[Answer]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="Answer.position",
    )
    # The target baskets of an allocation question (empty for choice questions).
    categories: Mapped[list[QuestionCategory]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionCategory.position",
    )
