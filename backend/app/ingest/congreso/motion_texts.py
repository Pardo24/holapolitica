"""Fetch the official text of PNLs (and motions, when linked) from the BOCG.

The PNL scraper (:mod:`app.ingest.congreso.pnl`) only gets titles, and a
title like "Proposición no de Ley relativa a X" says nothing about what is
asked. Summaries built from titles alone invented laws ("Modifica la Ley
del Deporte…") for initiatives that change no law at all.

The text lives in the BOCG Serie D bulletin. The initiative's detail page
on congreso.es links that PDF with the exact page (``…/BOCG-15-D-578.PDF
#page=34``). One bulletin holds many initiatives, each opening with its
expediente number alone on a line, so we cut this one out from its header
to the next.

Motions (series 173) usually carry no BOCG link on their page; they are
skipped (counted as ``no_link``) until one appears.

Politeness: 0.5 s between requests to congreso.es, and each bulletin PDF is
downloaded once per run however many of its initiatives we need.
"""

from __future__ import annotations

import asyncio
import io
import re
from datetime import date
from urllib.parse import quote

import httpx
from pypdf import PdfReader
from sqlalchemy import select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ingest.congreso.object_extractor import _collapse_whitespace, _strip_bocg_chrome
from app.models import Initiative, InitiativeType

log = get_logger(__name__)

_DETAIL_PATH = (
    "/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal"
    "&p_p_mode=view&_iniciativas_mode=mostrarDetalle"
    "&_iniciativas_legislatura={legislature}&_iniciativas_id={expediente}"
)
# Serie D bulletins come in two shapes: the plain issue
# (``BOCG-15-D-578.PDF``) and a per-part "cuadernillo"
# (``BOCG-15-D-222-C1.PDF``). Missing the second form is what left 86
# initiatives counted as ``no_link`` — most mociones publish that way.
_BOCG_D_LINK = re.compile(
    r"/public_oficiales/L\d+/CONG/BOCG/D/BOCG-\d+-D-\d+(?:-[A-Z]+\d*)?\.PDF(?:#page=(\d+))?",
    re.IGNORECASE,
)
# An item header inside a Serie D bulletin: an expediente alone on its line.
_ITEM_HEADER = re.compile(r"^\s*\d{3}/\d{6}(?:/\d{4})?\s*$", re.MULTILINE)
# Where the actual request starts ("El Congreso de los Diputados insta al
# Gobierno a: …"), after the exposición de motivos.
_PETITION = re.compile(r"El Congreso de los Diputados (insta|acuerda|manifiesta)", re.IGNORECASE)

_LEGISLATURE = "XV"
_LEGISLATURE_START = date(2023, 8, 17)
_FETCH_DELAY_S = 0.5
_PAGES_TO_READ = 8
_MAX_CHARS = 8000
_MIN_CHARS = 80


def expediente_of(official_id: str) -> str:
    """``"162/000833/0000"`` -> ``"162/000833"``."""
    return "/".join(official_id.split("/")[:2])


def find_bocg_d_link(html: str) -> tuple[str, int | None] | None:
    """The first BOCG Serie D PDF linked on a detail page, as (path, page)."""
    m = _BOCG_D_LINK.search(html)
    if m is None:
        return None
    page = int(m.group(1)) if m.group(1) else None
    return m.group(0).split("#", 1)[0], page


def slice_item_text(bulletin_text: str, expediente: str) -> str | None:
    """Cut one initiative out of a bulletin: from its header to the next one.

    Prefers the expediente standing alone on its line (the item header) over
    any other mention of it, such as the bulletin's table of contents. Very
    long items keep their opening (who presents what) and the petition,
    dropping the middle of the exposición de motivos.
    """
    header = re.search(
        rf"^\s*{re.escape(expediente)}(?:/\d{{4}})?\s*$", bulletin_text, re.MULTILINE
    )
    if header is not None:
        start = header.end()
    else:
        found = bulletin_text.find(expediente)
        if found < 0:
            return None
        start = found + len(expediente)
    rest = bulletin_text[start:]
    nxt = _ITEM_HEADER.search(rest)
    body = _collapse_whitespace(_strip_bocg_chrome(rest[: nxt.start()] if nxt else rest))
    if len(body) < _MIN_CHARS:
        return None
    if len(body) > _MAX_CHARS:
        petition = _PETITION.search(body)
        if petition is not None and petition.start() > 1500:
            body = body[:1200] + "\n\n[…]\n\n" + body[petition.start() :]
        body = body[:_MAX_CHARS]
    return body


async def enrich_motion_texts(*, limit: int = 150) -> dict[str, int]:
    """Fill ``object_text`` (and ``source_url``) for PNLs / motions of the
    current legislature that still lack it, newest first."""
    from app.db.session import AsyncSessionLocal

    settings = get_settings()
    base = settings.congreso_opendata_base_url.rstrip("/")

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(Initiative.id, Initiative.official_id)
                .where(
                    Initiative.type.in_([InitiativeType.PROPOSICION_NO_LEY, InitiativeType.MOCION]),
                    Initiative.object_text.is_(None),
                    Initiative.submitted_at >= _LEGISLATURE_START,
                )
                .order_by(Initiative.id.desc())
                .limit(limit)
            )
        ).all()

    stats = {
        "seen": len(rows),
        "no_link": 0,
        "pdfs": 0,
        "extracted": 0,
        "not_found": 0,
        "errors": 0,
    }
    readers: dict[str, PdfReader] = {}
    async with httpx.AsyncClient(
        timeout=60.0,
        follow_redirects=True,
        headers={"User-Agent": settings.congreso_user_agent},
    ) as client:
        for initiative_id, official_id in rows:
            expediente = expediente_of(official_id)
            try:
                detail = await client.get(
                    base
                    + _DETAIL_PATH.format(
                        legislature=_LEGISLATURE, expediente=quote(expediente, safe="")
                    )
                )
                await asyncio.sleep(_FETCH_DELAY_S)
                link = find_bocg_d_link(detail.text) if detail.status_code == 200 else None
                if link is None:
                    stats["no_link"] += 1
                    continue
                path, page = link
                reader = readers.get(path)
                if reader is None:
                    pdf = await client.get(base + path)
                    pdf.raise_for_status()
                    await asyncio.sleep(_FETCH_DELAY_S)
                    reader = PdfReader(io.BytesIO(pdf.content))
                    readers[path] = reader
                    stats["pdfs"] += 1
                first = max(0, (page or 1) - 1)
                last = min(first + _PAGES_TO_READ, len(reader.pages))
                text = "\n".join(reader.pages[i].extract_text() or "" for i in range(first, last))
                body = slice_item_text(text, expediente)
                if body is None:
                    stats["not_found"] += 1
                    continue
                async with AsyncSessionLocal() as session:
                    row = await session.get(Initiative, initiative_id)
                    if row is None:
                        continue
                    row.object_text = body
                    row.source_url = f"{base}{path}" + (f"#page={page}" if page else "")
                    await session.commit()
                stats["extracted"] += 1
            except Exception as e:
                stats["errors"] += 1
                log.warning("motion_texts.error", official_id=official_id, error=str(e))
    log.info("motion_texts.done", **stats)
    return stats
