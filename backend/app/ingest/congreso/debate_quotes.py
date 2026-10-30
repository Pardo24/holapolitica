"""One verbatim quote per group from the plenary debate behind a vote.

Sources, both on congreso.es and both reachable from the server:

- The open-data dataset ``IntervencionesIniciativa`` (one row per speech:
  expediente, session date, phase, speaker with their group's code, and the
  Diario de Sesiones PDF with the page where the speech starts).
- The Diario de Sesiones PDF itself (``DSCD-15-PL-181.PDF``), which has a
  clean text layer: each speech opens with ``La señora VELARDE GÓMEZ:``.

For each debate on a voted item we take each group's longest speech (each
speaker's, in the Mixed Group, whose parties vote apart), number its sentences
and ask the LLM which to quote. It answers with numbers, never with text: asked
to copy a passage, the model paraphrased about half the time ("mandar" became
"enviar", "[...]" appeared in the middle). What is stored is cut from the
source and checked once more to be a literal substring of that speech, so a
quote can never be attributed to someone who did not say it. Ministers speak
for the Government, not for a group, and are left out.

The dataset covers the current legislature only.

Usage (inside the backend container)::

    python -m app.ingest.congreso.debate_quotes --since 2026-01-01 --limit 5 \
        --dry-run --out quotes.jsonl
    python -m app.ingest.congreso.debate_quotes --since 2023-08-17

Neutrality contract (CLAUDE.md "mirall, no megàfon"): quotes only, verbatim,
sourced. Every group goes through the same prompt, and the site labels the
quote as what was said in the debate, not as the reason for the vote.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.motion_texts import expediente_of
from app.models import DebateQuote, Initiative, Legislature, ParliamentaryGroup, Vote
from app.models import Session as SessionModel
from app.services.debate_quotes import DEBATE_WINDOW_DAYS
from app.services.plain_summary import _call_llm_for_text

log = get_logger(__name__)

LEGISLATURE_START = date(2023, 8, 17)

# The dataset's group codes, as printed after each speaker's name.
GROUP_SLUG_BY_CODE: dict[str, str] = {
    "GP": "gp-popular",
    "GS": "gp-socialista",
    "GVOX": "gp-vox",
    "GSUMAR": "gp-plurinacional-sumar",
    "GR": "gp-republicano",
    "GV (EAJ-PNV)": "gp-vasco-eaj-pnv",
    "GJxCAT": "gp-junts-per-catalunya",
    "GEH Bildu": "gp-euskal-herria-bildu",
    "GMx": "gp-mixto",
}
_MIXED_GROUP = "gp-mixto"

# "Esteban Bravo, Aitor (GV (EAJ-PNV))"
_SPEAKER = re.compile(r"^(?P<family>[^,]+),\s*(?P<given>.+?)\s*\((?P<code>G.*)\)\s*$")
_DSCD_LINK = re.compile(r"(?P<ref>DSCD-\d+-PL-\d+)\.PDF#page=(?P<page>\d+)", re.IGNORECASE)
_SPEECH_HEADER = re.compile(
    r"^(?:El|La) señora? (?P<who>[A-ZÁÉÍÓÚÜÑÀÈÒÏÇ][^:]{1,160}?):", re.MULTILINE
)
_PAGE_CHROME = re.compile(
    r"^(?:DIARIO DE SESIONES DEL CONGRESO DE LOS DIPUTADOS"
    r"|PLENO Y DIPUTACIÓN PERMANENTE"
    r"|Núm\. \d+\s.*Pág\. \d+"
    r"|cve: DSCD-\S+)\s*$",
    re.MULTILINE,
)
_STAGE_DIRECTION = re.compile(
    r"\(\s*(?:Aplaus|Rumor|Risa|Protest|Pausa|Varios|Una?\s|El señor|La señora|Muestra|Golpe)"
)
# Where a sentence ends: ".", "?", "!" or "…" before something that opens one.
_SENTENCE_END = re.compile(r"(?<=[.?!…])\s+(?=[\"'«“¿¡(\[A-ZÁÉÍÓÚÜÑÀÈÒÏÇ])")
# Abbreviations whose full stop does not end a sentence.
_ABBREVIATION = re.compile(
    r"\b(?:art|arts|núm|sr|sra|srs|sras|dr|dra|d|dña|pág|etc)\.$", re.IGNORECASE
)

_PAGES_TO_READ = 14
_MIN_SPEECH_CHARS = 200
_MAX_SPEECH_CHARS = 20000
_MIN_QUOTE_CHARS = 40
_MAX_QUOTE_CHARS = 450
_MAX_QUOTE_SENTENCES = 3

STATUS_OK = "ok"
STATUS_NO_SPEECH = "no_speech"
STATUS_NO_PASSAGE = "no_passage"
STATUS_REJECTED = "rejected"

_PROMPT = """\
Eres un documentalista parlamentario neutral. Recibirás el asunto debatido en
el Pleno del Congreso y la intervención COMPLETA de un portavoz, con cada frase
numerada. Elige el pasaje que mejor recoja la posición de su grupo sobre ESE
asunto.

