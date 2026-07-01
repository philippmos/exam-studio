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
from datetime import date, datetime
from typing import TYPE_CHECKING

import strawberry

from app import models
from app.domain.analytics import (
    ExamStatsData,
    ReviewDueData,
    SectionStatsData,
    StudyDayData,
    StudyGoalProgressData,
)
from app.domain.enums import GoalPeriod, SessionMode, StudyGoalSource, ThemePreference
from app.domain.enums import QuestionType as QuestionTypeValue
from app.domain.planning import StudyGoalSuggestion
from app.domain.streak import StreakSummary

# `strawberry.enum(...)` registers the (framework-free) domain enums as GraphQL
# enums and returns the very same classes. For type-checkers we alias the names
# to those enums (a call result is not usable as a type annotation); at runtime
# the registration side effect is what matters. The GraphQL object type below is
# already called "QuestionType", so its enum gets a distinct schema name.
if TYPE_CHECKING:
    type SessionModeEnum = SessionMode
    type GoalPeriodEnum = GoalPeriod
    type StudyGoalSourceEnum = StudyGoalSource
    type ThemePreferenceEnum = ThemePreference
    type QuestionTypeEnum = QuestionTypeValue
else:
    SessionModeEnum = strawberry.enum(SessionMode)
    GoalPeriodEnum = strawberry.enum(GoalPeriod)
    StudyGoalSourceEnum = strawberry.enum(StudyGoalSource)
    ThemePreferenceEnum = strawberry.enum(ThemePreference)
    QuestionTypeEnum = strawberry.enum(QuestionTypeValue, name="QuestionKind")


@strawberry.type
class UserSettingsType:
    """The signed-in user's account settings (the ``user_settings`` row).

    This is the place to expose further per-user preferences as the settings
    page grows.
    """

    theme_preference: ThemePreferenceEnum
    # Questions to answer in a day before it counts towards the study streak.
    daily_streak_goal: int


@strawberry.type
class AnswerType:
    id: uuid.UUID
    text: str
    position: int


@strawberry.type
class CategoryType:
    """A basket of an allocation question (empty for choice questions)."""

    id: uuid.UUID
    key: str
    label: str
    position: int


@strawberry.type
class AllocationType:
    """An item (answer) sorted into a category — one drag-and-drop placement."""

    answer_id: uuid.UUID
    category_id: uuid.UUID


@strawberry.input
class AllocationInput:
    """One placement submitted for an allocation question."""

    answer_id: uuid.UUID
    category_id: uuid.UUID


@strawberry.type
class QuestionType:
    id: uuid.UUID
    text: str
    # Description of the question/answer, shown once answered (null if none).
    explanation: str | None
    section_id: uuid.UUID
    question_type: QuestionTypeEnum
    # For allocation questions these are the items to sort; for choice
    # questions they are the options. ``categories`` holds the baskets an
    # allocation question's items go into and is empty for choice questions.
    answers: list[AnswerType]
    categories: list[CategoryType]


@strawberry.type
class SectionType:
    id: uuid.UUID
    name: str
    position: int
    question_count: int


@strawberry.type
class StudyGoalType:
    """Per-exam study goal: answer ``target`` questions per ``period``."""

    period: GoalPeriodEnum
    target: int
    # Whether the target was entered by hand or derived from the exam date.
    source: StudyGoalSourceEnum


@strawberry.type
class SuggestedStudyGoal:
    """A study goal proposed from the certification exam date.

    ``target`` is the per-``period`` number to aim for; the remaining fields
    expose the inputs so the UI can explain how the number came about.
    """

    period: GoalPeriodEnum
    target: int
    question_count: int
    repetition_factor: int  # how often each question is answered on average
    days_until_exam: int
    usable_days: int  # days left after reserving a pre-exam buffer


@strawberry.type
class ExamType:
    id: uuid.UUID
    name: str
    issuer: str | None
    created_at: datetime
    question_count: int
    study_goal: StudyGoalType | None
    # When the user sits the real certification exam (null if not scheduled).
    certification_exam_at: datetime | None
    # Archived exams are hidden from the dashboard and cannot start new sessions.
    archived: bool
    sections: list[SectionType]


@strawberry.type
class AddQuestionsResult:
    """Outcome of merging new questions into an existing exam.

    ``exam`` is the updated exam (with the new question counts); ``added`` and
    ``skipped`` report how many of the uploaded questions were imported versus
    skipped because they were already present.
    """

    exam: ExamType
    added: int
    skipped: int


@strawberry.type
class SessionItemType:
    id: uuid.UUID
    position: int
    question: QuestionType
    selected_answer_ids: list[uuid.UUID]
    # The user's allocation placements (item -> basket); empty for choice
    # questions.
    selected_allocations: list[AllocationType]
    # Only revealed once the question has been answered, so the solution can be
    # shown when reviewing/resuming without leaking it beforehand.
    correct_answer_ids: list[uuid.UUID] | None
    # The solution of an allocation question (item -> correct basket); empty for
    # choice questions, null until answered.
    correct_allocations: list[AllocationType] | None
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
class SessionOverviewType:
    """Lightweight session row for the sessions overview (no items)."""

    id: uuid.UUID
    exam_id: uuid.UUID
    exam_name: str
    mode: SessionModeEnum
    section_id: uuid.UUID | None
    section_name: str | None
    created_at: datetime
    finished_at: datetime | None
    total: int
    answered: int
    correct: int


