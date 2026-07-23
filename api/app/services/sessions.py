"""Exam-session use cases: start, submit an answer, finish, delete and read.

Answer grading is delegated to the pure ``app.domain.grading`` rules; this layer
adapts ORM rows to those rules, persists the selection, advances the spaced-
repetition schedule and owns the transaction.
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.core.errors import NotFoundError, ValidationError
from app.domain import grading
from app.domain.enums import QuestionType, SessionMode
from app.repositories import exams as exams_repo
from app.repositories import sessions as sessions_repo
from app.services import review as review_service
from app.storage.blob import MediaStorage, get_media_storage
from app.storage.resolver import replace_media_placeholders


@dataclass
class AnswerOutcome:
    """The graded result of submitting an answer, for the UI feedback."""

    session_item_id: uuid.UUID
    is_correct: bool
    review_box: int
    review_interval_days: int
    correct_answer_ids: list[uuid.UUID] = field(default_factory=list)
    # (answer id, correct category id) pairs for allocation questions.
    correct_allocations: list[tuple[uuid.UUID, uuid.UUID]] = field(default_factory=list)
    # (answer id, 0-based slot) pairs for select-and-place questions.
    correct_placements: list[tuple[uuid.UUID, int]] = field(default_factory=list)
    # (answer id, correct verdict) pairs for yes/no questions.
    correct_verdicts: list[tuple[uuid.UUID, bool]] = field(default_factory=list)


def _shuffle_answer_order(question: models.Question) -> list[str]:
    answer_ids = [str(answer.id) for answer in question.answers]
    random.shuffle(answer_ids)
    return answer_ids


async def _resolve_media(session: models.ExamSession) -> None:
    """Swap each question's ``media://`` placeholders for short-lived signed URLs.

    Mutates the loaded question text/explanation in place for serving only; the
    read path never commits, so nothing is persisted. Questions without media
    (the common case) never touch storage.
    """
    storage: MediaStorage | None = None
    for item in session.items:
        question = item.question
        if not question.media:
            continue
        if storage is None:
            storage = get_media_storage()
        url_by_id = {
            str(media.id): await storage.signed_url(media.blob_path)
            for media in question.media
        }
        resolved_text = replace_media_placeholders(question.text, url_by_id)
        if resolved_text is not None:
            question.text = resolved_text
        question.explanation = replace_media_placeholders(
            question.explanation, url_by_id
        )


async def get_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> models.ExamSession | None:
    """A running (or finished) session with its ordered questions, or ``None``."""
    session = await sessions_repo.load_with_items(db, user_id, session_id)
    if session is not None:
        await _resolve_media(session)
    return session


async def list_overviews(
    db: AsyncSession, user_id: uuid.UUID, exam_id: uuid.UUID | None = None
) -> list[sessions_repo.OverviewRow]:
    """All the user's sessions (optionally one exam's) with answer progress."""
    return await sessions_repo.overview_rows(db, user_id, exam_id)


async def start_session(
    db: AsyncSession,
    user: models.User,
    exam_id: uuid.UUID,
    mode: SessionMode,
    section_id: uuid.UUID | None = None,
) -> models.ExamSession:
    """Start a run, snapshotting the selected questions in shuffled order."""
    exam = await exams_repo.get_owned(db, user.id, exam_id)
    if exam is None:
        raise NotFoundError("Exam not found.")
    if exam.archived:
        raise ValidationError("Cannot start a session for an archived exam.")
    if mode is SessionMode.BY_SECTION and section_id is None:
        raise ValidationError("A sectionId is required for BY_SECTION mode.")

    now = datetime.now(UTC)
    question_ids = await sessions_repo.question_ids_for_mode(
        db, exam_id, mode, section_id, now
    )
    random.shuffle(question_ids)
    questions = await sessions_repo.load_questions_with_answers(db, question_ids)
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

    result = await sessions_repo.load_with_items(db, user.id, session.id)
    assert result is not None  # just created and owned by this user
    await _resolve_media(result)
    return result


async def submit_answer(
    db: AsyncSession,
    user: models.User,
    session_item_id: uuid.UUID,
    selected_answer_ids: list[uuid.UUID] | None,
    placements: list[tuple[uuid.UUID, uuid.UUID]] | None,
    placed_answer_ids: list[uuid.UUID] | None,
    verdicts: list[tuple[uuid.UUID, bool]] | None,
    tz_offset_minutes: int,
) -> AnswerOutcome:
    """Persist the answer for a question and report correctness.

    Choice questions pass ``selected_answer_ids``; allocation questions pass
    ``placements`` (answer id, category id); select-and-place questions pass
    ``placed_answer_ids`` (the answer ids in the order they were placed); yes/no
    questions pass ``verdicts`` (answer id, Yes/No value per statement);
    selectbox questions pass ``selected_answer_ids`` (the chosen option of every
    selectbox). Every answer also advances the question's spaced-repetition
    schedule.
    """
    item = await sessions_repo.get_item_with_selection(db, session_item_id)
    if item is None:
        raise NotFoundError("Session item not found.")
    # Authorize: the item's session must belong to the current user.
    if await sessions_repo.get_owned(db, user.id, item.session_id) is None:
        raise NotFoundError("Session item not found.")

    question = await sessions_repo.get_question(db, item.question_id)
    assert question is not None  # a session item always has its question
    answers = await sessions_repo.answers_for_question(db, item.question_id)

    correct_answer_ids: list[uuid.UUID] = []
    correct_allocations: list[tuple[uuid.UUID, uuid.UUID]] = []
    correct_placements: list[tuple[uuid.UUID, int]] = []
    correct_verdicts: list[tuple[uuid.UUID, bool]] = []
    if question.question_type == QuestionType.ALLOCATION.value:
        categories = await sessions_repo.categories_for_question(db, item.question_id)
        allocation = grading.grade_allocation(
            {answer.id: answer.correct_category_id for answer in answers},
            {category.id for category in categories},
            placements or [],
        )
        selection = [
            models.SessionItemAnswer(answer_id=aid, category_id=cid)
            for aid, cid in allocation.chosen.items()
        ]
        is_correct = allocation.is_correct
        correct_allocations = allocation.correct_allocations
    elif question.question_type == QuestionType.SELECT_AND_PLACE.value:
        # Sort (rank, answer id) tuples so the ids come out in solution order.
        ordered_ids = [
            answer_id
            for _, answer_id in sorted(
                (answer.correct_position, answer.id)
                for answer in answers
                if answer.correct_position is not None
            )
        ]
        placement = grading.grade_select_and_place(
            ordered_ids,
            {answer.id for answer in answers},
            placed_answer_ids or [],
        )
        selection = [
            models.SessionItemAnswer(answer_id=aid, position=slot)
            for aid, slot in placement.chosen.items()
        ]
        is_correct = placement.is_correct
        correct_placements = placement.correct_placements
    elif question.question_type == QuestionType.YES_NO.value:
        verdict_grade = grading.grade_yes_no(
            {
                answer.id: answer.correct_verdict
                for answer in answers
                if answer.correct_verdict is not None
            },
            verdicts or [],
        )
        selection = [
            models.SessionItemAnswer(answer_id=aid, verdict=value)
            for aid, value in verdict_grade.chosen.items()
        ]
        is_correct = verdict_grade.is_correct
        correct_verdicts = verdict_grade.correct_verdicts
    elif question.question_type == QuestionType.SELECTBOX.value:
        selectbox = grading.grade_selectbox(
            {a.id: a.selectbox_id for a in answers if a.selectbox_id is not None},
            {
                a.selectbox_id: a.id
                for a in answers
                if a.is_correct and a.selectbox_id is not None
            },
            selected_answer_ids,
        )
        selection = [
            models.SessionItemAnswer(answer_id=aid)
            for aid in selectbox.selected_answer_ids
        ]
        is_correct = selectbox.is_correct
        correct_answer_ids = selectbox.correct_answer_ids
    else:
        choice = grading.grade_choice(
            QuestionType(question.question_type),
            {answer.id for answer in answers},
            {answer.id for answer in answers if answer.is_correct},
            selected_answer_ids,
        )
        selection = [
            models.SessionItemAnswer(answer_id=aid)
            for aid in choice.selected_answer_ids
        ]
        is_correct = choice.is_correct
        correct_answer_ids = choice.correct_answer_ids

    # Clear the previous selection and flush the deletes before inserting the new
    # rows: re-answering reuses the same (item, answer) pairs, which would
    # otherwise trip the session_item_answers uniqueness constraint.
    item.selected_answers = []
    await db.flush()
    item.selected_answers = selection
    item.is_correct = is_correct
    item.answered_at = datetime.now(UTC)
    outcome = await review_service.record_answer(
        db, item.question_id, is_correct, tz_offset_minutes
    )
    await db.commit()

    return AnswerOutcome(
        session_item_id=item.id,
        is_correct=is_correct,
        review_box=outcome.box,
        review_interval_days=outcome.interval_days,
        correct_answer_ids=correct_answer_ids,
        correct_allocations=correct_allocations,
        correct_placements=correct_placements,
        correct_verdicts=correct_verdicts,
    )


async def finish_session(
    db: AsyncSession, user: models.User, session_id: uuid.UUID
) -> models.ExamSession:
    session = await sessions_repo.get_owned(db, user.id, session_id)
    if session is None:
        raise NotFoundError("Session not found.")
    session.finished_at = datetime.now(UTC)
    await db.commit()
    result = await sessions_repo.load_with_items(db, user.id, session_id)
    assert result is not None
    await _resolve_media(result)
    return result


async def delete_session(
    db: AsyncSession, user: models.User, session_id: uuid.UUID
) -> bool:
    session = await sessions_repo.get_owned(db, user.id, session_id)
    if session is None:
        return False
    await db.delete(session)
    await db.commit()
    return True
