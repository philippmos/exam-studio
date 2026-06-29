"""Build ORM objects from an exam JSON payload.

Expected document shape:

    {
      "exam": {
        "name": "...",
        "issuer": "...",
        "sections": [{"key": "...", "name": "..."}],
        "questions": [
          {
            "question": "...",
            "section_key": "...",
            "question_type": "single_choice" | "multiple_choice",
            "answers": [{"text": "...", "is_correct": true}, {"text": "..."}],
            "explanation": "..."
          },
          {
            "question": "...",
            "section_key": "...",
            "question_type": "allocation",
            "categories": [{"key": "...", "label": "..."}],
            "items": [{"text": "...", "correct_category": "<category key>"}]
          }
        ]
      }
    }

Choice questions carry an ``answers`` list (correct options flagged with
``is_correct``). Allocation questions instead carry ``categories`` (the baskets)
and ``items`` (each pointing at the ``correct_category`` it belongs to); the
items are stored as answer rows.

Every question may carry an optional ``explanation`` (a description of the
question/answer) that the UI reveals once the question has been answered.

The JSON carries no ids: sections are referenced by their ``key``. Fresh UUIDs
are generated for every row, so the same file can be imported more than once as
independent exams. The question numbers used in error messages refer to the
position in the file.

``merge_questions_into_exam`` additively imports the same document format into
an *existing* exam: it adds only the questions that are not already present and
never removes anything. Duplicates are detected by exact question text, and
sections are matched by ``name`` (the JSON ``key`` is not persisted), with any
referenced-but-missing module created on the fly.
"""

import html
import json
from dataclasses import dataclass

from app.enums import QuestionType
from app.models import Answer, Exam, Question, QuestionCategory, Section


class ImportError_(ValueError):
    """Raised when the uploaded payload is not a valid exam document."""


@dataclass
class ImportSummary:
    """Outcome of a merge import: how many questions were added vs. skipped."""

    added: int
    skipped: int


def _parse_question_type(raw_question: dict, number: int) -> QuestionType:
    raw_type = raw_question.get("question_type", "single_choice")
    try:
        return QuestionType(str(raw_type).upper())
    except ValueError:
        raise ImportError_(
            f"Question {number} has unknown question_type '{raw_type}' "
            "(expected 'single_choice', 'multiple_choice' or 'allocation')."
        ) from None


def _build_choice_answers(
    question: Question, raw_question: dict, number: int, question_type: QuestionType
) -> None:
    """Attach the answer options of a single/multiple-choice question."""
    raw_answers = raw_question.get("answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        raise ImportError_(f"Question {number} needs a non-empty 'answers' list.")

    correct_count = 0
    for position, raw_answer in enumerate(raw_answers):
        if not isinstance(raw_answer, dict) or not raw_answer.get("text"):
            raise ImportError_(
                f"Question {number}, answer {position + 1} is missing its 'text'."
            )
        is_correct = bool(raw_answer.get("is_correct", False))
        correct_count += int(is_correct)

        Answer(
            text=html.unescape(raw_answer["text"]),
            is_correct=is_correct,
            position=position,
            question=question,
        )

    if question_type is QuestionType.SINGLE_CHOICE and correct_count != 1:
        raise ImportError_(
            f"Question {number} is single choice and must have exactly one "
            f"correct answer, found {correct_count}."
        )
    if question_type is QuestionType.MULTIPLE_CHOICE and correct_count < 1:
        raise ImportError_(
            f"Question {number} is multiple choice and must have at least "
            "one correct answer."
        )


def _build_allocation(question: Question, raw_question: dict, number: int) -> None:
    """Attach the categories (baskets) and items of an allocation question."""
    raw_categories = raw_question.get("categories")
    if not isinstance(raw_categories, list) or not raw_categories:
        raise ImportError_(
            f"Question {number} is an allocation question and needs a non-empty "
            "'categories' list."
        )

    # Map the category key -> freshly created QuestionCategory instance.
    category_by_key: dict[str, QuestionCategory] = {}
    for position, raw_category in enumerate(raw_categories):
        key = raw_category.get("key") if isinstance(raw_category, dict) else None
        label = raw_category.get("label") if isinstance(raw_category, dict) else None
        if not key or not label:
            raise ImportError_(
                f"Question {number}, category {position + 1} needs both "
                "'key' and 'label'."
            )
        if key in category_by_key:
            raise ImportError_(
                f"Question {number} has a duplicate category key '{key}'."
            )
        category_by_key[key] = QuestionCategory(
            key=key,
            label=html.unescape(label),
            position=position,
            question=question,
        )

    raw_items = raw_question.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ImportError_(
            f"Question {number} is an allocation question and needs a non-empty "
            "'items' list."
        )
    for position, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict) or not raw_item.get("text"):
            raise ImportError_(
                f"Question {number}, item {position + 1} is missing its 'text'."
            )
        category = category_by_key.get(raw_item.get("correct_category"))
        if category is None:
            raise ImportError_(
                f"Question {number}, item {position + 1} references unknown "
                f"category '{raw_item.get('correct_category')}'."
            )

        Answer(
            text=html.unescape(raw_item["text"]),
            is_correct=False,
            position=position,
            question=question,
            correct_category=category,
        )


