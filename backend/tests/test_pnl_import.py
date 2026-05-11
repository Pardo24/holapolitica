"""Tests for the PNL (Proposición no de Ley) scraper.

We do **not** hit the live Congreso portlet from tests. Instead we mount
an :class:`httpx.MockTransport` against a :class:`PnlSearchClient` and
serve canned JSON responses captured from the real endpoint at
https://www.congreso.es/es/busqueda-de-iniciativas (verified May 2026).

The fixtures here trim the real response to the keys the parser
consumes and keep ``id_iniciativa`` values that the matching backfill
logic exercises elsewhere (``162/000789`` already appears in
``test_vote_initiative_linkage.py`` — same legislature, same series).
"""

from __future__ import annotations

import json
from datetime import date

import httpx
import pytest

from app.ingest.congreso.pnl import (
    PNL_TIPO_CODE,
    PnlSearchClient,
    _form_body,
    collect_pnl_records,
    parse_pnl_page,
    parse_pnl_record,
)

# A two-page response — total=27, page size 25 — exercising the
# paginator's stop-on-collected-total branch and the dict-key ordering
# coming back from ``lista_iniciativas``.
PAGE_1_PAYLOAD = json.dumps(
    {
        "titulo_contenido": " XV Legislatura",
        "iniciativas_encontradas": "27",
        "lista_iniciativas": {
            f"iniciativa{i}": {
                "atis": "Función de orientación política",
                "tipo": "Proposición no de Ley ante el Pleno.",
                "atip": "Proposiciones no de Ley",
                "legislatura": "XV",
                "doc": str(i),
                "titulo": (f"Proposición no de Ley número {i} sobre un asunto de interés general."),
                "fecha_calificado": "11/05/2026",
                "fecha_presentado": "08/05/2026",
                # IDs descend from /000789 — page 1 in the real portal
                # serves the newest first.
                "id_iniciativa": f"162/{790 - i:06d}",
                "autor": (
                    "Grupo Parlamentario Popular en el Congreso"
                    if i % 2 == 0
                    else "Grupo Parlamentario Socialista"
                ),
            }
            for i in range(1, 26)
        },
        "paginacion": {
            "docs_ini": "1",
            "docs_fin": "25",
        },
    },
    ensure_ascii=False,
)

PAGE_2_PAYLOAD = json.dumps(
    {
        "titulo_contenido": " XV Legislatura",
        "iniciativas_encontradas": "27",
        "lista_iniciativas": {
            f"iniciativa{i}": {
                "legislatura": "XV",
                "doc": str(i),
                "titulo": f"Proposición no de Ley número {i} (segunda página).",
                "fecha_presentado": "01/05/2026",
                "id_iniciativa": f"162/{790 - i:06d}",
                "autor": "Grupo Parlamentario Mixto",
            }
            for i in range(26, 28)
        },
        "paginacion": {
            "docs_ini": "26",
            "docs_fin": "27",
        },
    },
    ensure_ascii=False,
)

# What the portlet returns when paginaActual overshoots the result set.
EMPTY_PAYLOAD = "{}"


