"""API access: our frontend passes, bulk downloads need a key, IPs are limited.

See app/core/api_access.py. Redis is faked in memory; the key lookup
(database) is not exercised here, only what happens without a key.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.core import api_access
from app.services import cache

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class FakePipeline:
    def __init__(self, r: FakeRedis) -> None:
        self.r = r
        self.ops: list[tuple[str, tuple[Any, ...]]] = []

    def __getattr__(self, name: str) -> Any:
        def queue(*args: Any) -> FakePipeline:
            self.ops.append((name, args))
            return self

        return queue

    async def execute(self) -> list[Any]:
        return [getattr(self.r, f"_{name}")(*args) for name, args in self.ops]


class FakeRedis:
    def __init__(self) -> None:
        self.kv: dict[str, Any] = {}
        self.h: dict[str, dict[str, str]] = defaultdict(dict)

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)

    def _hincrby(self, k: str, f: str, n: int) -> int:
        self.h[k][f] = str(int(self.h[k].get(f, "0")) + n)
        return int(self.h[k][f])

    def _hsetnx(self, k: str, f: str, v: str) -> int:
        if f in self.h[k]:
            return 0
        self.h[k][f] = v
        return 1

    def _incr(self, k: str) -> int:
        self.kv[k] = int(self.kv.get(k, 0)) + 1
        return int(self.kv[k])

    def _expire(self, k: str, s: int) -> bool:
        return True

    async def get(self, k: str) -> Any:
        return self.kv.get(k)

    async def set(self, k: str, v: Any, ex: int | None = None) -> None:
        self.kv[k] = v

    async def hgetall(self, k: str) -> dict[str, str]:
        return dict(self.h[k])


@pytest.fixture
def redis() -> AsyncIterator[FakeRedis]:
    fake = FakeRedis()
    cache.set_client_for_testing(fake)  # type: ignore[arg-type]
    yield fake  # type: ignore[misc]
    cache.set_client_for_testing(None)


def make_client(*, enforce: bool, per_minute: int = 300) -> httpx.AsyncClient:
    async def ok(request: Any) -> JSONResponse:
        return JSONResponse({"ok": True})

    inner = Starlette(routes=[Route("/votes", ok), Route("/dump/votes", ok), Route("/health", ok)])
    mw = api_access.ApiAccessMiddleware(inner)
    mw.internal = ["frontend-secret"]
    mw.enforce = enforce
    mw.anon_minute = per_minute
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=mw), base_url="http://t")


async def test_frontend_is_not_counted(redis: FakeRedis) -> None:
    async with make_client(enforce=True, per_minute=1) as c:
        for _ in range(3):
            r = await c.get("/votes", headers={"X-HP-Key": "frontend-secret"})
            assert r.status_code == 200
    assert redis.h[api_access.week_key()] == {}


async def test_dump_needs_a_key(redis: FakeRedis) -> None:
    async with make_client(enforce=True) as c:
        r = await c.get("/dump/votes")
    assert r.status_code == 401
    assert "apidocs" in r.json()["detail"]


async def test_ip_limit_only_when_enforced(redis: FakeRedis) -> None:
    async with make_client(enforce=False, per_minute=2) as c:
        codes = [
            (await c.get("/votes", headers={"X-Forwarded-For": "1.2.3.4"})).status_code
            for _ in range(4)
        ]
    assert codes == [200, 200, 200, 200]
    assert redis.h[api_access.week_key()]["ip:1.2.3.4"] == "4"

    async with make_client(enforce=True, per_minute=2) as c:
        codes = [
            (await c.get("/votes", headers={"X-Forwarded-For": "5.6.7.8"})).status_code
            for _ in range(3)
        ]
    assert codes == [200, 200, 429]


async def test_health_is_never_metered(redis: FakeRedis) -> None:
    async with make_client(enforce=True, per_minute=0) as c:
        assert (await c.get("/health")).status_code == 200
