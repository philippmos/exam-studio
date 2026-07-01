"""Framework-agnostic domain errors.

Services and the domain layer raise these instead of ``ValueError`` so the
GraphQL layer can map each kind to a stable ``extensions.code`` (see
``app.graphql.errors``) without parsing human-readable messages. They carry no
knowledge of HTTP or GraphQL.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class for expected, client-facing domain failures.

    ``code`` is the stable machine-readable identifier surfaced to API clients.
    """

    code: str = "DOMAIN_ERROR"


class NotFoundError(DomainError):
    """A referenced entity does not exist or is not visible to the caller."""

    code = "NOT_FOUND"


class ValidationError(DomainError):
    """The request is well-formed but violates a business rule."""

    code = "VALIDATION_ERROR"


class ConflictError(DomainError):
    """The request conflicts with the current state (e.g. a uniqueness clash)."""

    code = "CONFLICT"
