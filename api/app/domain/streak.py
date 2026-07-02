"""Study-streak summary — the pure calendar arithmetic.

Given the set of local days that met the daily goal, derive the running streak,
the best run ever and a recent-activity strip. No I/O, so the tricky calendar
edge cases (today still open, gaps) can be reasoned about on their own.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

STREAK_WINDOW_DAYS = 7  # days shown in the recent-activity strip


@dataclass(frozen=True)
class StreakDay:
    """One day of the recent-activity strip: did the user meet the goal?"""

    day: date
    active: bool


@dataclass(frozen=True)
class StreakSummary:
    """The streak metrics derived from the active-day set."""

    current: int
    longest: int
    studied_today: bool
    daily_goal: int
    answered_today: int
    recent_days: list[StreakDay]


def summarise_streak(
    active_days: set[date], today: date, daily_goal: int, answered_today: int
) -> StreakSummary:
    """Build the streak summary from the set of local days that met the goal.

    The current streak walks back over consecutive active days, ending on today
    (already secured) or -- when today is still open -- on yesterday, so a day
    is only "lost" once both today and yesterday are missing.
    """
    studied_today = today in active_days

    current = 0
    cursor = today if studied_today else today - timedelta(days=1)
    while cursor in active_days:
        current += 1
        cursor -= timedelta(days=1)

    # Longest run ever: scan the active days in order, resetting on every gap.
    longest = run = 0
    previous: date | None = None
    for day in sorted(active_days):
        run = (
            run + 1
            if previous is not None and day - previous == timedelta(days=1)
            else 1
        )
        longest = max(longest, run)
        previous = day

    window = [today - timedelta(days=n) for n in range(STREAK_WINDOW_DAYS - 1, -1, -1)]
    recent_days = [StreakDay(day=day, active=day in active_days) for day in window]

    return StreakSummary(
        current=current,
        longest=longest,
        studied_today=studied_today,
        daily_goal=daily_goal,
        answered_today=answered_today,
        recent_days=recent_days,
    )
