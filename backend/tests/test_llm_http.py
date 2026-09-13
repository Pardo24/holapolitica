"""Tests for the shared LLM transport (spacing, backoff, zero-quota stop).

Hermetic: requests go to an :class:`httpx.MockTransport`, and the
module's ``_sleep`` is replaced so waits are recorded, not slept.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from app.services import llm_http

URL = "https://llm.example/v1/chat/completions"


def _client(responses: list[httpx.Response]) -> tuple[httpx.AsyncClient, list[int]]:
    calls: list[int] = []

    def handler(_request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return responses.pop(0)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    recorded: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        recorded.append(seconds)

    monkeypatch.setattr(llm_http, "_sleep", fake_sleep)
    monkeypatch.setattr(llm_http, "_last_call", 0.0)
    return recorded


async def _post(client: httpx.AsyncClient, min_interval_s: float = 0.0) -> httpx.Response:
    return await llm_http.post_llm(
        client, URL, json_body={"x": 1}, headers={}, min_interval_s=min_interval_s
    )


@pytest.mark.asyncio
async def test_zero_quota_stops_after_one_call(sleeps: list[float]) -> None:
    client, calls = _client(
        [httpx.Response(429, headers={"x-ratelimit-limit-req-minute": "0"}, text="{}")]
    )
    with pytest.raises(llm_http.LLMUnavailableError):
        await _post(client)
    assert len(calls) == 1
    assert sleeps == []


@pytest.mark.asyncio
async def test_429_honours_retry_after_then_succeeds(sleeps: list[float]) -> None:
    client, calls = _client(
        [
            httpx.Response(429, headers={"retry-after": "3"}),
            httpx.Response(200, json={"ok": True}),
        ]
    )
    response = await _post(client)
    assert response.status_code == 200
    assert len(calls) == 2
    assert sleeps == [3.0]


@pytest.mark.asyncio
async def test_server_errors_back_off_then_raise(sleeps: list[float]) -> None:
    client, calls = _client([httpx.Response(503) for _ in range(4)])
    with pytest.raises(httpx.HTTPStatusError):
        await _post(client)
    assert len(calls) == 4
    assert sleeps == [5.0, 15.0, 45.0]


@pytest.mark.asyncio
async def test_calls_are_spaced_by_min_interval(sleeps: list[float]) -> None:
    ok: Callable[[], httpx.Response] = lambda: httpx.Response(200, json={})  # noqa: E731
    client, calls = _client([ok(), ok()])
    await _post(client, min_interval_s=1.5)
    await _post(client, min_interval_s=1.5)
    assert len(calls) == 2
    # The first call has nothing to wait for; the second waits out the gap.
    assert len(sleeps) == 1
    assert 1.0 < sleeps[0] <= 1.5
