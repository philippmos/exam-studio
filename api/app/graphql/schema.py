from typing import Any

import strawberry
from graphql.validation import NoSchemaIntrospectionCustomRule
from strawberry.extensions import AddValidationRules, QueryDepthLimiter

from app.core.config import get_settings
from app.graphql.errors import DomainErrorExtension
from app.graphql.mutations import Mutation
from app.graphql.queries import Query

_settings = get_settings()

# Reject pathologically deep queries (a cheap DoS guard) and tag domain errors
# with a stable extensions.code. (Typed as Any: strawberry accepts both extension
# classes and instances, which its parameter type does not spell out.)
_extensions: list[Any] = [
    QueryDepthLimiter(max_depth=_settings.graphql_max_depth),
    DomainErrorExtension,
]
if not _settings.debug:
    # No schema introspection in production; the SDL is exported from code.
    _extensions.append(AddValidationRules([NoSchemaIntrospectionCustomRule]))

schema = strawberry.Schema(query=Query, mutation=Mutation, extensions=_extensions)
