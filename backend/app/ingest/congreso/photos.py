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

# Birth date: the ficha typically renders the birth row as a short
# "Nascut/Nacido el …" phrase. The portal's Java template emits the raw
# ``Date.toString()`` format ("Wed Aug 11 00:00:00 CET 1971"), with the
# year as the last token — so we anchor on the verb and capture a
# 4-digit year somewhere in the next ~200 characters. As a secondary
# pattern we also accept the older "Fecha de nacimiento … DD/MM/YYYY"
# idiom in case the template is reissued.
_BIRTH_LINE_RE = re.compile(
    r"(?:Nascut|Nascuda|Nacido|Nacida)\s+el\b[\s\S]{0,200}?(\d{4})",
    re.IGNORECASE,
)
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
    year: int | None = None
    line_match = _BIRTH_LINE_RE.search(html)
    if line_match is not None:
        try:
            year = int(line_match.group(1))
        except (TypeError, ValueError):
            year = None
    if year is None:
        date_match = _BIRTH_DATE_RE.search(html)
        if date_match is not None:
            try:
                year = int(date_match.group(3))
            except (TypeError, ValueError):
                year = None
    if year is None:
        return None
    # Sanity check — Spanish deputies must be at least 18, so anyone born
    # after current year - 18 is a parsing artefact. Likewise pre-1900 is
    # almost certainly a misparse of an unrelated date on the page.
    from datetime import datetime as _dt

    today_year = _dt.now().year
    if year < 1900 or year > today_year - 18:
        return None
    return year


# --- "Fitxa personal" biography paragraph -----------------------------------
#
# The ficha HTML places the bio as a loose text node between the
# "Legislatures" <p> and the next ``<div class="f-alta">`` row. There's
# no enclosing tag we can hook onto reliably — the source markup is
# spaghetti templated with cargos, condicio, etc. inline.
#
# Strategy: locate the ``<h3>Fitxa personal</h3>``/``<h3>Ficha personal</h3>``
# heading, then grab everything up to the first ``<div class="f-alta">``,
# strip HTML tags, drop the auto-generated birth-date line ("Nascuda el…")
# and the legislatures line ("Diputada de la XV Legislatura"), and keep
# only the editorial bio paragraph. ``<br>`` is preserved as a paragraph
# break (``\n\n``) so the frontend can split on it.
#
# Validated on 2026-05-12 against Armengol (cod 185) and Abascal (cod 317).
_FICHA_BIO_BLOCK_RE = re.compile(
    r"<h3>\s*(?:Fitxa|Ficha)\s+personal\s*</h3>(.*?)<div\s+class=\"f-alta\"",
    re.IGNORECASE | re.DOTALL,
)

# Pattern that recognises the auto-generated header lines we want to
# discard. The ficha header reads:
#   "Nascut/Nacido el <weekday> <month> <day> ... <year> [en <place>]"
#   "Nascuda/Nacida el <weekday> <month> <day> ... <year> [en <place>]"
#   "Diputat/Diputada/Diputado/Diputada de la XV Legislatura"
# Both render with the raw java Date.toString() format on the source —
# we don't want to surface "Wed Aug 11 00:00:00 CET 1971" to readers.
# The pre-collapsed normaliser in :func:`_extract_bio_text` glues a
# "en Inca, Mallorca (Illes Balears)" continuation onto the "Nascuda el"
# line as part of step 3, so a simple ``^Nascuda el`` prefix catches the
# whole sentence including the optional place-of-birth tail.
_FICHA_AUTOGEN_RE = re.compile(
    r"^\s*(?:Nascut|Nascuda|Nacido|Nacida)\s+el\b.*$"
    # Matches every locale + plural variant of the legislature header
    # row: "Diputat/Diputada/Diputado/Diputada de la(s|es) ROMAN[,
    # ROMAN, … (i|y|e) ROMAN] Legislatura(s)|Legislatures". Accepts
    # comma- and conjunction-joined roman numerals so e.g. "Diputat de
    # la XIII, XIV i XV Legislatures" (Abascal's ficha, Catalan plural)
    # and "Diputado de las X y XI Legislaturas" (Spanish plural) both
    # capture wholesale.
    r"|^\s*Diputa(?:t|da|do)\s+de\s+(?:la|las|les|los)\s+"
    r"\w+(?:\s*,\s*\w+)*(?:\s+(?:i|y|e)\s+\w+)*"
    r"\s+Legislatur(?:a|as|es)\b.*$",
    re.IGNORECASE | re.MULTILINE,
)

# --- "Càrrecs" / "Cargos" — committee + role list ---------------------------
#
# The "Càrrecs" section is a flat ``<ul class="cargos">`` containing one
# ``<li>`` per role. Each ``<li>`` is a few text fragments interleaved
# with whitespace and the occasional ``<a href="…">Comisión …</a>`` link;
# the natural flattening is "strip tags + collapse whitespace".
_FICHA_CARGOS_BLOCK_RE = re.compile(
    r"<h3>\s*(?:Càrrecs|Cargos)\s*</h3>\s*<ul[^>]*class=\"cargos[^\"]*\"[^>]*>(.*?)</ul>",
    re.IGNORECASE | re.DOTALL,
)
_FICHA_CARGOS_LI_RE = re.compile(r"<li[^>]*>(.*?)</li>", re.IGNORECASE | re.DOTALL)

