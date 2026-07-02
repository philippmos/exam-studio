"""Spaced-repetition use cases: recording an answer and listing what is due."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.domain import scheduling
from app.domain.analytics import ReviewDueData
from app.repositories import review as review_repo


class ReviewOutcome(NamedTuple):
    """What the schedule did with a question, for immediate UI feedback."""

    box: int
    interval_days: int


async def record_answer(
    db: AsyncSession,
    question_id: uuid.UUID,
    is_correct: bool,
    tz_offset_minutes: int,
) -> ReviewOutcome:
    """Advance (or reset) a question's Leitner box after it was answered.

    Creates the review state on first answer. Does not commit -- the caller
    commits the surrounding transaction.
    """
    now = datetime.now(UTC)
    state = await review_repo.get_state(db, question_id)
    current_box = state.box if state is not None else 1
    new_box = scheduling.next_box(current_box, is_correct)
    interval = scheduling.interval_for_box(new_box)
    due_at = scheduling.due_at(interval, tz_offset_minutes, now)

    if state is None:
        db.add(
            models.QuestionReviewState(
                question_id=question_id,
                box=new_box,
                due_at=due_at,
                last_reviewed_at=now,
                reps=1,
                lapses=0 if is_correct else 1,
            )
        )
    else:
        state.box = new_box
        state.due_at = due_at
        state.last_reviewed_at = now
        state.reps += 1
        if not is_correct:
            state.lapses += 1

    return ReviewOutcome(box=new_box, interval_days=interval)


async def compute_review_due(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID | None = None
) -> list[ReviewDueData]:
    """Questions currently due for review, grouped per exam."""
    now = datetime.now(UTC)
    rows = await review_repo.due_counts_by_exam(db, user_id, now, exam_id)
    return [ReviewDueData(exam_id=exam_id, due_count=count) for exam_id, count in rows]
