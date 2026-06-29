"""Spaced-repetition scheduling (Leitner system).

A question's review state lives in ``QuestionReviewState`` and is updated on
every answer via :func:`record_answer`. The scheme is a classic Leitner ladder:

* a correct answer promotes the question one box (longer interval);
* a wrong answer sends it back to box 1 (review again soon).

Intervals grow per box. ``due_at`` is pinned to the *start of the local day*
the question becomes due again (same timezone convention as the study-history
and goal queries), so "due today" lines up with the user's calendar. Whether a
question is currently due is just ``due_at <= now`` and therefore needs no
timezone information -- only scheduling does.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.graphql.types import ReviewDueStatus

# Leitner ladder: box -> days until the question is due again. Box 1 is the
# "learning / just lapsed" box; the top box keeps mastered questions in long-
# term rotation rather than dropping them entirely.
MAX_BOX = 5
_BOX_INTERVAL_DAYS: dict[int, int] = {1: 1, 2: 3, 3: 7, 4: 16, 5: 35}


class ReviewOutcome(NamedTuple):
    """What the schedule did with a question, for immediate UI feedback."""

    box: int
    interval_days: int


def _interval_days(box: int) -> int:
    return _BOX_INTERVAL_DAYS[min(max(box, 1), MAX_BOX)]


def _due_at(interval_days: int, tz_offset_minutes: int, now: datetime) -> datetime:
    """UTC instant of local midnight ``interval_days`` days from now."""
    offset = timedelta(minutes=tz_offset_minutes)
    due_local_day = (now + offset).date() + timedelta(days=interval_days)
    return datetime.combine(due_local_day, time.min, tzinfo=timezone.utc) - offset


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
    now = datetime.now(timezone.utc)
    state = await db.get(models.QuestionReviewState, question_id)
    current_box = state.box if state is not None else 1
    new_box = min(current_box + 1, MAX_BOX) if is_correct else 1
    interval = _interval_days(new_box)
    due_at = _due_at(interval, tz_offset_minutes, now)

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
) -> list[ReviewDueStatus]:
    """Number of questions due for review right now, grouped per exam.

    Only exams with at least one due question appear (mirrors how study-goal
    progress only lists exams that have a goal). A question is due when its
    ``due_at`` has passed.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(
            models.Section.exam_id,
            func.count(models.QuestionReviewState.question_id),
        )
        .select_from(models.QuestionReviewState)
        .join(
            models.Question,
            models.Question.id == models.QuestionReviewState.question_id,
        )
        .join(models.Section, models.Section.id == models.Question.section_id)
        .join(models.Exam, models.Exam.id == models.Section.exam_id)
        .where(
            models.QuestionReviewState.due_at <= now,
            models.Exam.user_id == user_id,
        )
        .group_by(models.Section.exam_id)
    )
    if exam_id is not None:
        stmt = stmt.where(models.Section.exam_id == exam_id)

    rows = (await db.execute(stmt)).all()
    return [ReviewDueStatus(exam_id=eid, due_count=count) for eid, count in rows]
