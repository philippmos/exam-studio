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
    """Graded allocation answer (each item sorted into a basket).

    Items whose correct category is ``None`` are distractors that belong in no
    basket; the solution (``correct_allocations``) only lists the real items.
    """

    # answer id -> chosen category id, the selection to persist.
    chosen: dict[uuid.UUID, uuid.UUID]
    is_correct: bool
    # The solution as (answer id, correct category id) pairs, in item order;
    # distractors (no correct category) are omitted.
    correct_allocations: list[tuple[uuid.UUID, uuid.UUID]]


@dataclass(frozen=True)
class PlacementGrade:
    """Graded select-and-place answer (an ordered subset of the options)."""

    # answer id -> the 0-based slot it was placed into, the selection to persist.
    chosen: dict[uuid.UUID, int]
    is_correct: bool
    # The solution as (answer id, 0-based slot) pairs, in correct order.
    correct_placements: list[tuple[uuid.UUID, int]]


@dataclass(frozen=True)
class VerdictGrade:
    """Graded yes/no answer (a Yes/No verdict on every statement)."""

    # answer id -> the chosen verdict (True = Yes), the selection to persist.
    chosen: dict[uuid.UUID, bool]
    is_correct: bool
    # The solution as (answer id, correct verdict) pairs, in statement order.
    correct_verdicts: list[tuple[uuid.UUID, bool]]


@dataclass(frozen=True)
class SelectboxGrade:
    """Graded selectbox answer (one option chosen per selectbox)."""

    # The validated selection to persist (one row per chosen option id).
    selected_answer_ids: list[uuid.UUID]
    is_correct: bool
    # The solution: the correct option of every selectbox.
    correct_answer_ids: list[uuid.UUID]


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
    """Validate and grade an allocation (each item sorted into a basket).

    Items whose value in ``correct_category_by_answer`` is ``None`` are
    distractors that belong in no basket: the answer is correct only when every
    real item sits in its own correct category *and* every distractor is left
    unplaced. A distractor may still be dragged into a basket, and a real item
    may be left in the tray — either one makes the answer incorrect (it is not
    rejected). Pass ``correct_category_by_answer`` in item order so the returned
    solution keeps that order.
    """
    answer_ids = set(correct_category_by_answer)

    chosen: dict[uuid.UUID, uuid.UUID] = {}
    for answer_id, category_id in placements:
        if answer_id in chosen:
            raise ValidationError("Each item may be sorted into only one category.")
        chosen[answer_id] = category_id

    if not chosen:
        raise ValidationError("At least one item must be sorted into a category.")
    if not set(chosen) <= answer_ids:
        raise ValidationError("Selected answers do not belong to this question.")
    if not set(chosen.values()) <= category_ids:
        raise ValidationError("Selected categories do not belong to this question.")

    # A real item must sit in its correct category; a distractor (correct
    # category None) must be left unplaced, so ``chosen.get`` returning None
    # matches only for a distractor that was not dragged into any basket.
    is_correct = all(
        chosen.get(aid) == correct_category_by_answer[aid] for aid in answer_ids
    )
    correct_allocations = [
        (aid, cid) for aid, cid in correct_category_by_answer.items() if cid is not None
    ]
    return AllocationGrade(
        chosen=chosen, is_correct=is_correct, correct_allocations=correct_allocations
    )


def grade_select_and_place(
    correct_order: list[uuid.UUID],
    answer_ids: set[uuid.UUID],
    placed_answer_ids: Iterable[uuid.UUID],
) -> PlacementGrade:
    """Validate and grade a select-and-place answer (an ordered placement).

    ``placed_answer_ids`` is the user's placement, in the order they arranged
    it. It is correct only when it matches ``correct_order`` exactly (same
    options, same sequence); placing too few, too many, a distractor or a wrong
    order all count as incorrect. Only structurally invalid input is rejected.
    """
    placed = list(placed_answer_ids)
    if not placed:
        raise ValidationError("At least one option must be placed.")
    if len(set(placed)) != len(placed):
        raise ValidationError("Each option may be placed only once.")
    if not set(placed) <= answer_ids:
        raise ValidationError("Selected answers do not belong to this question.")
    if not correct_order:
        raise ValidationError("This question has no correct order configured.")

    chosen = {answer_id: slot for slot, answer_id in enumerate(placed)}
    correct_placements = list(enumerate(correct_order))
    return PlacementGrade(
        chosen=chosen,
        is_correct=placed == correct_order,
        correct_placements=[(answer_id, slot) for slot, answer_id in correct_placements],
    )


def grade_yes_no(
    correct_verdict_by_answer: dict[uuid.UUID, bool],
    verdicts: Iterable[tuple[uuid.UUID, bool]],
) -> VerdictGrade:
    """Validate and grade a yes/no answer (a Yes/No verdict per statement).

    Every statement must be answered, and the answer is correct only when every
    statement's verdict matches the solution. Pass ``correct_verdict_by_answer``
    in statement order so the returned solution keeps that order.
    """
    answer_ids = set(correct_verdict_by_answer)
    if not answer_ids:
        raise ValidationError("This question has no statements configured.")

    chosen: dict[uuid.UUID, bool] = {}
    for answer_id, value in verdicts:
        if answer_id in chosen:
            raise ValidationError("Each statement may be answered only once.")
        chosen[answer_id] = value

    if not set(chosen) <= answer_ids:
        raise ValidationError("Selected answers do not belong to this question.")
    if set(chosen) != answer_ids:
        raise ValidationError("Every statement must be answered yes or no.")

    is_correct = all(
        chosen[aid] == correct_verdict_by_answer[aid] for aid in answer_ids
    )
    return VerdictGrade(
        chosen=chosen,
        is_correct=is_correct,
        correct_verdicts=list(correct_verdict_by_answer.items()),
    )


def grade_selectbox(
    selectbox_by_answer: dict[uuid.UUID, uuid.UUID],
    correct_by_selectbox: dict[uuid.UUID, uuid.UUID],
    selected_answer_ids: Iterable[uuid.UUID] | None,
) -> SelectboxGrade:
    """Validate and grade a selectbox answer (one option chosen per selectbox).

    ``selectbox_by_answer`` maps every option to the selectbox it belongs to and
    ``correct_by_selectbox`` gives the correct option of each selectbox. The user
    must choose exactly one option in each selectbox; the answer is correct only
    when every selectbox's chosen option is its correct one.
    """
    selectbox_ids = set(selectbox_by_answer.values())
    if not selectbox_ids:
        raise ValidationError("This question has no selectboxes configured.")

    selected = set(selected_answer_ids or [])
    if not selected:
        raise ValidationError("At least one option must be selected.")
    if not selected <= set(selectbox_by_answer):
        raise ValidationError("Selected answers do not belong to this question.")

    chosen_by_selectbox: dict[uuid.UUID, set[uuid.UUID]] = {
        selectbox_id: set() for selectbox_id in selectbox_ids
    }
    for answer_id in selected:
        chosen_by_selectbox[selectbox_by_answer[answer_id]].add(answer_id)
    if any(len(chosen) != 1 for chosen in chosen_by_selectbox.values()):
        raise ValidationError("Choose exactly one option for each selectbox.")

    is_correct = all(
        chosen_by_selectbox[selectbox_id] == {correct_by_selectbox.get(selectbox_id)}
        for selectbox_id in selectbox_ids
    )
    return SelectboxGrade(
        selected_answer_ids=sorted(selected, key=str),
        is_correct=is_correct,
        correct_answer_ids=sorted(correct_by_selectbox.values(), key=str),
    )
