"""Tests for the Listmonk client and the weekly-digest job naming.

We don't talk to a real Listmonk instance here. ``httpx.MockTransport``
lets us assert the exact request shape (URL, body, idempotency behaviour)
without a network round-trip.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from app.newsletter.digest import weekly_campaign_name
from app.newsletter.listmonk import (
    ListmonkClient,
    ListmonkError,
)


def test_weekly_campaign_name_uses_iso_week() -> None:
    # ISO week 19 of 2026 covers May 4-10 (Monday-Sunday).
    assert weekly_campaign_name(date(2026, 5, 10)) == "monitor-weekly-2026-W19"
    # Year-boundary case: 1 Jan 2027 falls in ISO 2026-W53.
    assert weekly_campaign_name(date(2027, 1, 1)) == "monitor-weekly-2026-W53"


# ---------------------------------------------------------------------------
# Listmonk client — using httpx.MockTransport for hermetic API calls.
# ---------------------------------------------------------------------------


def _patch_async_client(monkeypatch: pytest.MonkeyPatch, handler: Any) -> None:
    """Replace ``httpx.AsyncClient`` (as imported by listmonk.py) with one
    bound to ``MockTransport(handler)``. Captures the ORIGINAL class once
    so the wrapper isn't recursive."""
    original_class = httpx.AsyncClient
    transport = httpx.MockTransport(handler)

    def factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs.pop("transport", None)
        return original_class(transport=transport, **kwargs)

    monkeypatch.setattr("app.newsletter.listmonk.httpx.AsyncClient", factory)


def _set_listmonk_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LISTMONK_BASE_URL", "http://listmonk-test")
    monkeypatch.setenv("LISTMONK_API_USER", "u")
    monkeypatch.setenv("LISTMONK_API_KEY", "k")
    monkeypatch.setenv("LISTMONK_LIST_ID", "1")
    from app.core.config import get_settings

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_find_campaign_by_name_returns_existing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "data": {
            "results": [
                {"id": 7, "name": "monitor-weekly-2026-W19", "status": "draft"},
                {"id": 8, "name": "something-else", "status": "running"},
            ],
            "total": 2,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/campaigns"
        return httpx.Response(200, json=payload)

    _patch_async_client(monkeypatch, handler)
    _set_listmonk_env(monkeypatch)

    client = ListmonkClient()
    found = await client.find_campaign_by_name("monitor-weekly-2026-W19")
    assert found == (7, "draft")

    not_found = await client.find_campaign_by_name("monitor-weekly-2026-W20")
    assert not_found is None


@pytest.mark.asyncio
async def test_create_draft_campaign_idempotent_returns_existing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    list_payload = {
        "data": {
            "results": [{"id": 42, "name": "monitor-weekly-2026-W19", "status": "draft"}],
            "total": 1,
        }
    }

    seen_methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_methods.append(request.method)
        return httpx.Response(200, json=list_payload)

    _patch_async_client(monkeypatch, handler)
    _set_listmonk_env(monkeypatch)

    client = ListmonkClient()
    cid = await client.create_draft_campaign(
        name="monitor-weekly-2026-W19",
        subject="s",
        body_html="<p>x</p>",
        from_email="a@b.c",
    )
    assert cid == 42
    # Only the GET (lookup) — no POST, because the campaign already exists.
    assert seen_methods == ["GET"]


@pytest.mark.asyncio
async def test_create_draft_campaign_posts_when_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    posted_bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"data": {"results": [], "total": 0}})
        # POST /api/campaigns
        import json as _json

        posted_bodies.append(_json.loads(request.content.decode()))
        return httpx.Response(200, json={"data": {"id": 99}})

    _patch_async_client(monkeypatch, handler)
    _set_listmonk_env(monkeypatch)

    client = ListmonkClient()
    cid = await client.create_draft_campaign(
        name="monitor-weekly-2026-W19",
        subject="hello",
        body_html="<p>x</p>",
        from_email="a@b.c",
    )
    assert cid == 99
    assert posted_bodies and posted_bodies[0]["name"] == "monitor-weekly-2026-W19"
    assert posted_bodies[0]["lists"] == [1]
    assert posted_bodies[0]["type"] == "regular"
    assert posted_bodies[0]["content_type"] == "html"


@pytest.mark.asyncio
async def test_listmonk_request_error_wrapped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Network failures surface as ``ListmonkError``, not raw httpx exceptions."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)

    _patch_async_client(monkeypatch, handler)
    _set_listmonk_env(monkeypatch)

    client = ListmonkClient()
    with pytest.raises(ListmonkError):
        await client.find_campaign_by_name("anything")
