from __future__ import annotations

import uuid
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.domain.enums import StudyGoalSource
from app.graphql.context import current_user
from app.graphql.types import (
    AddQuestionsResult,
    AllocationInput,
    AllocationType,
    AnswerResult,
    ExamSessionType,
    ExamType,
    GoalPeriodEnum,
    SessionModeEnum,
    StudyGoalSourceEnum,
    ThemePreferenceEnum,
    UserSettingsType,
    to_exam,
    to_session,
    to_user_settings,
)
from app.services import exams as exams_service
from app.services import sessions as sessions_service
from app.services import settings as settings_service


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def set_theme_preference(
        self, info: Info, theme_preference: ThemePreferenceEnum
    ) -> UserSettingsType:
        """Persist the user's colour-scheme preference (SYSTEM / LIGHT / DARK)."""
        settings = await settings_service.set_theme_preference(
            info.context["db"], current_user(info), theme_preference
        )
        return to_user_settings(settings)

    @strawberry.mutation
    async def set_daily_streak_goal(self, info: Info, goal: int) -> UserSettingsType:
        """Set how many questions a day needs for it to count towards the streak.

        ``goal`` must be one of the offered values (5, 10, 15, 25, 50).
        """
        settings = await settings_service.set_daily_streak_goal(
            info.context["db"], current_user(info), goal
        )
        return to_user_settings(settings)

    @strawberry.mutation
    async def import_exam(self, info: Info, payload: str) -> ExamType:
        """Import an exam from the JSON produced in the `exam.json` format."""
        exam, counts = await exams_service.import_exam(
            info.context["db"], current_user(info), payload
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def add_exam_questions(
        self, info: Info, exam_id: uuid.UUID, payload: str
    ) -> AddQuestionsResult:
        """Add new questions from an exam JSON document to an existing exam.

        The payload uses the same format as ``import_exam``. Only questions whose
        text is not already in the exam are imported; existing ones are skipped
        and nothing is removed.
        """
        outcome = await exams_service.add_exam_questions(
            info.context["db"], current_user(info), exam_id, payload
        )
        return AddQuestionsResult(
            exam=to_exam(outcome.exam, outcome.counts),
            added=outcome.added,
            skipped=outcome.skipped,
        )

    @strawberry.mutation
    async def delete_exam(self, info: Info, id: uuid.UUID) -> bool:
        return await exams_service.delete_exam(
            info.context["db"], current_user(info), id
        )

    @strawberry.mutation
    async def set_exam_archived(
        self, info: Info, exam_id: uuid.UUID, archived: bool
    ) -> ExamType:
        """Archive or restore an exam.

        Archiving hides it from the dashboard and stops new sessions from being
        started for it; restoring makes it active again. The exam's history is
        untouched either way.
        """
        exam, counts = await exams_service.set_archived(
            info.context["db"], current_user(info), exam_id, archived
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def set_study_goal(
        self,
        info: Info,
        exam_id: uuid.UUID,
        period: GoalPeriodEnum,
        target: int,
        source: StudyGoalSourceEnum = StudyGoalSource.MANUAL,
    ) -> ExamType:
        """Set (or replace) the exam's study goal: `target` questions per `period`.

        ``source`` records whether the target was entered by hand (``MANUAL``,
        the default) or accepted from the exam-date suggestion (``AUTO``).
        """
        exam, counts = await exams_service.set_study_goal(
            info.context["db"], current_user(info), exam_id, period, target, source
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def clear_study_goal(self, info: Info, exam_id: uuid.UUID) -> ExamType:
        """Remove the exam's study goal, if any."""
        exam, counts = await exams_service.clear_study_goal(
            info.context["db"], current_user(info), exam_id
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def set_certification_exam_date(
        self, info: Info, exam_id: uuid.UUID, exam_at: datetime
    ) -> ExamType:
        """Set (or replace) the date and time of the real certification exam.

        Recomputes the automatic study goal from the new date; a manual goal is
        kept as-is.
        """
        exam, counts = await exams_service.set_certification_exam_date(
            info.context["db"], current_user(info), exam_id, exam_at
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def clear_certification_exam_date(
        self, info: Info, exam_id: uuid.UUID
    ) -> ExamType:
        """Remove the exam's certification exam date, if any.

        An automatic study goal loses its basis and is removed too; a manual
        goal is kept.
        """
        exam, counts = await exams_service.clear_certification_exam_date(
            info.context["db"], current_user(info), exam_id
        )
        return to_exam(exam, counts)

    @strawberry.mutation
    async def delete_session(self, info: Info, id: uuid.UUID) -> bool:
        return await sessions_service.delete_session(
            info.context["db"], current_user(info), id
        )

    @strawberry.mutation
    async def start_session(
        self,
        info: Info,
        exam_id: uuid.UUID,
        mode: SessionModeEnum,
        section_id: uuid.UUID | None = None,
    ) -> ExamSessionType:
        session = await sessions_service.start_session(
            info.context["db"], current_user(info), exam_id, mode, section_id
        )
        return to_session(session)

    @strawberry.mutation
    async def submit_answer(
        self,
        info: Info,
        session_item_id: uuid.UUID,
        selected_answer_ids: list[uuid.UUID] | None = None,
        allocations: list[AllocationInput] | None = None,
        tz_offset_minutes: int = 0,
    ) -> AnswerResult:
        """Persist the answer for a question and report correctness.

        Choice questions pass ``selected_answer_ids`` (a multiple-choice answer
        only counts as correct when exactly the set of correct answers was
        chosen); allocation questions pass ``allocations`` and are correct only
        when every item sits in its correct basket. Every answer also advances
        the question's spaced-repetition schedule.
        """
        placements = (
            [(placement.answer_id, placement.category_id) for placement in allocations]
            if allocations is not None
            else None
        )
        outcome = await sessions_service.submit_answer(
            info.context["db"],
            current_user(info),
            session_item_id,
            selected_answer_ids,
            placements,
            tz_offset_minutes,
        )
        return AnswerResult(
            session_item_id=outcome.session_item_id,
            is_correct=outcome.is_correct,
            correct_answer_ids=outcome.correct_answer_ids,
            correct_allocations=[
                AllocationType(answer_id=answer_id, category_id=category_id)
                for answer_id, category_id in outcome.correct_allocations
            ],
            review_box=outcome.review_box,
            review_interval_days=outcome.review_interval_days,
        )

    @strawberry.mutation
    async def finish_session(self, info: Info, id: uuid.UUID) -> ExamSessionType:
        session = await sessions_service.finish_session(
            info.context["db"], current_user(info), id
        )
        return to_session(session)
