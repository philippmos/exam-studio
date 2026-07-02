"""Spaced-repetition (Leitner) scheduling — the pure box/interval/due maths.

A question's review state (its Leitner box and due date) is persisted, but the
arithmetic for promoting the box and computing the next due date lives here,
free of any I/O so it can be reasoned about and tested in isolation. The
persistence and the due-question queries live in the review repository/service.

* a correct answer promotes the question one box (longer interval);
* a wrong answer sends it back to box 1 (review again soon).

``due_at`` is pinned to the start of the local day the question becomes due
again, so "due today" lines up with the user's calendar.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

# Leitner ladder: box -> days until the question is due again. Box 1 is the
# "learning / just lapsed" box; the top box keeps mastered questions in long-
# term rotation rather than dropping them entirely.
MAX_BOX = 5
_BOX_INTERVAL_DAYS: dict[int, int] = {1: 1, 2: 3, 3: 7, 4: 16, 5: 35}


def next_box(current_box: int, is_correct: bool) -> int:
    """Promote the box on a correct answer, reset to box 1 on a wrong one."""
    return min(current_box + 1, MAX_BOX) if is_correct else 1


def interval_for_box(box: int) -> int:
    """Days until a question sitting in ``box`` is due for review again."""
    return _BOX_INTERVAL_DAYS[min(max(box, 1), MAX_BOX)]


def due_at(interval_days: int, tz_offset_minutes: int, now: datetime) -> datetime:
    """UTC instant of local midnight ``interval_days`` days from ``now``."""
    offset = timedelta(minutes=tz_offset_minutes)
    due_local_day = (now + offset).date() + timedelta(days=interval_days)
    return datetime.combine(due_local_day, time.min, tzinfo=UTC) - offset
