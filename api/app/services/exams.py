"""Exam use cases: import/merge, deletion, archiving, study goals and dates.

Each function owns its transaction (commit) and returns ORM objects plus the
per-section question counts the presentation layer needs; mutations that change
the question count keep an automatic study goal in sync.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.core.errors import NotFoundError, ValidationError
from app.domain import planning
from app.domain.enums import GoalPeriod, StudyGoalSource
from app.importer import (
    ImportError_,
    build_exam_from_payload,
    merge_questions_into_exam,
)
from app.repositories import exams as exams_repo

# An exam together with the per-section question counts the converter needs.
ExamWithCounts = tuple[models.Exam, dict[uuid.UUID, int]]


@dataclass
class AddQuestionsOutcome:
    """Result of merging new questions into an existing exam."""

    exam: models.Exam
    counts: dict[uuid.UUID, int]
    added: int
    skipped: int


async def _counts_for(db: AsyncSession, exam_id: uuid.UUID) -> dict[uuid.UUID, int]:
    return await exams_repo.question_counts_by_section(db, [exam_id])


async def _reload(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID
) -> ExamWithCounts:
    """Re-read an exam (with sections) and its counts after a mutation."""
    exams = list(await exams_repo.list_for_user(db, user_id, exam_id=exam_id))
    return exams[0], await _counts_for(db, exam_id)


async def _apply_auto_goal(db: AsyncSession, exam: models.Exam) -> None:
    """Recompute the exam's automatic study goal from its date (no commit).

    A manually set goal is left untouched. An automatic goal is recomputed from
    the current certification date, or cleared when there is no date or the exam
    can no longer be sensibly planned.
    """
    if exam.study_goal_source == StudyGoalSource.MANUAL.value:
        return

    # Keep an existing automatic goal's period; default to daily otherwise.
    period = (
        GoalPeriod(exam.study_goal_period)
        if exam.study_goal_period is not None
        else GoalPeriod.DAILY
    )
    suggestion = None
    if exam.certification_exam_at is not None:
        count = await exams_repo.count_questions(db, exam.id)
        suggestion = planning.suggest(count, exam.certification_exam_at, period)

    if suggestion is None:
        exam.study_goal_period = None
        exam.study_goal_target = None
        exam.study_goal_source = None
    else:
        exam.study_goal_period = suggestion.period.value
        exam.study_goal_target = suggestion.target
        exam.study_goal_source = StudyGoalSource.AUTO.value


async def list_exams(
    db: AsyncSession, user_id: uuid.UUID, *, archived: bool
) -> tuple[list[models.Exam], dict[uuid.UUID, int]]:
    """The user's active or archived exams with their per-section counts."""
    exams = list(await exams_repo.list_for_user(db, user_id, archived=archived))
    counts = await exams_repo.question_counts_by_section(db, [e.id for e in exams])
    return exams, counts


async def get_exam(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID
) -> ExamWithCounts | None:
    """A single exam (archived or not) with its counts, or ``None``."""
    exams = list(await exams_repo.list_for_user(db, user_id, exam_id=exam_id))
    if not exams:
        return None
    return exams[0], await _counts_for(db, exam_id)


async def import_exam(
    db: AsyncSession, user: models.User, payload: str
) -> ExamWithCounts:
    """Import an exam from a JSON document."""
    try:
        exam = build_exam_from_payload(payload)
    except ImportError_ as exc:
        raise ValidationError(str(exc)) from exc

    exam.user_id = user.id
    db.add(exam)
    await db.commit()
    return await _reload(db, user.id, exam.id)


async def add_exam_questions(
    db: AsyncSession, user: models.User, exam_id: uuid.UUID, payload: str
) -> AddQuestionsOutcome:
    """Merge new questions from a JSON document into an existing exam."""
    exam = await exams_repo.get_owned_with_questions(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    try:
        summary = merge_questions_into_exam(exam, payload)
    except ImportError_ as exc:
        raise ValidationError(str(exc)) from exc

    # The question count may have changed, so keep an automatic study goal in
    # sync (a manual goal is left untouched).
    await _apply_auto_goal(db, exam)
    await db.commit()
    reloaded, counts = await _reload(db, user.id, exam_id)
    return AddQuestionsOutcome(
        exam=reloaded, counts=counts, added=summary.added, skipped=summary.skipped
    )


async def delete_exam(db: AsyncSession, user: models.User, exam_id: uuid.UUID) -> bool:
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        return False
    await db.delete(exam)
    await db.commit()
    return True


async def set_archived(
    db: AsyncSession, user: models.User, exam_id: uuid.UUID, archived: bool
) -> ExamWithCounts:
    """Archive or restore an exam (its history is untouched either way)."""
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    exam.archived = archived
    await db.commit()
    return await _reload(db, user.id, exam_id)


async def set_study_goal(
    db: AsyncSession,
    user: models.User,
    exam_id: uuid.UUID,
    period: GoalPeriod,
    target: int,
    source: StudyGoalSource,
) -> ExamWithCounts:
    """Set (or replace) the exam's study goal: ``target`` questions per period."""
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    if target < 1:
        raise ValidationError("The goal target must be at least 1 question.")

    exam.study_goal_period = period.value
    exam.study_goal_target = target
    exam.study_goal_source = source.value
    await db.commit()
    return await _reload(db, user.id, exam_id)


async def clear_study_goal(
    db: AsyncSession, user: models.User, exam_id: uuid.UUID
) -> ExamWithCounts:
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    exam.study_goal_period = None
    exam.study_goal_target = None
    exam.study_goal_source = None
    await db.commit()
    return await _reload(db, user.id, exam_id)


async def set_certification_exam_date(
    db: AsyncSession, user: models.User, exam_id: uuid.UUID, exam_at: datetime
) -> ExamWithCounts:
    """Set the certification exam date; recomputes an automatic study goal."""
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    exam.certification_exam_at = exam_at
    await _apply_auto_goal(db, exam)
    await db.commit()
    return await _reload(db, user.id, exam_id)


async def clear_certification_exam_date(
    db: AsyncSession, user: models.User, exam_id: uuid.UUID
) -> ExamWithCounts:
    """Remove the certification exam date; an automatic goal loses its basis."""
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    exam.certification_exam_at = None
    await _apply_auto_goal(db, exam)
    await db.commit()
    return await _reload(db, user.id, exam_id)