def build_exam_from_payload(payload: str) -> Exam:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ImportError_(f"Invalid JSON: {exc}") from exc

    exam_data = data.get("exam") if isinstance(data, dict) else None
    if not isinstance(exam_data, dict):
        raise ImportError_("Payload must contain an 'exam' object.")
    if not exam_data.get("name"):
        raise ImportError_("Exam is missing a 'name'.")

    exam = Exam(name=exam_data["name"], issuer=exam_data.get("issuer"))

    # Map the JSON section key -> freshly created Section instance.
    section_by_key: dict[str, Section] = {}
    for index, raw_section in enumerate(exam_data.get("sections", [])):
        if not raw_section.get("key") or not raw_section.get("name"):
            raise ImportError_(f"Section {index + 1} needs both 'key' and 'name'.")
        section = Section(name=raw_section["name"], position=index, exam=exam)
        section_by_key[raw_section["key"]] = section

    for number, raw_question in enumerate(exam_data.get("questions", []), start=1):
        section = section_by_key.get(raw_question.get("section_key"))
        if section is None:
            raise ImportError_(
                f"Question {number} references unknown "
                f"section '{raw_question.get('section_key')}'."
            )
        if not raw_question.get("question"):
            raise ImportError_(f"Question {number} is missing its 'question' text.")

        question_type = _parse_question_type(raw_question, number)
        question = Question(
            text=raw_question["question"],
            explanation=raw_question.get("explanation"),
            question_type=question_type.value,
            section=section,
        )

        if question_type is QuestionType.ALLOCATION:
            _build_allocation(question, raw_question, number)
        else:
            _build_choice_answers(question, raw_question, number, question_type)

    return exam


def merge_questions_into_exam(exam: Exam, payload: str) -> ImportSummary:
    """Additively import a document's questions into an existing exam.

    The payload is parsed and fully validated by :func:`build_exam_from_payload`
    (same rules as a fresh import); the resulting graph is transient and only the
    new questions are grafted onto ``exam``. A question is "new" when its text is
    not already present in the exam (exact match); existing ones are skipped and
    nothing is ever removed. Incoming sections are matched to the exam's modules
    by ``name``, and a referenced module that does not exist yet is created.

    ``exam`` must be loaded with its ``sections`` and each section's
    ``questions`` so the existing texts can be read. Returns the add/skip counts;
    the caller is responsible for committing.
    """
    incoming = build_exam_from_payload(payload)

    existing_texts = {
        question.text for section in exam.sections for question in section.questions
    }
    section_by_name = {section.name: section for section in exam.sections}
    next_position = max((section.position for section in exam.sections), default=-1) + 1

    added = 0
    skipped = 0
    for incoming_section in incoming.sections:
        target = section_by_name.get(incoming_section.name)
        for incoming_question in list(incoming_section.questions):
            if incoming_question.text in existing_texts:
                skipped += 1
                continue
            if target is None:
                target = Section(
                    name=incoming_section.name, position=next_position, exam=exam
                )
                section_by_name[incoming_section.name] = target
                next_position += 1
            # Reassigning the relationship moves the question (with its answers
            # and categories, which hang off the question) into the persistent
            # exam graph; the transient incoming exam/sections are left behind.
            incoming_question.section = target
            existing_texts.add(incoming_question.text)
            added += 1

    return ImportSummary(added=added, skipped=skipped)
