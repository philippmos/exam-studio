from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QuestionReviewState(Base):
    """Spaced-repetition (Leitner) schedule for a single question.

    One row per question, created lazily the first time the question is
    answered. ``box`` is the Leitner level -- 1 means just-learned or recently
    lapsed, higher boxes carry longer review intervals. ``due_at`` is when the
    question should next resurface in a "due review" session.

    The state is derived from the answer history but stored explicitly because
    it changes on every answer and feeds the review-selection query directly.
    """

    __tablename__ = "question_review_states"

    __table_args__ = (
        CheckConstraint("box >= 1", name="ck_question_review_states_box_positive"),
    )

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    box: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    last_reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Lifetime counters for insight, not used by the scheduler itself.
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
