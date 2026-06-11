from __future__ import annotations

import uuid

import strawberry
from strawberry.types import Info

from app.graphql import loaders, stats
from app.graphql.types import (
    ExamSessionType,
    ExamStats,
    ExamType,
    SessionOverviewType,
    StudyDayStats,
)


@strawberry.type
class Query:
    @strawberry.field
    async def exams(self, info: Info) -> list[ExamType]:
        """All exams for the dashboard."""
        return await loaders.load_exams(info.context["db"])

    @strawberry.field
    async def exam(self, info: Info, id: uuid.UUID) -> ExamType | None:
        result = await loaders.load_exams(info.context["db"], exam_id=id)
        return result[0] if result else None

    @strawberry.field
    async def session(self, info: Info, id: uuid.UUID) -> ExamSessionType | None:
        """A running (or finished) exam session with its ordered questions."""
        return await loaders.load_session_type(info.context["db"], id)

    @strawberry.field
    async def sessions(
        self, info: Info, exam_id: uuid.UUID | None = None
    ) -> list[SessionOverviewType]:
        """All sessions (optionally one exam's) with answer progress, newest first."""
        return await loaders.load_session_overviews(info.context["db"], exam_id)

    @strawberry.field
    async def exam_stats(self, info: Info, exam_id: uuid.UUID) -> ExamStats | None:
        """Aggregated learning-progress statistics for an exam."""
        return await stats.compute_exam_stats(info.context["db"], exam_id)

    @strawberry.field
    async def study_history(
        self,
        info: Info,
        exam_id: uuid.UUID | None = None,
        tz_offset_minutes: int = 0,
    ) -> list[StudyDayStats]:
        """Questions answered per day -- all exams, or one exam's history."""
        return await stats.compute_study_history(
            info.context["db"], exam_id, tz_offset_minutes
        )
