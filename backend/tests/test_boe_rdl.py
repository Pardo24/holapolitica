"""Finding a Real Decreto-ley in the BOE from its title, and reading it.

The fixtures are real boe.es responses recorded on 2026-10-08 (the daily
summaries trimmed to a few items): the ELI XML of RDL 8/2026, the XML of
RDL 8/2025 (BOE-A-2025-14083), the summaries of 8 and 9 July 2025, and the
HTML page ELI answers with when an address does not exist.
"""

from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import httpx
import pytest

from app.ingest.boe import (
    USER_AGENT,
    BoeClient,
    RdlRef,
    find_rdl_in_summary,
    parse_boe_document,
    parse_rdl_title,
    resolve_rdl,
)
from app.services.law_text import analysis_source, clip_text

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# --- title → number ----------------------------------------------------


def test_parses_number_year_and_signature_date() -> None:
    ref = parse_rdl_title(
        "Real Decreto-ley 8/2026, de 20 de marzo, de medidas en el alquiler en respuesta "
        "a las consecuencias económicas y sociales de la Guerra de Irán."
    )
    assert ref == RdlRef(number=8, year=2026, signed=date(2026, 3, 20))
    assert ref.official_number == "8/2026"
    assert ref.eli_xml_url == "https://www.boe.es/eli/es/rdl/2026/03/20/8/dof/spa/xml"


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        # Two-digit number, single-digit day.
        (
            "Real Decreto-ley 23/2026, de 8 de septiembre, por el que se adoptan medidas",
            RdlRef(23, 2026, date(2026, 9, 8)),
        ),
        # Signed in December, Congress record opened in January.
        (
            "Real Decreto-ley 8/2023, de 27 de diciembre, por el que se adoptan medidas",
            RdlRef(8, 2023, date(2023, 12, 27)),
        ),
        # Ordinal day, lower case, no comma, extra spaces.
        ("real decreto-ley  3/2025 de 1º de abril", RdlRef(3, 2025, date(2025, 4, 1))),
        # "Decreto ley" without a hyphen, and the old spelling of September.
        ("Real Decreto ley 10/2025, de 23 de setiembre", RdlRef(10, 2025, date(2025, 9, 23))),
    ],
)
def test_title_variants(title: str, expected: RdlRef) -> None:
    assert parse_rdl_title(title) == expected


@pytest.mark.parametrize(
    "title",
    [
        None,
        "",
        "Proyecto de Ley de movilidad sostenible",
        # Not a month.
        "Real Decreto-ley 4/2025, de 8 de abrill",
        # An impossible date.
        "Real Decreto-ley 4/2025, de 31 de abril",
        # A Royal Decree, not a Decree-law.
        "Real Decreto 598/2025, de 7 de julio, por el que se nombra Magistrada",
    ],
)
def test_titles_that_name_no_rdl(title: str | None) -> None:
    assert parse_rdl_title(title) is None


# --- BOE documents and summaries --------------------------------------


def test_reads_the_published_document() -> None:
    doc = parse_boe_document(_fixture("boe_eli_rdl_8_2026.xml"))
    assert doc is not None
    assert doc.boe_id == "BOE-A-2026-6545"
    assert doc.rank_code == "1320"
    assert doc.official_number == "8/2026"
    assert doc.title.startswith("Real Decreto-ley 8/2026, de 20 de marzo")
    assert doc.publication_date == date(2026, 3, 21)
    assert doc.url == "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-6545"
    # The body, one line per block, without the metadata or references.
    assert len(doc.text) > 5_000
    assert "Artículo 1" in doc.text
    assert "BOE-A-2026-6545" not in doc.text
    assert all(line == line.strip() and line for line in doc.text.split("\n"))


def test_an_eli_error_page_is_no_document() -> None:
    assert parse_boe_document(_fixture("boe_eli_not_found.html")) is None
    assert parse_boe_document(b"") is None


def test_finds_the_rdl_in_its_daily_summary() -> None:
    ref = RdlRef(8, 2025, date(2025, 7, 8))
    on_the_day = json.loads(_fixture("boe_sumario_20250708.json"))
    next_day = json.loads(_fixture("boe_sumario_20250709.json"))
    assert find_rdl_in_summary(on_the_day, ref) is None
    assert find_rdl_in_summary(next_day, ref) == "BOE-A-2025-14083"
    # Another number in the same issue is not it.
    assert find_rdl_in_summary(next_day, RdlRef(18, 2025, date(2025, 7, 8))) is None
    assert find_rdl_in_summary({"data": ""}, ref) is None


