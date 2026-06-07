"""Build ORM objects from an exam JSON payload (the `ceh_questions.json` format).

Fresh UUIDs are generated for every row, so the same file can be imported more
than once as independent exams. The JSON answer ids are only used locally to
resolve which answer is the correct one.
"""

import json

from app.models import Answer, Exam, Question, Section


class ImportError_(ValueError):
    """Raised when the uploaded payload is not a valid exam document."""


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

    # Map the JSON section id -> freshly created Section instance.
    section_by_json_id: dict[str, Section] = {}
    for index, raw_section in enumerate(exam_data.get("sections", [])):
        section = Section(name=raw_section["name"], position=index, exam=exam)
        section_by_json_id[raw_section["id"]] = section

    for raw_question in exam_data.get("questions", []):
        section = section_by_json_id.get(raw_question["section_id"])
        if section is None:
            raise ImportError_(
                f"Question {raw_question.get('number')} references unknown "
                f"section '{raw_question['section_id']}'."
            )

        question = Question(
            number=raw_question["number"],
            text=raw_question["question"],
            section=section,
        )

        correct_id = raw_question.get("correct_answer")
        correct_count = 0
        for position, (answer_id, answer_text) in enumerate(
            raw_question.get("answers", {}).items()
        ):
            is_correct = answer_id == correct_id
            correct_count += int(is_correct)
            Answer(
                text=answer_text,
                is_correct=is_correct,
                position=position,
                question=question,
            )

        if correct_count != 1:
            raise ImportError_(
                f"Question {raw_question.get('number')} must have exactly one "
                f"correct answer, found {correct_count}."
            )

    return exam
