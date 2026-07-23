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
            "items": [
              {"text": "...", "correct_category": "<category key>"},
              {"text": "... (a distractor, belongs in no category)"}
            ]
          },
          {
            "question": "...",
            "section_key": "...",
            "question_type": "select_and_place",
            "answers": [
              {"text": "...", "correct_position": 1},
              {"text": "... (a distractor, never placed)"}
            ]
          },
          {
            "question": "...",
            "section_key": "...",
            "question_type": "yes_no",
            "answers": [
              {"text": "...", "answer": "yes"},
              {"text": "...", "answer": "no"}
            ]
          },
          {
            "question": "...",
            "section_key": "...",
            "question_type": "selectbox",
            "selectboxes": [
              {
                "key": "...",
                "label": "...",
                "options": [
                  {"text": "...", "is_correct": true},
                  {"text": "..."}
                ]
              }
            ]
          }
        ]
      }
    }

Choice questions carry an ``answers`` list (correct options flagged with
``is_correct``). Allocation questions instead carry ``categories`` (the baskets)
and ``items``; an item names the ``correct_category`` it belongs to, while an
item that omits ``correct_category`` is a distractor that belongs in no basket
(at least one item must name a category). The items are stored as answer rows.
Select-and-place questions also carry an ``answers`` list (the option pool); the
options that make up the answer flag their rank with ``correct_position``
(1-based, contiguous from 1), and the remaining options are distractors that are
never placed. Yes/No questions carry
an ``answers`` list of statements; each flags its expected answer with
``answer`` ("yes" or "no") and the question is correct only when every verdict
matches. Selectbox questions carry a ``selectboxes`` list; each selectbox
(stored as a category with ``key`` + ``label``) holds a non-empty ``options``
list, exactly one of which is flagged ``is_correct``, and the question is
correct only when every selectbox's chosen option is its correct one.

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

import hashlib
import html
import io
import json
import re
import uuid
import zipfile
from collections.abc import Callable
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.domain.enums import QuestionType
from app.models import (
    Answer,
    Exam,
    Question,
    QuestionCategory,
    QuestionMedia,
    Section,
)
from app.storage.blob import MediaUpload


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
            "(expected 'single_choice', 'multiple_choice', 'allocation', "
            "'select_and_place', 'yes_no' or 'selectbox')."
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
    real_count = 0  # items that name a category (the rest are distractors)
    for position, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict) or not raw_item.get("text"):
            raise ImportError_(
                f"Question {number}, item {position + 1} is missing its 'text'."
            )
        raw_category = raw_item.get("correct_category")
        category: QuestionCategory | None = None
        if raw_category is not None:
            category = (
                category_by_key.get(raw_category)
                if isinstance(raw_category, str)
                else None
            )
            if category is None:
                raise ImportError_(
                    f"Question {number}, item {position + 1} references unknown "
                    f"category '{raw_item.get('correct_category')}'."
                )
            real_count += 1

        Answer(
            text=html.unescape(raw_item["text"]),
            is_correct=False,
            position=position,
            question=question,
            correct_category=category,
        )

    if real_count == 0:
        raise ImportError_(
            f"Question {number} is an allocation question and needs at least one "
            "item with a 'correct_category' (items that omit it are distractors "
            "that belong in no category)."
        )


