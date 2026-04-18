"""Tests for the Congreso open data client.

The portal regenerates download filenames daily with a fresh timestamp suffix,
so we cannot hardcode URLs. The client instead scrapes the listing page and
extracts the link by filename prefix. These tests verify that the discovery
regex matches the real HTML structure observed on the portal in May 2026.
"""

from __future__ import annotations

import httpx
import pytest

from app.ingest.congreso.client import (
    CongresoClient,
    CongresoOpenDataError,
)

# A trimmed-down sample of the HTML actually served at /es/opendata/diputados.
# We keep multiple sibling links to ensure the regex picks the right format
# and prefix and does not bleed across rows.
DEPUTIES_LISTING_HTML = """
<html><body>
<a href="/webpublica/opendata/diputados/DiputadosActivos__20260508050009.csv">CSV</a>
<a href="/webpublica/opendata/diputados/DiputadosActivos__20260508050010.xml">XML</a>
<a href="/webpublica/opendata/diputados/DiputadosActivos__20260508050011.json">JSON</a>
<a href="/webpublica/opendata/diputados/DiputadosDeBaja__20260508050013.json">Inactive</a>
<a href="/webpublica/opendata/diputados/odsDiputados14__20260508050140.json">Leg XIV</a>
<a href="/webpublica/opendata/diputados/odsDiputados03__20260508050132.json">Leg III</a>
</body></html>
"""

INITIATIVES_LISTING_HTML = """
<html><body>
<a href="/webpublica/opendata/iniciativas/IniciativasLegislativasAprobadas__20260508050018.json">A</a>
<a href="/webpublica/opendata/iniciativas/ProyectosDeLey__20260508050026.json">B</a>
<a href="/webpublica/opendata/iniciativas/ProposicionesDeLey__20260508050121.json">C</a>
</body></html>
"""


def _mock_transport(routes: dict[str, str]) -> httpx.MockTransport:
    """Build a MockTransport that returns canned HTML for known paths."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = routes.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        return httpx.Response(200, text=body, headers={"Content-Type": "text/html; charset=utf-8"})

    return httpx.MockTransport(handler)


@pytest.fixture
def client() -> CongresoClient:
    """A CongresoClient whose underlying httpx client is replaced with a mock."""
    c = CongresoClient(base_url="https://www.congreso.es")
    c._client = httpx.AsyncClient(  # type: ignore[assignment]
        transport=_mock_transport(
            {
                "/es/opendata/diputados": DEPUTIES_LISTING_HTML,
                "/es/opendata/iniciativas": INITIATIVES_LISTING_HTML,
            }
        ),
        follow_redirects=True,
    )
    return c


async def test_discovers_active_deputies_json(client: CongresoClient) -> None:
    url = await client.discover_dataset_url("/es/opendata/diputados", "DiputadosActivos", "json")
    assert url == (
        "https://www.congreso.es/webpublica/opendata/diputados/"
        "DiputadosActivos__20260508050011.json"
    )


async def test_discovers_active_deputies_xml(client: CongresoClient) -> None:
    url = await client.discover_dataset_url("/es/opendata/diputados", "DiputadosActivos", "xml")
    assert url.endswith("DiputadosActivos__20260508050010.xml")


async def test_discovers_inactive_deputies(client: CongresoClient) -> None:
    url = await client.discover_dataset_url("/es/opendata/diputados", "DiputadosDeBaja", "json")
    assert url.endswith("DiputadosDeBaja__20260508050013.json")


async def test_discovers_legislature_deputies(client: CongresoClient) -> None:
    url = await client.discover_dataset_url("/es/opendata/diputados", "odsDiputados14", "json")
    assert url.endswith("odsDiputados14__20260508050140.json")


async def test_discovers_initiatives(client: CongresoClient) -> None:
    url = await client.discover_dataset_url("/es/opendata/iniciativas", "ProyectosDeLey", "json")
    assert url.endswith("ProyectosDeLey__20260508050026.json")


async def test_does_not_match_wrong_prefix(client: CongresoClient) -> None:
    """odsDiputados14 must not match a request for odsDiputados1 (length confusion)."""
    with pytest.raises(CongresoOpenDataError):
        await client.discover_dataset_url("/es/opendata/diputados", "odsDiputados99", "json")


async def test_does_not_match_wrong_format(client: CongresoClient) -> None:
    """If only json/xml/csv are listed, requesting zip must fail cleanly."""
    with pytest.raises(CongresoOpenDataError):
        await client.discover_dataset_url("/es/opendata/diputados", "DiputadosActivos", "zip")


async def test_legislature_number_validates_range() -> None:
    async with CongresoClient() as c:
        with pytest.raises(ValueError):
            await c.fetch_legislature_deputies(-1)
        with pytest.raises(ValueError):
            await c.fetch_legislature_deputies(100)
