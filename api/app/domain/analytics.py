"""Result shapes for the derived learning-progress analytics.

Plain, framework-free dataclasses returned by the stats/review services; the
GraphQL layer maps them onto its presentation types. Keeping them here (rather
than returning Strawberry types from the services) keeps the services free of
any presentation dependency.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from app.domain.enums import GoalPeriod


@dataclass(frozen=True)
class SectionStatsData:
    """Per-module learning progress."""

    section_id: uuid.UUID
    name: str
    total_questions: int
    attempted_questions: int
    mastered_questions: int
    struggling_questions: int
    correct_attempts: int
    incorrect_attempts: int
    accuracy: float
    mastery: float


@dataclass(frozen=True)
class ExamStatsData:
    """Aggregated learning progress for a whole exam."""

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
    coverage: float
    mastery: float
    sessions_count: int
    last_activity: datetime | None
    sections: list[SectionStatsData]


@dataclass(frozen=True)
class StudyDayData:
    """Questions answered on one calendar day."""

    day: date
    total: int
    correct: int
    incorrect: int


@dataclass(frozen=True)
class StudyGoalProgressData:
    """How far an exam's study goal has come in the current period."""

    exam_id: uuid.UUID
    period: GoalPeriod
    target: int
    answered: int
    period_start: date


@dataclass(frozen=True)
class ReviewDueData:
    """How many of an exam's questions are due for review right now."""

    exam_id: uuid.UUID
    due_count: int