def _build_select_and_place(
    question: Question, raw_question: dict, number: int
) -> None:
    """Attach the option pool of a select-and-place question.

    Every option is stored as an answer row; the options that make up the
    answer carry a 1-based ``correct_position`` (contiguous from 1), the rest
    are distractors. The pool is shuffled per session at run time.
    """
    raw_answers = raw_question.get("answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        raise ImportError_(
            f"Question {number} is a select-and-place question and needs a "
            "non-empty 'answers' list."
        )

    positions: list[int] = []
    for index, raw_answer in enumerate(raw_answers):
        if not isinstance(raw_answer, dict) or not raw_answer.get("text"):
            raise ImportError_(
                f"Question {number}, answer {index + 1} is missing its 'text'."
            )
        raw_position = raw_answer.get("correct_position")
        correct_position: int | None = None
        if raw_position is not None:
            if not isinstance(raw_position, int) or isinstance(raw_position, bool):
                raise ImportError_(
                    f"Question {number}, answer {index + 1} has a non-integer "
                    "'correct_position'."
                )
            correct_position = raw_position
            positions.append(raw_position)

        Answer(
            text=html.unescape(raw_answer["text"]),
            is_correct=False,
            position=index,
            question=question,
            correct_position=correct_position,
        )

    if not positions:
        raise ImportError_(
            f"Question {number} is a select-and-place question and needs at "
            "least one answer with a 'correct_position'."
        )
    if sorted(positions) != list(range(1, len(positions) + 1)):
        raise ImportError_(
            f"Question {number} must number its placed answers 1..N with "
            f"'correct_position' (no gaps or duplicates), found {sorted(positions)}."
        )


def _build_yes_no(question: Question, raw_question: dict, number: int) -> None:
    """Attach the statements of a yes/no question.

    Every statement is stored as an answer row carrying its expected verdict in
    ``correct_verdict`` (``True`` = "Yes", ``False`` = "No"), read from the
    statement's ``answer`` field ("yes"/"no"). The user answers each statement
    with yes or no; the question is correct only when every verdict matches.
    """
    raw_answers = raw_question.get("answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        raise ImportError_(
            f"Question {number} is a yes/no question and needs a non-empty "
            "'answers' list."
        )

    for index, raw_answer in enumerate(raw_answers):
        if not isinstance(raw_answer, dict) or not raw_answer.get("text"):
            raise ImportError_(
                f"Question {number}, answer {index + 1} is missing its 'text'."
            )
        raw_value = raw_answer.get("answer")
        if not isinstance(raw_value, str) or raw_value.strip().lower() not in (
            "yes",
            "no",
        ):
            raise ImportError_(
                f"Question {number}, answer {index + 1} needs an 'answer' of "
                "'yes' or 'no'."
            )

        Answer(
            text=html.unescape(raw_answer["text"]),
            is_correct=False,
            position=index,
            question=question,
            correct_verdict=raw_value.strip().lower() == "yes",
        )


def _build_selectbox(question: Question, raw_question: dict, number: int) -> None:
    """Attach the selectboxes and their options of a selectbox question.

    Each selectbox becomes a ``QuestionCategory`` (``key`` + ``label``); every
    option is stored as an answer row grouped under its selectbox (``selectbox``),
    and exactly one option per selectbox is flagged ``is_correct``. Options are
    numbered with a single ``position`` counter running across all selectboxes.
    """
    raw_selectboxes = raw_question.get("selectboxes")
    if not isinstance(raw_selectboxes, list) or not raw_selectboxes:
        raise ImportError_(
            f"Question {number} is a selectbox question and needs a non-empty "
            "'selectboxes' list."
        )

    seen_keys: set[str] = set()
    position = 0  # option position, running across every selectbox
    for box_index, raw_box in enumerate(raw_selectboxes):
        key = raw_box.get("key") if isinstance(raw_box, dict) else None
        label = raw_box.get("label") if isinstance(raw_box, dict) else None
        if not key or not label:
            raise ImportError_(
                f"Question {number}, selectbox {box_index + 1} needs both "
                "'key' and 'label'."
            )
        if key in seen_keys:
            raise ImportError_(
                f"Question {number} has a duplicate selectbox key '{key}'."
            )
        seen_keys.add(key)
        selectbox = QuestionCategory(
            key=key,
            label=html.unescape(label),
            position=box_index,
            question=question,
        )

        raw_options = raw_box.get("options")
        if not isinstance(raw_options, list) or not raw_options:
            raise ImportError_(
                f"Question {number}, selectbox '{key}' needs a non-empty "
                "'options' list."
            )
        correct_count = 0
        for raw_option in raw_options:
            if not isinstance(raw_option, dict) or not raw_option.get("text"):
                raise ImportError_(
                    f"Question {number}, selectbox '{key}' has an option missing "
                    "its 'text'."
                )
            is_correct = bool(raw_option.get("is_correct", False))
            correct_count += int(is_correct)
            Answer(
                text=html.unescape(raw_option["text"]),
                is_correct=is_correct,
                position=position,
                question=question,
                selectbox=selectbox,
            )
            position += 1

        if correct_count != 1:
            raise ImportError_(
                f"Question {number}, selectbox '{key}' must have exactly one "
                f"correct option, found {correct_count}."
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
        section_key = raw_question.get("section_key")
        matched_section = (
            section_by_key.get(section_key) if isinstance(section_key, str) else None
        )
        if matched_section is None:
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
            section=matched_section,
        )

        if question_type is QuestionType.ALLOCATION:
            _build_allocation(question, raw_question, number)
        elif question_type is QuestionType.SELECT_AND_PLACE:
            _build_select_and_place(question, raw_question, number)
        elif question_type is QuestionType.YES_NO:
            _build_yes_no(question, raw_question, number)
        elif question_type is QuestionType.SELECTBOX:
            _build_selectbox(question, raw_question, number)
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
    summary, _grafted = _graft_new_questions(exam, incoming)
    return summary