REGLAS ESTRICTAS:
- Responde solo con números de frase: de una a tres frases CONSECUTIVAS, que
  sumen como mucho unos 350 caracteres.
- El pasaje debe entenderse por sí solo y tratar del asunto. Prefiere donde el
  portavoz dice qué votará su grupo o por qué apoya o rechaza el texto.
- Elige el más representativo, no el más llamativo ni el más polémico. Evita
  saludos, agradecimientos, insultos, ataques personales y frases sobre otros
  grupos que no digan nada de la posición propia.
- No elijas frases con acotaciones como (Aplausos).
- Si la intervención no fija posición sobre el asunto, devuelve null.

Devuelve SOLO este JSON: {"frases": [12, 13]} o {"frases": null}
"""


@dataclass(frozen=True, slots=True)
class Turn:
    """One speech by a deputy, as the dataset lists it."""

    speaker: str  # "Martina Velarde Gómez"
    family: str  # "Velarde Gómez"
    group_slug: str
    dscd_ref: str  # "DSCD-15-PL-181"
    page: int
    minutes: int
    phase: str | None


@dataclass(slots=True)
class Debate:
    expediente: str
    debate_date: date
    title: str
    turns: list[Turn]


@dataclass(slots=True)
class PickedQuote:
    """What one speech yielded. ``quote`` is None unless status is ok."""

    expediente: str
    debate_date: str
    title: str
    group_slug: str
    speaker: str
    dscd_ref: str
    page: int
    phase: str | None
    status: str
    quote: str | None


def parse_speaker(raw: str | None) -> tuple[str, str, str] | None:
    """``"Velarde Gómez, Martina (GMx)"`` -> (display name, family, group slug).

    None when the row names no known group.
    """
    match = _SPEAKER.match(raw or "")
    if match is None:
        return None
    slug = GROUP_SLUG_BY_CODE.get(match.group("code").strip())
    if slug is None:
        return None
    family = match.group("family").strip()
    return f"{match.group('given').strip()} {family}", family, slug


def _minutes(start: str | None, end: str | None) -> int:
    try:
        begin = datetime.strptime(start or "", "%H:%M")
        finish = datetime.strptime(end or "", "%H:%M")
    except ValueError:
        return 0
    return max(0, int((finish - begin).total_seconds() // 60))


def plan_debates(
    rows: Iterable[Mapping[str, Any]],
    voted: Mapping[str, set[date]],
    *,
    since: date,
    until: date | None = None,
) -> list[Debate]:
    """The debates on voted items, newest first, with the speeches to read.

    A plenary debates an item one day and votes on it at the end of that day
    or later that week, so a debate counts when a vote on the same expediente
    follows within :data:`DEBATE_WINDOW_DAYS`.
    """
    window = timedelta(days=DEBATE_WINDOW_DAYS)
    debates: dict[tuple[str, date], Debate] = {}
    for row in rows:
        if row.get("ORGANO") != "Pleno" or row.get("TIPOINTERVENCION") != "Intervención":
            continue
        # Ministers and the Prime Minister carry their group's code too, but
        # they speak for the Government.
        if row.get("CARGOORADOR") not in ("Diputado", "Diputada"):
            continue
        raw_expediente = row.get("NUMEXPEDIENTE")
        speaker = parse_speaker(row.get("ORADOR"))
        link = _DSCD_LINK.search(row.get("ENLACEPDF") or "")
        if not raw_expediente or speaker is None or link is None:
            continue
        expediente = expediente_of(raw_expediente)
        try:
            debate_date = datetime.strptime(str(row.get("SESION")), "%d/%m/%Y").date()
        except ValueError:
            continue
        if debate_date < since or (until is not None and debate_date > until):
            continue
        if not any(debate_date <= v <= debate_date + window for v in voted.get(expediente, ())):
            continue
        debate = debates.setdefault(
            (expediente, debate_date),
            Debate(
                expediente=expediente,
                debate_date=debate_date,
                title=" ".join(str(row.get("OBJETOINICIATIVA") or "").split()),
                turns=[],
            ),
        )
        debate.turns.append(
            Turn(
                speaker=speaker[0],
                family=speaker[1],
                group_slug=speaker[2],
                dscd_ref=link.group("ref").upper(),
                page=int(link.group("page")),
                minutes=_minutes(row.get("INICIOINTERVENCION"), row.get("FININTERVENCION")),
                phase=row.get("FASE"),
            )
        )
    return sorted(debates.values(), key=lambda d: (d.debate_date, d.expediente), reverse=True)


def main_turns(debate: Debate) -> list[Turn]:
    """Each group's longest speech; in the Mixed Group, each speaker's.

    The Mixed Group's parties vote apart, so picking one of them would be
    choosing a party. Ties go to the earlier speech: the one that fixes the
    position, not the reply.
    """
    best: dict[tuple[str, str], Turn] = {}
    for turn in debate.turns:
        key = (turn.group_slug, turn.speaker if turn.group_slug == _MIXED_GROUP else "")
        if key not in best or turn.minutes > best[key].minutes:
            best[key] = turn
    return list(best.values())


def clean_pages(raw_pages: Sequence[str]) -> list[str]:
    """Pages without the running header and footer, which would otherwise
    land in the middle of any speech crossing a page."""
    return [_PAGE_CHROME.sub("", page) for page in raw_pages]


def _key(text: str) -> str:
    """Uppercase letters only: names compare across accents and hyphens."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if c.isalpha()).upper()


