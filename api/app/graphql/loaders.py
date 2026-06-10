"""Shared loading helpers used by both queries and mutations.

Centralising the eager-loading here keeps the resolvers small and ensures the
relationships required by the converters are always populated.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models
from app.graphql import types


async def _question_counts(
    db: AsyncSession, exam_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Map of section_id -> number of questions, for the given exams."""
    if not exam_ids:
        return {}
    result = await db.execute(
        select(models.Question.section_id, func.count(models.Question.id))
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.Section.exam_id.in_(exam_ids))
        .group_by(models.Question.section_id)
    )
    return {section_id: count for section_id, count in result.all()}


async def load_exams(
    db: AsyncSession, exam_id: uuid.UUID | None = None
) -> list[types.ExamType]:
    stmt = select(models.Exam).options(selectinload(models.Exam.sections))
    if exam_id is not None:
        stmt = stmt.where(models.Exam.id == exam_id)
    stmt = stmt.order_by(models.Exam.created_at.desc())

    exams = list((await db.scalars(stmt)).all())
    counts = await _question_counts(db, [e.id for e in exams])
    return [types.to_exam(exam, counts) for exam in exams]


async def load_session(
    db: AsyncSession, session_id: uuid.UUID
) -> models.ExamSession | None:
    stmt = (
        select(models.ExamSession)
        .where(models.ExamSession.id == session_id)
        .options(
            selectinload(models.ExamSession.items)
            .selectinload(models.SessionItem.question)
            .selectinload(models.Question.answers)
        )
    )
    return await db.scalar(stmt)


async def load_session_type(
    db: AsyncSession, session_id: uuid.UUID
) -> types.ExamSessionType | None:
    session = await load_session(db, session_id)
    return types.to_session(session) if session is not None else None


async def load_session_overviews(
    db: AsyncSession, exam_id: uuid.UUID | None = None
) -> list[types.SessionOverviewType]:
    """Session rows with their answer counts (aggregated in SQL), newest first."""
    progress = (
        select(
            models.SessionItem.session_id,
            func.count(models.SessionItem.id).label("total"),
            func.count(models.SessionItem.selected_answer_id).label("answered"),
            func.count(models.SessionItem.id)
            .filter(models.SessionItem.is_correct.is_(True))
            .label("correct"),
        )
        .group_by(models.SessionItem.session_id)
        .subquery()
    )

    stmt = (
        select(
            models.ExamSession,
            models.Exam.name,
            models.Section.name,
            func.coalesce(progress.c.total, 0),
            func.coalesce(progress.c.answered, 0),
            func.coalesce(progress.c.correct, 0),
        )
        .join(models.Exam, models.ExamSession.exam_id == models.Exam.id)
        .outerjoin(models.Section, models.ExamSession.section_id == models.Section.id)
        .outerjoin(progress, progress.c.session_id == models.ExamSession.id)
        .order_by(models.ExamSession.created_at.desc())
    )
    if exam_id is not None:
        stmt = stmt.where(models.ExamSession.exam_id == exam_id)

    rows = (await db.execute(stmt)).all()
    return [
        types.to_session_overview(
            session, exam_name, section_name, total, answered, correct
        )
        for session, exam_name, section_name, total, answered, correct in rows
    ]
