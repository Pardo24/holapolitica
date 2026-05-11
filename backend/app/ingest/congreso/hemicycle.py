"""Ingest the seat-to-deputy mapping published by the Congreso hemicycle page.

Source: ``https://www.congreso.es/ca/hemiciclo`` (Catalan locale used for
parity with the rest of the project; the same image-map ships on every
locale variant).

Data shape
~~~~~~~~~~
The hemicycle page renders a static PNG (``/o/diputados/img/hemiciclo.png``,
536×393 pixels, RGBA) with an HTML image-map overlay::

    <map name="hemiciclo">
        <area shape="circle" id="fotoHemi"
            alt="Francina Armengol Socias (Presidenta del Congreso …)"
            coords="270,382,5"
            href="javascript:getUrlFichaDiputado(185, 15);"
            onmouseover="javascript:mostrarFotografiaHemiciclo(
                '/docu/imgweb/diputados/185_15.jpg', '/wc/htdocs/web',
                'Armengol Socias, Francina (…)',
                'Diputada per Balears (Illes)',
                'G. P. Mesa del Congreso', '', '', true, 185);" …>
        …
    </map>

There is **no JSON endpoint**. We scrape the HTML directly. Verified
2026-05-12: the live page exposes 369 ``<area>`` elements — 350 deputy
seats with a ``getUrlFichaDiputado(N, …)`` link, plus 19 ministerial
seats on the *Banco Azul* (cabinet bench) which lack the link because
the minister is not currently a deputy. We persist the 350 linked seats
and ignore the bench-only ministers.

Persistence model
~~~~~~~~~~~~~~~~~
We store the raw image-space coordinates on :class:`Person` (``seat_x``,
``seat_y``). Matching to our existing rows is keyed by
``cod_parlamentario`` (populated by ``app.ingest.congreso.photos``);
when that field is NULL we fall back to a normalised full-name lookup.

Idempotency: re-running the importer overwrites the seat columns for
every matched person — political-party reassignments happen
occasionally (mandate renunciation, group switches) and the hemicycle
page is the authoritative source for the current layout.

Network etiquette: a single HTML fetch per run. Polite, low-volume.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.client import CongresoClient
from app.models import Person

log = get_logger(__name__)

# Path under the Congreso base URL. We use the Catalan locale to match
# the project's default and exercise the same i18n path the user sees,
# but the image map ships on every locale variant.
HEMICYCLE_PATH: Final[str] = "/ca/hemiciclo"

# Natural pixel dimensions of /o/diputados/img/hemiciclo.png as of
# 2026-05-12. Stored as constants so the frontend (and tests) can refer
# to the same canonical viewBox.
HEMICYCLE_IMAGE_WIDTH: Final[int] = 536
HEMICYCLE_IMAGE_HEIGHT: Final[int] = 393


# The ``<area>`` elements are HTML5 void tags emitted by Liferay
# without a closing form — they're delimited only by the start of the
# next ``<area`` (or the closing ``</map>``). We split the HTML on
# that boundary, then run a handful of bounded regexes within each
# resulting block. This keeps the parser robust to:
#
# - trailing pad-spaces inside ``coords="270,382,5                     "``
# - attribute reordering between ``coords`` / ``href`` / ``alt``
# - the 19 cabinet-bench seats that lack ``getUrlFichaDiputado`` —
#   they simply fail the link regex and get skipped, while the
#   following block still parses correctly.
_AREA_SPLIT = re.compile(r"<area\b", re.IGNORECASE)

_COORDS_RE = re.compile(
    r"""coords\s*=\s*"\s*(?P<x>\d+)\s*,\s*(?P<y>\d+)\s*,\s*\d+[^"]*"\s*""",
    re.IGNORECASE | re.VERBOSE,
)

# Link to the deputy ficha. Carries ``codParlamentario`` as first arg.
_LINK_RE = re.compile(
    r"getUrlFichaDiputado\(\s*(?P<cod>\d+)\s*,\s*\d+\s*\)",
    re.IGNORECASE,
)