def _is_header(who: str) -> bool:
    # A sentence that happens to open with "El señor Pérez dijo:" is not a
    # speech. Headers print the name in capitals; a role's "(Name)" may not.
    return who.split("(", 1)[0].strip().isupper()


def _is_chair(who_key: str) -> bool:
    return who_key.startswith(("PRESIDENT", "VICEPRESIDENT"))


def speech_of(pages: Sequence[str], page: int, family: str) -> str | None:
    """The speech by ``family`` starting on 1-based ``page``.

    Runs to the next speaker. The chair cutting in ("Señoría, tiene que
    terminar") does not end it: the speaker's own words around the
    interruption are kept, the chair's are not.
    """
    text = "\n".join(pages[max(0, page - 1) : page - 1 + _PAGES_TO_READ])
    target = _key(family)
    parts: list[str] = []
    headers = [m for m in _SPEECH_HEADER.finditer(text) if _is_header(m.group("who"))]
    for i, header in enumerate(headers):
        who = _key(header.group("who"))
        if who.startswith(target):
            end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
            parts.append(text[header.end() : end])
        elif parts and not _is_chair(who):
            break
    return "\n".join(parts) if parts else None


def _collapse(text: str) -> str:
    return " ".join(text.replace("\u00ad", "").split())


def split_sentences(speech: str) -> list[str]:
    """The speech's sentences, in order, with whitespace collapsed."""
    sentences: list[str] = []
    for piece in _SENTENCE_END.split(_collapse(speech)):
        if sentences and _ABBREVIATION.search(sentences[-1]):
            sentences[-1] += f" {piece}"
        else:
            sentences.append(piece)
    return sentences


def fit_passage(chosen: Sequence[str]) -> str:
    """The chosen sentences, up to the first that would make the quote too long
    or brings a stage direction with it. The model over-picks, and a sentence
    fewer of a whole passage is still what was said."""
    passage = chosen[0] if chosen else ""
    for sentence in chosen[1:]:
        longer = f"{passage} {sentence}"
        if len(longer) > _MAX_QUOTE_CHARS or _STAGE_DIRECTION.search(sentence):
            break
        passage = longer
    return passage


def is_literal(passage: str, speech: str) -> bool:
    """The literalness gate: the passage is in the speech, whitespace aside."""
    return bool(passage) and _collapse(passage) in _collapse(speech)


def is_presentable(passage: str) -> bool:
    """Whole sentences of a readable length, with no stage directions: a quote
    cut mid-sentence can change what was said."""
    if not _MIN_QUOTE_CHARS <= len(passage) <= _MAX_QUOTE_CHARS:
        return False
    if _STAGE_DIRECTION.search(passage):
        return False
    first = passage.lstrip("\"'«“¿¡([")[:1]
    return first.isupper() and passage.rstrip("\"'»”)]")[-1:] in (".", "?", "!", "…")


