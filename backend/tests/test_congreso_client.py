"""Tests for the Congreso open data client.

The portal regenerates download filenames daily with a fresh timestamp suffix,
so we cannot hardcode URLs. The client instead scrapes the listing page and
extracts the link by filename prefix. These tests verify that the discovery
regex matches the real HTML structure observed on the portal in May 2026.
"""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.ingest.congreso.client import (
    CongresoClient,
    CongresoOpenDataError,
    _is_retryable_http_error,
    parse_vote_xml_urls,
)
from app.ingest.congreso.votes import parse_session_zip

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


# ---------------------------------------------------------------------------
# Missing-aggregate-ZIP fallback (historical sessions, legislatures X/XII)
# ---------------------------------------------------------------------------

# Path layout of the failing sessions, e.g.:
#   /webpublica/opendata/votaciones/Leg12/Sesion026/20170202/VOT_<ts>.zip   -> 404
#   /webpublica/opendata/votaciones/Leg12/Sesion026/20170202/Votacion001/VOT_<ts>.xml -> 200
_SESSION_DIR = "/webpublica/opendata/votaciones/Leg12/Sesion026/20170202"
_SESSION_ZIP_PATH = f"{_SESSION_DIR}/VOT_20201204142428.zip"
_TARGET_DATE = date(2017, 2, 2)


def _vote_xml(vote_number: int, *, voto: str) -> bytes:
    """Minimal but schema-valid per-vote XML (ASCII-only, ISO-8859-1 prolog)."""
    return (
        '<?xml version="1.0" encoding="ISO-8859-1"?>'
        "<Resultado>"
        "<Informacion>"
        "<Sesion>26</Sesion>"
        f"<NumeroVotacion>{vote_number}</NumeroVotacion>"
        "<Fecha>2/2/2017</Fecha>"
        f"<Titulo>Votacion de prueba {vote_number}</Titulo>"
        "<TextoExpediente>Texto</TextoExpediente>"
        "</Informacion>"
        "<Totales>"
        "<Presentes>2</Presentes><AFavor>1</AFavor><EnContra>1</EnContra>"
        "<Abstenciones>0</Abstenciones><NoVotan>0</NoVotan>"
        "</Totales>"
        "<Votaciones>"
        f"<Votacion><Asiento>1</Asiento><Diputado>Foo, Bar</Diputado>"
        f"<Grupo>GP</Grupo><Voto>{voto}</Voto></Votacion>"
        "</Votaciones>"
        "</Resultado>"
    ).encode("iso-8859-1")


def _portlet_html(*, n_votes: int, with_xml: bool) -> str:
    """Portlet HTML rendering one session: an aggregate ZIP link plus per-vote
    XML links (the XML links omitted when ``with_xml`` is False)."""
    rows = [f'<a href="{_SESSION_ZIP_PATH}">Descargar todas</a>']
    for i in range(1, n_votes + 1):
        if with_xml:
            xml = f"{_SESSION_DIR}/Votacion{i:03d}/VOT_2020120414242{i}.xml"
            rows.append(f'<a href="{xml}">XML</a>')
    return "<html><body>" + "\n".join(rows) + "</body></html>"


def _vote_aware_transport(*, zip_status: int, with_xml: bool, n_votes: int) -> httpx.MockTransport:
    """MockTransport serving the portlet HTML, a (configurable) ZIP response,
    and per-vote XML payloads keyed by their /VotacionNNN/ path segment."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/es/opendata/votaciones":
            return httpx.Response(
                200,
                text=_portlet_html(n_votes=n_votes, with_xml=with_xml),
                headers={"Content-Type": "text/html; charset=utf-8"},
            )
        if path == _SESSION_ZIP_PATH:
            if zip_status == 200:
                return httpx.Response(200, content=b"PK\x03\x04not-a-real-zip")
            return httpx.Response(zip_status)
        if "/Votacion" in path and path.endswith(".xml"):
            vote_number = int(path.split("/Votacion")[1][:3])
            voto = "Si" if vote_number % 2 else "No"
            return httpx.Response(200, content=_vote_xml(vote_number, voto=voto))
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _client_with(transport: httpx.MockTransport) -> CongresoClient:
    c = CongresoClient(base_url="https://www.congreso.es")
    c._client = httpx.AsyncClient(transport=transport, follow_redirects=True)  # type: ignore[assignment]
    return c


async def test_session_zip_falls_back_to_per_vote_xml_on_404() -> None:
    """When the aggregate ZIP 404s, the bundle is rebuilt from per-vote XML."""
    c = _client_with(_vote_aware_transport(zip_status=404, with_xml=True, n_votes=3))
    bundle = await c.fetch_session_zip_for_date("XII", _TARGET_DATE)

    assert bundle is not None
    assert bundle.ref.session_number == 26
    assert bundle.ref.date == _TARGET_DATE
    # The synthesized ZIP must parse through the real importer parser.
    votes = parse_session_zip(bundle.zip_bytes)
    assert [v.vote_number for v in votes] == [1, 2, 3]
    assert votes[0].records[0].deputy_name_raw == "Foo, Bar"


async def test_session_zip_reraises_404_when_no_per_vote_xml() -> None:
    """A 404 ZIP with no per-vote XML is genuinely unrecoverable -> re-raise."""
    c = _client_with(_vote_aware_transport(zip_status=404, with_xml=False, n_votes=3))
    with pytest.raises(httpx.HTTPStatusError) as exc:
        await c.fetch_session_zip_for_date("XII", _TARGET_DATE)
    assert exc.value.response.status_code == 404


async def test_session_zip_uses_aggregate_when_present() -> None:
    """When the aggregate ZIP is served (200), the fallback is not triggered."""
    c = _client_with(_vote_aware_transport(zip_status=200, with_xml=True, n_votes=3))
    bundle = await c.fetch_session_zip_for_date("XII", _TARGET_DATE)
    assert bundle is not None
    assert bundle.zip_bytes == b"PK\x03\x04not-a-real-zip"


def test_parse_vote_xml_urls_absolutizes_and_dedupes() -> None:
    html = _portlet_html(n_votes=2, with_xml=True)
    urls = parse_vote_xml_urls(html, base_url="https://www.congreso.es")
    assert set(urls) == {1, 2}
    assert urls[1] == (
        "https://www.congreso.es" + f"{_SESSION_DIR}/Votacion001/VOT_20201204142421.xml"
    )


def test_parse_vote_xml_urls_empty_when_no_links() -> None:
    assert parse_vote_xml_urls(_portlet_html(n_votes=3, with_xml=False)) == {}


def test_retry_predicate_skips_4xx_but_retries_5xx_and_transport() -> None:
    def status_error(code: int) -> httpx.HTTPStatusError:
        req = httpx.Request("GET", "https://x/")
        return httpx.HTTPStatusError("e", request=req, response=httpx.Response(code, request=req))

    assert _is_retryable_http_error(status_error(404)) is False
    assert _is_retryable_http_error(status_error(403)) is False
    assert _is_retryable_http_error(status_error(503)) is True
    assert _is_retryable_http_error(httpx.ConnectError("boom")) is True
