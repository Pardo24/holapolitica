"""Boletín Oficial del Estado (BOE) link enrichment for approved initiatives.

When an initiative reaches publication as a "Ley" / "Ley Orgánica" /
"Real Decreto-ley", the official consolidated text appears in the
BOE under an identifier of the form ``BOE-A-YYYY-NNNNN``. Linking
each :class:`Initiative` row to its BOE entry lets the frontend say
"this law was published on D as BOE-A-… and enters into force on E"
without sending readers off to the BOE search UI.

Matching strategy
-----------------
We query the official **Datos Abiertos API** at
``https://www.boe.es/datosabiertos/api/legislacion-consolidada``.
This endpoint accepts an Elasticsearch-style ``query_string`` and
returns rich per-norm metadata including:

* ``identificador`` — the canonical ``BOE-A-YYYY-NNNNN`` id
* ``url_html_consolidada`` — link to the consolidated law page
* ``fecha_publicacion`` — when it was published in the BOE
* ``fecha_vigencia`` — when it enters / entered into force
  (precisely the field newsrooms ask for; the BOE has already done
  the parsing of "Disposición final" for us)
* ``rango`` — norm rank (Ley, Ley Orgánica, Real Decreto-ley, …)
* ``vigencia_agotada`` — whether the norm is no longer in force

The previous atom-feed search (``boe.es/buscar/atom.php``) was
retired by BOE in 2026; this module replaces that path.

Match acceptance:

* The initiative's type is a publishable rank (Proyecto de Ley,
  Proposición de Ley, Real Decreto-ley). PNLs and Mociones never
  reach the BOE.
* The initiative's status is APPROVED. Pending or rejected
  initiatives don't produce a BOE entry by construction.
* Token-set overlap between the BOE result's title and our local
  initiative title clears 0.45 — a conservative bar empirically
  good against the XV legislature dataset. Below the bar we skip
  rather than guess; an un-matched row stays NULL.

Reales Decretos-ley
------------------
An RDL is not a bill: the Government publishes it in the BOE, it is in
force from then, and Congress only validates or repeals it within 30
days. Its Congress record has no BOCG text, and its status says nothing
about publication (every RDL is published before Congress sees it). So
RDLs skip the title-overlap search and resolve by their number instead:
the title always starts "Real Decreto-ley N/YYYY, de D de mes", which
gives the ELI address of the published text
(``/eli/es/rdl/YYYY/MM/DD/N/dof/spa/xml``). If that fails, the BOE
daily summaries of the following days are searched for the same
number. The XML carries the id, the dates and the text itself, which
:mod:`app.services.law_text` then reads.

Idempotent: re-running only touches rows whose ``boe_id`` is still
NULL. Network and parse failures are caught and logged; a single
bad row never aborts the batch.
"""

from __future__ import annotations

import asyncio
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import Initiative, InitiativeStatus, InitiativeType

log = get_logger(__name__)

USER_AGENT = (
    "monitor-parlamentari/0.1 (+https://www.holapolitica.org; "
    "contact daniel@holapolitica.org) python-httpx"
)

# Datos Abiertos endpoint. The path lives under www.boe.es so we
# inherit BOE's CDN; rate limits are generous (the docs cite
# "reasonable use" and we run one search per initiative once a day).
BOE_API_URL = "https://www.boe.es/datosabiertos/api/legislacion-consolidada"

# Initiative types that can plausibly produce a BOE entry. PNLs and
# Mociones never do; Proyecto / Proposición de Ley and Real Decreto-
# ley do once the chamber approves them.
PUBLISHABLE_TYPES = frozenset(
    {
        InitiativeType.PROYECTO_LEY,
        InitiativeType.PROPOSICION_LEY,
        InitiativeType.REAL_DECRETO_LEY,
    }
)

PUBLISHABLE_STATUSES = frozenset({InitiativeStatus.APPROVED})

# BOE "rango" code of a Real Decreto-ley, as in the document metadata.
RDL_RANK_CODE = "1320"
# Pause between two requests to boe.es: one at a time, never a burst.
BOE_MIN_INTERVAL_S = 1.0
# Days after signature in which an RDL is looked for in the daily
# summaries. They are published the next day almost always.
_SUMMARY_WINDOW_DAYS = 5


