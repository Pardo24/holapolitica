"""Congress candidacies for the general election of 29 November 2026, from the BOE.

The BOE publishes every list twice, in one document each time, a few days
apart (LOREG arts. 47 and 169): the candidacies as presented, then as
proclaimed by the provincial electoral boards. Each document has one section
per board ("JUNTA ELECTORAL DE ALBACETE"), and in it the Congress and Senate
lists in the board's order: "1. PARTIDO POPULAR (PP)", the numbered
candidates, and "Suplentes:" with the substitutes. We keep the Congress lists.

``refresh`` looks through the BOE summaries of the days the documents can
appear on and imports any it finds; it is safe to run as often as wanted
(the scheduler runs it every three hours in the window). Names are kept as
published: the site shows the official lists, not a version of them.

Usage (inside the backend container)::

    python -m app.ingest.candidacies refresh
    python -m app.ingest.candidacies import BOE-A-2026-NNNNN proclaimed
"""

from __future__ import annotations

import argparse
import asyncio
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Final
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete, select

from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.models import ElectionCandidacy

configure_logging()
log = get_logger(__name__)

ELECTION: Final[str] = "2026-11"
ELECTION_DAY: Final[date] = date(2026, 11, 29)
#: Real Decreto 806/2026, de 5 de octubre (BOE-A-2026-20742), cited in the
#: title of both candidacy documents.
DECREE: Final[str] = "806/2026"
#: Days the documents can appear on: candidacies are presented 15-20 days
#: after the call (6 October), published two days later, proclaimed on day
#: 27 and published on day 28; a margin either side for delays.
WINDOW: Final[tuple[date, date]] = (date(2026, 10, 24), date(2026, 11, 12))

#: Seats per constituency, from the annex of Real Decreto 806/2026. Keyed by
#: the names the Congress open data uses, as everywhere else on the site.
SEATS: Final[dict[str, int]] = {
    "Albacete": 4, "Alicante/Alacant": 12, "Almería": 6, "Araba/Álava": 4, "Asturias": 7,
    "Ávila": 3, "Badajoz": 5, "Balears (Illes)": 8, "Barcelona": 32, "Bizkaia": 8,
    "Burgos": 4, "Cáceres": 4, "Cádiz": 8, "Cantabria": 5, "Castellón/Castelló": 5,
    "Ciudad Real": 5, "Córdoba": 6, "Coruña (A)": 8, "Cuenca": 3, "Gipuzkoa": 6,
    "Girona": 6, "Granada": 7, "Guadalajara": 3, "Huelva": 5, "Huesca": 3, "Jaén": 5,
    "León": 4, "Lleida": 4, "Lugo": 4, "Madrid": 38, "Málaga": 11, "Murcia": 10,
    "Navarra": 5, "Ourense": 4, "Palencia": 3, "Palmas (Las)": 8, "Pontevedra": 7,
    "Rioja (La)": 4, "Salamanca": 4, "S/C Tenerife": 7, "Segovia": 3, "Sevilla": 12,
    "Soria": 2, "Tarragona": 6, "Teruel": 3, "Toledo": 6, "Valencia/València": 16,
    "Valladolid": 5, "Zamora": 3, "Zaragoza": 7, "Ceuta": 1, "Melilla": 1,
}  # fmt: skip

#: Every election the table can hold: seats per constituency and polling day.
#: The 2023 lists (BOE-A-2023-15066) are the previous general election, kept
#: as such; Cádiz had one seat more and Madrid one fewer then.
ELECTIONS: Final[dict[str, tuple[date, dict[str, int]]]] = {
    ELECTION: (ELECTION_DAY, SEATS),
    "2023-07": (date(2023, 7, 23), {**SEATS, "Cádiz": 9, "Madrid": 37}),
}

BOE_SUMMARY_URL: Final[str] = "https://www.boe.es/datosabiertos/api/boe/sumario/{ymd}"
BOE_XML_URL: Final[str] = "https://www.boe.es/diario_boe/xml.php?id={boe_id}"
USER_AGENT: Final[str] = "holapolitica/1.0 (+https://www.holapolitica.org)"