def test_a_title_that_only_mentions_the_rdl_does_not_match() -> None:
    payload = {
        "data": {
            "sumario": {
                "diario": [
                    {
                        "seccion": {
                            "codigo": "1",
                            "departamento": {
                                "epigrafe": {
                                    "item": {
                                        "identificador": "BOE-A-2025-99999",
                                        "titulo": "Corrección de errores del Real Decreto-ley "
                                        "8/2025, de 8 de julio.",
                                    }
                                }
                            },
                        }
                    }
                ]
            }
        }
    }
    assert find_rdl_in_summary(payload, RdlRef(8, 2025, date(2025, 7, 8))) is None


# --- the lookup, over recorded responses -------------------------------


def _boe(routes: dict[str, tuple[int, bytes]], seen: list[str]) -> BoeClient:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        seen.append(url)
        status, body = routes.get(url, (404, b'{"status":{"code":"404"}}'))
        return httpx.Response(status, content=body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return BoeClient(client, min_interval_s=0)


async def test_resolves_through_eli_in_one_request() -> None:
    ref = RdlRef(8, 2026, date(2026, 3, 20))
    seen: list[str] = []
    routes = {ref.eli_xml_url: (200, _fixture("boe_eli_rdl_8_2026.xml"))}
    async with _boe(routes, seen) as boe:
        doc = await resolve_rdl(boe, ref)
    assert doc is not None and doc.boe_id == "BOE-A-2026-6545"
    assert seen == [ref.eli_xml_url]


async def test_falls_back_to_the_daily_summaries() -> None:
    ref = RdlRef(8, 2025, date(2025, 7, 8))
    summary = "https://www.boe.es/datosabiertos/api/boe/sumario/"
    doc_xml = "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2025-14083"
    routes = {
        ref.eli_xml_url: (200, _fixture("boe_eli_not_found.html")),
        summary + "20250708": (200, _fixture("boe_sumario_20250708.json")),
        summary + "20250709": (200, _fixture("boe_sumario_20250709.json")),
        doc_xml: (200, _fixture("boe_doc_BOE-A-2025-14083.xml")),
    }
    seen: list[str] = []
    async with _boe(routes, seen) as boe:
        doc = await resolve_rdl(boe, ref)
    assert doc is not None
    assert doc.boe_id == "BOE-A-2025-14083"
    assert doc.entry_in_force == date(2025, 7, 9)
    assert seen == [ref.eli_xml_url, summary + "20250708", summary + "20250709", doc_xml]


async def test_a_document_with_another_number_is_rejected() -> None:
    # ELI answers, but with a different norm: the metadata decide.
    ref = RdlRef(9, 2026, date(2026, 3, 20))
    routes = {ref.eli_xml_url: (200, _fixture("boe_eli_rdl_8_2026.xml"))}
    seen: list[str] = []
    async with _boe(routes, seen) as boe:
        assert await resolve_rdl(boe, ref) is None
    # ELI, then every day of the window (all 404 here).
    assert len(seen) == 1 + 6


async def test_requests_are_paced_and_identified() -> None:
    agents: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        agents.append(request.headers.get("user-agent", ""))
        return httpx.Response(404)

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT}
    )
    async with BoeClient(client, min_interval_s=0.05) as boe:
        start = time.monotonic()
        for _ in range(3):
            await boe.get("https://www.boe.es/x")
        elapsed = time.monotonic() - start
    assert elapsed >= 0.1
    assert all("holapolitica" in a for a in agents)


# --- what the analysis is marked with -------------------------------------


def test_source_says_which_text_was_read() -> None:
    assert analysis_source("bocg", truncated=False) == "full"
    assert analysis_source("bocg", truncated=True) == "partial"
    assert analysis_source("boe", truncated=False) == "boe_full"
    assert analysis_source("boe", truncated=True) == "boe_partial"
    assert clip_text("abc") == ("abc", False)
    long_text, cut = clip_text("x" * 70_000)
    assert cut and len(long_text) == 60_000