@strawberry.type
class AnswerResult:
    """Returned after a question is answered so the UI can show feedback."""

    session_item_id: uuid.UUID
    is_correct: bool
    correct_answer_ids: list[uuid.UUID]
    # The solution of an allocation question (item -> correct basket); empty for
    # choice questions.
    correct_allocations: list[AllocationType]
    # Spaced-repetition outcome: the Leitner box the question landed in and how
    # many days until it is due again. Lets the UI confirm the review schedule.
    review_box: int
    review_interval_days: int


@strawberry.type
class ReviewDueStatus:
    """How many of an exam's questions are due for spaced-repetition review."""

    exam_id: uuid.UUID
    due_count: int


@strawberry.type
class SectionStats:
    """Per-module learning progress."""

    section_id: uuid.UUID
    name: str
    total_questions: int
    attempted_questions: int  # answered at least once
    mastered_questions: int  # answered correctly at least once
    struggling_questions: int  # attempted but never correct
    correct_attempts: int
    incorrect_attempts: int
    accuracy: float  # correct_attempts / total attempts
    mastery: float  # mastered_questions / total_questions


@strawberry.type
class StudyDayStats:
    """Questions answered on one calendar day (study-history chart data)."""

    day: date
    total: int
    correct: int
    incorrect: int


@strawberry.type
class StudyGoalProgress:
    """How far an exam's study goal has come in the current period."""

    exam_id: uuid.UUID
    period: GoalPeriodEnum
    target: int
    answered: int  # questions answered since the period started
    period_start: date  # local calendar day the current period began on


@strawberry.type
class StreakDay:
    """One day of the recent-activity strip: did the user study that day?"""

    day: date
    active: bool


@strawberry.type
class StudyStreak:
    """Consecutive-day study streak across all exams (a habit metric).

    A streak counts calendar days that reach the user's ``daily_goal`` (number
    of questions answered that day). It stays alive as long as the chain reaches
    yesterday: ``current`` includes today once the goal is met, and otherwise
    still counts the run through yesterday so the day is not yet "lost".
    ``studied_today`` tells an already-secured streak from one still at risk
    today, and ``answered_today`` lets the UI show progress towards the goal.
    """

    current: int  # length of the running streak (0 if broken)
    longest: int  # best run ever, for a personal-best target
    studied_today: bool  # whether today has already met the goal
    daily_goal: int  # questions/day needed for a day to count
    answered_today: int  # questions answered so far today (progress to the goal)
    # The last seven local days, oldest first (the last entry is today), for a
    # compact week strip.
    recent_days: list[StreakDay]


@strawberry.type
class ExamStats:
    """Aggregated learning progress for a whole exam (dashboard data)."""

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
    coverage: float  # attempted_questions / total_questions
    mastery: float  # mastered_questions / total_questions
    sessions_count: int
    last_activity: datetime | None
    sections: list[SectionStats]


# --------------------------------------------------------------------------- #
# Converters: ORM -> GraphQL types (relationships must be loaded beforehand)   #
# --------------------------------------------------------------------------- #


def to_user_settings(settings: models.UserSettings) -> UserSettingsType:
    return UserSettingsType(
        theme_preference=ThemePreference(settings.theme_preference),
        daily_streak_goal=settings.daily_streak_goal,
    )


def to_answer(answer: models.Answer) -> AnswerType:
    return AnswerType(id=answer.id, text=answer.text, position=answer.position)


def to_category(category: models.QuestionCategory) -> CategoryType:
    return CategoryType(
        id=category.id,
        key=category.key,
        label=category.label,
        position=category.position,
    )


def to_question(
    question: models.Question, answer_order: list[str] | None = None
) -> QuestionType:
    if answer_order:
        answers_by_id = {str(answer.id): answer for answer in question.answers}
        ordered_answers = [
            answers_by_id[answer_id]
            for answer_id in answer_order
            if answer_id in answers_by_id
        ]
        if len(ordered_answers) != len(question.answers):
            seen = set(answer_order)
            ordered_answers.extend(
                answer for answer in question.answers if str(answer.id) not in seen
            )
    else:
        ordered_answers = list(question.answers)
    return QuestionType(
        id=question.id,
        text=question.text,
        explanation=question.explanation,
        section_id=question.section_id,
        question_type=QuestionTypeValue(question.question_type),
        answers=[to_answer(a) for a in ordered_answers],
        categories=[to_category(c) for c in question.categories],
    )


def to_section(section: models.Section, question_count: int) -> SectionType:
    return SectionType(
        id=section.id,
        name=section.name,
        position=section.position,
        question_count=question_count,
    )


def to_study_goal(exam: models.Exam) -> StudyGoalType | None:
    if (
        exam.study_goal_period is None
        or exam.study_goal_target is None
        or exam.study_goal_source is None
    ):
        return None
    return StudyGoalType(
        period=GoalPeriod(exam.study_goal_period),
        target=exam.study_goal_target,
        source=StudyGoalSource(exam.study_goal_source),
    )