# Generic HTML-tag stripper. Conservative — keeps text content of every
# element. We deliberately do NOT decode HTML entities here (there are
# very few in this corpus and the few that appear render fine in the UI);
# adding html.unescape would be safe but unnecessary.
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# In the bio, ``<br>`` is the source's only paragraph separator. Convert
# to a sentinel before stripping the rest of the tags so we can preserve
# the visual structure as ``\n\n`` in the persisted text.
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)


def _strip_html(html: str) -> str:
    """Drop all HTML tags from ``html`` and collapse internal whitespace.

    Preserves the relative ordering of text nodes — i.e. it's the
    simplest possible faithful flattening. Multiple consecutive
    whitespace characters (including newlines and tabs) collapse to a
    single space. Used by both the bio and the cargos extractors.
    """
    text = _HTML_TAG_RE.sub(" ", html)
    return re.sub(r"\s+", " ", text).strip()


def _extract_bio_text(html: str) -> str | None:
    """Return the deputy's biography paragraph from a ficha page, or None.

    The bio block (``<h3>Fitxa personal</h3>`` → next ``<div
    class="f-alta">``) contains auto-generated header lines ("Nascuda el
    Wed Aug 11 … en Inca, Mallorca (Illes Balears)", "Diputada de la XV
    Legislatura") and the actual bio paragraph as a loose text node. We
    extract the block, treat ``<br>`` as the *only* paragraph break (so
    a header sentence split across two <p>s or whitespace-only line
    wraps stays as one virtual line and gets dropped wholesale), then
    drop the auto-generated header lines and return what's left — or
    ``None`` when nothing meaningful remains.
    """
    match = _FICHA_BIO_BLOCK_RE.search(html)
    if match is None:
        return None
    raw = match.group(1)
    # Step 1: identify all *authored* paragraph boundaries. The source
    # uses two idioms — ``<br>`` inline within a paragraph and ``</p>``
    # at the end of one. Both become a sentinel token; every other tag
    # is replaced with a space so neighbouring words don't glue. The
    # double-vertical-bar token is the sentinel — a string that never
    # appears in any deputy's ficha (verified against the live corpus)
    # and crucially, is NOT matched by ``\s`` so the subsequent
    # whitespace-collapse pass won't eat it the way it would a control
    # character.
    sentinel = "|||"
    raw = _BR_RE.sub(sentinel, raw)
    raw = re.sub(r"</p\s*>", sentinel, raw, flags=re.IGNORECASE)
    raw = _HTML_TAG_RE.sub(" ", raw)
    # Step 2: collapse all *unintended* whitespace runs (raw template
    # newlines, indentation tabs) into single spaces. This is what
    # flattens "Nascuda el …" + indented "en Inca, …" into one logical
    # line so the autogen filter catches the whole sentence.
    raw = re.sub(r"\s+", " ", raw)
    # Step 3: split on the authored sentinel boundaries.
    lines = [ln.strip() for ln in raw.split(sentinel)]
    # Step 4: drop empty lines and the auto-generated header rows.
    kept: list[str] = []
    for ln in lines:
        if not ln:
            continue
        if _FICHA_AUTOGEN_RE.match(ln):
            continue
        # The header section also embeds the "Condició plena" timestamp
        # ("Condició plena: Thu Aug 17 …") — drop it; it's not bio.
        if re.match(r"^\s*(?:Condició|Condición)\s+plena", ln, re.IGNORECASE):
            continue
        kept.append(ln)
    if not kept:
        return None
    bio = "\n\n".join(kept)
    # Sanity floor: a single-word residue is almost certainly noise.
    if len(bio) < 4:
        return None
    return bio


def _extract_commissions(html: str) -> list[str]:
    """Return the verbatim "Càrrecs" list as plain text strings.

    Each ``<li>`` becomes one entry. Anchor tags inside the li (links to
    the Comisión / Mesa / Junta pages) are flattened to their text
    content. The order matches the source HTML.

    Returns an empty list when the ficha has no Càrrecs block — that's
    a legitimate "we scraped, nothing to show" signal distinct from the
    NULL "we never scraped" state captured in the DB column.
    """
    block = _FICHA_CARGOS_BLOCK_RE.search(html)
    if block is None:
        return []
    items: list[str] = []
    for li_match in _FICHA_CARGOS_LI_RE.finditer(block.group(1)):
        text = _strip_html(li_match.group(1))
        if text:
            items.append(text)
    return items


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
            # Biography paragraph + committee/role list from the same
            # ficha. Both are refreshed on every run — the source is the
            # authoritative copy and a re-run is how we catch new
            # committee assignments after a Mesa reshuffle. Commissions
            # is always assigned (empty list when no block exists); bio
            # is only overwritten when we actually parsed something to
            # avoid clobbering a manual edit with NULL on a transient
            # template change.
            bio = _extract_bio_text(ficha_html)
            if bio is not None:
                person.bio_text = bio
            person.commissions = _extract_commissions(ficha_html)
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