def _graft_new_questions(
    exam: Exam,
    incoming: Exam,
    dedup_key: Callable[[Question], str] | None = None,
) -> tuple[ImportSummary, list[Question]]:
    """Move the not-yet-present questions of ``incoming`` onto ``exam``.

    A question is "new" when its ``dedup_key`` is not already in the exam
    (default: the exact question text). Incoming sections are matched to the
    exam's modules by ``name``; a referenced module that does not exist yet is
    created. Returns the add/skip summary and the list of questions actually
    grafted (so the caller can, e.g., attach their media).
    """
    key_of = dedup_key or (lambda question: question.text)
    existing_keys = {
        key_of(question) for section in exam.sections for question in section.questions
    }
    section_by_name = {section.name: section for section in exam.sections}
    next_position = max((section.position for section in exam.sections), default=-1) + 1

    grafted: list[Question] = []
    skipped = 0
    for incoming_section in incoming.sections:
        target = section_by_name.get(incoming_section.name)
        for incoming_question in list(incoming_section.questions):
            key = key_of(incoming_question)
            if key in existing_keys:
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
            existing_keys.add(key)
            grafted.append(incoming_question)

    return ImportSummary(added=len(grafted), skipped=skipped), grafted


# --------------------------------------------------------------------------- #
# ZIP import (question images)                                                 #
# --------------------------------------------------------------------------- #
#
# A ZIP import bundles the JSON manifest with the images it references:
#
#     exam.zip
#     ├── exam.json          # the same document as a plain JSON import
#     └── images/            # image files referenced from question HTML
#         ├── diagram.png
#         └── topology.svg
#
# Question HTML points at a bundled image with a ZIP-relative path, e.g.
# ``<img src="images/diagram.png">``. On import each referenced image is
# validated, uploaded to blob storage (content-addressed under the exam prefix)
# and its ``src`` rewritten to a stable ``media://{id}`` placeholder that is
# resolved to a signed URL when the question is served.

# The manifest must sit at the archive root under this exact (case-sensitive) name.
_MANIFEST_NAME = "exam.json"
# Only references under this folder are treated as bundled images.
_IMAGES_PREFIX = "images/"

# ``<img ... src="...">`` — captures (prefix incl. ``src=``, quote, url).
_IMG_SRC_RE = re.compile(
    r'(<img\b[^>]*?\bsrc\s*=\s*)(["\'])(.*?)\2',
    re.IGNORECASE | re.DOTALL,
)


