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
from datetime import datetime

import strawberry

from app import models
from app.enums import SessionMode

SessionModeEnum = strawberry.enum(SessionMode)


@strawberry.type
class AnswerType:
    id: uuid.UUID
    text: str
    position: int


@strawberry.type
class QuestionType:
    id: uuid.UUID
    number: int
    text: str
    section_id: uuid.UUID
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
    selected_answer_id: uuid.UUID | None
    # Only revealed once the question has been answered, so the solution can be
    # shown when reviewing/resuming without leaking it beforehand.
    correct_answer_id: uuid.UUID | None
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
class AnswerResult:
    """Returned after a question is answered so the UI can show feedback."""

    session_item_id: uuid.UUID
    is_correct: bool
    correct_answer_id: uuid.UUID


# --------------------------------------------------------------------------- #
# Converters: ORM -> GraphQL types (relationships must be loaded beforehand)   #
# --------------------------------------------------------------------------- #


def to_answer(answer: models.Answer) -> AnswerType:
    return AnswerType(id=answer.id, text=answer.text, position=answer.position)


def to_question(question: models.Question) -> QuestionType:
    return QuestionType(
        id=question.id,
        number=question.number,
        text=question.text,
        section_id=question.section_id,
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
    answered = item.selected_answer_id is not None
    correct_answer_id = None
    if answered:
        correct_answer_id = next(
            (a.id for a in item.question.answers if a.is_correct), None
        )
    return SessionItemType(
        id=item.id,
        position=item.position,
        question=to_question(item.question),
        selected_answer_id=item.selected_answer_id,
        correct_answer_id=correct_answer_id,
        is_correct=item.is_correct,
        answered_at=item.answered_at,
    )


def to_session(session: models.ExamSession) -> ExamSessionType:
    items = list(session.items)
    answered = sum(1 for i in items if i.selected_answer_id is not None)
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