def to_exam(exam: models.Exam, counts_by_section: dict[uuid.UUID, int]) -> ExamType:
    sections = [to_section(s, counts_by_section.get(s.id, 0)) for s in exam.sections]
    return ExamType(
        id=exam.id,
        name=exam.name,
        issuer=exam.issuer,
        created_at=exam.created_at,
        question_count=sum(counts_by_section.get(s.id, 0) for s in exam.sections),
        study_goal=to_study_goal(exam),
        certification_exam_at=exam.certification_exam_at,
        archived=exam.archived,
        sections=sections,
    )


def to_session_item(item: models.SessionItem) -> SessionItemType:
    answered = item.answered_at is not None
    correct_answer_ids = None
    correct_allocations = None
    if answered:
        correct_answer_ids = [a.id for a in item.question.answers if a.is_correct]
        correct_allocations = [
            AllocationType(answer_id=a.id, category_id=a.correct_category_id)
            for a in item.question.answers
            if a.correct_category_id is not None
        ]
    return SessionItemType(
        id=item.id,
        position=item.position,
        question=to_question(item.question, item.answer_order),
        selected_answer_ids=[sa.answer_id for sa in item.selected_answers],
        selected_allocations=[
            AllocationType(answer_id=sa.answer_id, category_id=sa.category_id)
            for sa in item.selected_answers
            if sa.category_id is not None
        ],
        correct_answer_ids=correct_answer_ids,
        correct_allocations=correct_allocations,
        is_correct=item.is_correct,
        answered_at=item.answered_at,
    )


def to_session_overview(
    session: models.ExamSession,
    exam_name: str,
    section_name: str | None,
    total: int,
    answered: int,
    correct: int,
) -> SessionOverviewType:
    return SessionOverviewType(
        id=session.id,
        exam_id=session.exam_id,
        exam_name=exam_name,
        mode=SessionMode(session.mode),
        section_id=session.section_id,
        section_name=section_name,
        created_at=session.created_at,
        finished_at=session.finished_at,
        total=total,
        answered=answered,
        correct=correct,
    )


def to_session(session: models.ExamSession) -> ExamSessionType:
    items = list(session.items)
    answered = sum(1 for i in items if i.answered_at is not None)
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


# --------------------------------------------------------------------------- #
# Converters: domain analytics results -> GraphQL types                        #
# --------------------------------------------------------------------------- #


def to_review_due(data: ReviewDueData) -> ReviewDueStatus:
    return ReviewDueStatus(exam_id=data.exam_id, due_count=data.due_count)


def to_study_day(data: StudyDayData) -> StudyDayStats:
    return StudyDayStats(
        day=data.day, total=data.total, correct=data.correct, incorrect=data.incorrect
    )


def to_study_goal_progress(data: StudyGoalProgressData) -> StudyGoalProgress:
    return StudyGoalProgress(
        exam_id=data.exam_id,
        period=data.period,
        target=data.target,
        answered=data.answered,
        period_start=data.period_start,
    )


def _to_section_stats(data: SectionStatsData) -> SectionStats:
    return SectionStats(
        section_id=data.section_id,
        name=data.name,
        total_questions=data.total_questions,
        attempted_questions=data.attempted_questions,
        mastered_questions=data.mastered_questions,
        struggling_questions=data.struggling_questions,
        correct_attempts=data.correct_attempts,
        incorrect_attempts=data.incorrect_attempts,
        accuracy=data.accuracy,
        mastery=data.mastery,
    )


def to_exam_stats(data: ExamStatsData) -> ExamStats:
    return ExamStats(
        exam_id=data.exam_id,
        exam_name=data.exam_name,
        total_questions=data.total_questions,
        attempted_questions=data.attempted_questions,
        mastered_questions=data.mastered_questions,
        struggling_questions=data.struggling_questions,
        unattempted_questions=data.unattempted_questions,
        total_attempts=data.total_attempts,
        correct_attempts=data.correct_attempts,
        incorrect_attempts=data.incorrect_attempts,
        accuracy=data.accuracy,
        coverage=data.coverage,
        mastery=data.mastery,
        sessions_count=data.sessions_count,
        last_activity=data.last_activity,
        sections=[_to_section_stats(section) for section in data.sections],
    )


def to_study_streak(summary: StreakSummary) -> StudyStreak:
    return StudyStreak(
        current=summary.current,
        longest=summary.longest,
        studied_today=summary.studied_today,
        daily_goal=summary.daily_goal,
        answered_today=summary.answered_today,
        recent_days=[
            StreakDay(day=day.day, active=day.active) for day in summary.recent_days
        ],
    )


def to_suggested_goal(suggestion: StudyGoalSuggestion) -> SuggestedStudyGoal:
    return SuggestedStudyGoal(
        period=suggestion.period,
        target=suggestion.target,
        question_count=suggestion.question_count,
        repetition_factor=suggestion.repetition_factor,
        days_until_exam=suggestion.days_until_exam,
        usable_days=suggestion.usable_days,
    )
