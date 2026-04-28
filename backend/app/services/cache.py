"""Redis-backed read-through cache for expensive read endpoints.

The :func:`cached` wrapper is the single entry point. It hashes the call's
key, looks up Redis, and on miss runs the ``factory`` (an async callable
that produces a JSON-serialisable value), stores it with a TTL, and returns
it. Cache failures (Redis down, JSON encode errors) degrade gracefully —
they log a warning and call the factory directly so the API stays up.

The companion :func:`invalidate` wipes every key whose name starts with the
given prefix. We use it from ingest workers so a fresh import busts all
``stats:*`` and ``metrics:*`` entries in one shot.

Serialisation
~~~~~~~~~~~~~

Stored values must round-trip through ``json.dumps``/``json.loads``. The
helpers in this module accept any JSON-serialisable Python object plus two
project-specific shapes:

- Pydantic v2 ``BaseModel`` instances and lists thereof — converted via
  ``model_dump(mode="json")``.
- Frozen ``dataclass`` instances (the ``app.metrics`` row classes) and
  lists thereof — converted via ``dataclasses.asdict``.

The decoded value is returned as a list of dicts (or a dict, for singletons)
which FastAPI re-serialises through its declared ``response_model``. That
double-pass through Pydantic is intentional: the response_model coerces the
cached dicts back into the proper Pydantic schema before they leave the API.

Why not store the raw JSON bytes from the response body?
We could, but it requires a custom Starlette response and skips OpenAPI
shape validation. The simple dict round-trip costs ~1ms on shapes this
small while keeping the rest of the stack normal.
"""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Any, TypeVar

import redis.asyncio as redis_async
import structlog
from pydantic import BaseModel

from app.core.config import get_settings

log = structlog.get_logger(__name__)

T = TypeVar("T")

# Single shared async Redis client. ``decode_responses=True`` keeps the
# round-trip in ``str`` instead of ``bytes`` so we can json.loads() directly.
@lru_cache(maxsize=1)
def _client() -> redis_async.Redis:
    return redis_async.Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
    )


def _client_override() -> redis_async.Redis | None:
    """Hook for tests to inject a fake client; ``None`` means "use the real one"."""
    return _OVERRIDE


_OVERRIDE: redis_async.Redis | None = None


def set_client_for_testing(client: redis_async.Redis | None) -> None:
    """Install a fake Redis client for the duration of a test.

    Pass ``None`` to clear. The wrapper falls back to the singleton when no
    override is set.
    """
    global _OVERRIDE
    _OVERRIDE = client


def _resolve_client() -> redis_async.Redis:
    return _client_override() or _client()


def _encode(value: object) -> str:
    """Serialise the factory's return value to a JSON string.

    Handles Pydantic ``BaseModel``s and dataclasses transparently; anything
    else must already be JSON-serialisable.
    """
    return json.dumps(_to_jsonable(value))


def _to_jsonable(value: object) -> Any:
    """Recursively coerce a value into a JSON-serialisable shape."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _to_jsonable(dataclasses.asdict(value))
    if isinstance(value, list | tuple):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    return value


async def cached(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> T:
    """Read-through cache. Returns Redis value on hit, else calls ``factory``.

    ``key`` MUST encode every parameter that affects the result (we cannot
    introspect it). Use a stable, colon-delimited prefix so ``invalidate``
    can clear a whole namespace at once.

    On any Redis failure (network, decode), we fall back to calling
    ``factory`` directly and return its result without caching — the API
    must keep serving even when Redis is unhealthy.
    """
    client = _resolve_client()
    try:
        raw = await client.get(key)
        if raw is not None:
            return json.loads(raw)  # type: ignore[no-any-return]
    except Exception as exc:  # pragma: no cover — defensive
        log.warning("cache.get.failed", key=key, error=str(exc))

    value = await factory()

    try:
        await client.set(key, _encode(value), ex=ttl_seconds)
    except Exception as exc:  # pragma: no cover — defensive
        log.warning("cache.set.failed", key=key, error=str(exc))
    return value


async def invalidate(prefix: str) -> int:
    """Delete every key whose name starts with ``prefix``. Returns the count.

    Uses ``SCAN`` (not ``KEYS``) to avoid blocking Redis on large keyspaces.
    Safe to call when Redis is empty — returns 0 in that case.
    """
    client = _resolve_client()
    deleted = 0
    pattern = f"{prefix}*"
    try:
        async for k in client.scan_iter(match=pattern, count=500):
            try:
                deleted += await client.delete(k)
            except Exception as exc:  # pragma: no cover — defensive
                log.warning("cache.delete.failed", key=k, error=str(exc))
    except Exception as exc:  # pragma: no cover — defensive
        log.warning("cache.scan.failed", prefix=prefix, error=str(exc))
    log.info("cache.invalidated", prefix=prefix, count=deleted)
    return deleted
