"""Answer grading — pure, framework-free correctness rules.

Given only ids and flags (no ORM rows, no GraphQL types), decide whether a
submitted answer is correct and what should be persisted. The repository/service
adapts ORM objects to these primitives and turns the results back into rows.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from app.core.errors import ValidationError
from app.domain.enums import QuestionType


@dataclass(frozen=True)
class ChoiceGrade:
    """Graded single/multiple-choice answer."""

    # The validated selection to persist (one row per id).
    selected_answer_ids: list[uuid.UUID]
    is_correct: bool
    # The solution, for immediate feedback.
    correct_answer_ids: list[uuid.UUID]


@dataclass(frozen=True)
class AllocationGrade:
    """Graded allocation answer (each item sorted into a basket)."""

    # answer id -> chosen category id, the selection to persist.
    chosen: dict[uuid.UUID, uuid.UUID]
    is_correct: bool
    # The solution as (answer id, correct category id) pairs, in item order.
    correct_allocations: list[tuple[uuid.UUID, uuid.UUID]]


def grade_choice(
    question_type: QuestionType,
    answer_ids: set[uuid.UUID],
    correct_answer_ids: set[uuid.UUID],
    selected_answer_ids: Iterable[uuid.UUID] | None,
) -> ChoiceGrade:
    """Validate and grade a single/multiple-choice selection.

    A multiple-choice answer counts as correct only when it matches the set of
    correct answers exactly; a single-choice answer must select exactly one.
    """
    selected = set(selected_answer_ids or [])
    if not selected:
        raise ValidationError("At least one answer must be selected.")
    if question_type is QuestionType.SINGLE_CHOICE and len(selected) != 1:
        raise ValidationError(
            "Exactly one answer must be selected for a single-choice question."
        )
    if not selected <= answer_ids:
        raise ValidationError("Selected answers do not belong to this question.")
    if not correct_answer_ids:
        raise ValidationError("This question has no correct answer configured.")

    return ChoiceGrade(
        selected_answer_ids=sorted(selected, key=str),
        is_correct=selected == correct_answer_ids,
        correct_answer_ids=sorted(correct_answer_ids, key=str),
    )


def grade_allocation(
    correct_category_by_answer: dict[uuid.UUID, uuid.UUID | None],
    category_ids: set[uuid.UUID],
    placements: Iterable[tuple[uuid.UUID, uuid.UUID]],
) -> AllocationGrade:
    """Validate and grade an allocation (every item sorted into a basket).

    Correct only when every item sits in its own correct category. Pass
    ``correct_category_by_answer`` in item order so the returned solution keeps
    that order.
    """
    answer_ids = set(correct_category_by_answer)

    chosen: dict[uuid.UUID, uuid.UUID] = {}
    for answer_id, category_id in placements:
        if answer_id in chosen:
            raise ValidationError("Each item may be sorted into only one category.")
        chosen[answer_id] = category_id

    if not set(chosen) <= answer_ids:
        raise ValidationError("Selected answers do not belong to this question.")
    if not set(chosen.values()) <= category_ids:
        raise ValidationError("Selected categories do not belong to this question.")
    if set(chosen) != answer_ids:
        raise ValidationError("Every item must be sorted into a category.")

    is_correct = all(
        chosen[aid] == correct_category_by_answer[aid] for aid in answer_ids
    )
    correct_allocations = [
        (aid, cid) for aid, cid in correct_category_by_answer.items() if cid is not None
    ]
    return AllocationGrade(
        chosen=chosen, is_correct=is_correct, correct_allocations=correct_allocations
    )