def page_of(passage: str, pages: Sequence[str], start_page: int) -> int:
    """The 1-based page the passage starts on, for the link to the PDF."""
    opening = _collapse(passage)[:50]
    for number in range(start_page, min(start_page + _PAGES_TO_READ, len(pages) + 1)):
        if opening in _collapse(pages[number - 1]):
            return number
    return start_page


def parse_choice(raw: str, sentence_count: int) -> list[int]:
    """The 1-based sentence numbers the model chose: the first consecutive run,
    within range and :data:`_MAX_QUOTE_SENTENCES`. Empty when it chose none."""
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return []
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return []
    numbers = payload.get("frases") if isinstance(payload, dict) else None
    if not isinstance(numbers, list):
        return []
    run: list[int] = []
    for number in numbers:
        if not isinstance(number, int) or not 1 <= number <= sentence_count:
            break
        if run and number != run[-1] + 1:
            break
        run.append(number)
    return run[:_MAX_QUOTE_SENTENCES]


async def pick_quote(
    settings: Settings, debate: Debate, turn: Turn, pages: Sequence[str]
) -> PickedQuote:
    """Read one speech and pick its passage. LLM errors propagate: the speech
    is then left unrecorded and retried on the next run."""

    def result(status: str, quote: str | None = None, page: int | None = None) -> PickedQuote:
        return PickedQuote(
            expediente=debate.expediente,
            debate_date=debate.debate_date.isoformat(),
            title=debate.title,
            group_slug=turn.group_slug,
            speaker=turn.speaker,
            dscd_ref=turn.dscd_ref,
            page=page or turn.page,
            phase=turn.phase,
            status=status,
            quote=quote,
        )

    speech = speech_of(pages, turn.page, turn.family)
    if speech is None or len(_collapse(speech)) < _MIN_SPEECH_CHARS:
        return result(STATUS_NO_SPEECH)
    sentences = split_sentences(speech)
    numbered = "\n".join(f"[{i}] {text}" for i, text in enumerate(sentences, start=1))
    user = (
        f"ASUNTO: {debate.title}\nTRÁMITE: {turn.phase or '-'}\n\nINTERVENCIÓN:\n"
        f"{numbered[:_MAX_SPEECH_CHARS]}"
    )
    raw = await _call_llm_for_text(settings, system=_PROMPT, user=user)
    chosen = parse_choice(raw, len(sentences))
    if not chosen:
        return result(STATUS_NO_PASSAGE)
    passage = fit_passage([sentences[number - 1] for number in chosen])
    if not is_literal(passage, speech) or not is_presentable(passage):
        log.info(
            "debate_quotes.dropped",
            expediente=debate.expediente,
            speaker=turn.speaker,
            passage=passage[:120],
            length=len(passage),
        )
        return result(STATUS_REJECTED)
    return result(STATUS_OK, passage, page_of(passage, pages, turn.page))


async def voted_expedientes(session: AsyncSession, since: date) -> dict[str, set[date]]:
    """``{expediente: dates it was voted on}`` from the votes table."""
    rows = await session.execute(
        select(Vote.expediente_raw, Initiative.official_id, SessionModel.date)
        .join(SessionModel, SessionModel.id == Vote.session_id)
        .outerjoin(Initiative, Initiative.id == Vote.initiative_id)
        .where(SessionModel.date >= since)
    )
    voted: dict[str, set[date]] = defaultdict(set)
    for raw, official_id, day in rows:
        expediente = raw or official_id
        if expediente:
            voted[expediente_of(expediente)].add(day)
    return voted


def _pdf_path(dscd_ref: str) -> str:
    return f"/public_oficiales/L{dscd_ref.split('-')[1]}/CONG/DS/PL/{dscd_ref}.PDF"


def _read_pdf(content: bytes) -> list[str]:
    return clean_pages([page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages])


