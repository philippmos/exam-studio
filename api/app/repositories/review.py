"""Data access for spaced-repetition review state."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models


async def get_state(
    db: AsyncSession, question_id: uuid.UUID
) -> models.QuestionReviewState | None:
    """The Leitner review state for a question, or ``None`` before its first answer."""
    return await db.get(models.QuestionReviewState, question_id)


async def due_counts_by_exam(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    exam_id: uuid.UUID | None = None,
) -> list[tuple[uuid.UUID, int]]:
    """(exam_id, number of due questions) for the user's exams with any due.

    A question is due when its ``due_at`` has passed. Only exams with at least
    one due question are returned.
    """
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
    return [(exam_id, count) for exam_id, count in rows]
