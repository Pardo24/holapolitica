"""Backfill official deputy photos and the Congreso's stable ``codParlamentario``.

The open-data feed publishes deputies but NOT their numeric Congreso ID.
The website itself uses one (e.g. Santiago Abascal = 317) and serves
photos at::

    https://www.congreso.es/docu/imgweb/diputados/{cod}_{legislature}.jpg

Pattern verified on 2026-05-08 for codes 1, 100, 200, 317, 350.

This module does a one-shot scrape: probe consecutive codes, fetch the
ficha page when a photo exists, parse the deputy's name from the page's
``<h1>``, and join it back to our ``persons`` table by ``full_name``.

Network etiquette: sequential requests with a polite delay, identifying
User-Agent (already configured at :class:`CongresoClient`). The portal
publishes these pages without a robots.txt restriction; running this
weekly would be rude — we run it once and re-run only when new mandates
land.

Photo licensing: Povedano is the credited photographer; the Congreso
publishes them on its website without a per-image attribution string. We
attribute "© Congreso de los Diputados" wherever we display a photo, per
the project's neutrality stance.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import asdict, dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.parse import parse_person_name
from app.models import Person

log = get_logger(__name__)

# The ficha page wraps the deputy's name in ``<div class="nombre-dip">``.
# Pattern observed 2026-05-08; brittle to a portal redesign but that's
# inherent to scraping unstructured HTML.
_NAME_RE = re.compile(
    r'<div\s+class="nombre-dip"[^>]*>\s*([^<]+?)\s*</div>',
    re.IGNORECASE,
)

# Birth date: the ficha typically renders a row labeled "Fecha de
# nacimiento" with the date in DD/MM/YYYY form. Two HTML idioms appear
# in the wild:
#   <span class="lbl">Fecha de nacimiento</span><span>20/04/1980</span>
#   <dt>Fecha de nacimiento</dt><dd>20/04/1980</dd>
# The pattern below matches both by looking for the literal label and
# then capturing the next non-tag chunk that looks like a date.
_BIRTH_DATE_RE = re.compile(
    r"Fecha\s+de\s+nacimiento[\s\S]{0,200}?(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})",
    re.IGNORECASE,
)


def _extract_birth_year(html: str) -> int | None:
    """Return the deputy's birth year from a ficha page, or None.

    We only persist the year (not the full date) because: (a) civic
    privacy — the day/month is personal info that doesn't matter for
    parliamentary activity tracking, (b) age is the only derived signal
    we surface to the public. Storing less is the safer default.
    """
    match = _BIRTH_DATE_RE.search(html)
    if match is None:
        return None
    try:
        year = int(match.group(3))
    except (TypeError, ValueError):
        return None
    # Sanity check — Spanish deputies must be at least 18, so anyone born
    # after current year - 18 is a parsing artefact. Likewise pre-1900 is
    # almost certainly a misparse of an unrelated date on the page.
    from datetime import datetime as _dt

    today_year = _dt.now().year
    if year < 1900 or year > today_year - 18:
        return None
    return year


_PHOTO_PATH = "/docu/imgweb/diputados/{cod}_{leg}.jpg"
_FICHA_PATH = (
    "/ca/busqueda-de-diputados"
    "?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal"
    "&p_p_mode=view&_diputadomodule_mostrarFicha=true"
    "&codParlamentario={cod}&idLegislatura={leg}"
)

# Tiny placeholder JPEGs (e.g. the blank silhouette for code 1) are usually
# under 4 KB. Real Povedano portraits run 30-60 KB. Filter on size to skip
# placeholders without round-tripping the ficha page.
_PHOTO_MIN_BYTES = 5000


@dataclass(frozen=True, slots=True)
class PhotoBackfillStats:
    codes_probed: int = 0
    photos_found: int = 0
    fichas_fetched: int = 0
    persons_matched: int = 0
    persons_unmatched: int = 0


async def backfill_photos(
    *,
    session: AsyncSession,
    legislature_number: str = "15",
    cod_range: range = range(1, 601),
    delay_seconds: float = 0.2,
) -> PhotoBackfillStats:
    """Probe codes in ``cod_range`` and assign ``photo_url`` + ``cod_parlamentario``.

    The Spanish Congress has 350 seats; 1..600 covers all current and
    historically-recent codes. Codes that 404 or have a placeholder photo
    are skipped silently.

    The function commits once at the end so it's safe to interrupt.
    """
    persons_by_full_name = await _persons_indexed_by_name(session)
    stats = PhotoBackfillStats()
    matched: list[Person] = []

    async with CongresoClient() as client:
        # Reuse the client's underlying httpx session for HEADs too.
        if client._client is None:
            raise RuntimeError("Client failed to initialize")

        for cod in cod_range:
            stats = stats.__class__(
                codes_probed=stats.codes_probed + 1,
                photos_found=stats.photos_found,
                fichas_fetched=stats.fichas_fetched,
                persons_matched=stats.persons_matched,
                persons_unmatched=stats.persons_unmatched,
            )
            photo_url, exists = await _photo_exists(client, cod, legislature_number)
            if not exists:
                await asyncio.sleep(delay_seconds)
                continue
            stats = stats.__class__(
                codes_probed=stats.codes_probed,
                photos_found=stats.photos_found + 1,
                fichas_fetched=stats.fichas_fetched,
                persons_matched=stats.persons_matched,
                persons_unmatched=stats.persons_unmatched,
            )

            roman = legislature_number_to_roman(legislature_number)
            ficha_html = await client.fetch_html(_FICHA_PATH.format(cod=cod, leg=roman))
            stats = stats.__class__(
                codes_probed=stats.codes_probed,
                photos_found=stats.photos_found,
                fichas_fetched=stats.fichas_fetched + 1,
                persons_matched=stats.persons_matched,
                persons_unmatched=stats.persons_unmatched,
            )
            full_name = _extract_full_name(ficha_html)
            if full_name is None:
                stats = _bump_unmatched(stats)
                await asyncio.sleep(delay_seconds)
                continue

            person = persons_by_full_name.get(full_name)
            if person is None:
                log.info("photos.no_match", cod=cod, ficha_full_name=full_name)
                stats = _bump_unmatched(stats)
                await asyncio.sleep(delay_seconds)
                continue

            person.cod_parlamentario = cod
            person.photo_url = photo_url
            person.biography_url = (
                f"https://www.congreso.es{_FICHA_PATH.format(cod=cod, leg=roman)}"
            )
            # Backfill birth_year from the same ficha — saves a second
            # round of HTTPs. Don't overwrite a value already set by a
            # prior run or a manual correction.
            if person.birth_year is None:
                year = _extract_birth_year(ficha_html)
                if year is not None:
                    person.birth_year = year
            matched.append(person)
            stats = stats.__class__(
                codes_probed=stats.codes_probed,
                photos_found=stats.photos_found,
                fichas_fetched=stats.fichas_fetched,
                persons_matched=stats.persons_matched + 1,
                persons_unmatched=stats.persons_unmatched,
            )
            await asyncio.sleep(delay_seconds)

    await session.commit()
    log.info("photos.done", **asdict(stats))
    return stats


async def _persons_indexed_by_name(
    session: AsyncSession,
) -> dict[str, Person]:
    rows = (await session.execute(select(Person))).scalars().all()
    return {p.full_name: p for p in rows}


async def _photo_exists(client: CongresoClient, cod: int, legislature: str) -> tuple[str, bool]:
    """HEAD the photo URL and return ``(absolute_url, is_real_photo)``."""
    path = _PHOTO_PATH.format(cod=cod, leg=legislature)
    url = client._absolute(path)
    assert client._client is not None
    try:
        response = await client._client.head(url)
    except httpx.HTTPError as e:
        log.debug("photos.head.error", url=url, error=str(e))
        return url, False
    if response.status_code != 200:
        return url, False
    size = int(response.headers.get("content-length", "0") or 0)
    return url, size >= _PHOTO_MIN_BYTES


def _extract_full_name(html: str) -> str | None:
    match = _NAME_RE.search(html)
    if match is None:
        return None
    raw = match.group(1)
    name = parse_person_name(raw)
    return name.full_name if name.given_names else None


def _bump_unmatched(stats: PhotoBackfillStats) -> PhotoBackfillStats:
    return PhotoBackfillStats(
        codes_probed=stats.codes_probed,
        photos_found=stats.photos_found,
        fichas_fetched=stats.fichas_fetched,
        persons_matched=stats.persons_matched,
        persons_unmatched=stats.persons_unmatched + 1,
    )


def legislature_number_to_roman(n: str) -> str:
    """Convert integer-form legislature ('15') to the Roman ('XV') the URLs accept."""
    table = {"15": "XV", "14": "XIV", "13": "XIII", "12": "XII", "11": "XI", "10": "X"}
    return table.get(n, "XV")