def _size_label(num_bytes: int) -> str:
    """A human-friendly size limit, e.g. "5 MB" (or bytes when under 1 MB)."""
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes // (1024 * 1024)} MB"
    return f"{num_bytes} bytes"


# Blob extension per (sniffed) content type.
_EXT_BY_TYPE = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}


def _open_import_zip(
    zip_bytes: bytes, settings: Settings
) -> tuple[str, zipfile.ZipFile]:
    """Open and sanity-check an import ZIP, returning ``(manifest_text, zip)``.

    Guards against oversized uploads, zip bombs (total uncompressed size and
    entry count) and unsafe entry paths, then reads the ``exam.json`` manifest.
    The caller owns the returned :class:`zipfile.ZipFile` and must close it.
    """
    if len(zip_bytes) > settings.import_zip_max_bytes:
        raise ImportError_(
            f"The import archive exceeds the "
            f"{_size_label(settings.import_zip_max_bytes)} limit."
        )
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ImportError_("The uploaded file is not a valid ZIP archive.") from exc

    infos = archive.infolist()
    if len(infos) > settings.media_max_files + 50:
        archive.close()
        raise ImportError_("The ZIP archive contains too many entries.")

    max_total = settings.import_zip_max_bytes + settings.media_max_file_bytes * (
        settings.media_max_files + 1
    )
    total = 0
    for info in infos:
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or ".." in name.split("/"):
            archive.close()
            raise ImportError_(f"The ZIP contains an unsafe path: '{info.filename}'.")
        total += info.file_size
        if total > max_total:
            archive.close()
            raise ImportError_(
                "The ZIP's uncompressed contents exceed the allowed size."
            )

    try:
        manifest_bytes = archive.read(_MANIFEST_NAME)
    except KeyError:
        archive.close()
        raise ImportError_(
            f"The ZIP archive must contain a '{_MANIFEST_NAME}' file at its root."
        ) from None
    try:
        manifest = manifest_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        archive.close()
        raise ImportError_(f"'{_MANIFEST_NAME}' is not valid UTF-8.") from exc

    return manifest, archive


