"""Suggest a study goal from the certification exam date.

The naive "questions / days_left" split ignores that mastering a question takes
several spaced repetitions, not a single pass. This module grounds the
suggestion in the Leitner ladder used by the spaced-repetition scheduler (see
:mod:`app.graphql.review`):

* taking a question from the first box to the top box needs ``MAX_BOX - 1``
  correct reviews;
* nobody answers everything correctly while learning, so an assumed accuracy
  inflates that into an expected number of *attempts* per question (a wrong
  answer resets the box);
* the resulting workload (questions x attempts) is spread over the days left,
  minus a buffer reserved before the exam for a final pass and some slack.

The result is a per-period target. The frontend prefills it when an exam date
is set and still lets the user override it manually.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

from app.enums import GoalPeriod
from app.graphql.review import MAX_BOX

# Tunables, kept together so the heuristic is easy to find and adjust.
ASSUMED_ACCURACY = 0.8  # share of reviews answered correctly while learning
BUFFER_FRACTION = 0.15  # share of the runway kept free before the exam
MAX_BUFFER_DAYS = 10  # ... but never reserve more than this many days

# Expected attempts per question to climb from box 1 to the top box: the
# MAX_BOX - 1 correct reviews needed, inflated for the wrong answers that reset
# the box. With the defaults this is ceil(4 / 0.8) = 5.
REPETITION_FACTOR = math.ceil((MAX_BOX - 1) / ASSUMED_ACCURACY)


@dataclass(frozen=True)
class StudyGoalSuggestion:
    """A suggested per-period target plus the inputs it was derived from."""

    period: GoalPeriod
    target: int
    question_count: int
    repetition_factor: int
    days_until_exam: int
    usable_days: int


def _days_until(exam_at: datetime, now: datetime) -> int:
    """Whole days from ``now`` to ``exam_at`` (naive datetimes assumed UTC)."""
    if exam_at.tzinfo is None:
        exam_at = exam_at.replace(tzinfo=timezone.utc)
    return (exam_at - now).days


def suggest(
    question_count: int,
    exam_at: datetime,
    period: GoalPeriod,
    now: datetime | None = None,
) -> StudyGoalSuggestion | None:
    """Per-period study-goal target, or ``None`` when no plan makes sense.

    Returns ``None`` when the exam has no questions or its date is less than a
    full day away -- there is either nothing to spread or no runway to spread it
    over, and the user is better served setting a manual goal.
    """
    now = now or datetime.now(timezone.utc)
    days = _days_until(exam_at, now)
    if question_count <= 0 or days < 1:
        return None

    workload = question_count * REPETITION_FACTOR
    buffer = min(MAX_BUFFER_DAYS, round(days * BUFFER_FRACTION))
    usable_days = max(1, days - buffer)

    if period is GoalPeriod.WEEKLY:
        usable_weeks = max(1, math.ceil(usable_days / 7))
        target = math.ceil(workload / usable_weeks)
    else:
        target = math.ceil(workload / usable_days)

    return StudyGoalSuggestion(
        period=period,
        target=max(1, target),
        question_count=question_count,
        repetition_factor=REPETITION_FACTOR,
        days_until_exam=days,
        usable_days=usable_days,
    )
