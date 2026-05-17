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

Idempotent: re-running only touches rows whose ``boe_id`` is still
NULL. Network and parse failures are caught and logged; a single
bad row never aborts the batch.
"""

from __future__ import annotations

import json
import re
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
        initiative.boe_entry_in_force = hit.entry_in_force
        matched += 1
        log.info(
            "boe.matched",
            initiative_id=initiative.id,
            boe_id=hit.boe_id,
            initiative_title=(initiative.title_ca or initiative.title_original)[:100],
            boe_title=hit.title[:100],
        )

    await session.commit()
    log.info("boe.enriched", matched=matched, skipped=skipped, attempted=len(rows))
    return {"matched": matched, "skipped": skipped, "attempted": len(rows)}
