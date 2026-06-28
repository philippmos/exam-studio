import enum


class SessionMode(str, enum.Enum):
    """How questions are selected when starting an exam session."""

    ALL_RANDOM = "ALL_RANDOM"  # all questions of the exam, shuffled
    BY_SECTION = "BY_SECTION"  # only questions of one section
    UNANSWERED = "UNANSWERED"  # only questions answered incorrectly at least once
    DUE_REVIEW = "DUE_REVIEW"  # only questions whose spaced-repetition review is due


class QuestionType(str, enum.Enum):
    """What kind of answer a question expects."""

    SINGLE_CHOICE = "SINGLE_CHOICE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    # Sort each item (an answer row) into one of the question's categories.
    ALLOCATION = "ALLOCATION"


class GoalPeriod(str, enum.Enum):
    """Time window of a per-exam study goal ("N questions per ...")."""

    DAILY = "DAILY"  # current local calendar day
    WEEKLY = "WEEKLY"  # current ISO week (Monday to Sunday, local time)


class StudyGoalSource(str, enum.Enum):
    """Where an exam's study goal came from."""

    MANUAL = "MANUAL"  # the user entered the target by hand
    AUTO = "AUTO"  # derived from the certification exam date (recomputed on change)
