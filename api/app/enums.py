import enum


class SessionMode(str, enum.Enum):
    """How questions are selected when starting an exam session."""

    ALL_RANDOM = "ALL_RANDOM"  # all questions of the exam, shuffled
    BY_SECTION = "BY_SECTION"  # only questions of one section
    UNANSWERED = "UNANSWERED"  # only questions never answered correctly yet


class QuestionType(str, enum.Enum):
    """How many answers a question expects."""

    SINGLE_CHOICE = "SINGLE_CHOICE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