def _fold(text: str) -> str:
    """Lower case, no accents, single spaces: for matching names."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s/]", " ", text.lower())).strip()


# How the boards name themselves where it is not the constituency's name.
_BOARD_ALIASES: Final[dict[str, str]] = {
    "a coruna": "Coruña (A)",
    "la coruna": "Coruña (A)",
    "las palmas": "Palmas (Las)",
    "la rioja": "Rioja (La)",
    "baleares": "Balears (Illes)",
    "illes balears": "Balears (Illes)",
    "islas baleares": "Balears (Illes)",
    "santa cruz de tenerife": "S/C Tenerife",
    "alava": "Araba/Álava",
    "araba": "Araba/Álava",
}


def constituency_for_board(board: str) -> str | None:
    """'JUNTA ELECTORAL DE A CORUÑA' → 'Coruña (A)'; None if unknown."""
    m = re.match(r"junta electoral (?:provincial )?de (.+)$", _fold(board))
    if not m:
        return None
    name = m.group(1).strip()
    if name in _BOARD_ALIASES:
        return _BOARD_ALIASES[name]
    for canonical in SEATS:
        parts = {_fold(p) for p in canonical.split("/")} | {_fold(canonical)}
        if name in parts:
            return canonical
    return None


@dataclass
class ParsedList:
    constituency: str
    ballot_order: int
    name: str
    acronym: str | None
    candidates: list[str] = field(default_factory=list)
    substitutes: list[str] = field(default_factory=list)
    #: The board turned it down ("No proclamada."): it does not stand.
    rejected: bool = False


_LIST_RE: Final = re.compile(r"^(\d+)\.\s+(.+)$")
_ITEM_RE: Final = re.compile(r"^(\d+)\.\s+(.+?)\.?$")


def split_list_name(text: str) -> tuple[str, str | None]:
    """'PARTIDO POPULAR (PP)' → ('PARTIDO POPULAR', 'PP').

    The initials are the last bracketed group, which can hold brackets of
    its own: 'PARTIDO SOCIALISTA DE EUSKADI (PSOE) (PSE-EE (PSOE))' or
    '... [PSE-EE (PSOE)]'.
    """
    text = text.strip()
    pairs = {")": "(", "]": "["}
    if not text or text[-1] not in pairs:
        return text, None
    depth = 0
    for i in range(len(text) - 1, -1, -1):
        c = text[i]
        if c in pairs:
            depth += 1
        elif c in pairs.values():
            depth -= 1
            if depth == 0:
                name, acronym = text[:i].strip(), text[i + 1 : -1].strip()
                return (name, acronym or None) if name else (text, None)
    return text, None


def _text(el: ET.Element) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def parse_candidacies(xml: bytes) -> list[ParsedList]:
    """The Congress lists of one BOE candidacy document, in order."""
    root = ET.fromstring(xml)
    texto = root.find("texto")
    if texto is None:
        return []
    out: list[ParsedList] = []
    constituency: str | None = None
    chamber: str | None = None
    current: ParsedList | None = None
    in_substitutes = False
    for p in texto.iter("p"):
        cls = p.get("class") or ""
        text = _text(p)
        if not text:
            continue
        if cls == "centro_negrita":
            if text.upper().startswith("JUNTA ELECTORAL"):
                constituency = constituency_for_board(text)
                if constituency is None:
                    log.warning("candidacies.unknown_board", board=text)
                chamber, current = None, None
            # "Circunscripción electoral: Mallorca" opens a Senate island.
            continue
        if cls == "centro_cursiva":
            upper = text.upper()
            chamber = (
                "congreso" if "CONGRESO" in upper else "senado" if "SENADO" in upper else chamber
            )
            current = None
            continue
        if chamber != "congreso" or constituency is None:
            continue
        if cls == "centro_redonda":
            m = _LIST_RE.match(text)
            if not m:
                current = None
                continue
            name, acronym = split_list_name(m.group(2))
            current = ParsedList(
                constituency=constituency,
                ballot_order=int(m.group(1)),
                name=name,
                acronym=acronym,
            )
            out.append(current)
            in_substitutes = False
            continue
        if current is None:
            continue
        if text.rstrip(":").strip().lower() == "suplentes":
            in_substitutes = True
            continue
        if _fold(text).startswith("no proclamada"):
            current.rejected = True
            continue
        m = _ITEM_RE.match(text)
        if m:
            (current.substitutes if in_substitutes else current.candidates).append(
                m.group(2).strip()
            )
    return [lst for lst in out if not lst.rejected]


def _stage_of(title: str) -> str | None:
    """Which document a BOE title is, if it is one of ours."""
    t = title.lower()
    if DECREE not in title or "congreso" not in t:
        return None
    if t.startswith("candidaturas proclamadas"):
        return "proclaimed"
    if t.startswith("candidaturas presentadas"):
        return "presented"
    return None


def _walk_items(node: object) -> list[dict[str, object]]:
    found: list[dict[str, object]] = []
    if isinstance(node, dict):
        if "identificador" in node and "titulo" in node:
            found.append(node)
        for v in node.values():
            found.extend(_walk_items(v))
    elif isinstance(node, list):
        for v in node:
            found.extend(_walk_items(v))
    return found


async def documents_on(client: httpx.AsyncClient, day: date) -> list[tuple[str, str]]:
    """(BOE id, stage) of the candidacy documents published on ``day``."""
    resp = await client.get(
        BOE_SUMMARY_URL.format(ymd=day.strftime("%Y%m%d")), headers={"Accept": "application/json"}
    )
    if resp.status_code == 404:  # no BOE that day (Sundays, holidays)
        return []
    resp.raise_for_status()
    docs = []
    for item in _walk_items(resp.json()):
        stage = _stage_of(str(item["titulo"]))
        if stage:
            docs.append((str(item["identificador"]), stage))
    return docs


async def import_document(
    boe_id: str, stage: str, published_on: date, election: str = ELECTION
) -> int:
    """Replace this stage's lists with the ones in ``boe_id``. Returns the count."""
    async with httpx.AsyncClient(timeout=60, headers={"User-Agent": USER_AGENT}) as client:
        resp = await client.get(BOE_XML_URL.format(boe_id=boe_id))
        resp.raise_for_status()
    lists = parse_candidacies(resp.content)
    if not lists:
        log.warning("candidacies.empty_document", boe_id=boe_id)
        return 0
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(ElectionCandidacy).where(
                ElectionCandidacy.election == election, ElectionCandidacy.stage == stage
            )
        )
        for lst in lists:
            session.add(
                ElectionCandidacy(
                    election=election,
                    stage=stage,
                    constituency=lst.constituency,
                    ballot_order=lst.ballot_order,
                    name=lst.name,
                    acronym=lst.acronym,
                    candidates=lst.candidates,
                    substitutes=lst.substitutes,
                    boe_id=boe_id,
                    published_on=published_on,
                )
            )
        await session.commit()
    constituencies = {lst.constituency for lst in lists}
    log.info(
        "candidacies.imported",
        boe_id=boe_id,
        stage=stage,
        lists=len(lists),
        constituencies=len(constituencies),
    )
    return len(lists)


