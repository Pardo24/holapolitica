"""Importer for Proposiciones no de Ley (PNL — initiative series ``162/…``).

The Congreso open data portal does **not** publish PNLs as a bulk JSON
dataset — only the three bill-like series (Proyectos de Ley ``121``,
Proposiciones de Ley ``122`` and Propuestas de Reforma ``127``) are
exposed via :func:`CongresoClient.fetch_initiatives`. PNLs are however
the most-voted initiative type in the Congreso plenary, so they
dominate the unmatched bucket of :func:`backfill_vote_initiative_links`.

This module fills that gap by scraping the Liferay search portlet at
``/es/busqueda-de-iniciativas``. The portlet's "Filtrar listado"
button fires an AJAX POST against::

    https://www.congreso.es/es/busqueda-de-iniciativas
        ?p_p_id=iniciativas
        &p_p_lifecycle=2
        &p_p_state=normal
        &p_p_mode=view
        &p_p_resource_id=filtrarListado
        &p_p_cacheability=cacheLevelPage

with a form-urlencoded body whose only meaningful fields for our
purposes are ``_iniciativas_legislatura`` (Roman numeral, e.g. ``"XV"``),
``_iniciativas_tipo`` (initiative series code as a 3-digit string —
``"162"`` for PNL) and ``_iniciativas_paginaActual`` (1-based page
index). The remaining ``_iniciativas_…`` keys can be sent empty.

The response is a JSON document::

    {
        "iniciativas_encontradas": "789",
        "lista_iniciativas": {
            "iniciativa1": {
                "id_iniciativa": "162/000789",
                "titulo": "...",
                "autor": "Grupo Parlamentario Popular en el Congreso",
                "fecha_presentado": "08/05/2026",
                "atip": "Proposiciones no de Ley",
                "tipo": "Proposición no de Ley ante el Pleno.",
                ...
            },
            "iniciativa2": {...},
            ...  # 25 items per page
        },
        "paginacion": {...},
        "titulo_contenido": " XV Legislatura"
    }

The status field is not exposed by the search endpoint, so every PNL is
imported as ``InitiativeStatus.SUBMITTED``. Once the link to a vote is
populated by :func:`backfill_vote_initiative_links`, the vote's
``vote_result`` is what users see anyway — and the per-initiative
status is rebuilt by a future enrichment pass against the detail page
(out of scope for this PR).

Series ``173`` (Moción), ``130`` (RDL convalidation) and ``102``
(constitutional reform) are NOT handled here. ``173`` is a planned
follow-up that will reuse this same scraper (only the ``tipo`` form
field changes); see ``docs/STATUS.md``.

Politeness: we sleep one second between pages, matching the rate
observed by an interactive user. The portal does not rate-limit
aggressively but it is shared civic infrastructure and we don't want
to be the reason it slows down.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ingest.congreso.initiatives import (
    InitiativeImporter,
    InitiativeImportResult,
    InitiativeImportStats,
)
from app.ingest.congreso.parse import ParsedInitiative, parse_dmy_date

log = get_logger(__name__)


# Liferay portlet AJAX endpoint. Discovered by inspecting the inline JS on
# https://www.congreso.es/es/busqueda-de-iniciativas — the same URL has been
# stable since at least the 2020 site redesign. ``p_p_lifecycle=2`` is the
# Liferay flag for "resource request" (the JSON variant of an AJAX call).
_PNL_AJAX_PATH = (
    "/es/busqueda-de-iniciativas"
    "?p_p_id=iniciativas"
    "&p_p_lifecycle=2"
    "&p_p_state=normal"
    "&p_p_mode=view"
    "&p_p_resource_id=filtrarListado"
    "&p_p_cacheability=cacheLevelPage"
)

# Initiative type code for "Proposición no de Ley" as used by the portlet's
# tipo filter. See ``docs/data-sources.md``: 121=Proyectos, 122=Proposiciones
# de Ley, 162=Proposiciones no de Ley, 173=Mociones.
PNL_TIPO_CODE = "162"

# Empirically observed page size. The portlet hard-codes 25 results/page;
# there is no per-page-size parameter exposed.
_PAGE_SIZE = 25

# Inter-page courtesy delay. Matches the 1 req/s budget used elsewhere in
# the Congreso ingest stack (see CLAUDE.md "Constraints").
_INTER_PAGE_DELAY_S = 1.0

# Hard cap on the number of pages we will fetch in a single run. With 25
# items per page this allows up to 250_000 PNLs — orders of magnitude
# above the largest legislature on record (XV has ~800 as of May 2026).
# The cap is a runaway-safety belt, not a real limit.
_MAX_PAGES = 10_000


@dataclass(frozen=True, slots=True)
class _PnlSearchPage:
    """One page of the Liferay search response, narrowed to what we use."""

    total: int
    items: list[dict[str, Any]]


def _form_body(legislature_roman: str, page: int, tipo: str = PNL_TIPO_CODE) -> dict[str, str]:
    """Build the form-urlencoded body for one filter request.

    All ``_iniciativas_…`` keys are required even when empty — the
    Liferay portlet treats absence as a malformed request and returns
    an empty ``{}``.
    """
    return {
        "_iniciativas_legislatura": legislature_roman,
        "_iniciativas_titulo": "",
        "_iniciativas_texto": "",
        "_iniciativas_autor": "",
        "_iniciativas_competencias": "",
        "_iniciativas_tipo": tipo,
        "_iniciativas_tramitacion": "",
        "_iniciativas_expedientes": "",
        "_iniciativas_hasta": "",
        "_iniciativas_tipo_tramitacion": "",
        "_iniciativas_comision_competente": "",
        "_iniciativas_fase": "",
        "_iniciativas_organo": "",
        "_iniciativas_fechaDe": "",
        "_iniciativas_fechaDesde": "",
        "_iniciativas_fechaHasta": "",
        "_iniciativas_materias": "",
        "_iniciativas_iniciativas_relacionadas": "",
        "_iniciativas_iniciativas_origen": "",
        "_iniciativas_iscc": "",
        "_iniciativas_paginaActual": str(page),
    }


def parse_pnl_page(payload: bytes) -> _PnlSearchPage:
    """Parse one Liferay search JSON response into a typed page.

    The endpoint returns ``{}`` for filter combinations with no results
    (and also, frustratingly, for invalid filter strings — see the
    ``Proposiciones no de Ley`` text-form failure documented at the top
    of this module). We treat ``{}`` as an empty page rather than an
    error: pagination drives the loop and an empty page is the natural
    stop condition.
    """
    obj = json.loads(payload.decode("utf-8"))
    if not isinstance(obj, dict):
        raise ValueError(f"Expected JSON object, got {type(obj).__name__}")
    if not obj:
        return _PnlSearchPage(total=0, items=[])

    total_raw = obj.get("iniciativas_encontradas") or "0"
    try:
        total = int(total_raw)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Unparseable 'iniciativas_encontradas': {total_raw!r}") from e

    lista = obj.get("lista_iniciativas") or {}
    if not isinstance(lista, dict):
        raise ValueError(f"Expected 'lista_iniciativas' to be a dict, got {type(lista).__name__}")

    # The keys are ``iniciativa1``, ``iniciativa2``, … in display order.
    # Sort numerically so we preserve the portal's chronological order
    # regardless of dict iteration semantics.
    def _key(name: str) -> int:
        try:
            return int(name.removeprefix("iniciativa"))
        except ValueError:
            return 1_000_000

    items = [lista[k] for k in sorted(lista, key=_key) if isinstance(lista[k], dict)]
    return _PnlSearchPage(total=total, items=items)


def parse_pnl_record(
    record: dict[str, Any], *, type_code: str = "proposicion_no_ley"
) -> ParsedInitiative:
    """Normalize one search-portlet row into a :class:`ParsedInitiative`.

    The Liferay search response shape is the same regardless of which
    ``tipo`` was filtered on, so this parser is reused verbatim by the
    sibling series importers in :mod:`series_search` (Moción 173, RDL
    convalidation 130, Reforma constitucional 102). The default
    ``type_code`` matches the original PNL caller for back-compat.

    Maps to the same :class:`ParsedInitiative` dataclass used by the bulk
    JSON importer so :class:`InitiativeImporter` can consume both
    interchangeably.

    Raises :class:`KeyError` if ``id_iniciativa`` is missing — that's a
    structural change in the portal and we want the run to surface it
    rather than silently drop the row.
    """
    official_id = str(record["id_iniciativa"]).strip()
    title = " ".join(str(record.get("titulo") or "").split())

    submitted_raw = str(record.get("fecha_presentado") or "").strip()
    submitted_at = parse_dmy_date(submitted_raw) if submitted_raw else None

    submitted_by = str(record.get("autor") or "").strip() or None

    # The search endpoint does not expose the BOCG URL nor an outcome
    # field. ``tipo`` carries the human-readable subtype ("Proposición no
    # de Ley ante el Pleno." vs. "...ante la Comisión...") which we
    # collapse into the single :class:`InitiativeType` value below.
    return ParsedInitiative(
        official_id=official_id,
        type_code=type_code,
        title=title,
        submitted_at=submitted_at,
        submitted_by=submitted_by,
        # Search endpoint exposes neither situation nor result; the
        # importer's status classifier falls back to ``submitted``.
        situation_raw=None,
        result_raw=None,
        source_url=None,
    )


class PnlSearchClient:
    """Thin async HTTP client for the PNL search AJAX endpoint.

    Reuses the same User-Agent settings (``congreso_user_agent``) as
    :class:`CongresoClient` to keep our footprint identifiable. Lives in
    this module rather than ``client.py`` because the endpoint is a
    portlet AJAX (lifecycle=2) and has no relation to the open-data
    listing pages ``CongresoClient`` is built around.

    Use as an async context manager so the underlying httpx client is
    properly closed::

        async with PnlSearchClient() as c:
            page = await c.fetch_page("XV", 1)
    """

    def __init__(self, base_url: str | None = None, timeout: float = 30.0) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.congreso_opendata_base_url).rstrip("/")
        self.user_agent = settings.congreso_user_agent
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> PnlSearchClient:
        self._client = httpx.AsyncClient(
            timeout=self.timeout,
            headers={
                "User-Agent": self.user_agent,
                # The portlet only returns JSON when these headers are
                # present. Without them it falls back to the rendered
                # search page HTML (which is much larger and unparseable
                # by us).
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json, text/javascript, */*",
            },
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *_args: object) -> None:
        if self._client is not None:
            await self._client.aclose()

    async def fetch_page(
        self, legislature_roman: str, page: int, *, tipo: str = PNL_TIPO_CODE
    ) -> _PnlSearchPage:
        """Fetch one page of PNL search results.

        Raises :class:`httpx.HTTPError` on transport failure (after
        tenacity retries) and :class:`ValueError` on malformed JSON.
        """
        if self._client is None:
            raise RuntimeError("PnlSearchClient must be used as an async context manager.")
        if page < 1:
            raise ValueError("page is 1-based; page >= 1 required")

        url = self.base_url + _PNL_AJAX_PATH
        body = _form_body(legislature_roman, page, tipo=tipo)
        log.info("congreso.pnl.fetch", legislature=legislature_roman, page=page, tipo=tipo)

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=2, max=20),
                retry=retry_if_exception_type((httpx.HTTPError,)),
                reraise=True,
            ):
                with attempt:
                    response = await self._client.post(
                        url,
                        data=body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                        },
                    )
                    response.raise_for_status()
                    return parse_pnl_page(response.content)
        except RetryError as e:
            log.error(
                "congreso.pnl.fetch.failed",
                legislature=legislature_roman,
                page=page,
                error=str(e),
            )
            raise
        raise RuntimeError("Unreachable")  # mypy


async def collect_pnl_records(
    legislature_roman: str,
    *,
    tipo: str = PNL_TIPO_CODE,
    client: PnlSearchClient | None = None,
    max_pages: int = _MAX_PAGES,
    inter_page_delay_s: float = _INTER_PAGE_DELAY_S,
) -> list[dict[str, Any]]:
    """Walk the Liferay search pagination, returning every result row.

    A broken row inside one page is skipped (the parser raises ValueError
    but the iterator keeps going); the orchestrator can re-run safely
    because the importer is idempotent.

    Args:
        legislature_roman: ``"XV"`` etc. Roman numeral.
        tipo: Liferay portlet type code. Defaults to ``"162"`` (PNL).
        client: pre-built :class:`PnlSearchClient`. When ``None`` we
            create one and tear it down around the call.
        max_pages: safety cap; raises if the portal claims more pages
            than this. Default ``10_000`` (250k items).
        inter_page_delay_s: courtesy sleep between page requests.
    """
    if client is not None:
        return await _collect_with_client(
            client,
            legislature_roman,
            tipo=tipo,
            max_pages=max_pages,
            inter_page_delay_s=inter_page_delay_s,
        )
    async with PnlSearchClient() as owned:
        return await _collect_with_client(
            owned,
            legislature_roman,
            tipo=tipo,
            max_pages=max_pages,
            inter_page_delay_s=inter_page_delay_s,
        )


async def _collect_with_client(
    client: PnlSearchClient,
    legislature_roman: str,
    *,
    tipo: str,
    max_pages: int,
    inter_page_delay_s: float,
) -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []
    page = 1
    expected_total: int | None = None
    while page <= max_pages:
        result = await client.fetch_page(legislature_roman, page, tipo=tipo)
        if expected_total is None:
            expected_total = result.total
            log.info(
                "congreso.pnl.total",
                legislature=legislature_roman,
                tipo=tipo,
                total=expected_total,
            )
        if not result.items:
            break
        all_items.extend(result.items)
        if len(all_items) >= result.total:
            break
        page += 1
        if inter_page_delay_s > 0:
            await asyncio.sleep(inter_page_delay_s)
    if expected_total is not None and len(all_items) != expected_total:
        log.warning(
            "congreso.pnl.count_mismatch",
            legislature=legislature_roman,
            tipo=tipo,
            expected=expected_total,
            collected=len(all_items),
        )
    return all_items


async def import_pnl(
    importer: InitiativeImporter,
    *,
    legislature_roman: str,
    client: PnlSearchClient | None = None,
    tipo: str = PNL_TIPO_CODE,
    type_code: str = "proposicion_no_ley",
) -> InitiativeImportResult:
    """Scrape every record of ``tipo`` in ``legislature_roman`` and upsert.

    Default ``tipo`` / ``type_code`` keep the historical PNL behaviour;
    the sibling :mod:`series_search` module overrides both pairs to
    import Mociones (173), RDL convalidations (130) and constitutional
    reform proposals (102) without duplicating this orchestration.

    Reuses the same :class:`InitiativeImporter` plumbing as the bulk
    JSON datasets — the only difference is the source. Each parse is
    wrapped in try/except so a single malformed record can't kill the
    batch. Returns the same :class:`InitiativeImportResult` shape so
    callers downstream (enrichment, link backfill) treat these rows
    identically to bills.
    """
    raw_records = await collect_pnl_records(legislature_roman, tipo=tipo, client=client)

    # Synthesise the dict shape that ``InitiativeImporter._upsert_one``
    # expects. The importer reads ``parsed`` directly; the ``raw`` dict
    # is only forwarded for diagnostics today, so we hand it through
    # verbatim.
    existing = await importer._load_existing()
    stats = InitiativeImportStats()
    new_ids: list[str] = []
    parsed_ok = 0
    parse_errors = 0
    for raw in raw_records:
        try:
            parsed = parse_pnl_record(raw, type_code=type_code)
        except Exception as e:
            parse_errors += 1
            log.warning(
                "congreso.pnl.parse_error",
                error=str(e),
                tipo=tipo,
                id_iniciativa=raw.get("id_iniciativa"),
            )
            continue
        parsed_ok += 1
        before_created = stats.created
        stats = importer._upsert_one(parsed, raw, existing, stats)
        if stats.created > before_created:
            new_ids.append(parsed.official_id)

    await importer.session.commit()
    log.info(
        "congreso.pnl.import.done",
        legislature=legislature_roman,
        tipo=tipo,
        type_code=type_code,
        parsed_ok=parsed_ok,
        parse_errors=parse_errors,
        **asdict(stats),
    )
    return InitiativeImportResult(stats=stats, new_official_ids=tuple(new_ids))


async def import_pnl_xv() -> InitiativeImportStats:
    """Bootstrap entry point: import all PNLs of legislature XV.

    Opens its own DB session and resolves the chamber/legislature the
    same way the other ``bootstrap.import_*`` steps do. Idempotent;
    safe to re-run. Returns the same :class:`InitiativeImportStats`
    counters the JSON importers do — the bootstrap CLI prints them.
    """
    # Imported lazily to avoid a circular import: ``bootstrap`` imports
    # this module to register the CLI step.
    from app.db.session import AsyncSessionLocal
    from app.ingest.congreso.bootstrap import (
        _get_active_legislature,
        _get_congreso_chamber,
    )

    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)
        importer = InitiativeImporter(session, chamber, legislature)
        result = await import_pnl(importer, legislature_roman="XV")
        return result.stats
