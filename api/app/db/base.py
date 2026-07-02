"""The declarative base shared by every ORM model.

Kept in its own tiny module (rather than alongside the engine) so models can
import :class:`Base` without pulling in the engine/session machinery, avoiding
import cycles between the models and the database connection.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""
