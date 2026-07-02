"""Learning-progress analytics use cases.

Everything is derived on the fly from the answer history via the stats
repository; this layer does the ratio/rollup arithmetic and returns the
framework-free analytics dataclasses.

Definitions: *attempted* = answered at least once; *mastered* = answered
correctly at least once; *struggling* = attempted but never correct; an
*attempt* is a single answered SessionItem (a question may be attempted in
several sessions).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import periods, planning
from app.domain import streak as streak_domain
from app.domain.analytics import (
    ExamStatsData,
    SectionStatsData,
    StudyDayData,
    StudyGoalProgressData,
)
from app.domain.enums import GoalPeriod
from app.domain.planning import StudyGoalSuggestion
from app.domain.streak import StreakSummary
from app.repositories import exams as exams_repo
from app.repositories import stats as stats_repo


def _ratio(part: int, whole: int) -> float:
    return (part / whole) if whole else 0.0


async def compute_exam_stats(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID
) -> ExamStatsData | None:
    """Aggregate learning progress for one exam, or ``None`` if not owned."""
    exam = await exams_repo.get_owned(db, user_id, exam_id)
    if exam is None:
        return None

    sections = await stats_repo.sections_ordered(db, exam_id)
    totals = await stats_repo.section_question_totals(db, exam_id)
    attempts_by_section = await stats_repo.section_attempt_stats(db, exam_id)
    mastered_by_section = await stats_repo.section_mastered_counts(db, exam_id)

    section_stats: list[SectionStatsData] = []
    for section in sections:
        total = totals.get(section.id, 0)
        attempts, correct, attempted_q = attempts_by_section.get(section.id, (0, 0, 0))
        mastered_q = mastered_by_section.get(section.id, 0)
        section_stats.append(
            SectionStatsData(
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

    # Each question belongs to exactly one section, so summing the per-section
    # distinct counts yields the exam-wide distinct counts.
    total_questions = sum(s.total_questions for s in section_stats)
    attempted = sum(s.attempted_questions for s in section_stats)
    mastered = sum(s.mastered_questions for s in section_stats)
    correct_attempts = sum(s.correct_attempts for s in section_stats)
    total_attempts = sum(
        s.correct_attempts + s.incorrect_attempts for s in section_stats
    )

    return ExamStatsData(
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
        sessions_count=await stats_repo.sessions_count(db, exam_id),
        last_activity=await stats_repo.last_activity(db, exam_id),
        sections=section_stats,
    )


async def compute_study_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    tz_offset_minutes: int = 0,
) -> list[StudyDayData]:
    """Questions answered per calendar day, oldest first."""
    rows = await stats_repo.study_history_rows(db, user_id, exam_id, tz_offset_minutes)
    return [
        StudyDayData(day=day, total=total, correct=correct, incorrect=total - correct)
        for day, total, correct in rows
    ]


async def compute_study_goal_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    tz_offset_minutes: int = 0,
) -> list[StudyGoalProgressData]:
    """Progress of every configured study goal in its current period."""
    exams = await stats_repo.exams_with_goals(db, user_id, exam_id)

    # Narrow the (constraint-guaranteed) goal fields once, for the type-checker.
    goals: list[tuple[uuid.UUID, GoalPeriod, int]] = []
    for exam in exams:
        if exam.study_goal_period is None or exam.study_goal_target is None:
            continue
        goals.append(
            (exam.id, GoalPeriod(exam.study_goal_period), exam.study_goal_target)
        )
    if not goals:
        return []

    now = datetime.now(UTC)
    starts = {
        period: periods.current_period_start(period, tz_offset_minutes, now)
        for period in {period for _, period, _ in goals}
    }

    # One grouped count per period kind (at most two queries).
    answered_counts: dict[uuid.UUID, int] = {}
    for period, (_, start_utc) in starts.items():
        ids = [eid for eid, p, _ in goals if p is period]
        answered_counts.update(
            await stats_repo.answered_counts_since(db, ids, start_utc)
        )

    return [
        StudyGoalProgressData(
            exam_id=eid,
            period=period,
            target=target,
            answered=answered_counts.get(eid, 0),
            period_start=starts[period][0],
        )
        for eid, period, target in goals
    ]


async def compute_study_streak(
    db: AsyncSession,
    user_id: uuid.UUID,
    tz_offset_minutes: int = 0,
    daily_goal: int = 1,
) -> StreakSummary:
    """The consecutive-day study streak across all of the user's exams."""
    counts = await stats_repo.active_day_counts(db, user_id, tz_offset_minutes)
    now = datetime.now(UTC)
    today = (now + timedelta(minutes=tz_offset_minutes)).date()
    active_days = {day for day, count in counts.items() if count >= daily_goal}
    answered_today = counts.get(today, 0)
    return streak_domain.summarise_streak(
        active_days, today, daily_goal, answered_today
    )


async def suggest_study_goal(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID,
    period: GoalPeriod,
    exam_at: datetime | None,
) -> StudyGoalSuggestion | None:
    """A study goal derived from the certification exam date, or ``None``.

    Uses ``exam_at`` when given (to preview a date before it is saved),
    otherwise the exam's stored certification date.
    """
    exam = await exams_repo.get_owned(db, user_id, exam_id)
    if exam is None:
        return None
    when = exam_at or exam.certification_exam_at
    if when is None:
        return None
    count = await exams_repo.count_questions(db, exam_id)
    return planning.suggest(count, when, period)
