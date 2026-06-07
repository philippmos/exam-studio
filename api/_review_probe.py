import asyncio
import json
import uuid

# Force SQLite async engine BEFORE importing app modules.
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

# config reads env at import; but Settings default is postgres. Patch database module engine.
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
import app.database as database

engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
database.engine = engine
database.SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

from app.database import Base
from app import models
from app.graphql import loaders
from app.graphql.types import to_session, to_session_item
from app.graphql.mutations import _select_question_ids, Mutation
from app.enums import SessionMode


PAYLOAD = json.dumps({
    "exam": {
        "id": "E1",
        "name": "Test Exam",
        "issuer": "Org",
        "sections": [
            {"id": "S1", "name": "Sec One"},
            {"id": "S2", "name": "Sec Two"},
        ],
        "questions": [
            {"id": "Q1", "number": 1, "question": "q1?",
             "answers": {"A1": "a", "A2": "b", "A3": "c"},
             "correct_answer": "A2", "section_id": "S1"},
            {"id": "Q2", "number": 2, "question": "q2?",
             "answers": {"B1": "x", "B2": "y"},
             "correct_answer": "B2", "section_id": "S2"},
        ],
    }
})


class FakeInfo:
    def __init__(self, db):
        self.context = {"db": db}


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    mut = Mutation()
    findings = []

    async with database.SessionLocal() as db:
        info = FakeInfo(db)
        # ---- import_exam ----
        exam_type = await mut.import_exam(info, payload=PAYLOAD)
        print("IMPORT ok:", exam_type.name, "qcount=", exam_type.question_count,
              "sections=", [(s.name, s.question_count) for s in exam_type.sections])
        exam_id = exam_type.id

        # verify is_correct mapping
        rows = (await db.scalars(__import__("sqlalchemy").select(models.Answer))).all()
        correct = [(r.text, r.is_correct) for r in rows]
        print("ANSWERS is_correct:", correct)
        ncorrect = sum(1 for r in rows if r.is_correct)
        print("num correct flags:", ncorrect, "(expected 2)")

        # ---- start_session ALL_RANDOM ----
        s_all = await mut.start_session(info, exam_id=exam_id, mode=SessionMode.ALL_RANDOM)
        print("START ALL_RANDOM total:", s_all.total, "items:", len(s_all.items),
              "mode:", s_all.mode)

        # ---- start_session BY_SECTION ----
        sec1_id = exam_type.sections[0].id
        s_sec = await mut.start_session(info, exam_id=exam_id, mode=SessionMode.BY_SECTION,
                                        section_id=sec1_id)
        print("START BY_SECTION total:", s_sec.total, "section_id:", s_sec.section_id)

        # ---- submit_answer on first item of ALL_RANDOM session ----
        first_item_id = s_all.items[0].id
        # find that item's question answers
        item_obj = await db.get(models.SessionItem, first_item_id)
        ans = (await db.scalars(
            __import__("sqlalchemy").select(models.Answer).where(
                models.Answer.question_id == item_obj.question_id))).all()
        wrong = next(a for a in ans if not a.is_correct)
        res_wrong = await mut.submit_answer(info, session_item_id=first_item_id,
                                            selected_answer_id=wrong.id)
        print("SUBMIT wrong -> is_correct:", res_wrong.is_correct,
              "correct_answer_id matches flagged:",
              res_wrong.correct_answer_id == next(a.id for a in ans if a.is_correct))

        right = next(a for a in ans if a.is_correct)
        res_right = await mut.submit_answer(info, session_item_id=first_item_id,
                                            selected_answer_id=right.id)
        print("SUBMIT right -> is_correct:", res_right.is_correct)

        # ---- query session back (lazy-load hazard for to_session_item.question.answers) ----
        s_back = await loaders.load_session_type(db, s_all.id)
        print("RELOAD session answered:", s_back.answered, "correct:", s_back.correct,
              "total:", s_back.total)
        # check correct_answer_id surfaced after answering
        ans_item = next(i for i in s_back.items if i.id == first_item_id)
        print("  answered item correct_answer_id:", ans_item.correct_answer_id,
              "is_correct:", ans_item.is_correct)
        unans_item = next((i for i in s_back.items if i.id != first_item_id), None)
        if unans_item:
            print("  unanswered item correct_answer_id (should be None):",
                  unans_item.correct_answer_id)
        # access question.answers via type
        print("  item question answers count:", len(ans_item.question.answers))

        # ---- UNANSWERED mode ----
        # Q1 was answered correctly in s_all (right). So UNANSWERED should now exclude it.
        unanswered_ids = await _select_question_ids(db, exam_id, SessionMode.UNANSWERED, None)
        print("UNANSWERED count after answering Q1 correctly:", len(unanswered_ids),
              "(expected 1)")

        # ---- finish_session ----
        s_fin = await mut.finish_session(info, id=s_all.id)
        print("FINISH finished_at set:", s_fin.finished_at is not None)

    print("DONE")


asyncio.run(main())