# The mostrarFotografiaHemiciclo() call carries the deputy's full name
# in the third positional argument. We grab it as a fallback identifier
# when our DB row doesn't yet have a cod_parlamentario. The format
# observed is "Family, Given (role)" — the role suffix is parenthesised
# and we strip it before name matching.
_NAME_IN_HOVER_RE = re.compile(
    r"mostrarFotografiaHemiciclo\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']+)'",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ParsedSeat:
    """One seat parsed from the hemicycle image map."""

    cod_parlamentario: int
    x: int
    y: int
    # Raw "Family, Given (role)" string from the hover JS — used as a
    # secondary match key. None when the JS shape diverges.
    raw_name: str | None = None


@dataclass(frozen=True, slots=True)
class HemicycleImportStats:
    """Counters returned by :func:`import_hemicycle_seats`."""

    seats_parsed: int = 0
    persons_matched_by_cod: int = 0
    persons_matched_by_name: int = 0
    persons_unmatched: int = 0
    unmatched_cods: tuple[int, ...] = field(default_factory=tuple)


def parse_hemicycle_html(html: str) -> list[ParsedSeat]:
    """Return every deputy-bound seat in the hemicycle image-map.

    Skips the 19 ministerial bench entries (``Banco Azul`` cabinet
    seats) that have no ``getUrlFichaDiputado`` link — those are
    ministers who are not currently deputies and would yield duplicate
    seat rows for the few cabinet members who *are* deputies too.

    De-duplicates by ``cod_parlamentario``: if the same code appears
    twice (a deputy who is also a presiding officer with a seat in the
    Mesa), the **last** occurrence wins. Mesa coordinates appear first
    in the HTML, then the deputy's regular seat below in their group.
    We prefer the regular seat because it's where the deputy sits when
    the Mesa is not presiding.
    """
    seen: dict[int, ParsedSeat] = {}

    # Split on the start of every ``<area`` tag. The first chunk is
    # everything before the first area (header markup) — we discard
    # it. Every subsequent chunk represents exactly one area block
    # whose attribute soup we can parse independently without risk of
    # bleeding into a neighbouring seat.
    chunks = _AREA_SPLIT.split(html)
    for block in chunks[1:]:
        link_match = _LINK_RE.search(block)
        if link_match is None:
            # Cabinet-bench / unlinked seat — skip.
            continue
        coords_match = _COORDS_RE.search(block)
        if coords_match is None:
            continue
        name_match = _NAME_IN_HOVER_RE.search(block)
        cod = int(link_match.group("cod"))
        seen[cod] = ParsedSeat(
            cod_parlamentario=cod,
            x=int(coords_match.group("x")),
            y=int(coords_match.group("y")),
            raw_name=(name_match.group(1).strip() if name_match else None),
        )

    return list(seen.values())


def normalise_name_for_match(raw: str) -> str:
    """Normalise a raw hover-card name string into a comparable key.

    Strips the parenthesised role suffix ("(Presidenta del Congreso de
    los Diputados)") and reflows ``"Family, Given"`` into the
    ``"Given Family"`` format our DB uses for ``Person.full_name``.
    Collapses whitespace and lowercases for a case-insensitive match.
    """
    cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", raw).strip()
    if "," in cleaned:
        family, _, given = cleaned.partition(",")
        cleaned = f"{given.strip()} {family.strip()}"
    return re.sub(r"\s+", " ", cleaned).strip().casefold()


async def import_hemicycle_seats(
    *,
    session: AsyncSession,
    html: str | None = None,
) -> HemicycleImportStats:
    """Parse the hemicycle HTML and persist ``seat_x`` / ``seat_y`` on each Person.

    ``html`` may be passed in for tests; in production it's ``None`` and
    we fetch the live page through :class:`CongresoClient`.

    The function commits once at the end.
    """
    if html is None:
        async with CongresoClient() as client:
            html = await client.fetch_html(HEMICYCLE_PATH)

    seats = parse_hemicycle_html(html)
    log.info("hemicycle.parsed", seats=len(seats))

    # Build two indexes over the current Persons table: by
    # cod_parlamentario (primary key for this importer) and by
    # normalised full name (fallback).
    rows = (await session.execute(select(Person))).scalars().all()
    by_cod: dict[int, Person] = {
        p.cod_parlamentario: p for p in rows if p.cod_parlamentario is not None
    }
    by_name: dict[str, Person] = {
        normalise_name_for_match(p.full_name): p for p in rows if p.full_name
    }

    matched_by_cod = 0
    matched_by_name = 0
    unmatched: list[int] = []

    for seat in seats:
        person: Person | None = by_cod.get(seat.cod_parlamentario)
        if person is not None:
            person.seat_x = seat.x
            person.seat_y = seat.y
            matched_by_cod += 1
            continue

        if seat.raw_name:
            key = normalise_name_for_match(seat.raw_name)
            person = by_name.get(key)
        if person is not None:
            # While we're here, opportunistically backfill the cod —
            # the hemicycle page is one of the only sources that exposes
            # it without scraping the search portlet.
            if person.cod_parlamentario is None:
                person.cod_parlamentario = seat.cod_parlamentario
            person.seat_x = seat.x
            person.seat_y = seat.y
            matched_by_name += 1
            continue

        unmatched.append(seat.cod_parlamentario)

    stats = HemicycleImportStats(
        seats_parsed=len(seats),
        persons_matched_by_cod=matched_by_cod,
        persons_matched_by_name=matched_by_name,
        persons_unmatched=len(unmatched),
        unmatched_cods=tuple(sorted(unmatched)),
    )

    await session.commit()
    log.info("hemicycle.done", **asdict(stats))
    return stats
