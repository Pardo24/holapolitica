"""Async SQLAlchemy engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    echo=_settings.is_development,
    pool_pre_ping=True,
    # Per process. Production runs 3 API workers plus the job worker on a
    # box with 2 cores, where Postgres gets nothing more done with more than
    # a handful of queries at once. At 20 per worker, a scraper going through
    # the law lists (2026-11-03) had 61 queries sharing those 2 cores: each
    # took a minute instead of 50 ms and the box went into swap. At 8 a peak
    # queues in the pool instead, and queries still answer at their own speed.
    pool_size=_settings.db_pool_size,
    max_overflow=_settings.db_max_overflow,
    # Postgres compiles "expensive" queries to machine code first, ~0.4 s
    # each on the profile's tallies (2026-10-26) for queries that then run
    # in a fraction of that. A web API's queries are never long enough to
    # win it back.
    connect_args=(
        {"server_settings": {"jit": "off"}}
        if _settings.database_url.startswith("postgresql")
        else {}
    ),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session.

    Usage:
        @router.get("/items")
        async def list_items(session: AsyncSession = Depends(get_session)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