async def ingest(
    session: AsyncSession,
    *,
    since: date,
    until: date | None = None,
    limit: int | None = None,
    expediente: str | None = None,
    dry_run: bool = False,
    out_path: Path | None = None,
) -> dict[str, int]:
    """Read the speeches not read yet, for up to ``limit`` debates.

    Every speech read leaves a row, with ``quote`` NULL when nothing usable
    came out, so a later run does not pay for it again. ``dry_run`` writes
    nothing to the database; ``out_path`` gets each result as a JSON line.
    """
    settings = get_settings()
    stats: dict[str, int] = defaultdict(int)
    voted = await voted_expedientes(session, since)
    groups = {
        slug: group_id
        for slug, group_id in (
            await session.execute(
                select(ParliamentaryGroup.slug, ParliamentaryGroup.id)
                .join(Legislature, Legislature.id == ParliamentaryGroup.legislature_id)
                .where(
                    Legislature.number == "XV",
                    ParliamentaryGroup.slug.in_(GROUP_SLUG_BY_CODE.values()),
                )
            )
        ).all()
    }
    existing = {
        (row[0], row[1], row[2], row[3])
        for row in await session.execute(
            select(
                DebateQuote.expediente,
                DebateQuote.debate_date,
                DebateQuote.group_id,
                DebateQuote.speaker_name,
            ).where(DebateQuote.debate_date >= since)
        )
    }

    async with CongresoClient(timeout=180.0) as client:
        debates = plan_debates(
            json.loads(await client.fetch_interventions()), voted, since=since, until=until
        )
        if expediente:
            debates = [d for d in debates if d.expediente == expediente]
        stats["debates_found"] = len(debates)

        out = out_path.open("w", encoding="utf-8") if out_path else None
        # One diary per day and debates sorted by day, so keeping the last
        # one is enough to read each PDF once.
        pages_ref: str | None = None
        pages: list[str] = []
        try:
            for debate in debates:
                turns = [
                    t
                    for t in main_turns(debate)
                    if (debate.expediente, debate.debate_date, groups.get(t.group_slug), t.speaker)
                    not in existing
                ]
                if not turns:
                    continue
                if limit is not None and stats["debates_read"] >= limit:
                    break
                stats["debates_read"] += 1
                for turn in turns:
                    group_id = groups.get(turn.group_slug)
                    if group_id is None:
                        stats["unknown_group"] += 1
                        continue
                    try:
                        if turn.dscd_ref != pages_ref:
                            pages = _read_pdf(await client.fetch_bytes(_pdf_path(turn.dscd_ref)))
                            pages_ref = turn.dscd_ref
                        picked = await pick_quote(settings, debate, turn, pages)
                    except Exception as exc:
                        stats["errors"] += 1
                        log.warning(
                            "debate_quotes.error",
                            expediente=debate.expediente,
                            speaker=turn.speaker,
                            error=str(exc),
                        )
                        continue
                    stats[picked.status] += 1
                    if out is not None:
                        out.write(json.dumps(asdict(picked), ensure_ascii=False) + "\n")
                        out.flush()
                    if dry_run:
                        continue
                    session.add(
                        DebateQuote(
                            expediente=debate.expediente,
                            debate_date=debate.debate_date,
                            group_id=group_id,
                            speaker_name=turn.speaker,
                            dscd_ref=turn.dscd_ref,
                            page=picked.page,
                            source_url=(
                                f"{client.base_url}{_pdf_path(turn.dscd_ref)}#page={picked.page}"
                            ),
                            phase=(turn.phase or "")[:120] or None,
                            quote=picked.quote,
                            status=picked.status,
                            model=settings.mistral_model,
                        )
                    )
                    await session.commit()
        finally:
            if out is not None:
                out.close()
    log.info("debate_quotes.done", **stats)
    return dict(stats)


def main() -> None:
    from app.core.logging import configure_logging
    from app.db.session import AsyncSessionLocal

    configure_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", type=date.fromisoformat, default=LEGISLATURE_START)
    parser.add_argument("--until", type=date.fromisoformat, default=None)
    parser.add_argument("--limit", type=int, default=None, help="debates to read in this run")
    parser.add_argument("--expediente", default=None, help='only this one, e.g. "130/000056"')
    parser.add_argument("--dry-run", action="store_true", help="write nothing to the database")
    parser.add_argument("--out", type=Path, default=None, help="JSONL of what was picked")
    args = parser.parse_args()

    async def _run() -> dict[str, int]:
        async with AsyncSessionLocal() as session:
            return await ingest(
                session,
                since=args.since,
                until=args.until,
                limit=args.limit,
                expediente=args.expediente,
                dry_run=args.dry_run,
                out_path=args.out,
            )

    print(asyncio.run(_run()))


if __name__ == "__main__":
    main()