def _build_mocked_client(pages: dict[int, str]) -> PnlSearchClient:
    """Build a :class:`PnlSearchClient` whose transport returns canned JSON.

    ``pages`` maps the 1-based page index to the JSON body the mocked
    transport will return for that page.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        # The endpoint is POST x-www-form-urlencoded. The mock returns
        # the body for the requested page; we parse the body so the test
        # also validates that the client sent the right paginaActual.
        body_params = httpx.QueryParams(request.content.decode("utf-8"))
        page_str = body_params.get("_iniciativas_paginaActual", "1")
        body = pages.get(int(page_str), EMPTY_PAYLOAD)
        return httpx.Response(
            200,
            content=body.encode("utf-8"),
            headers={"Content-Type": "application/json; charset=UTF-8"},
        )

    c = PnlSearchClient(base_url="https://www.congreso.es")
    c._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        follow_redirects=True,
    )
    return c


# --- pure-function tests --------------------------------------------------


def test_parse_pnl_record_extracts_id_title_and_date() -> None:
    raw = {
        "id_iniciativa": "162/000789",
        "titulo": (
            "Proposición no de Ley sobre el cierre programado de la Central Nuclear de\n"
            "Almaraz y del resto de la generación nuclear en España."
        ),
        "fecha_presentado": "08/05/2026",
        "autor": "Grupo Parlamentario Popular en el Congreso",
        "tipo": "Proposición no de Ley ante el Pleno.",
    }
    parsed = parse_pnl_record(raw)
    assert parsed.official_id == "162/000789"
    assert parsed.type_code == "proposicion_no_ley"
    # Whitespace inside the title is collapsed to single spaces.
    assert parsed.title == (
        "Proposición no de Ley sobre el cierre programado de la Central Nuclear "
        "de Almaraz y del resto de la generación nuclear en España."
    )
    assert parsed.submitted_at == date(2026, 5, 8)
    assert parsed.submitted_by == "Grupo Parlamentario Popular en el Congreso"
    assert parsed.source_url is None
    assert parsed.situation_raw is None
    assert parsed.result_raw is None


def test_parse_pnl_record_handles_missing_optional_fields() -> None:
    raw = {
        "id_iniciativa": "162/000010",
        "titulo": "Algo",
        # No fecha_presentado, no autor.
    }
    parsed = parse_pnl_record(raw)
    assert parsed.official_id == "162/000010"
    assert parsed.submitted_at is None
    assert parsed.submitted_by is None


def test_parse_pnl_record_requires_id_iniciativa() -> None:
    with pytest.raises(KeyError):
        parse_pnl_record({"titulo": "Sin expediente"})


def test_parse_pnl_page_handles_empty_payload() -> None:
    page = parse_pnl_page(b"{}")
    assert page.total == 0
    assert page.items == []


def test_parse_pnl_page_orders_items_numerically() -> None:
    """Dict keys come back as ``iniciativa1``, ``iniciativa2``, …;
    lexicographic order would put ``iniciativa10`` before ``iniciativa2``.
    """
    page = parse_pnl_page(PAGE_1_PAYLOAD.encode("utf-8"))
    assert page.total == 27
    assert len(page.items) == 25
    assert page.items[0]["doc"] == "1"
    # iniciativa10 must come AFTER iniciativa9, not after iniciativa1.
    docs = [item["doc"] for item in page.items]
    assert docs == [str(i) for i in range(1, 26)]


def test_form_body_includes_every_required_key() -> None:
    body = _form_body("XV", page=3)
    assert body["_iniciativas_legislatura"] == "XV"
    assert body["_iniciativas_tipo"] == PNL_TIPO_CODE
    assert body["_iniciativas_paginaActual"] == "3"
    # The portlet rejects requests with missing keys; every documented
    # filter key must be present.
    for k in (
        "_iniciativas_titulo",
        "_iniciativas_texto",
        "_iniciativas_autor",
        "_iniciativas_competencias",
        "_iniciativas_tramitacion",
        "_iniciativas_fechaDesde",
    ):
        assert k in body


# --- integration test against the mocked transport ------------------------


async def test_collect_pnl_records_walks_pagination() -> None:
    client = _build_mocked_client({1: PAGE_1_PAYLOAD, 2: PAGE_2_PAYLOAD})
    records = await collect_pnl_records(
        "XV",
        client=client,
        inter_page_delay_s=0.0,
    )
    assert len(records) == 27
    # First-page leader is 162/000789, last-page trailer is 162/000763.
    assert records[0]["id_iniciativa"] == "162/000789"
    assert records[-1]["id_iniciativa"] == "162/000763"


async def test_collect_pnl_records_stops_on_empty_page() -> None:
    """A short result set (page 1 only) must terminate without paging on."""
    short_payload = json.dumps(
        {
            "iniciativas_encontradas": "1",
            "lista_iniciativas": {
                "iniciativa1": {
                    "id_iniciativa": "162/000001",
                    "titulo": "Single",
                    "fecha_presentado": "01/01/2024",
                    "autor": "Grupo Parlamentario Mixto",
                },
            },
        }
    )
    client = _build_mocked_client({1: short_payload})
    records = await collect_pnl_records("XV", client=client, inter_page_delay_s=0.0)
    assert len(records) == 1
    assert records[0]["id_iniciativa"] == "162/000001"


async def test_collect_pnl_records_terminates_when_portal_overcounts() -> None:
    """Defensive: if iniciativas_encontradas overstates the real count,
    the empty-page branch must still stop the loop instead of looping
    forever against the ``{}`` response from page N+1.
    """
    # ``iniciativas_encontradas`` says 9999 but only page 1 has content.
    payload = json.dumps(
        {
            "iniciativas_encontradas": "9999",
            "lista_iniciativas": {
                "iniciativa1": {
                    "id_iniciativa": "162/000999",
                    "titulo": "Edge case",
                    "fecha_presentado": "01/01/2024",
                    "autor": "Grupo Parlamentario Mixto",
                },
            },
        }
    )
    client = _build_mocked_client({1: payload})  # page 2+ -> EMPTY_PAYLOAD
    records = await collect_pnl_records("XV", client=client, inter_page_delay_s=0.0)
    assert len(records) == 1
