from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

import strawberry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from strawberry.types import Info

from app import models
from app.enums import GoalPeriod, QuestionType, SessionMode, StudyGoalSource
from app.graphql import loaders, planning, review
from app.graphql.types import (
    AllocationInput,
    AllocationType,
    AnswerResult,
    ExamSessionType,
    ExamType,
    GoalPeriodEnum,
    SessionModeEnum,
    StudyGoalSourceEnum,
)
from app.importer import ImportError_, build_exam_from_payload


async def _select_question_ids(
    db: AsyncSession,
    exam_id: uuid.UUID,
    mode: SessionMode,
    section_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    base = (
        select(models.Question.id)
        .join(models.Section, models.Question.section_id == models.Section.id)
        .where(models.Section.exam_id == exam_id)
    )

    if mode is SessionMode.BY_SECTION:
        if section_id is None:
            raise ValueError("A sectionId is required for BY_SECTION mode.")
        base = base.where(models.Question.section_id == section_id)
    elif mode is SessionMode.UNANSWERED:
        answered_correctly = (
            select(models.SessionItem.question_id)
            .join(
                models.ExamSession,
                models.SessionItem.session_id == models.ExamSession.id,
            )
            .where(
                models.ExamSession.exam_id == exam_id,
                models.SessionItem.is_correct.is_(True),
            )
        )
        base = base.where(models.Question.id.not_in(answered_correctly))
    elif mode is SessionMode.DUE_REVIEW:
        base = base.join(
            models.QuestionReviewState,
            models.QuestionReviewState.question_id == models.Question.id,
        ).where(models.QuestionReviewState.due_at <= datetime.now(timezone.utc))

    ids = list((await db.scalars(base)).all())
    random.shuffle(ids)
    return ids


def _grade_choice(
    question: models.Question,
    answers: list[models.Answer],
    selected_answer_ids: list[uuid.UUID] | None,
) -> tuple[list[models.SessionItemAnswer], bool, list[uuid.UUID]]:
    """Validate and grade a single/multiple-choice selection.

    Returns the selection rows to persist, whether it was correct, and the
    (sorted) ids of the correct answers for the feedback.
    """
    selected_ids = set(selected_answer_ids or [])
    if not selected_ids:
        raise ValueError("At least one answer must be selected.")
    if (
        question.question_type == QuestionType.SINGLE_CHOICE.value
        and len(selected_ids) != 1
    ):
        raise ValueError(
            "Exactly one answer must be selected for a single-choice question."
        )

    answer_ids = {a.id for a in answers}
    if not selected_ids <= answer_ids:
        raise ValueError("Selected answers do not belong to this question.")

    correct_ids = {a.id for a in answers if a.is_correct}
    if not correct_ids:
        raise ValueError("This question has no correct answer configured.")

    selection = [models.SessionItemAnswer(answer_id=aid) for aid in selected_ids]
    return selection, selected_ids == correct_ids, sorted(correct_ids, key=str)


def _grade_allocation(
    answers: list[models.Answer],
    categories: list[models.QuestionCategory],
    allocations: list[AllocationInput] | None,
) -> tuple[list[models.SessionItemAnswer], bool, list[AllocationType]]:
    """Validate and grade an allocation (every item sorted into a basket).

    The answer counts as correct only when every item sits in its own correct
    category. Returns the selection rows to persist, the correctness, and the
    full correct mapping (item -> basket) for the feedback.
    """
    answer_ids = {a.id for a in answers}
    category_ids = {c.id for c in categories}

    chosen: dict[uuid.UUID, uuid.UUID] = {}
    for placement in allocations or []:
        if placement.answer_id in chosen:
            raise ValueError("Each item may be sorted into only one category.")
        chosen[placement.answer_id] = placement.category_id

    if not set(chosen) <= answer_ids:
        raise ValueError("Selected answers do not belong to this question.")
    if not set(chosen.values()) <= category_ids:
        raise ValueError("Selected categories do not belong to this question.")
    if set(chosen) != answer_ids:
        raise ValueError("Every item must be sorted into a category.")

    selection = [
        models.SessionItemAnswer(answer_id=aid, category_id=cid)
        for aid, cid in chosen.items()
    ]
    correct_by_answer = {a.id: a.correct_category_id for a in answers}
    is_correct = all(chosen[aid] == correct_by_answer[aid] for aid in answer_ids)
    correct_allocations = [
        AllocationType(answer_id=a.id, category_id=a.correct_category_id)
        for a in answers
        if a.correct_category_id is not None
    ]
    return selection, is_correct, correct_allocations


async def _apply_auto_goal(db: AsyncSession, exam: models.Exam) -> None:
    """Recompute the exam's automatic study goal from its date (no commit).

    A manually set goal is left untouched. An automatic goal is recomputed from
    the current certification date, or cleared when there is no date or the exam
    can no longer be sensibly planned. Call this whenever the date changes.
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
        count = await loaders.count_questions(db, exam.id)
        suggestion = planning.suggest(count, exam.certification_exam_at, period)

    if suggestion is None:
        exam.study_goal_period = None
        exam.study_goal_target = None
        exam.study_goal_source = None
    else:
        exam.study_goal_period = suggestion.period.value
        exam.study_goal_target = suggestion.target
        exam.study_goal_source = StudyGoalSource.AUTO.value


def _shuffle_answer_order(question: models.Question) -> list[str] | None:
    answer_ids = [str(answer.id) for answer in question.answers]
    random.shuffle(answer_ids)
    return answer_ids


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def import_exam(self, info: Info, payload: str) -> ExamType:
        """Import an exam from the JSON produced in the `exam.json` format."""
        db: AsyncSession = info.context["db"]
        try:
            exam = build_exam_from_payload(payload)
        except ImportError_ as exc:
            raise ValueError(str(exc)) from exc

        db.add(exam)
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam.id)
        return result[0]

    @strawberry.mutation
    async def delete_exam(self, info: Info, id: uuid.UUID) -> bool:
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, id)
        if exam is None:
            return False
        await db.delete(exam)
        await db.commit()
        return True

    @strawberry.mutation
    async def set_exam_archived(
        self, info: Info, exam_id: uuid.UUID, archived: bool
    ) -> ExamType:
        """Archive or restore an exam.

        Archiving hides it from the dashboard and stops new sessions from being
        started for it; restoring (``archived = false``) makes it active again.
        The exam's history is untouched either way, so statistics and the study
        streak keep accounting for it.
        """
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")

        exam.archived = archived
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam_id)
        return result[0]

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
        the default) or accepted from the exam-date suggestion (``AUTO``); only
        ``AUTO`` goals are later recomputed when the exam date changes.
        """
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")
        if target < 1:
            raise ValueError("The goal target must be at least 1 question.")

        exam.study_goal_period = period.value
        exam.study_goal_target = target
        exam.study_goal_source = source.value
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam_id)
        return result[0]

    @strawberry.mutation
    async def clear_study_goal(self, info: Info, exam_id: uuid.UUID) -> ExamType:
        """Remove the exam's study goal, if any."""
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")

        exam.study_goal_period = None
        exam.study_goal_target = None
        exam.study_goal_source = None
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam_id)
        return result[0]

    @strawberry.mutation
    async def set_certification_exam_date(
        self, info: Info, exam_id: uuid.UUID, exam_at: datetime
    ) -> ExamType:
        """Set (or replace) the date and time of the real certification exam.

        Recomputes the automatic study goal from the new date; a manual goal is
        kept as-is.
        """
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")

        exam.certification_exam_at = exam_at
        await _apply_auto_goal(db, exam)
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam_id)
        return result[0]

    @strawberry.mutation
    async def clear_certification_exam_date(
        self, info: Info, exam_id: uuid.UUID
    ) -> ExamType:
        """Remove the exam's certification exam date, if any.

        An automatic study goal loses its basis and is removed too; a manual
        goal is kept.
        """
        db: AsyncSession = info.context["db"]
        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")

        exam.certification_exam_at = None
        await _apply_auto_goal(db, exam)
        await db.commit()
        result = await loaders.load_exams(db, exam_id=exam_id)
        return result[0]

    @strawberry.mutation
    async def delete_session(self, info: Info, id: uuid.UUID) -> bool:
        db: AsyncSession = info.context["db"]
        session = await db.get(models.ExamSession, id)
        if session is None:
            return False
        await db.delete(session)
        await db.commit()
        return True

    @strawberry.mutation
    async def start_session(
        self,
        info: Info,
        exam_id: uuid.UUID,
        mode: SessionModeEnum,
        section_id: uuid.UUID | None = None,
    ) -> ExamSessionType:
        db: AsyncSession = info.context["db"]

        exam = await db.get(models.Exam, exam_id)
        if exam is None:
            raise ValueError("Exam not found.")
        if exam.archived:
            raise ValueError("Cannot start a session for an archived exam.")

        question_ids = await _select_question_ids(db, exam_id, mode, section_id)
        questions = list(
            (
                await db.scalars(
                    select(models.Question)
                    .where(models.Question.id.in_(question_ids))
                    .options(selectinload(models.Question.answers))
                )
            ).all()
        )
        questions_by_id = {question.id: question for question in questions}

        session = models.ExamSession(
            exam_id=exam_id,
            mode=mode.value,
            section_id=section_id if mode is SessionMode.BY_SECTION else None,
        )
        session.items = [
            models.SessionItem(
                question_id=qid,
                position=position,
                answer_order=_shuffle_answer_order(questions_by_id[qid]),
            )
            for position, qid in enumerate(question_ids)
        ]
        db.add(session)
        await db.commit()

        return await loaders.load_session_type(db, session.id)

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
        the question's spaced-repetition schedule (``tz_offset_minutes`` aligns
        the next due date to the caller's local day).
        """
        db: AsyncSession = info.context["db"]

        item = await db.get(
            models.SessionItem,
            session_item_id,
            options=(selectinload(models.SessionItem.selected_answers),),
        )
        if item is None:
            raise ValueError("Session item not found.")

        question = await db.get(models.Question, item.question_id)
        answers = list(
            (
                await db.scalars(
                    select(models.Answer).where(
                        models.Answer.question_id == item.question_id
                    )
                )
            ).all()
        )

        if question.question_type == QuestionType.ALLOCATION.value:
            categories = list(
                (
                    await db.scalars(
                        select(models.QuestionCategory).where(
                            models.QuestionCategory.question_id == item.question_id
                        )
                    )
                ).all()
            )
            selection, is_correct, correct_allocations = _grade_allocation(
                answers, categories, allocations
            )
            correct_answer_ids: list[uuid.UUID] = []
        else:
            selection, is_correct, correct_answer_ids = _grade_choice(
                question, answers, selected_answer_ids
            )
            correct_allocations = []

        # Clear the previous selection and flush the deletes before inserting
        # the new rows: re-answering reuses the same (item, answer) pairs, which
        # would otherwise trip the session_item_answers uniqueness constraint.
        item.selected_answers = []
        await db.flush()
        item.selected_answers = selection
        item.is_correct = is_correct
        item.answered_at = datetime.now(timezone.utc)
        outcome = await review.record_answer(
            db, item.question_id, is_correct, tz_offset_minutes
        )
        await db.commit()

        return AnswerResult(
            session_item_id=item.id,
            is_correct=is_correct,
            correct_answer_ids=correct_answer_ids,
            correct_allocations=correct_allocations,
            review_box=outcome.box,
            review_interval_days=outcome.interval_days,
        )

    @strawberry.mutation
    async def finish_session(self, info: Info, id: uuid.UUID) -> ExamSessionType:
        db: AsyncSession = info.context["db"]
        session = await db.get(models.ExamSession, id)
        if session is None:
            raise ValueError("Session not found.")
        session.finished_at = datetime.now(timezone.utc)
        await db.commit()
        return await loaders.load_session_type(db, id)
