"""Data access for exam sessions, their items and answer selections.

Reads that back a mutation or an ownership check are scoped to ``user_id`` via
the session's exam, so a session (and its items) is only ever reachable by its
owner.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models
from app.domain.enums import SessionMode

# One row of the sessions overview: the session plus its exam/section names and
# aggregated answer counts.
OverviewRow = tuple[models.ExamSession, str, str | None, int, int, int]


async def get_owned(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> models.ExamSession | None:
    """The session if its exam belongs to ``user_id``, else ``None``."""
    return await db.scalar(
        select(models.ExamSession)
        .join(models.Exam, models.ExamSession.exam_id == models.Exam.id)
        .where(
            models.ExamSession.id == session_id,
            models.Exam.user_id == user_id,
        )
    )


async def load_with_items(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> models.ExamSession | None:
    """The owned session with items, questions, answers, categories and selections."""
    stmt = (
        select(models.ExamSession)
        .join(models.Exam, models.ExamSession.exam_id == models.Exam.id)
        .where(
            models.ExamSession.id == session_id,
            models.Exam.user_id == user_id,
        )
        .options(
            selectinload(models.ExamSession.items)
            .selectinload(models.SessionItem.question)
            .selectinload(models.Question.answers),
            selectinload(models.ExamSession.items)
            .selectinload(models.SessionItem.question)
            .selectinload(models.Question.categories),
            selectinload(models.ExamSession.items).selectinload(
                models.SessionItem.selected_answers
            ),
        )
    )
    return await db.scalar(stmt)


async def overview_rows(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID | None = None
) -> list[OverviewRow]:
    """The user's sessions with answer counts (aggregated in SQL), newest first."""
    progress = (
        select(
            models.SessionItem.session_id,
            func.count(models.SessionItem.id).label("total"),
            func.count(models.SessionItem.answered_at).label("answered"),
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
        .where(models.Exam.user_id == user_id)
        .order_by(models.ExamSession.created_at.desc())
    )
    if exam_id is not None:
        stmt = stmt.where(models.ExamSession.exam_id == exam_id)

    rows = (await db.execute(stmt)).all()
    return [
        (s, exam_name, section_name, total, answered, correct)
        for s, exam_name, section_name, total, answered, correct in rows
    ]


async def question_ids_for_mode(
    db: AsyncSession,
    exam_id: uuid.UUID,
    mode: SessionMode,
    section_id: uuid.UUID | None,
    now: datetime,
) -> list[uuid.UUID]:
    """Ids of the questions selected for a new session in the given mode.

    The order is unspecified (the caller shuffles). ``BY_SECTION`` assumes a
    ``section_id`` was supplied (the service validates that first).
    """
    base = (
        select(models.Question.id)
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.Section.exam_id == exam_id)
    )

    if mode is SessionMode.BY_SECTION:
        base = base.where(models.Question.section_id == section_id)
    elif mode is SessionMode.UNANSWERED:
        answered_incorrectly = (
            select(models.SessionItem.question_id)
            .join(
                models.ExamSession,
                models.SessionItem.session_id == models.ExamSession.id,
            )
            .where(
                models.ExamSession.exam_id == exam_id,
                models.SessionItem.is_correct.is_(False),
            )
        )
        base = base.where(models.Question.id.in_(answered_incorrectly))
    elif mode is SessionMode.DUE_REVIEW:
        base = base.join(
            models.QuestionReviewState,
            models.QuestionReviewState.question_id == models.Question.id,
        ).where(models.QuestionReviewState.due_at <= now)

    return list((await db.scalars(base)).all())


async def load_questions_with_answers(
    db: AsyncSession, question_ids: Sequence[uuid.UUID]
) -> list[models.Question]:
    """The given questions with their answer options eager-loaded."""
    return list(
        (
            await db.scalars(
                select(models.Question)
                .where(models.Question.id.in_(question_ids))
                .options(selectinload(models.Question.answers))
            )
        ).all()
    )


async def get_item_with_selection(
    db: AsyncSession, session_item_id: uuid.UUID
) -> models.SessionItem | None:
    """A session item with its current answer selection eager-loaded."""
    return await db.get(
        models.SessionItem,
        session_item_id,
        options=(selectinload(models.SessionItem.selected_answers),),
    )


async def get_question(
    db: AsyncSession, question_id: uuid.UUID
) -> models.Question | None:
    return await db.get(models.Question, question_id)


async def answers_for_question(
    db: AsyncSession, question_id: uuid.UUID
) -> list[models.Answer]:
    return list(
        (
            await db.scalars(
                select(models.Answer).where(models.Answer.question_id == question_id)
            )
        ).all()
    )


async def categories_for_question(
    db: AsyncSession, question_id: uuid.UUID
) -> list[models.QuestionCategory]:
    return list(
        (
            await db.scalars(
                select(models.QuestionCategory).where(
                    models.QuestionCategory.question_id == question_id
                )
            )
        ).all()
    )
