"""GraphQL types and converters from ORM models.

The types are plain data containers (no per-field DB access). Query/mutation
resolvers eager-load the relationships they need and then call the ``to_*``
converters, which keeps the data flow explicit and easy to follow.

Note: ``AnswerType`` deliberately does NOT expose ``is_correct`` so the client
cannot reveal the solution while a session is running. Correctness is only
returned by the ``submit_answer`` mutation.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

import strawberry

from app import models
from app.enums import QuestionType as QuestionTypeValue
from app.enums import SessionMode

SessionModeEnum = strawberry.enum(SessionMode)
# The GraphQL object type below is already called "QuestionType", so the enum
# gets a distinct schema name.
QuestionTypeEnum = strawberry.enum(QuestionTypeValue, name="QuestionKind")


@strawberry.type
class AnswerType:
    id: uuid.UUID
    text: str
    position: int


@strawberry.type
class QuestionType:
    id: uuid.UUID
    text: str
    section_id: uuid.UUID
    question_type: QuestionTypeEnum
    answers: list[AnswerType]


@strawberry.type
class SectionType:
    id: uuid.UUID
    name: str
    position: int
    question_count: int


@strawberry.type
class ExamType:
    id: uuid.UUID
    name: str
    issuer: str | None
    created_at: datetime
    question_count: int
    sections: list[SectionType]


@strawberry.type
class SessionItemType:
    id: uuid.UUID
    position: int
    question: QuestionType
    selected_answer_ids: list[uuid.UUID]
    # Only revealed once the question has been answered, so the solution can be
    # shown when reviewing/resuming without leaking it beforehand.
    correct_answer_ids: list[uuid.UUID] | None
    is_correct: bool | None
    answered_at: datetime | None


@strawberry.type
class ExamSessionType:
    id: uuid.UUID
    exam_id: uuid.UUID
    mode: SessionModeEnum
    section_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None
    total: int
    answered: int
    correct: int
    items: list[SessionItemType]


@strawberry.type
class SessionOverviewType:
    """Lightweight session row for the sessions overview (no items)."""

    id: uuid.UUID
    exam_id: uuid.UUID
    exam_name: str
    mode: SessionModeEnum
    section_id: uuid.UUID | None
    section_name: str | None
    created_at: datetime
    finished_at: datetime | None
    total: int
    answered: int
    correct: int


@strawberry.type
class AnswerResult:
    """Returned after a question is answered so the UI can show feedback."""

    session_item_id: uuid.UUID
    is_correct: bool
    correct_answer_ids: list[uuid.UUID]


@strawberry.type
class SectionStats:
    """Per-module learning progress."""

    section_id: uuid.UUID
    name: str
    total_questions: int
    attempted_questions: int  # answered at least once
    mastered_questions: int  # answered correctly at least once
    struggling_questions: int  # attempted but never correct
    correct_attempts: int
    incorrect_attempts: int
    accuracy: float  # correct_attempts / total attempts
    mastery: float  # mastered_questions / total_questions


@strawberry.type
class StudyDayStats:
    """Questions answered on one calendar day (study-history chart data)."""

    day: date
    total: int
    correct: int
    incorrect: int


@strawberry.type
class ExamStats:
    """Aggregated learning progress for a whole exam (dashboard data)."""

    exam_id: uuid.UUID
    exam_name: str
    total_questions: int
    attempted_questions: int
    mastered_questions: int
    struggling_questions: int
    unattempted_questions: int
    total_attempts: int
    correct_attempts: int
    incorrect_attempts: int
    accuracy: float
    coverage: float  # attempted_questions / total_questions
    mastery: float  # mastered_questions / total_questions
    sessions_count: int
    last_activity: datetime | None
    sections: list[SectionStats]


# --------------------------------------------------------------------------- #
# Converters: ORM -> GraphQL types (relationships must be loaded beforehand)   #
# --------------------------------------------------------------------------- #


def to_answer(answer: models.Answer) -> AnswerType:
    return AnswerType(id=answer.id, text=answer.text, position=answer.position)


def to_question(question: models.Question) -> QuestionType:
    return QuestionType(
        id=question.id,
        text=question.text,
        section_id=question.section_id,
        question_type=QuestionTypeValue(question.question_type),
        answers=[to_answer(a) for a in question.answers],
    )


def to_section(section: models.Section, question_count: int) -> SectionType:
    return SectionType(
        id=section.id,
        name=section.name,
        position=section.position,
        question_count=question_count,
    )


def to_exam(exam: models.Exam, counts_by_section: dict[uuid.UUID, int]) -> ExamType:
    sections = [to_section(s, counts_by_section.get(s.id, 0)) for s in exam.sections]
    return ExamType(
        id=exam.id,
        name=exam.name,
        issuer=exam.issuer,
        created_at=exam.created_at,
        question_count=sum(counts_by_section.get(s.id, 0) for s in exam.sections),
        sections=sections,
    )


def to_session_item(item: models.SessionItem) -> SessionItemType:
    answered = item.answered_at is not None
    correct_answer_ids = None
    if answered:
        correct_answer_ids = [a.id for a in item.question.answers if a.is_correct]
    return SessionItemType(
        id=item.id,
        position=item.position,
        question=to_question(item.question),
        selected_answer_ids=[sa.answer_id for sa in item.selected_answers],
        correct_answer_ids=correct_answer_ids,
        is_correct=item.is_correct,
        answered_at=item.answered_at,
    )


def to_session_overview(
    session: models.ExamSession,
    exam_name: str,
    section_name: str | None,
    total: int,
    answered: int,
    correct: int,
) -> SessionOverviewType:
    return SessionOverviewType(
        id=session.id,
        exam_id=session.exam_id,
        exam_name=exam_name,
        mode=SessionMode(session.mode),
        section_id=session.section_id,
        section_name=section_name,
        created_at=session.created_at,
        finished_at=session.finished_at,
        total=total,
        answered=answered,
        correct=correct,
    )


def to_session(session: models.ExamSession) -> ExamSessionType:
    items = list(session.items)
    answered = sum(1 for i in items if i.answered_at is not None)
    correct = sum(1 for i in items if i.is_correct)
    return ExamSessionType(
        id=session.id,
        exam_id=session.exam_id,
        mode=SessionMode(session.mode),
        section_id=session.section_id,
        created_at=session.created_at,
        finished_at=session.finished_at,
        total=len(items),
        answered=answered,
        correct=correct,
        items=[to_session_item(i) for i in items],
    )