@dataclass(frozen=True, slots=True)
class BoeMatch:
    """One BOE search hit narrowed to the fields we persist."""

    boe_id: str
    title: str
    publication_date: date | None
    entry_in_force: date | None
    url: str


# Words we strip from an initiative title before composing the BOE
# search query. The BOE entry's title never starts with "Proyecto de
# Ley" (that's the parliamentary stage); it always starts with the
# rank that became law ("Ley Orgánica 1/2024, de …"). Cutting the
# prefix lifts our title-overlap score and shrinks false positives.
_PREFIX_PATTERNS = (
    re.compile(r"^proyecto de ley org[áa]nica\s+", re.IGNORECASE),
    re.compile(r"^proposici[óo]n de ley org[áa]nica\s+", re.IGNORECASE),
    re.compile(r"^proyecto de ley\s+", re.IGNORECASE),
    re.compile(r"^proposici[óo]n de ley\s+", re.IGNORECASE),
    re.compile(r"^real decreto-ley\s+", re.IGNORECASE),
    re.compile(r"^proyecto de ley\s+", re.IGNORECASE),
)


def _strip_prefix(title: str) -> str:
    """Remove the parliamentary-stage prefix from an initiative title.

    Leaves the noun phrase that identifies the law (e.g. "del derecho
    de defensa", "de amnistía para…"), which is what survives into
    the BOE entry's title and gives the best matching signal.
    """
    s = title.strip()
    for pat in _PREFIX_PATTERNS:
        s = pat.sub("", s)
    # Trim trailing period that some Congress feeds leave on the
    # initiative title — it confuses the Elasticsearch tokenizer.
    return s.rstrip(". ").strip()


