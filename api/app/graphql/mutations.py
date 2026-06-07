from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

import strawberry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.types import Info

from app import models
from app.enums import SessionMode
from app.graphql import loaders
from app.graphql.types import (
    AnswerResult,
    ExamSessionType,
    ExamType,
    SessionModeEnum,
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

    ids = list((await db.scalars(base)).all())
    random.shuffle(ids)
    return ids


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def import_exam(self, info: Info, payload: str) -> ExamType:
        """Import an exam from the JSON produced in the `ceh_questions.json` format."""
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

        question_ids = await _select_question_ids(db, exam_id, mode, section_id)

        session = models.ExamSession(
            exam_id=exam_id,
            mode=mode.value,
            section_id=section_id if mode is SessionMode.BY_SECTION else None,
        )
        session.items = [
            models.SessionItem(question_id=qid, position=position)
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
        selected_answer_id: uuid.UUID,
    ) -> AnswerResult:
        """Persist the chosen answer for a question and report correctness."""
        db: AsyncSession = info.context["db"]

        item = await db.get(models.SessionItem, session_item_id)
        if item is None:
            raise ValueError("Session item not found.")

        answers = list(
            (
                await db.scalars(
                    select(models.Answer).where(
                        models.Answer.question_id == item.question_id
                    )
                )
            ).all()
        )
        answers_by_id = {a.id: a for a in answers}
        if selected_answer_id not in answers_by_id:
            raise ValueError("Selected answer does not belong to this question.")

        correct_answer = next((a for a in answers if a.is_correct), None)
        if correct_answer is None:
            raise ValueError("This question has no correct answer configured.")

        item.selected_answer_id = selected_answer_id
        item.is_correct = selected_answer_id == correct_answer.id
        item.answered_at = datetime.now(timezone.utc)
        await db.commit()

        return AnswerResult(
            session_item_id=item.id,
            is_correct=bool(item.is_correct),
            correct_answer_id=correct_answer.id,
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
