"""Smoke / shape tests for the public bulk dump endpoints.

These run against whatever database the FastAPI app is configured to
talk to (the live development DB in CI/local; a seeded fixture
database when the project gains a proper integration test rig).
Because the endpoints are read-only and the project's principle is
"don't break existing endpoints; ADD only," we assert on JSON shape,
the presence of the ``data_license`` envelope key, and HTTP status —
not on row counts or specific row values, which would couple tests to
ingestion state.

Skip semantics: if the database is empty (e.g. fresh CI checkout with
no ingest run), we still expect a 200 with ``count: 0`` — every
endpoint must return a well-formed envelope for the empty case.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient


def _assert_envelope(payload: Any) -> dict[str, Any]:
    """Common shape assertions every dump endpoint must satisfy."""
    assert isinstance(payload, dict), "Dump response must be a JSON object"
    assert payload.get("data_license") == "CC-BY 4.0"
    assert "generated_at" in payload and isinstance(payload["generated_at"], str)
    assert "count" in payload and isinstance(payload["count"], int)
    assert "items" in payload and isinstance(payload["items"], list)
    assert payload["count"] == len(payload["items"])
    return payload


async def test_dump_deputies_returns_envelope(client: AsyncClient) -> None:
    """``/dump/deputies`` returns the standard envelope and items list."""
    response = await client.get("/dump/deputies", params={"legislature_id": 1})
    assert response.status_code == 200, response.text
    payload = _assert_envelope(response.json())
    assert payload.get("legislature_id") == 1
    # Each deputy row must carry the canonical keys, even when empty.
    for row in payload["items"]:
        assert "person_id" in row
        assert "mandate_id" in row
        assert "full_name" in row
        assert "current_group" in row  # may be None
        assert "constituency" in row


async def test_dump_deputies_requires_legislature_id(client: AsyncClient) -> None:
    """Missing required query param yields 422."""
    response = await client.get("/dump/deputies")
    assert response.status_code == 422


async def test_dump_votes_returns_envelope(client: AsyncClient) -> None:
    """``/dump/votes`` returns the envelope and per-row aggregate counts."""
    response = await client.get("/dump/votes", params={"legislature_id": 1})
    assert response.status_code == 200, response.text
    payload = _assert_envelope(response.json())
    assert payload.get("legislature_id") == 1
    for row in payload["items"]:
        for key in (
            "id",
            "title",
            "voted_at",
            "result",
            "ayes",
            "noes",
            "abstentions",
            "absent",
        ):
            assert key in row, f"vote row missing {key}"


async def test_dump_votes_accepts_date_range(client: AsyncClient) -> None:
    """The optional ``from`` / ``to`` query params are accepted and echoed."""
    response = await client.get(
        "/dump/votes",
        params={
            "legislature_id": 1,
            "from": "2024-01-01",
            "to": "2024-12-31",
        },
    )
    assert response.status_code == 200, response.text
    payload = _assert_envelope(response.json())
    assert payload.get("date_from") == "2024-01-01"
    assert payload.get("date_to") == "2024-12-31"


async def test_dump_vote_records_unknown_id_returns_404(client: AsyncClient) -> None:
    """An unknown vote id propagates as 404 and is not cached as success."""
    response = await client.get("/dump/vote-records", params={"vote_id": 999_999_999})
    assert response.status_code == 404
    body = response.json()
    assert body.get("detail") == "Vote not found"


async def test_dump_vote_records_returns_envelope_when_present(
    client: AsyncClient,
) -> None:
    """When the DB has at least one vote, ``/dump/vote-records`` returns its records.

    We discover a real vote id by hitting ``/dump/votes`` first so the
    test stays decoupled from any specific vote id seeded in fixtures.
    If the DB has no votes at all, the assertion is skipped (the empty
    case is covered by the 404 test above for a nonexistent id).
    """
    votes_resp = await client.get("/dump/votes", params={"legislature_id": 1})
    assert votes_resp.status_code == 200
    votes_payload = votes_resp.json()
    items = votes_payload.get("items", [])
    if not items:
        pytest.skip("No votes in DB — vote-records shape test cannot run")

    vote_id = items[0]["id"]
    response = await client.get("/dump/vote-records", params={"vote_id": vote_id})
    assert response.status_code == 200, response.text
    payload = _assert_envelope(response.json())
    assert payload.get("vote_id") == vote_id
    assert "vote_title" in payload
    assert "voted_at" in payload
    assert "result" in payload
    for row in payload["items"]:
        assert "id" in row
        assert "mandate_id" in row
        assert "choice" in row
        assert "person" in row and "full_name" in row["person"]


async def test_dump_initiatives_returns_envelope(client: AsyncClient) -> None:
    """``/dump/initiatives`` returns each initiative with its (possibly empty) topics."""
    response = await client.get("/dump/initiatives", params={"legislature_id": 1})
    assert response.status_code == 200, response.text
    payload = _assert_envelope(response.json())
    assert payload.get("legislature_id") == 1
    for row in payload["items"]:
        for key in ("id", "type", "official_id", "title_original", "status", "topics"):
            assert key in row, f"initiative row missing {key}"
        assert isinstance(row["topics"], list)


async def test_openapi_lists_dump_endpoints(client: AsyncClient) -> None:
    """The public OpenAPI spec advertises the four dump endpoints."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    paths = spec.get("paths", {})
    for expected in (
        "/dump/deputies",
        "/dump/votes",
        "/dump/vote-records",
        "/dump/initiatives",
    ):
        assert expected in paths, f"OpenAPI missing {expected}"


async def test_docs_ui_is_public(client: AsyncClient) -> None:
    """Swagger UI is served at /docs and contains the canonical title."""
    response = await client.get("/docs")
    assert response.status_code == 200
    assert "Monitor Parlamentari API" in response.text or "swagger" in response.text.lower()


async def test_dump_cors_open_for_third_parties(client: AsyncClient) -> None:
    """Dump endpoints emit ``Access-Control-Allow-Origin: *`` for external Origins."""
    response = await client.get(
        "/dump/deputies",
        params={"legislature_id": 1},
        headers={"Origin": "https://example-newsroom.test"},
    )
    assert response.status_code == 200
    allow_origin = response.headers.get("access-control-allow-origin")
    # Either explicit "*" (current config) or echo of the requesting origin
    # is acceptable; both indicate the dump is reachable from external JS.
    assert allow_origin in {"*", "https://example-newsroom.test"}
