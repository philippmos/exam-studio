import enum


class SessionMode(str, enum.Enum):
    """How questions are selected when starting an exam session."""

    ALL_RANDOM = "ALL_RANDOM"  # all questions of the exam, shuffled
    BY_SECTION = "BY_SECTION"  # only questions of one section
    UNANSWERED = "UNANSWERED"  # only questions never answered correctly yet
    DUE_REVIEW = "DUE_REVIEW"  # only questions whose spaced-repetition review is due


class QuestionType(str, enum.Enum):
    """How many answers a question expects."""

    SINGLE_CHOICE = "SINGLE_CHOICE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"


class GoalPeriod(str, enum.Enum):
    """Time window of a per-exam study goal ("N questions per ...")."""

    DAILY = "DAILY"  # current local calendar day
    WEEKLY = "WEEKLY"  # current ISO week (Monday to Sunday, local time)
