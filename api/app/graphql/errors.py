"""GraphQL error handling.

Domain errors already surface their (client-facing) message through Strawberry's
default handling; this extension additionally tags them with a stable
``extensions.code`` so clients can branch on the kind of failure without parsing
the message. Unexpected errors are left untouched here (and logged by the
schema), never masked, so the message contract the API exposes stays intact.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from graphql.execution.execute import ExecutionResult as GraphQLExecutionResult
from strawberry.extensions.base_extension import SchemaExtension
from strawberry.types.execution import ExecutionResult as StrawberryExecutionResult

from app.core.errors import DomainError


class DomainErrorExtension(SchemaExtension):
    """Tag errors raised from a :class:`DomainError` with ``extensions.code``."""

    def _annotate(self, result: Any) -> None:
        if not result.errors:
            return
        for error in result.errors:
            original = error.original_error
            if isinstance(original, DomainError):
                error.extensions = {**(error.extensions or {}), "code": original.code}

    def on_operation(self) -> Iterator[None]:
        yield
        result = self.execution_context.result
        if isinstance(result, GraphQLExecutionResult | StrawberryExecutionResult):
            self._annotate(result)
        elif result:
            self._annotate(result.initial_result)