async def refresh(today: date | None = None) -> dict[str, int]:
    """Import any candidacy document published so far that we do not have yet."""
    today = today or datetime.now(ZoneInfo("Europe/Madrid")).date()
    start, end = WINDOW
    if today < start:
        return {}
    async with AsyncSessionLocal() as session:
        have = {
            (b, s)
            for b, s in (
                await session.execute(
                    select(ElectionCandidacy.boe_id, ElectionCandidacy.stage)
                    .where(ElectionCandidacy.election == ELECTION)
                    .distinct()
                )
            ).all()
        }
    imported: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
        day = start
        while day <= min(today, end):
            try:
                docs = await documents_on(client, day)
            except httpx.HTTPError as e:
                log.warning("candidacies.summary_failed", day=day.isoformat(), error=str(e))
                docs = []
            for boe_id, stage in docs:
                if (boe_id, stage) not in have:
                    imported[boe_id] = await import_document(boe_id, stage, day)
            day += timedelta(days=1)
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("refresh")
    imp = sub.add_parser("import")
    imp.add_argument("boe_id")
    imp.add_argument("stage", choices=["presented", "proclaimed"])
    imp.add_argument("--date", type=date.fromisoformat, default=None)
    # A past election's document, kept as that election (e.g. 2023-07).
    imp.add_argument("--election", default=ELECTION, choices=sorted(ELECTIONS))
    args = parser.parse_args()
    if args.cmd == "refresh":
        print(asyncio.run(refresh()))
    else:
        print(
            asyncio.run(
                import_document(args.boe_id, args.stage, args.date or date.today(), args.election)
            )
        )


if __name__ == "__main__":
    main()
