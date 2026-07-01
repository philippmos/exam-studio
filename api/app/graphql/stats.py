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
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.domain.enums import GoalPeriod
from app.graphql.types import (
    ExamStats,
    SectionStats,
    StreakDay,
    StudyDayStats,
    StudyGoalProgress,
    StudyStreak,
)

STREAK_WINDOW_DAYS = 7  # days shown in the recent-activity strip


def _ratio(part: int, whole: int) -> float:
    return (part / whole) if whole else 0.0


def _current_period_start(
    period: GoalPeriod, tz_offset_minutes: int
) -> tuple[date, datetime]:
    """First local day of the running goal period and its UTC start instant.

    DAILY periods start at local midnight, WEEKLY periods on Monday of the
    current ISO week. ``tz_offset_minutes`` shifts UTC into the caller's local
    time (same convention as ``compute_study_history``).
    """
    offset = timedelta(minutes=tz_offset_minutes)
    local_now = datetime.now(timezone.utc) + offset
    start_day = local_now.date()
    if period is GoalPeriod.WEEKLY:
        start_day -= timedelta(days=local_now.weekday())
    start_utc = datetime.combine(start_day, time.min, tzinfo=timezone.utc) - offset
    return start_day, start_utc


async def compute_study_goal_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    tz_offset_minutes: int = 0,
) -> list[StudyGoalProgress]:
    """Progress of every configured study goal in its current period.

    Returns one entry per exam (of the current user) that has a goal (optionally
    narrowed to one exam), counting the questions answered since the period
    started. Every answered SessionItem counts, so re-attempting also counts.
    """
    stmt = select(models.Exam).where(
        models.Exam.user_id == user_id,
        models.Exam.study_goal_period.is_not(None),
    )
    if exam_id is not None:
        stmt = stmt.where(models.Exam.id == exam_id)
    exams = list((await db.scalars(stmt.order_by(models.Exam.created_at.desc()))).all())
    if not exams:
        return []

    starts = {
        period: _current_period_start(period, tz_offset_minutes)
        for period in {GoalPeriod(e.study_goal_period) for e in exams}
    }

    # One grouped count per period kind (at most two queries).
    answered_counts: dict[uuid.UUID, int] = {}
    for period, (_, start_utc) in starts.items():
        ids = [e.id for e in exams if e.study_goal_period == period.value]
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
                    models.ExamSession.exam_id.in_(ids),
                    models.SessionItem.answered_at >= start_utc,
                )
                .group_by(models.ExamSession.exam_id)
            )
        ).all()
        answered_counts.update(dict(rows))

    return [
        StudyGoalProgress(
            exam_id=exam.id,
            period=GoalPeriod(exam.study_goal_period),
            target=exam.study_goal_target,
            answered=answered_counts.get(exam.id, 0),
            period_start=starts[GoalPeriod(exam.study_goal_period)][0],
        )
        for exam in exams
    ]


async def compute_study_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    tz_offset_minutes: int = 0,
) -> list[StudyDayStats]:
    """Questions answered per calendar day, oldest day first.

    Covers all of the user's exams unless ``exam_id`` narrows it to one.
    Timestamps are stored in UTC; ``tz_offset_minutes`` shifts them into the
    caller's local time before bucketing so a late-evening session lands on the
    right day.
    """
    local_time = models.SessionItem.answered_at + timedelta(
        minutes=tz_offset_minutes
    )
    day = func.date(local_time)
    stmt = (
        select(
            day.label("day"),
            func.count(models.SessionItem.id),
            func.coalesce(
                func.sum(
                    case((models.SessionItem.is_correct.is_(True), 1), else_=0)
                ),
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
    return [
        StudyDayStats(day=d, total=total, correct=correct, incorrect=total - correct)
        for d, total, correct in rows
    ]


def _summarise_streak(
    active_days: set[date], today: date, daily_goal: int, answered_today: int
) -> StudyStreak:
    """Build the streak summary from the set of local days that met the goal.

    Pure (no DB) so the calendar logic can be reasoned about and tested on its
    own. ``active_days`` are the days that reached ``daily_goal``; the current
    streak walks back over consecutive ones, ending on today (already secured)
    or -- when today is still open -- on yesterday, so a day is only "lost" once
    both today and yesterday are missing.
    """
    studied_today = today in active_days

    current = 0
    cursor = today if studied_today else today - timedelta(days=1)
    while cursor in active_days:
        current += 1
        cursor -= timedelta(days=1)

    # Longest run ever: scan the active days in order, resetting on every gap.
    longest = run = 0
    previous: date | None = None
    for day in sorted(active_days):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day

    window = [today - timedelta(days=n) for n in range(STREAK_WINDOW_DAYS - 1, -1, -1)]
    recent_days = [StreakDay(day=day, active=day in active_days) for day in window]

    return StudyStreak(
        current=current,
        longest=longest,
        studied_today=studied_today,
        daily_goal=daily_goal,
        answered_today=answered_today,
        recent_days=recent_days,
    )


async def compute_study_streak(
    db: AsyncSession,
    user_id: uuid.UUID,
    tz_offset_minutes: int = 0,
    daily_goal: int = 1,
) -> StudyStreak:
    """The consecutive-day study streak across all exams.

    Derived entirely from the answered-question history: a day counts once at
    least ``daily_goal`` questions were answered on it, and the set of such local
    calendar days drives the current streak, the longest run ever and the
    recent-activity strip. ``tz_offset_minutes`` shifts UTC timestamps into the
    caller's local time (same convention as the study-history and goal queries)
    so "today" lines up with their calendar.
    """
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
    # ``func.date`` yields ``date`` on PostgreSQL; coerce defensively so the set
    # arithmetic also holds on backends that return ISO strings.
    counts = {
        (d if isinstance(d, date) else date.fromisoformat(str(d))): count
        for d, count in rows
    }
    today = (datetime.now(timezone.utc) + offset).date()
    active_days = {d for d, count in counts.items() if count >= daily_goal}
    answered_today = counts.get(today, 0)
    return _summarise_streak(active_days, today, daily_goal, answered_today)


async def compute_exam_stats(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID
) -> ExamStats | None:
    exam = await db.scalar(
        select(models.Exam).where(
            models.Exam.id == exam_id, models.Exam.user_id == user_id
        )
    )
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

    answered = models.SessionItem.answered_at.is_not(None)
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