def _image_entries(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    """The archive's image files, keyed by their normalised ``images/...`` name."""
    entries: dict[str, zipfile.ZipInfo] = {}
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = info.filename.replace("\\", "/")
        if name.startswith(_IMAGES_PREFIX):
            entries[name] = info
    return entries


def _normalize_zip_ref(raw_src: str) -> str | None:
    """Normalise an ``<img src>`` value to a bundled image path, or ``None``.

    Returns ``None`` for anything that is not a local reference under
    ``images/`` (external URLs, ``data:`` URIs, absolute or traversing paths),
    which is then left untouched in the HTML.
    """
    value = raw_src.strip().replace("\\", "/")
    if value.startswith("./"):
        value = value[2:]
    if "://" in value or value.lower().startswith("data:") or value.startswith("/"):
        return None
    if ".." in value.split("/"):
        return None
    if not value.startswith(_IMAGES_PREFIX):
        return None
    return value


def _looks_like_svg(data: bytes) -> bool:
    head = data[:512].lstrip()
    if head.startswith(b"\xef\xbb\xbf"):  # UTF-8 BOM
        head = head[3:].lstrip()
    lowered = head.lower()
    return lowered.startswith(b"<svg") or (
        lowered.startswith(b"<?xml") and b"<svg" in data[:2048].lower()
    )


def _detect_image_type(data: bytes) -> str | None:
    """Sniff an image's content type from its magic bytes (never the extension)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if _looks_like_svg(data):
        return "image/svg+xml"
    return None


def _sniff_content_type(data: bytes, settings: Settings) -> str | None:
    """The image's content type if it is sniffable *and* allowed, else ``None``."""
    content_type = _detect_image_type(data)
    if content_type is None:
        return None
    if content_type not in settings.media_allowed_content_types_list:
        return None
    return content_type


def _rewrite_img_src(html_text: str, resolve: Callable[[str], str | None]) -> str:
    """Rewrite each ``<img src>`` for which ``resolve`` returns a replacement."""

    def _sub(match: re.Match[str]) -> str:
        prefix, quote, url = match.group(1), match.group(2), match.group(3)
        replacement = resolve(url)
        if replacement is None:
            return match.group(0)
        return f"{prefix}{quote}{replacement}{quote}"

    return _IMG_SRC_RE.sub(_sub, html_text)


def _attach_media_to_question(
    question: Question,
    archive: zipfile.ZipFile,
    image_entries: dict[str, zipfile.ZipInfo],
    entry_bytes: dict[str, bytes],
    uploads: dict[str, MediaUpload],
    exam_id: uuid.UUID,
    settings: Settings,
) -> None:
    """Upload-plan and rewrite the bundled images referenced by one question."""
    path_to_placeholder: dict[str, str] = {}
    sha_to_media_id: dict[str, str] = {}

    def resolve(raw_src: str) -> str | None:
        normalized = _normalize_zip_ref(raw_src)
        if normalized is None:
            return None
        if normalized in path_to_placeholder:
            return path_to_placeholder[normalized]

        info = image_entries.get(normalized)
        if info is None:
            raise ImportError_(
                f"Image '{raw_src.strip()}' referenced by a question is not in "
                f"the ZIP (bundled images must live under '{_IMAGES_PREFIX}')."
            )
        if info.file_size > settings.media_max_file_bytes:
            raise ImportError_(
                f"Image '{normalized}' exceeds the per-file limit of "
                f"{_size_label(settings.media_max_file_bytes)}."
            )

        data = entry_bytes.get(normalized)
        if data is None:
            data = archive.read(info)
            if len(data) > settings.media_max_file_bytes:
                raise ImportError_(
                    f"Image '{normalized}' exceeds the per-file limit of "
                    f"{_size_label(settings.media_max_file_bytes)}."
                )
            entry_bytes[normalized] = data

        content_type = _sniff_content_type(data, settings)
        if content_type is None:
            raise ImportError_(
                f"Image '{normalized}' is not an allowed image type "
                f"({', '.join(settings.media_allowed_content_types_list)})."
            )

        sha = hashlib.sha256(data).hexdigest()
        media_id = sha_to_media_id.get(sha)
        if media_id is None:
            blob_path = f"exams/{exam_id}/{sha}.{_EXT_BY_TYPE[content_type]}"
            media = QuestionMedia(
                id=uuid.uuid4(),
                question=question,
                blob_path=blob_path,
                content_type=content_type,
                sha256=sha,
                byte_size=len(data),
            )
            media_id = str(media.id)
            sha_to_media_id[sha] = media_id
            uploads.setdefault(
                blob_path,
                MediaUpload(blob_path=blob_path, data=data, content_type=content_type),
            )

        placeholder = f"media://{media_id}"
        path_to_placeholder[normalized] = placeholder
        return placeholder

    if question.text:
        question.text = _rewrite_img_src(question.text, resolve)
    if question.explanation:
        question.explanation = _rewrite_img_src(question.explanation, resolve)


def _attach_media(
    questions: list[Question],
    archive: zipfile.ZipFile,
    exam_id: uuid.UUID,
    settings: Settings,
) -> list[MediaUpload]:
    """Process the bundled images of every question, returning the upload plan."""
    image_entries = _image_entries(archive)
    entry_bytes: dict[str, bytes] = {}
    uploads: dict[str, MediaUpload] = {}
    for question in questions:
        _attach_media_to_question(
            question, archive, image_entries, entry_bytes, uploads, exam_id, settings
        )
    if len(uploads) > settings.media_max_files:
        raise ImportError_(
            f"The import references more than {settings.media_max_files} images."
        )
    return list(uploads.values())


def _canonicalize_media(text: str, sha_lookup: Callable[[str], str | None]) -> str:
    """Rewrite ``<img src>`` values to a content hash for dedup comparison.

    Both a stored ``media://{id}`` and a bundled ``images/...`` reference to the
    *same* image collapse to the same ``sha256:...`` token, so an already-imported
    image question is recognised as a duplicate on re-import (while questions that
    differ only in *which* image they show stay distinct).
    """

    def _sub(match: re.Match[str]) -> str:
        prefix, quote, url = match.group(1), match.group(2), match.group(3)
        sha = sha_lookup(url)
        if sha is None:
            return match.group(0)
        return f"{prefix}{quote}sha256:{sha}{quote}"

    return _IMG_SRC_RE.sub(_sub, text)


def _make_media_dedup_key(
    exam: Exam,
    archive: zipfile.ZipFile,
    image_entries: dict[str, zipfile.ZipInfo],
) -> Callable[[Question], str]:
    """A dedup key that compares image questions by their images' content.

    Existing questions carry ``media://{id}`` (resolved to a hash via their media
    rows); incoming questions carry ``images/...`` (resolved via the archive).
    """
    existing_sha_by_id = {
        str(media.id): media.sha256
        for section in exam.sections
        for question in section.questions
        for media in question.media
    }
    sha_by_path: dict[str, str] = {}

    def _archive_sha(normalized: str) -> str | None:
        if normalized not in sha_by_path:
            info = image_entries.get(normalized)
            if info is None:
                return None
            sha_by_path[normalized] = hashlib.sha256(archive.read(info)).hexdigest()
        return sha_by_path[normalized]

    def sha_lookup(url: str) -> str | None:
        stripped = url.strip()
        if stripped.startswith("media://"):
            return existing_sha_by_id.get(stripped.removeprefix("media://"))
        normalized = _normalize_zip_ref(url)
        if normalized is None:
            return None
        return _archive_sha(normalized)

    def dedup_key(question: Question) -> str:
        return _canonicalize_media(question.text, sha_lookup)

    return dedup_key


def build_exam_from_zip(
    zip_bytes: bytes, *, settings: Settings | None = None
) -> tuple[Exam, list[MediaUpload]]:
    """Build an exam from a ZIP bundle (``exam.json`` + ``images/``).

    Validates the manifest exactly like :func:`build_exam_from_payload`, then
    validates and upload-plans the bundled images and rewrites each question's
    HTML to reference them as ``media://{id}``. Returns the (transient) exam and
    the list of blobs to upload; nothing is uploaded or committed here.
    """
    settings = settings or get_settings()
    manifest, archive = _open_import_zip(zip_bytes, settings)
    try:
        exam = build_exam_from_payload(manifest)
        # Fix the id now so image blob paths can be scoped to the exam.
        exam.id = uuid.uuid4()
        questions = [q for section in exam.sections for q in section.questions]
        uploads = _attach_media(questions, archive, exam.id, settings)
    finally:
        archive.close()
    return exam, uploads


def merge_questions_from_zip(
    exam: Exam, zip_bytes: bytes, *, settings: Settings | None = None
) -> tuple[ImportSummary, list[MediaUpload]]:
    """Additively import a ZIP bundle's questions (with images) into ``exam``.

    Same additive semantics as :func:`merge_questions_into_exam`, but duplicates
    are detected content-aware: a question already imported with the same image
    is recognised even though its stored ``media://`` reference differs from the
    incoming ``images/`` one. Images are only processed for the questions
    actually added. Returns the add/skip summary and the blobs to upload.

    ``exam`` must be loaded with its sections, their questions and each
    question's media (see ``get_owned_with_questions``).
    """
    settings = settings or get_settings()
    manifest, archive = _open_import_zip(zip_bytes, settings)
    try:
        incoming = build_exam_from_payload(manifest)
        dedup_key = _make_media_dedup_key(exam, archive, _image_entries(archive))
        summary, grafted = _graft_new_questions(exam, incoming, dedup_key)
        uploads = _attach_media(grafted, archive, exam.id, settings)
    finally:
        archive.close()
    return summary, uploads
