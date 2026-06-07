"""Learning-progress statistics for an exam.

Everything here is *derived* from the recorded answer history (SessionItem rows)
plus the exam structure -- no aggregates are stored, which keeps the schema
normalised. Counts are computed with SQL aggregates so the work stays in the DB.

Definitions
-----------
* attempted  -- questions answered at least once
* mastered   -- questions answered correctly at least once
* struggling -- attempted but never answered correctly
* attempt    -- a single answered SessionItem row (a question may be attempted
                in several sessions, so attempts >= attempted questions)
"""

from __future__ import annotations

import uuid

from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.graphql.types import ExamStats, SectionStats


def _ratio(part: int, whole: int) -> float:
    return (part / whole) if whole else 0.0


async def compute_exam_stats(
    db: AsyncSession, exam_id: uuid.UUID
) -> ExamStats | None:
    exam = await db.get(models.Exam, exam_id)
    if exam is None:
        return None

    sections = list(
        (
            await db.scalars(
                select(models.Section)
                .where(models.Section.exam_id == exam_id)
                .order_by(models.Section.position)
            )
        ).all()
    )

    # Total questions per section.
    totals = dict(
        (
            await db.execute(
                select(models.Question.section_id, func.count(models.Question.id))
                .where(models.Section.id == models.Question.section_id)
                .where(models.Section.exam_id == exam_id)
                .group_by(models.Question.section_id)
            )
        ).all()
    )

    answered = models.SessionItem.selected_answer_id.is_not(None)
    section_join = (
        select(models.Section.id)
        .select_from(models.SessionItem)
        .join(
            models.ExamSession,
            models.SessionItem.session_id == models.ExamSession.id,
        )
        .join(
            models.Question, models.SessionItem.question_id == models.Question.id
        )
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.ExamSession.exam_id == exam_id)
        .group_by(models.Section.id)
    )

    # Attempts per section: total attempts, correct attempts, distinct questions.
    attempt_rows = (
        await db.execute(
            section_join.add_columns(
                func.count(models.SessionItem.id),
                func.coalesce(
                    func.sum(
                        case((models.SessionItem.is_correct.is_(True), 1), else_=0)
                    ),
                    0,
                ),
                func.count(distinct(models.SessionItem.question_id)),
            ).where(answered)
        )
    ).all()
    attempts_by_section = {r[0]: (r[1], r[2], r[3]) for r in attempt_rows}

    # Distinct mastered questions per section.
    mastered_rows = (
        await db.execute(
            section_join.add_columns(
                func.count(distinct(models.SessionItem.question_id))
            ).where(models.SessionItem.is_correct.is_(True))
        )
    ).all()
    mastered_by_section = {r[0]: r[1] for r in mastered_rows}

    section_stats: list[SectionStats] = []
    for section in sections:
        total = totals.get(section.id, 0)
        attempts, correct, attempted_q = attempts_by_section.get(section.id, (0, 0, 0))
        mastered_q = mastered_by_section.get(section.id, 0)
        section_stats.append(
            SectionStats(
                section_id=section.id,
                name=section.name,
                total_questions=total,
                attempted_questions=attempted_q,
                mastered_questions=mastered_q,
                struggling_questions=max(attempted_q - mastered_q, 0),
                correct_attempts=correct,
                incorrect_attempts=max(attempts - correct, 0),
                accuracy=_ratio(correct, attempts),
                mastery=_ratio(mastered_q, total),
            )
        )

    # Exam-wide totals: each question belongs to exactly one section, so summing
    # the per-section distinct counts yields the exam-wide distinct counts.
    total_questions = sum(s.total_questions for s in section_stats)
    attempted = sum(s.attempted_questions for s in section_stats)
    mastered = sum(s.mastered_questions for s in section_stats)
    correct_attempts = sum(s.correct_attempts for s in section_stats)
    total_attempts = sum(s.correct_attempts + s.incorrect_attempts for s in section_stats)

    sessions_count = await db.scalar(
        select(func.count(models.ExamSession.id)).where(
            models.ExamSession.exam_id == exam_id
        )
    )
    last_activity = await db.scalar(
        select(func.max(models.SessionItem.answered_at))
        .select_from(models.SessionItem)
        .join(
            models.ExamSession,
            models.SessionItem.session_id == models.ExamSession.id,
        )
        .where(models.ExamSession.exam_id == exam_id)
    )

    return ExamStats(
        exam_id=exam.id,
        exam_name=exam.name,
        total_questions=total_questions,
        attempted_questions=attempted,
        mastered_questions=mastered,
        struggling_questions=max(attempted - mastered, 0),
        unattempted_questions=max(total_questions - attempted, 0),
        total_attempts=total_attempts,
        correct_attempts=correct_attempts,
        incorrect_attempts=max(total_attempts - correct_attempts, 0),
        accuracy=_ratio(correct_attempts, total_attempts),
        coverage=_ratio(attempted, total_questions),
        mastery=_ratio(mastered, total_questions),
        sessions_count=sessions_count or 0,
        last_activity=last_activity,
        sections=section_stats,
    )
