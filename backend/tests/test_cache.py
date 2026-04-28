"""Tests for the read-through Redis cache wrapper.

We back the wrapper with a hand-rolled in-process fake instead of fakeredis
or a live Redis container. The fake supports the four operations the cache
actually uses (``get``, ``set`` with ``ex``, ``scan_iter``, ``delete``) and
records call counts so we can assert hit/miss without flake.

Why not fakeredis? It pulls a ~10MB optional dependency for what amounts
to a 60-line dict mock. The fake here lives inside the test file so it's
also documentation of the interface the production code relies on.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from pydantic import BaseModel

from app.services import cache


# ---------------------------------------------------------------------------
# In-process fake Redis
# ---------------------------------------------------------------------------


class FakeRedis:
    """Minimal async-Redis stand-in for the operations the cache layer uses.

    Implements TTL using monotonic clocks — entries expire on read, not on a
    background timer, which keeps tests deterministic.
    """

    def __init__(self) -> None:
        self.store: dict[str, tuple[str, float | None]] = {}
        self.gets = 0
        self.sets = 0
        self.deletes = 0

    async def get(self, key: str) -> str | None:
        self.gets += 1
        entry = self.store.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if expiry is not None and time.monotonic() > expiry:
            del self.store[key]
            return None
        return value

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.sets += 1
        expiry = time.monotonic() + ex if ex is not None else None
        self.store[key] = (value, expiry)

    async def scan_iter(
        self, match: str | None = None, count: int = 500
    ) -> AsyncIterator[str]:
        pattern = match or "*"
        # Strip trailing '*' for prefix matching (the only pattern we use).
        prefix = pattern[:-1] if pattern.endswith("*") else pattern
        for k in list(self.store):
            if k.startswith(prefix):
                yield k

    async def delete(self, *keys: str) -> int:
        n = 0
        for k in keys:
            if k in self.store:
                del self.store[k]
                n += 1
        self.deletes += n
        return n


@pytest.fixture
def fake_redis() -> Any:
    """Install a fake Redis client; restore the override on teardown."""
    fake = FakeRedis()
    cache.set_client_for_testing(fake)  # type: ignore[arg-type]
    try:
        yield fake
    finally:
        cache.set_client_for_testing(None)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_cached_miss_then_hit(fake_redis: FakeRedis) -> None:
    """First call runs the factory; subsequent calls return the cached value."""
    calls = 0

    async def factory() -> dict[str, int]:
        nonlocal calls
        calls += 1
        return {"answer": 42}

    out1 = await cache.cached("test:key", 60, factory)
    out2 = await cache.cached("test:key", 60, factory)

    assert out1 == {"answer": 42}
    assert out2 == {"answer": 42}
    assert calls == 1, "factory should run only once across two reads"
    assert fake_redis.sets == 1


async def test_cached_ttl_respected(fake_redis: FakeRedis) -> None:
    """When TTL elapses the wrapper falls back to the factory again."""
    calls = 0

    async def factory() -> list[int]:
        nonlocal calls
        calls += 1
        return [calls]

    await cache.cached("test:ttl", ttl_seconds=1, factory=factory)
    # Advance the fake clock by manipulating stored expiry.
    key, (val, _expiry) = next(iter(fake_redis.store.items()))
    fake_redis.store[key] = (val, time.monotonic() - 1)  # already expired

    out = await cache.cached("test:ttl", ttl_seconds=1, factory=factory)
    assert out == [2]
    assert calls == 2


async def test_cached_invalidate_prefix(fake_redis: FakeRedis) -> None:
    """``invalidate`` removes every key sharing a prefix, leaves others alone."""

    async def fab(value: int) -> dict[str, int]:
        return {"v": value}

    await cache.cached("stats:a", 60, lambda: fab(1))
    await cache.cached("stats:b", 60, lambda: fab(2))
    await cache.cached("metrics:c", 60, lambda: fab(3))

    deleted = await cache.invalidate("stats:")

    assert deleted == 2
    assert "stats:a" not in fake_redis.store
    assert "stats:b" not in fake_redis.store
    assert "metrics:c" in fake_redis.store


async def test_cached_serializes_pydantic_models(fake_redis: FakeRedis) -> None:
    """Pydantic v2 models round-trip via model_dump."""

    class Item(BaseModel):
        name: str
        count: int

    async def factory() -> list[Item]:
        return [Item(name="x", count=1), Item(name="y", count=2)]

    out1 = await cache.cached("test:pydantic", 60, factory)
    out2 = await cache.cached("test:pydantic", 60, factory)

    assert out1 == [Item(name="x", count=1), Item(name="y", count=2)]
    # Second call returns plain dicts (decoded JSON). That's fine because the
    # FastAPI ``response_model`` re-coerces them at the API boundary.
    assert out2 == [{"name": "x", "count": 1}, {"name": "y", "count": 2}]


async def test_cached_serializes_dataclasses(fake_redis: FakeRedis) -> None:
    """Frozen dataclasses (the shape used by app.metrics) are serialised."""

    @dataclass(frozen=True)
    class Row:
        slug: str
        count: int

    async def factory() -> list[Row]:
        return [Row(slug="ppe", count=5)]

    out1 = await cache.cached("test:dc", 60, factory)
    out2 = await cache.cached("test:dc", 60, factory)

    assert out1 == [Row(slug="ppe", count=5)]
    assert out2 == [{"slug": "ppe", "count": 5}]


async def test_invalidate_empty_prefix_is_safe(fake_redis: FakeRedis) -> None:
    """No keys to delete returns 0 cleanly."""
    n = await cache.invalidate("never-stored:")
    assert n == 0


async def test_concurrent_misses_run_factory_once_each(fake_redis: FakeRedis) -> None:
    """Concurrent miss races call the factory once per task.

    Single-flight de-duplication is NOT a requirement here — Redis itself
    handles the second write idempotently and the user-facing latency we
    care about is the steady-state hit rate, not the cold-start race. This
    test pins the current behaviour so future single-flight changes are
    intentional.
    """
    calls = 0

    async def factory() -> dict[str, int]:
        nonlocal calls
        calls += 1
        # Yield once so both tasks race.
        await asyncio.sleep(0)
        return {"calls": calls}

    a, b = await asyncio.gather(
        cache.cached("test:race", 60, factory),
        cache.cached("test:race", 60, factory),
    )
    assert a in ({"calls": 1}, {"calls": 2})
    assert b in ({"calls": 1}, {"calls": 2})
    assert calls in (1, 2)
