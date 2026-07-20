"""Rewrite ``media://{id}`` placeholders in question HTML to real image URLs.

The importer stores each image reference as ``media://{media_id}`` (typically in
an ``<img src="...">``) so the persisted question text carries no environment-
specific or expiring URL. When a question is served, the placeholders are
swapped for short-lived signed blob URLs (see :mod:`app.storage.blob`).
"""

from __future__ import annotations

import re

# ``media://<uuid>`` — the placeholder written by the importer.
MEDIA_URI_RE = re.compile(
    r"media://("
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)


def iter_media_ids(text: str | None) -> set[str]:
    """The media ids referenced by ``text`` (empty if there are none)."""
    if not text:
        return set()
    return {match.group(1) for match in MEDIA_URI_RE.finditer(text)}


def replace_media_placeholders(
    text: str | None, url_by_id: dict[str, str]
) -> str | None:
    """Replace every ``media://{id}`` with ``url_by_id[id]``.

    Ids with no entry in ``url_by_id`` are left untouched (a missing image should
    degrade to a broken link, never blow up serving the question).
    """
    if not text:
        return text

    def _sub(match: re.Match[str]) -> str:
        return url_by_id.get(match.group(1), match.group(0))

    return MEDIA_URI_RE.sub(_sub, text)
