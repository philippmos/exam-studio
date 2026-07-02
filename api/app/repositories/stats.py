"""Data access for the learning-progress statistics.

Everything is *derived* from the recorded answer history (SessionItem rows) plus
the exam structure -- no aggregates are stored. These functions run the SQL
aggregates and return raw numbers/rows; the ratios and result assembly live in
the stats service.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, timedelta

from sqlalchemy import Select, case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models


async def sections_ordered(
    db: AsyncSession, exam_id: uuid.UUID
) -> Sequence[models.Section]:
    """The exam's sections in display order."""
    return list(
        (
            await db.scalars(
                select(models.Section)
                .where(models.Section.exam_id == exam_id)
                .order_by(models.Section.position)
            )
        ).all()
    )


async def section_question_totals(
    db: AsyncSession, exam_id: uuid.UUID
) -> dict[uuid.UUID, int]:
    """Total number of questions per section of the exam."""
    rows = (
        await db.execute(
            select(models.Question.section_id, func.count(models.Question.id))
            .where(models.Section.id == models.Question.section_id)
            .where(models.Section.exam_id == exam_id)
            .group_by(models.Question.section_id)
        )
    ).all()
    return {section_id: count for section_id, count in rows}


def _section_answer_scope(exam_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
    """Grouped-by-section select over the exam's answered/attempted session items."""
    return (
        select(models.Section.id)
        .select_from(models.SessionItem)
        .join(
            models.ExamSession,
            models.SessionItem.session_id == models.ExamSession.id,
        )
        .join(models.Question, models.SessionItem.question_id == models.Question.id)
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.ExamSession.exam_id == exam_id)
        .group_by(models.Section.id)
    )


async def section_attempt_stats(
    db: AsyncSession, exam_id: uuid.UUID
) -> dict[uuid.UUID, tuple[int, int, int]]:
    """Per section: (total attempts, correct attempts, distinct questions attempted)."""
    rows = (
        await db.execute(
            _section_answer_scope(exam_id)
            .add_columns(
                func.count(models.SessionItem.id),
                func.coalesce(
                    func.sum(
                        case((models.SessionItem.is_correct.is_(True), 1), else_=0)
                    ),
                    0,
                ),
                func.count(distinct(models.SessionItem.question_id)),
            )
            .where(models.SessionItem.answered_at.is_not(None))
        )
    ).all()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


async def section_mastered_counts(
    db: AsyncSession, exam_id: uuid.UUID
) -> dict[uuid.UUID, int]:
    """Per section: distinct questions answered correctly at least once."""
    rows = (
        await db.execute(
            _section_answer_scope(exam_id)
            .add_columns(func.count(distinct(models.SessionItem.question_id)))
            .where(models.SessionItem.is_correct.is_(True))
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def sessions_count(db: AsyncSession, exam_id: uuid.UUID) -> int:
    """How many sessions the exam has."""
    count = await db.scalar(
        select(func.count(models.ExamSession.id)).where(
            models.ExamSession.exam_id == exam_id
        )
    )
    return count or 0


async def last_activity(db: AsyncSession, exam_id: uuid.UUID) -> datetime | None:
    """When the exam was last answered, or ``None`` if never."""
    return await db.scalar(
        select(func.max(models.SessionItem.answered_at))
        .select_from(models.SessionItem)
        .join(
            models.ExamSession,
            models.SessionItem.session_id == models.ExamSession.id,
        )
        .where(models.ExamSession.exam_id == exam_id)
    )


async def study_history_rows(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None,
    tz_offset_minutes: int,
) -> list[tuple[date, int, int]]:
    """(local day, answered, correct) per calendar day, oldest first.

    ``tz_offset_minutes`` shifts UTC timestamps into the caller's local time
    before bucketing so a late-evening session lands on the right day.
    """
    local_time = models.SessionItem.answered_at + timedelta(minutes=tz_offset_minutes)
    day = func.date(local_time)
    stmt = (
        select(
            day.label("day"),
            func.count(models.SessionItem.id),
            func.coalesce(
                func.sum(case((models.SessionItem.is_correct.is_(True), 1), else_=0)),
                0,
            ),
        )
        .join(
            models.ExamSession,
            models.SessionItem.session_id == models.ExamSession.id,
        )
        .join(models.Exam, models.ExamSession.exam_id == models.Exam.id)
        .where(
            models.SessionItem.answered_at.is_not(None),
            models.Exam.user_id == user_id,
        )
        .group_by(day)
        .order_by(day)
    )
    if exam_id is not None:
        stmt = stmt.where(models.ExamSession.exam_id == exam_id)

    rows = (await db.execute(stmt)).all()
    return [(d, total, correct) for d, total, correct in rows]


async def exams_with_goals(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID | None = None
) -> Sequence[models.Exam]:
    """The user's exams that have a study goal, newest first."""
    stmt = select(models.Exam).where(
        models.Exam.user_id == user_id,
        models.Exam.study_goal_period.is_not(None),
    )
    if exam_id is not None:
        stmt = stmt.where(models.Exam.id == exam_id)
    return list((await db.scalars(stmt.order_by(models.Exam.created_at.desc()))).all())


async def answered_counts_since(
    db: AsyncSession, exam_ids: Sequence[uuid.UUID], start_utc: datetime
) -> dict[uuid.UUID, int]:
    """Per exam: questions answered on/after ``start_utc`` (re-attempts count)."""
    if not exam_ids:
        return {}
    rows = (
        await db.execute(
            select(
                models.ExamSession.exam_id,
                func.count(models.SessionItem.id),
            )
            .join(
                models.SessionItem,
                models.SessionItem.session_id == models.ExamSession.id,
            )
            .where(
                models.ExamSession.exam_id.in_(exam_ids),
                models.SessionItem.answered_at >= start_utc,
            )
            .group_by(models.ExamSession.exam_id)
        )
    ).all()
    return {exam_id: count for exam_id, count in rows}


async def active_day_counts(
    db: AsyncSession, user_id: uuid.UUID, tz_offset_minutes: int
) -> dict[date, int]:
    """Questions answered per local calendar day across all of the user's exams."""
    offset = timedelta(minutes=tz_offset_minutes)
    day = func.date(models.SessionItem.answered_at + offset)
    rows = (
        await db.execute(
            select(day, func.count(models.SessionItem.id))
            .join(
                models.ExamSession,
                models.SessionItem.session_id == models.ExamSession.id,
            )
            .join(models.Exam, models.ExamSession.exam_id == models.Exam.id)
            .where(
                models.SessionItem.answered_at.is_not(None),
                models.Exam.user_id == user_id,
            )
            .group_by(day)
        )
    ).all()
    # func.date yields date on PostgreSQL; coerce defensively so the set
    # arithmetic also holds on backends that return ISO strings.
    return {
        (d if isinstance(d, date) else date.fromisoformat(str(d))): count
        for d, count in rows
    }
