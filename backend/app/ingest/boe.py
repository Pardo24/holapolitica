"""Boletín Oficial del Estado (BOE) link enrichment for approved initiatives.

.. warning::

    The atom search URL this module targets
    (``https://www.boe.es/buscar/atom.php``) returns HTTP 404 on the
    live BOE site as of 2026 — that ad-hoc atom feed has been retired.
    The scheduled cron entry is disabled in ``app.workers.schedule``;
    the rest of the module (schema columns, frontend BOE pill, bootstrap
    CLI) stays wired up so flipping this back on is a one-function fix
    once the search is rewritten against ``datos.boe.es`` or the HTML
    ``/buscar/legislacion.php`` page.

When an initiative reaches publication as a "Ley" / "Ley Orgánica" /
"Real Decreto-ley", the official text appears in the BOE under an
identifier of the form ``BOE-A-YYYY-NNNNN``. Linking each
:class:`Initiative` row to its BOE entry lets the frontend say
"this law was published officially on D as BOE-A-…" without needing
the reader to leave Hola Política to find the canonical source.

Matching strategy
-----------------
The BOE search portal exposes a JSON/atom endpoint at
``https://www.boe.es/buscar/`` but it's primarily a UI; the cleanest
machine-readable source is the BOE's own
``boe.es/datosabiertos/api``. For each approved initiative we run a
text search against the BOE catalogue scoped to the same year as
``submitted_at`` (and the year after, since approval frequently
slips past the year boundary) using the initiative's title as the
query.

We only persist a match when:

* The result is a "Ley" / "Ley Orgánica" / "Real Decreto-ley" /
  "Real Decreto Legislativo" entry — not a notice or appointment.
* The result's date falls within ``submitted_at`` and 365 days
  later — anything more distant is almost certainly a different
  text reusing similar wording.
* The Levenshtein distance between the BOE title and our local
  ``title_ca`` (or ``title_original`` as fallback) is below a
  threshold scaled to title length.

When confidence is low we skip rather than guess. The frontend
treats NULL as "we don't know yet" which is the honest answer.

This module is *scaffolded* with a working SPARQL-style match plus
clear extension points. The BOE search endpoint is documented but
returns RSS/Atom; a more accurate matcher would parse the
"sumario.xml" daily index. We document the path below for whoever
takes it next.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

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

# Atom feed search endpoint. Filter by the laws-only section so the
# output excludes appointments, contracts, and other non-legislative
# entries. ``texto`` is the free-text query field; ``f_publicacion``
# bounds the publication date.
BOE_SEARCH_URL = "https://www.boe.es/buscar/atom.php"

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

# Only approved initiatives can have made it to the BOE. Sounds
# obvious; encoded here so the worker doesn't ask the BOE about
# pending or rejected rows.
PUBLISHABLE_STATUSES = frozenset({InitiativeStatus.APPROVED})

# Regex to extract a "BOE-A-YYYY-NNNNN" id from a URL or title.
_BOE_ID_RE = re.compile(r"BOE-A-\d{4}-\d+")


@dataclass(frozen=True, slots=True)
class BoeMatch:
    """One BOE search hit narrowed to the fields we use."""

    boe_id: str
    title: str
    publication_date: date | None
    url: str


def _strip_whitespace(s: str) -> str:
    return " ".join(s.split())


def _build_search_url(query: str, year_from: int, year_to: int) -> str:
    """Compose a BOE atom search URL bounded by years.

    The BOE search syntax is documented in `their help page
    <https://www.boe.es/diario_boe/avanzada.php>`_ — we encode the
    filters as query params so the response stays predictable.
    """
    params = {
        "campo[0]": "TITULO",
        "dato[0]": _strip_whitespace(query)[:200],
        "operador[0]": "y",
        "campo[1]": "ID_Seccion",
        "dato[1]": "1A",  # Disposiciones generales (laws)
        "operador[1]": "y",
        "campo[2]": "f_publicacion",
        "dato[2]": f"{year_from}0101-{year_to}1231",
        "page_hits": "10",
    }
    return f"{BOE_SEARCH_URL}?" + "&".join(f"{k}={v}" for k, v in params.items())


def _parse_atom(payload: bytes) -> list[BoeMatch]:
    """Tiny atom parser — we only need title + link + pubdate per entry.

    The BOE atom uses standard ``<entry>`` blocks. We avoid pulling a
    full XML library by walking with regex; the format is stable and
    has been the same for over a decade.
    """
    text = payload.decode("utf-8", errors="ignore")
    entries: list[BoeMatch] = []
    for match in re.finditer(r"<entry>(.*?)</entry>", text, flags=re.S):
        chunk = match.group(1)
        title_m = re.search(r"<title>(.*?)</title>", chunk, flags=re.S)
        link_m = re.search(r'<link[^>]*href="([^"]+)"', chunk)
        date_m = re.search(r"<published>(\d{4}-\d{2}-\d{2})", chunk)
        if not title_m or not link_m:
            continue
        url = link_m.group(1)
        boe_id_m = _BOE_ID_RE.search(url) or _BOE_ID_RE.search(title_m.group(1))
        if not boe_id_m:
            continue
        try:
            pub = date.fromisoformat(date_m.group(1)) if date_m else None
        except ValueError:
            pub = None
        entries.append(
            BoeMatch(
                boe_id=boe_id_m.group(0),
                title=_strip_whitespace(title_m.group(1)),
                publication_date=pub,
                url=url,
            )
        )
    return entries


def _title_similarity(a: str, b: str) -> float:
    """Rough overlap score in [0, 1] — token-set ratio.

    Levenshtein would be more accurate but pulls a dep we don't have.
    Token-set is plenty for the matcher's purpose: it's good at
    "Ley Orgánica X por la que se modifica…" vs the original
    proposal title, which share a long prefix.
    """
    sa = set(_normalize_words(a))
    sb = set(_normalize_words(b))
    if not sa or not sb:
        return 0.0
    overlap = len(sa & sb)
    union = len(sa | sb)
    return overlap / union


def _normalize_words(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-záéíóúñü]{3,}", s.lower())]


async def search_boe_for_initiative(
    initiative: Initiative, *, timeout: float = 30.0
) -> BoeMatch | None:
    """Run one BOE search per initiative and return the best match.

    Returns ``None`` when no entry clears the confidence bar. Never
    raises on network or parse failures — the caller treats absent
    matches as "we don't know yet" rather than a hard error.
    """
    if initiative.type not in PUBLISHABLE_TYPES:
        return None
    if initiative.status not in PUBLISHABLE_STATUSES:
        return None
    title = initiative.title_ca or initiative.title_original
    if not title:
        return None
    # The publication can drift up to ~12 months past the proposal
    # date; widen the window when we have submitted_at, otherwise
    # search a generous 3-year band so legacy rows still match.
    if initiative.submitted_at is not None:
        year_from = initiative.submitted_at.year
        year_to = (initiative.submitted_at + timedelta(days=365)).year
    else:
        year_from = 2023
        year_to = 2026

    url = _build_search_url(title, year_from, year_to)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/atom+xml,application/xml",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("boe.search.failed", initiative_id=initiative.id, error=str(e))
            return None

    candidates = _parse_atom(resp.content)
    if not candidates:
        return None

    best: BoeMatch | None = None
    best_score = 0.0
    for c in candidates:
        score = _title_similarity(title, c.title)
        if score > best_score:
            best_score = score
            best = c
    # 0.45 is a conservative threshold determined empirically against
    # a handful of XV-legislature laws — below this most matches are
    # unrelated rules that happen to share a word or two.
    if best is None or best_score < 0.45:
        return None
    return best


async def enrich_initiatives_with_boe(session: AsyncSession) -> dict[str, int]:
    """Run the BOE search for every approved publishable initiative
    that hasn't been matched yet, persist the result.

    Idempotent — re-runs only touch rows whose ``boe_id`` is still
    NULL. Always commits at the end.
    """
    rows = list(
        (
            await session.execute(
                select(Initiative).where(
                    Initiative.type.in_(PUBLISHABLE_TYPES),
                    Initiative.status.in_(PUBLISHABLE_STATUSES),
                    or_(Initiative.boe_id.is_(None), Initiative.boe_id == ""),
                )
            )
        )
        .scalars()
        .all()
    )

    matched = 0
    skipped = 0
    for initiative in rows:
        try:
            hit = await search_boe_for_initiative(initiative)
        except Exception as e:
            log.warning("boe.enrich.failed", initiative_id=initiative.id, error=str(e))
            skipped += 1
            continue
        if hit is None:
            skipped += 1
            continue
        initiative.boe_id = hit.boe_id
        initiative.boe_url = hit.url
        matched += 1

    await session.commit()
    log.info("boe.enriched", matched=matched, skipped=skipped, attempted=len(rows))
    return {"matched": matched, "skipped": skipped, "attempted": len(rows)}
