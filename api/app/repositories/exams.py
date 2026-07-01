"""Data access for exams (and their sections/question counts).

Every read is scoped to a ``user_id`` so one user never sees another's exams;
callers treat a ``None`` result as "not found" so a foreign id is
indistinguishable from a missing one (no existence leak).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models


async def get_owned(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID
) -> models.Exam | None:
    """The exam if it belongs to ``user_id``, else ``None``."""
    return await db.scalar(
        select(models.Exam).where(
            models.Exam.id == exam_id, models.Exam.user_id == user_id
        )
    )


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    archived: bool | None = None,
) -> Sequence[models.Exam]:
    """The user's exams (with sections eager-loaded), newest first.

    ``archived`` narrows to active (``False``) or archived (``True``) exams;
    ``None`` leaves both in, which is what loading a single exam by id needs so
    an archived exam is still returned.
    """
    stmt = (
        select(models.Exam)
        .where(models.Exam.user_id == user_id)
        .options(selectinload(models.Exam.sections))
    )
    if exam_id is not None:
        stmt = stmt.where(models.Exam.id == exam_id)
    if archived is not None:
        stmt = stmt.where(models.Exam.archived.is_(archived))
    stmt = stmt.order_by(models.Exam.created_at.desc())
    return list((await db.scalars(stmt)).all())


async def get_owned_with_questions(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID
) -> models.Exam | None:
    """The owned exam with its sections and their questions eager-loaded.

    Used by the merge import, which needs the existing question texts (to detect
    duplicates) and the modules (to match by name).
    """
    return await db.scalar(
        select(models.Exam)
        .where(models.Exam.id == exam_id, models.Exam.user_id == user_id)
        .options(
            selectinload(models.Exam.sections).selectinload(models.Section.questions)
        )
    )


async def question_counts_by_section(
    db: AsyncSession, exam_ids: Sequence[uuid.UUID]
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


async def count_questions(db: AsyncSession, exam_id: uuid.UUID) -> int:
    """Total number of questions in one exam (across all its sections)."""
    total = await db.scalar(
        select(func.count(models.Question.id))
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.Section.exam_id == exam_id)
    )
    return total or 0
