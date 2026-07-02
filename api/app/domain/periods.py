"""Study-goal period boundaries — pure calendar arithmetic.

A goal is measured per DAILY or WEEKLY period; this computes the first local day
of the running period and the UTC instant it began, so the "answered since"
count lines up with the user's calendar. ``tz_offset_minutes`` shifts UTC into
the caller's local time (same convention as the study-history and streak code).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from app.domain.enums import GoalPeriod


def current_period_start(
    period: GoalPeriod, tz_offset_minutes: int, now: datetime
) -> tuple[date, datetime]:
    """First local day of the running period and its UTC start instant.

    DAILY periods start at local midnight, WEEKLY periods on Monday of the
    current ISO week.
    """
    offset = timedelta(minutes=tz_offset_minutes)
    local_now = now + offset
    start_day = local_now.date()
    if period is GoalPeriod.WEEKLY:
        start_day -= timedelta(days=local_now.weekday())
    start_utc = datetime.combine(start_day, time.min, tzinfo=UTC) - offset
    return start_day, start_utc
