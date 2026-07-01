"""Async database engine, session factory and connection helpers."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

engine = create_async_engine(get_settings().database_url, echo=False, future=True)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session per request."""
    async with SessionLocal() as session:
        yield session


async def ping() -> None:
    """Issue a trivial query, raising if the database is unreachable.

    Backs the ``/health/ready`` readiness probe: a green result means the API
    can actually reach its database, not merely that the process is up.
    """
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
