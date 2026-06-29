from __future__ import annotations

import uuid
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.enums import GoalPeriod
from app.graphql import loaders, planning, review, stats
from app.graphql.context import current_user
from app.graphql.types import (
    ExamSessionType,
    ExamStats,
    ExamType,
    GoalPeriodEnum,
    ReviewDueStatus,
    SessionOverviewType,
    StudyDayStats,
    StudyGoalProgress,
    StudyStreak,
    SuggestedStudyGoal,
    UserSettingsType,
    to_user_settings,
)


@strawberry.type
class Query:
    @strawberry.field
    async def user_settings(self, info: Info) -> UserSettingsType:
        """The signed-in user's account settings (colour scheme, streak goal)."""
        settings = await loaders.get_or_create_settings(
            info.context["db"], current_user(info)
        )
        return to_user_settings(settings)

    @strawberry.field
    async def exams(self, info: Info) -> list[ExamType]:
        """Active (non-archived) exams for the dashboard."""
        user = current_user(info)
        return await loaders.load_exams(info.context["db"], user.id, archived=False)

    @strawberry.field
    async def archived_exams(self, info: Info) -> list[ExamType]:
        """Archived exams, for the archive page."""
        user = current_user(info)
        return await loaders.load_exams(info.context["db"], user.id, archived=True)

    @strawberry.field
    async def exam(self, info: Info, id: uuid.UUID) -> ExamType | None:
        """A single exam by id (archived or not), e.g. for its progress page."""
        user = current_user(info)
        result = await loaders.load_exams(info.context["db"], user.id, exam_id=id)
        return result[0] if result else None

    @strawberry.field
    async def session(self, info: Info, id: uuid.UUID) -> ExamSessionType | None:
        """A running (or finished) exam session with its ordered questions."""
        user = current_user(info)
        return await loaders.load_session_type(info.context["db"], id, user.id)

    @strawberry.field
    async def sessions(
        self, info: Info, exam_id: uuid.UUID | None = None
    ) -> list[SessionOverviewType]:
        """All sessions (optionally one exam's) with answer progress, newest first."""
        user = current_user(info)
        return await loaders.load_session_overviews(
            info.context["db"], user.id, exam_id
        )

    @strawberry.field
    async def exam_stats(self, info: Info, exam_id: uuid.UUID) -> ExamStats | None:
        """Aggregated learning-progress statistics for an exam."""
        user = current_user(info)
        return await stats.compute_exam_stats(info.context["db"], exam_id, user.id)

    @strawberry.field
    async def study_history(
        self,
        info: Info,
        exam_id: uuid.UUID | None = None,
        tz_offset_minutes: int = 0,
    ) -> list[StudyDayStats]:
        """Questions answered per day -- all exams, or one exam's history."""
        user = current_user(info)
        return await stats.compute_study_history(
            info.context["db"], user.id, exam_id, tz_offset_minutes
        )

    @strawberry.field
    async def study_goal_progress(
        self,
        info: Info,
        exam_id: uuid.UUID | None = None,
        tz_offset_minutes: int = 0,
    ) -> list[StudyGoalProgress]:
        """Current-period progress of every exam that has a study goal."""
        user = current_user(info)
        return await stats.compute_study_goal_progress(
            info.context["db"], user.id, exam_id, tz_offset_minutes
        )

    @strawberry.field
    async def review_due(
        self, info: Info, exam_id: uuid.UUID | None = None
    ) -> list[ReviewDueStatus]:
        """Questions currently due for spaced-repetition review, per exam."""
        user = current_user(info)
        return await review.compute_review_due(info.context["db"], user.id, exam_id)

    @strawberry.field
    async def study_streak(
        self, info: Info, tz_offset_minutes: int = 0
    ) -> StudyStreak:
        """Consecutive-day study streak across all exams (habit/gamification)."""
        db = info.context["db"]
        user = current_user(info)
        settings = await loaders.get_or_create_settings(db, user)
        return await stats.compute_study_streak(
            db, user.id, tz_offset_minutes, settings.daily_streak_goal
        )

    @strawberry.field
    async def suggested_study_goal(
        self,
        info: Info,
        exam_id: uuid.UUID,
        period: GoalPeriodEnum = GoalPeriod.DAILY,
        exam_at: datetime | None = None,
    ) -> SuggestedStudyGoal | None:
        """A study goal derived from the certification exam date.

        Uses ``exam_at`` when given (to preview a date before it is saved),
        otherwise the exam's stored certification date. Returns ``None`` when no
        date is known or the exam cannot be sensibly planned (see
        :func:`app.graphql.planning.suggest`).
        """
        db = info.context["db"]
        user = current_user(info)
        exam = await loaders.get_owned_exam(db, user.id, exam_id)
        if exam is None:
            return None
        when = exam_at or exam.certification_exam_at
        if when is None:
            return None

        count = await loaders.count_questions(db, exam_id)
        suggestion = planning.suggest(count, when, GoalPeriod(period.value))
        if suggestion is None:
            return None
        return SuggestedStudyGoal(
            period=suggestion.period,
            target=suggestion.target,
            question_count=suggestion.question_count,
            repetition_factor=suggestion.repetition_factor,
            days_until_exam=suggestion.days_until_exam,
            usable_days=suggestion.usable_days,
        )
