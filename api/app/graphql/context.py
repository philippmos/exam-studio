"""Helpers for reading the authenticated request context inside resolvers."""

from __future__ import annotations

from strawberry.types import Info

from app import models


def current_user(info: Info) -> models.User:
    """The authenticated user for this request.

    ``get_context`` (see ``app.main``) rejects unauthenticated requests with a
    401 before any resolver runs, so a user is always present here.
    """
    return info.context["user"]
