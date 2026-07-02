from __future__ import annotations

import uuid
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.domain.enums import GoalPeriod
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
    to_exam,
    to_exam_stats,
    to_review_due,
    to_session,
    to_session_overview,
    to_study_day,
    to_study_goal_progress,
    to_study_streak,
    to_suggested_goal,
    to_user_settings,
)
from app.services import exams as exams_service
from app.services import review as review_service
from app.services import sessions as sessions_service
from app.services import settings as settings_service
from app.services import stats as stats_service


@strawberry.type
class Query:
    @strawberry.field
    async def user_settings(self, info: Info) -> UserSettingsType:
        """The signed-in user's account settings (colour scheme, streak goal)."""
        settings = await settings_service.get_or_create_settings(
            info.context["db"], current_user(info)
        )
        return to_user_settings(settings)

    @strawberry.field
    async def exams(self, info: Info) -> list[ExamType]:
        """Active (non-archived) exams for the dashboard."""
        exams, counts = await exams_service.list_exams(
            info.context["db"], current_user(info).id, archived=False
        )
        return [to_exam(exam, counts) for exam in exams]

    @strawberry.field
    async def archived_exams(self, info: Info) -> list[ExamType]:
        """Archived exams, for the archive page."""
        exams, counts = await exams_service.list_exams(
            info.context["db"], current_user(info).id, archived=True
        )
        return [to_exam(exam, counts) for exam in exams]

    @strawberry.field
    async def exam(self, info: Info, id: uuid.UUID) -> ExamType | None:
        """A single exam by id (archived or not), e.g. for its progress page."""
        result = await exams_service.get_exam(
            info.context["db"], current_user(info).id, id
        )
        return to_exam(*result) if result is not None else None

    @strawberry.field
    async def session(self, info: Info, id: uuid.UUID) -> ExamSessionType | None:
        """A running (or finished) exam session with its ordered questions."""
        session = await sessions_service.get_session(
            info.context["db"], current_user(info).id, id
        )
        return to_session(session) if session is not None else None

    @strawberry.field
    async def sessions(
        self, info: Info, exam_id: uuid.UUID | None = None
    ) -> list[SessionOverviewType]:
        """All sessions (optionally one exam's) with answer progress, newest first."""
        rows = await sessions_service.list_overviews(
            info.context["db"], current_user(info).id, exam_id
        )
        return [to_session_overview(*row) for row in rows]

    @strawberry.field
    async def exam_stats(self, info: Info, exam_id: uuid.UUID) -> ExamStats | None:
        """Aggregated learning-progress statistics for an exam."""
        data = await stats_service.compute_exam_stats(
            info.context["db"], exam_id, current_user(info).id
        )
        return to_exam_stats(data) if data is not None else None

    @strawberry.field
    async def study_history(
        self,
        info: Info,
        exam_id: uuid.UUID | None = None,
        tz_offset_minutes: int = 0,
    ) -> list[StudyDayStats]:
        """Questions answered per day -- all exams, or one exam's history."""
        data = await stats_service.compute_study_history(
            info.context["db"], current_user(info).id, exam_id, tz_offset_minutes
        )
        return [to_study_day(day) for day in data]

    @strawberry.field
    async def study_goal_progress(
        self,
        info: Info,
        exam_id: uuid.UUID | None = None,
        tz_offset_minutes: int = 0,
    ) -> list[StudyGoalProgress]:
        """Current-period progress of every exam that has a study goal."""
        data = await stats_service.compute_study_goal_progress(
            info.context["db"], current_user(info).id, exam_id, tz_offset_minutes
        )
        return [to_study_goal_progress(item) for item in data]

    @strawberry.field
    async def review_due(
        self, info: Info, exam_id: uuid.UUID | None = None
    ) -> list[ReviewDueStatus]:
        """Questions currently due for spaced-repetition review, per exam."""
        data = await review_service.compute_review_due(
            info.context["db"], current_user(info).id, exam_id
        )
        return [to_review_due(item) for item in data]

    @strawberry.field
    async def study_streak(self, info: Info, tz_offset_minutes: int = 0) -> StudyStreak:
        """Consecutive-day study streak across all exams (habit/gamification)."""
        db = info.context["db"]
        user = current_user(info)
        settings = await settings_service.get_or_create_settings(db, user)
        summary = await stats_service.compute_study_streak(
            db, user.id, tz_offset_minutes, settings.daily_streak_goal
        )
        return to_study_streak(summary)

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
        date is known or the exam cannot be sensibly planned.
        """
        suggestion = await stats_service.suggest_study_goal(
            info.context["db"], current_user(info).id, exam_id, period, exam_at
        )
        return to_suggested_goal(suggestion) if suggestion is not None else None