def _parse_yyyymmdd(s: str | None) -> date | None:
    """BOE dates arrive as ``YYYYMMDD`` strings; parse defensively."""
    if not s or len(s) < 8:
        return None
    try:
        return date(int(s[0:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


# Common Spanish stop-words that survive the 3+ char filter and
# distort the Jaccard score (they're in every law title and so
# never carry matching signal). We drop them from the token-set on
# both sides of the comparison.
_STOP_WORDS = frozenset(
    {
        "del",
        "los",
        "las",
        "una",
        "para",
        "por",
        "que",
        "con",
        "como",
        "sobre",
        "esta",
        "este",
        "esos",
        "esas",
        "sus",
        "ley",
        "leyes",
        "real",
        "decreto",
        "decretos",
        "art",
        "articulo",
        "artículo",
        "modifica",
        "modificacion",
        "modificación",
        "establece",
        "regula",
        "regulacion",
        "regulación",
    }
)


def _normalize_words(s: str) -> list[str]:
    """Lowercase + diacritic-fold + split into 3+ char tokens, with
    Spanish stop-words removed so the Jaccard score reflects
    *content* overlap rather than legalese boilerplate.
    """
    tokens = re.findall(r"[a-z\xe1\xe9\xed\xf3\xfa\xf1\xfc]{3,}", s.lower())
    return [t for t in tokens if t not in _STOP_WORDS]


def _title_similarity(a: str, b: str) -> float:
    """Token-set Jaccard score in [0, 1]. See module docstring for
    why this is sufficient given the BOE entry inherits most nouns
    from the original initiative title."""
    sa = set(_normalize_words(a))
    sb = set(_normalize_words(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _build_query_string(stem: str) -> str:
    """Build the Elasticsearch ``query_string`` body the BOE API expects.

    The endpoint accepts the query as a JSON-encoded
    ``{"query": {"query_string": {"query": "<lucene>"}}}`` payload
    passed through the ``query`` URL parameter. ``titulo:`` is the
    lucene field for the entry's title; we quote the stem so spaces
    are matched as a phrase rather than as OR'd terms.

    The stem is sanitised — colons, quotes and lucene-significant
    characters are dropped — so we never produce a request that the
    server can reject as malformed.
    """
    cleaned = re.sub(r"[\"\\:^~\[\]{}]", " ", stem).strip()
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return ""
    payload = {"query": {"query_string": {"query": f'titulo:"{cleaned}"'}}}
    return json.dumps(payload, ensure_ascii=False)


async def search_boe_for_initiative(
    initiative: Initiative, *, timeout: float = 30.0
) -> BoeMatch | None:
    """Best-effort lookup for one initiative. Never raises."""
    if initiative.type not in PUBLISHABLE_TYPES:
        return None
    if initiative.status not in PUBLISHABLE_STATUSES:
        return None
    raw_title = initiative.title_ca or initiative.title_original
    if not raw_title:
        return None
    stem = _strip_prefix(raw_title)
    if len(stem) < 8:
        return None
    query = _build_query_string(stem)
    if not query:
        return None

    params: dict[str, Any] = {"query": query, "limit": 5}
    # Date window: laws typically clear within 24 months of being
    # filed. The BOE API accepts AAAAMMDD dates via ``from`` / ``to``.
    if initiative.submitted_at is not None:
        date_from = initiative.submitted_at
        date_to = initiative.submitted_at + timedelta(days=730)
        params["from"] = date_from.strftime("%Y%m%d")
        params["to"] = date_to.strftime("%Y%m%d")

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        try:
            resp = await client.get(BOE_API_URL, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("boe.search.failed", initiative_id=initiative.id, error=str(e))
            return None

    try:
        payload = resp.json()
    except ValueError:
        log.warning("boe.search.bad_json", initiative_id=initiative.id)
        return None

    items = payload.get("data") or []
    if not isinstance(items, list) or not items:
        return None

    best: BoeMatch | None = None
    best_score = 0.0
    for it in items:
        if not isinstance(it, dict):
            continue
        # Hard filter: the Congress of Deputies only passes STATE laws.
        # The BOE indexes regional norms (Catalan, Basque, Andalusian
        # parliaments) under ``ambito.codigo == "2"``; matching one of
        # those to a state-level initiative is by definition wrong.
        # Pulled from a real false positive on the first 0.40 run
        # ("Proyecto de Ley de Movilidad Sostenible" → Basque Country
        # Mobility Law).
        ambito = it.get("ambito") or {}
        if isinstance(ambito, dict) and ambito.get("codigo") not in (None, "1"):
            continue
        boe_id = it.get("identificador")
        title = it.get("titulo")
        url = it.get("url_html_consolidada")
        if not boe_id or not title or not url:
            continue
        score = _title_similarity(stem, title)
        if score > best_score:
            best_score = score
            best = BoeMatch(
                boe_id=str(boe_id),
                title=str(title),
                publication_date=_parse_yyyymmdd(it.get("fecha_publicacion")),
                entry_in_force=_parse_yyyymmdd(it.get("fecha_vigencia")),
                url=str(url),
            )

    # 0.40 threshold — calibrated after the first prod run (9/26
    # matched at 0.45). Lowering to 0.40 with the stop-word filter
    # active makes the score more meaningful (we're comparing
    # content tokens, not legalese) and pulls in a handful of
    # genuine matches that were sitting just below the old bar. The
    # date-window filter remains as the hard guardrail against
    # cross-year false positives.
    if best is None or best_score < 0.40:
        return None
    return best


_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

_RDL_TITLE_RE = re.compile(
    r"real\s+decreto[\s\-‐‑–]*ley\s+(\d{1,3})\s*/\s*(\d{4})\s*,?\s+de\s+(\d{1,2})\s*[ºo]?\s+de\s+([a-z]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class RdlRef:
    """A Real Decreto-ley as its title names it: number, year, signature date."""

    number: int
    year: int
    signed: date

    @property
    def official_number(self) -> str:
        """The BOE ``numero_oficial``: ``"8/2026"``."""
        return f"{self.number}/{self.year}"

    @property
    def eli_xml_url(self) -> str:
        """ELI address of the text as published, in XML."""
        s = self.signed
        return (
            f"https://www.boe.es/eli/es/rdl/{s.year}/{s.month:02d}/{s.day:02d}/"
            f"{self.number}/dof/spa/xml"
        )


def parse_rdl_title(title: str | None) -> RdlRef | None:
    """``"Real Decreto-ley 8/2026, de 20 de marzo, …"`` → number, year, date.

    None when the title does not name an RDL or the date is impossible.
    The signature year is the number's year (an RDL is numbered within
    the year it is signed).
    """
    if not title:
        return None
    m = _RDL_TITLE_RE.search(title)
    if not m:
        return None
    month = _MONTHS.get(m.group(4).lower())
    if month is None:
        return None
    number, year = int(m.group(1)), int(m.group(2))
    try:
        signed = date(year, month, int(m.group(3)))
    except ValueError:
        return None
    return RdlRef(number=number, year=year, signed=signed)


@dataclass(frozen=True, slots=True)
class BoeDocument:
    """A BOE document as published: metadata and its plain text."""

    boe_id: str
    title: str
    rank_code: str
    official_number: str
    publication_date: date | None
    entry_in_force: date | None
    text: str

    @property
    def url(self) -> str:
        """The text as published on boe.es: the one the analysis reads."""
        return boe_text_url(self.boe_id)


class BoeUnavailableError(RuntimeError):
    """The BOE did not return a document that should be there."""


def boe_text_url(boe_id: str) -> str:
    return f"https://www.boe.es/diario_boe/txt.php?id={boe_id}"


def boe_xml_url(boe_id: str) -> str:
    return f"https://www.boe.es/diario_boe/xml.php?id={boe_id}"


def parse_boe_document(xml_bytes: bytes) -> BoeDocument | None:
    """Read a ``diario_boe/xml.php`` (or ELI ``…/xml``) document.

    None when it is not a BOE document (ELI answers an unknown address
    with a 200 HTML error page). The text is one line per block of
    ``<texto>`` (paragraph, heading, table), signatures included.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return None
    meta = root.find("metadatos")
    if root.tag != "documento" or meta is None:
        return None

    def field_text(name: str) -> str:
        return (meta.findtext(name) or "").strip()

    rank = meta.find("rango")
    boe_id = field_text("identificador")
    if not boe_id:
        return None
    blocks: list[str] = []
    body = root.find("texto")
    if body is not None:
        for block in body:
            line = " ".join("".join(block.itertext()).split())
            if line:
                blocks.append(line)
    return BoeDocument(
        boe_id=boe_id,
        title=field_text("titulo"),
        rank_code=(rank.get("codigo") or "") if rank is not None else "",
        official_number=field_text("numero_oficial"),
        publication_date=_parse_yyyymmdd(field_text("fecha_publicacion")),
        entry_in_force=_parse_yyyymmdd(field_text("fecha_vigencia")),
        text="\n".join(blocks),
    )


def _as_list(value: Any) -> list[Any]:
    """The summary JSON gives one child as an object and several as a list."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def find_rdl_in_summary(payload: Any, ref: RdlRef) -> str | None:
    """The BOE id of RDL ``ref`` in one daily summary, if it is there.

    Only section I (general provisions) is searched, and the title must
    start with the exact "Real Decreto-ley N/YYYY," so "… por el que se
    modifica el Real Decreto-ley 8/2025" never matches.
    """
    prefix = f"real decreto-ley {ref.official_number},"
    data = payload.get("data") if isinstance(payload, dict) else None
    summary = data.get("sumario") if isinstance(data, dict) else None
    if not isinstance(summary, dict):
        return None
    for issue in _as_list(summary.get("diario")):
        for section in _as_list(issue.get("seccion") if isinstance(issue, dict) else None):
            if not isinstance(section, dict) or section.get("codigo") != "1":
                continue
            for dept in _as_list(section.get("departamento")):
                for heading in _as_list(dept.get("epigrafe") if isinstance(dept, dict) else None):
                    items = heading.get("item") if isinstance(heading, dict) else None
                    for item in _as_list(items):
                        if not isinstance(item, dict):
                            continue
                        title = " ".join(str(item.get("titulo") or "").lower().split())
                        if title.startswith(prefix) and item.get("identificador"):
                            return str(item["identificador"])
    return None


class BoeClient:
    """One polite connection to boe.es: project user agent, paced requests."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        min_interval_s: float = BOE_MIN_INTERVAL_S,
    ) -> None:
        self._client = client or httpx.AsyncClient(
            timeout=30.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True
        )
        self._min_interval_s = min_interval_s
        self._last = 0.0

    async def __aenter__(self) -> BoeClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._client.aclose()

    async def get(self, url: str, *, accept: str = "application/xml") -> httpx.Response:
        loop = asyncio.get_running_loop()
        wait = self._last + self._min_interval_s - loop.time()
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            return await self._client.get(url, headers={"Accept": accept})
        finally:
            self._last = loop.time()

    async def document(self, url: str) -> BoeDocument | None:
        """A BOE XML document, or None when the address has none."""
        resp = await self.get(url)
        if resp.status_code != 200:
            return None
        return parse_boe_document(resp.content)

    async def summary(self, day: date) -> Any:
        """The BOE daily summary as JSON, or None (no issue that day)."""
        resp = await self.get(
            f"https://www.boe.es/datosabiertos/api/boe/sumario/{day:%Y%m%d}",
            accept="application/json",
        )
        if resp.status_code != 200:
            return None
        try:
            return resp.json()
        except ValueError:
            return None


def _is_rdl(doc: BoeDocument | None, ref: RdlRef) -> bool:
    return (
        doc is not None
        and doc.rank_code == RDL_RANK_CODE
        and doc.official_number == ref.official_number
    )


async def resolve_rdl(boe: BoeClient, ref: RdlRef) -> BoeDocument | None:
    """The published RDL ``ref``: its ELI address first, then the summaries.

    The document is only accepted when the BOE's own metadata confirm
    the rank (Real Decreto-ley) and the number.
    """
    doc = await boe.document(ref.eli_xml_url)
    if _is_rdl(doc, ref):
        return doc
    for offset in range(_SUMMARY_WINDOW_DAYS + 1):
        payload = await boe.summary(ref.signed + timedelta(days=offset))
        boe_id = find_rdl_in_summary(payload, ref) if payload is not None else None
        if boe_id is None:
            continue
        doc = await boe.document(boe_xml_url(boe_id))
        return doc if _is_rdl(doc, ref) else None
    return None


async def _match_rdl(boe: BoeClient, initiative: Initiative) -> BoeMatch | None:
    ref = parse_rdl_title(initiative.title_original or initiative.title_es)
    if ref is None:
        return None
    doc = await resolve_rdl(boe, ref)
    if doc is None:
        return None
    return BoeMatch(
        boe_id=doc.boe_id,
        title=doc.title,
        publication_date=doc.publication_date,
        entry_in_force=doc.entry_in_force,
        url=doc.url,
    )


async def enrich_initiatives_with_boe(session: AsyncSession) -> dict[str, int]:
    """Match approved publishable initiatives to their BOE entries.

    Operates only on rows where ``boe_id`` is still NULL — re-running
    is safe and cheap. Always commits at the end; per-row failures
    are caught and logged so a single bad row never blocks the batch.

    Returns a counter ``{matched, skipped, attempted}`` for telemetry.
    """
    rows = list(
        (
            await session.execute(
                select(Initiative).where(
                    Initiative.type.in_(PUBLISHABLE_TYPES),
                    # Every RDL is published before Congress sees it,
                    # whatever its status there.
                    or_(
                        Initiative.status.in_(PUBLISHABLE_STATUSES),
                        Initiative.type == InitiativeType.REAL_DECRETO_LEY,
                    ),
                    or_(Initiative.boe_id.is_(None), Initiative.boe_id == ""),
                )
            )
        )
        .scalars()
        .all()
    )

    matched = 0
    skipped = 0
    async with BoeClient() as boe:
        for initiative in rows:
            try:
                if initiative.type == InitiativeType.REAL_DECRETO_LEY:
                    hit = await _match_rdl(boe, initiative)
                else:
                    hit = await search_boe_for_initiative(initiative)
            except Exception as e:
                log.warning("boe.enrich.failed", initiative_id=initiative.id, error=str(e))
                skipped += 1
                continue
            if hit is None:
                skipped += 1
                continue
            _apply_match(initiative, hit)
            matched += 1

    await session.commit()
    log.info("boe.enriched", matched=matched, skipped=skipped, attempted=len(rows))
    return {"matched": matched, "skipped": skipped, "attempted": len(rows)}


def _apply_match(initiative: Initiative, hit: BoeMatch) -> None:
    initiative.boe_id = hit.boe_id
    initiative.boe_url = hit.url
    initiative.boe_entry_in_force = hit.entry_in_force
    log.info(
        "boe.matched",
        initiative_id=initiative.id,
        boe_id=hit.boe_id,
        initiative_title=(initiative.title_ca or initiative.title_original)[:100],
        boe_title=hit.title[:100],
    )
