"""Deputies' economic interests and activities, from the Congreso.

Besides the assets declaration (app/ingest/congreso/assets.py), each
deputy's ficha links two more documents:

- The "Declaración de Intereses Económicos" (``/docacteco/leg15/{n}/{n}_{seq}_e_{reg}_{yyyymmdd}.pdf``),
  a scanned two-page form like the assets one, under the Cortes' Code of
  Conduct: the jobs held in the five years before the seat (period,
  employer, sector), gifts received, and contributions to foundations,
  associations or parties. A later one (higher ``seq``) records a change.
- The "Registro de Intereses - Actividades" (``/docinte/registro_intereses_diputado_{cod}.pdf``),
  one page the Congreso rewrites in place: the public posts the deputy
  holds or gave up, pensions, teaching, party posts, and the private
  activities the Chamber authorised, each with the date of the plenary
  agreement. Its URL never changes, so we keep a hash of the file and read
  it again when the file changes.

Both are read like the assets one: Mistral's OCR model, then the large
model copies the fields into JSON as written, then a check that the name on
the document is the deputy's ("needs_review" otherwise, and the site shows
only the PDF link). Nothing here is summed or ranked.

Usage (inside the backend container)::

    python -m app.ingest.congreso.interests discover          # find new or changed PDFs
    python -m app.ingest.congreso.interests parse --limit 20  # read pending ones
    python -m app.ingest.congreso.interests parse --person 123 --retry
    python -m app.ingest.congreso.interests show 123          # print what we read
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Final

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.ingest.congreso.assets import _headers, _text, fetch_pdf, name_matches, ocr_pdf
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.photos import _FICHA_PATH, legislature_number_to_roman
from app.models import InterestDeclaration, Person

log = get_logger(__name__)

INTERESTS: Final = "interests"
ACTIVITIES: Final = "activities"

_BASE_URL: Final = "https://www.congreso.es"
_INTERESTS_RE: Final = re.compile(
    r'href="(?P<path>/docacteco/leg(?P<leg>\d+)/(?P<n>\d+)/(?P=n)_(?P<seq>\d{3})_e_\d+_(?P<ymd>\d{8})\.pdf)"',
    re.IGNORECASE,
)
_ACTIVITIES_RE: Final = re.compile(
    r'href="(?P<path>/docinte/registro_intereses_diputado_\d+\.pdf)"', re.IGNORECASE
)

#: The register's sections, by the letter the document gives them.
ACTIVITY_SECTIONS: Final = {
    "A": "public_posts",
    "B": "public_renounced",
    "C1": "pensions_renounced",
    "C2": "pensions_compatible",
    "D": "teaching",
    "E": "party_posts",
    "F": "creative",
    "G": "private_authorised",
    "H": "other",
}


@dataclass(frozen=True, slots=True)
class InterestLink:
    kind: str
    url: str
    legislature: int
    sequence: int | None = None
    declared_on: date | None = None


def extract_interest_links(html: str, legislature: int) -> list[InterestLink]:
    """The interests declarations (oldest first) and the activities register
    linked from a ficha."""
    seen: dict[str, InterestLink] = {}
    for m in _INTERESTS_RE.finditer(html):
        ymd = m.group("ymd")
        try:
            day = date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:]))
        except ValueError:
            continue
        url = _BASE_URL + m.group("path")
        seen[url] = InterestLink(INTERESTS, url, int(m.group("leg")), int(m.group("seq")), day)
    for m in _ACTIVITIES_RE.finditer(html):
        url = _BASE_URL + m.group("path")
        seen[url] = InterestLink(ACTIVITIES, url, legislature)
    return sorted(seen.values(), key=lambda d: (d.kind, d.sequence or 0, d.declared_on or date.min))


# ---------------------------------------------------------------------------
# Checking what the model returned
# ---------------------------------------------------------------------------


#: Words deputies write for the sector box ("PÚBLICO", "Administración
#: pública. CARGO PÚBLICO", "Profesión liberal"...). Anything else is "other",
#: and the page always shows the box as written.
_PUBLIC_SECTOR: Final = re.compile(r"PUBLIC|LEGISLATIV|ADMINISTRACION")
_PRIVATE_SECTOR: Final = re.compile(r"PRIVAD|LIBERAL|CUENTA PROPIA|AUTONOM|EMPRESA")
#: What a box says when there is nothing to declare.
_NOTHING: Final = re.compile(
    r"^(?:NINGUN[OA]S?|NADA(?: (?:QUE|RESENABLE).*)?|NO APLICA|NO PROCEDE|N/?A|NO|SIN [A-Z]+|-+)\.?$"
)
#: The register's placeholder until the plenary agrees on the activities.
_AWAITING: Final = re.compile(r"Pendiente de acuerdo definitivo del Pleno", re.IGNORECASE)


def _upper_plain(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.upper())
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def _sector(value: Any) -> str | None:
    text = _text(value)
    if not text:
        return None
    plain = _upper_plain(text)
    if _PUBLIC_SECTOR.search(plain):
        return "public"
    if _PRIVATE_SECTOR.search(plain):
        return "private"
    return "other"


def _said_something(text: str | None) -> str | None:
    """The text, unless it only says there is nothing ("Ninguno", "No aplica")."""
    return None if text is None or _NOTHING.match(_upper_plain(text)) else text


def _rows(raw: Any, keys: tuple[str, ...]) -> list[dict[str, str | None]]:
    """List rows with the given text fields; a row with none of them is
    a blank line on the form and goes."""
    out: list[dict[str, str | None]] = []
    for row in raw if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        clean = {k: _said_something(_text(row.get(k))) for k in keys}
        if any(clean.values()):
            out.append(clean)
    return out


def normalise_interests(raw: dict[str, Any], full_name: str) -> tuple[dict[str, Any], list[str]]:
    """The economic-interests form, cleaned, and what fails a check."""
    problems: list[str] = []
    if not name_matches(_text(raw.get("name")), full_name):
        problems.append(f"name on the form {raw.get('name')!r} is not {full_name!r}")
    activities = _rows(raw.get("activities"), ("period", "employer", "sector", "description"))
    for row in activities:
        row["sector_as_written"] = row["sector"]
        row["sector"] = _sector(row["sector"])
    initial = raw.get("initial")
    data = {
        "name": _text(raw.get("name")),
        "initial": initial if isinstance(initial, bool) else None,
        "activities": activities,
        "gifts": _rows(raw.get("gifts"), ("benefactor", "description")),
        "contributions": _rows(raw.get("contributions"), ("recipient", "description")),
        "other": _said_something(_text(raw.get("other"))),
    }
    return data, problems


def normalise_activities(raw: dict[str, Any], full_name: str) -> tuple[dict[str, Any], list[str]]:
    """The activities register, cleaned, and what fails a check."""
    problems: list[str] = []
    if not name_matches(_text(raw.get("name")), full_name):
        problems.append(f"name on the register {raw.get('name')!r} is not {full_name!r}")
    sections_raw = raw.get("sections")
    given: dict[str, Any] = sections_raw if isinstance(sections_raw, dict) else {}
    sections = {
        key: _rows(given.get(letter), ("text", "approved_on"))
        for letter, key in ACTIVITY_SECTIONS.items()
    }
    unknown = set(given) - set(ACTIVITY_SECTIONS)
    if unknown:
        problems.append(f"sections not on the register: {sorted(unknown)}")
    data = {
        "name": _text(raw.get("name")),
        "group": _text(raw.get("group")),
        "registered_on": _text(raw.get("registered_on")),
        "sections": sections,
        "declarations": [t for t in (_text(d) for d in raw.get("declarations") or []) if t],
    }
    return data, problems


# ---------------------------------------------------------------------------
# Mistral: the fields, from the OCR text
# ---------------------------------------------------------------------------

_INTERESTS_SYSTEM: Final = """Eres un transcriptor. Recibes el texto (OCR) de una "Declaración de Intereses
Económicos" de un diputado del Congreso, un formulario fijo de dos páginas. Copia sus casillas en JSON con
EXACTAMENTE estas claves, sin inventar nada:

{
  "name": "nombre y apellidos tal como figuran",
  "initial": true si está marcada "DECLARACIÓN INICIAL", false si está marcada "MODIFICACIÓN", null si no se ve,
  "activities": [{"period": "período", "employer": "empleador", "sector": "sector tal cual",
                  "description": "breve descripción"}],
  "gifts": [{"benefactor": "benefactor o null", "description": "descripción y valoración"}],
  "contributions": [{"recipient": "destinatario", "description": "descripción de la contribución o null"}],
  "other": "texto del apartado IV (otros intereses / observaciones), o null"
}

Reglas:
- "activities" es el apartado I, "gifts" el II, "contributions" el III.
- Solo lo que el declarante ha escrito. Ignora los títulos impresos, el texto de PROTECCIÓN DE DATOS,
  el nombre y la fecha de la firma, y los sellos ("C.DIP ...", "REGISTRO DE INTERESES").
- Fila vacía: no la pongas. Lista sin filas: []. Valor sin dato: null.
- Copia los textos exactamente como están escritos; no los resumas ni los corrijas.
- Cada fila del formulario es un elemento de su lista: no juntes dos filas en una.
- Devuelve solo el objeto JSON."""

_ACTIVITIES_SYSTEM: Final = """Eres un transcriptor. Recibes el texto (OCR) de una página del "Registro de
Intereses - Actividades" de un diputado del Congreso. Copia su contenido en JSON con EXACTAMENTE estas claves,
sin inventar nada:

{
  "name": "apellidos y nombre tal como figuran",
  "group": "grupo parlamentario tal como figura, o null",
  "registered_on": "fecha de alta tal cual, o null",
  "sections": {"A": [...], "B": [...], "C1": [...], "C2": [...], "D": [...], "E": [...], "F": [...],
               "G": [...], "H": [...]},
  "declarations": ["cada declaración de actividades listada al final, tal cual"]
}

Cada elemento de una sección es {"text": "la actividad tal cual", "approved_on": "fecha del acuerdo plenario
definitivo que la acompaña, tal cual, o null"}.

Secciones: A cargos públicos; B actividades públicas a las que ha renunciado; C1 prestaciones de derechos
pasivos renunciadas; C2 prestaciones consideradas compatibles; D actividades docentes extraordinarias;
E cargos en partidos o grupos parlamentarios; F actividades de producción y creación literaria, científica,
artística o técnica; G actividades privadas autorizadas; H otras actividades.

Reglas:
- Sección sin contenido: []. No copies los títulos de las secciones, las notas al pie (las que empiezan por
  "La autorización de esta actividad..." o "Las actividades privadas se autorizan...") ni las líneas de guiones.
- Copia los textos exactamente; no los resumas. Un párrafo es un elemento.
- Devuelve solo el objeto JSON."""


async def structure(
    settings: Settings, client: httpx.AsyncClient, kind: str, ocr_text: str
) -> dict[str, Any]:
    """The document's fields from the OCR text, as the large model copies them."""
    from app.services.llm_http import post_llm

    body = {
        "model": settings.asset_structure_model,
        "messages": [
            {
                "role": "system",
                "content": _INTERESTS_SYSTEM if kind == INTERESTS else _ACTIVITIES_SYSTEM,
            },
            {"role": "user", "content": ocr_text},
        ],
        "temperature": 0,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
    }
    r = await post_llm(
        client,
        "https://api.mistral.ai/v1/chat/completions",
        json_body=body,
        headers=_headers(settings),
        min_interval_s=settings.llm_min_interval_s,
    )
    content = str(r.json()["choices"][0]["message"]["content"])
    parsed = json.loads(content[content.find("{") : content.rfind("}") + 1])
    if not isinstance(parsed, dict):
        raise ValueError("model did not return an object")
    return parsed


def normalise(kind: str, raw: dict[str, Any], full_name: str) -> tuple[dict[str, Any], list[str]]:
    return (normalise_interests if kind == INTERESTS else normalise_activities)(raw, full_name)


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


async def discover(
    session: AsyncSession,
    *,
    legislature: str = "15",
    delay_seconds: float = 0.5,
    recheck: bool = True,
) -> dict[str, int]:
    """Add a "pending" row for every document not seen yet, reading the
    ficha of each person with a ``cod_parlamentario``. With ``recheck``,
    download each activities register again and mark it "pending" when the
    file changed (its URL never does)."""
    persons = (
        (await session.execute(select(Person).where(Person.cod_parlamentario.is_not(None))))
        .scalars()
        .all()
    )
    known = {
        d.pdf_url: d for d in (await session.execute(select(InterestDeclaration))).scalars().all()
    }
    roman = legislature_number_to_roman(legislature)
    counts = {"fichas": 0, "found": 0, "new": 0, "changed": 0, "failed": 0}
    async with (
        CongresoClient() as congreso,
        httpx.AsyncClient(timeout=60, headers={"User-Agent": "Mozilla/5.0"}) as client,
    ):
        for person in persons:
            try:
                html = await congreso.fetch_html(
                    _FICHA_PATH.format(cod=person.cod_parlamentario, leg=roman)
                )
            except Exception as e:  # one ficha failing must not stop the run
                log.warning("interests.ficha_failed", person_id=person.id, error=str(e))
                counts["failed"] += 1
                continue
            counts["fichas"] += 1
            for link in extract_interest_links(html, int(legislature)):
                counts["found"] += 1
                row = known.get(link.url)
                if row is None:
                    row = InterestDeclaration(
                        person_id=person.id,
                        kind=link.kind,
                        legislature=link.legislature,
                        sequence=link.sequence,
                        declared_on=link.declared_on,
                        pdf_url=link.url,
                        parse_status="pending",
                    )
                    session.add(row)
                    known[link.url] = row
                    counts["new"] += 1
                elif recheck and link.kind == ACTIVITIES and row.pdf_sha256:
                    try:
                        digest = hashlib.sha256(await fetch_pdf(client, link.url)).hexdigest()
                    except httpx.HTTPError as e:
                        log.warning("interests.recheck_failed", url=link.url, error=str(e))
                        continue
                    if digest != row.pdf_sha256:
                        row.parse_status = "pending"
                        row.ocr_text = None
                        counts["changed"] += 1
            await asyncio.sleep(delay_seconds)
    await session.commit()
    log.info("interests.discovered", **counts)
    return counts


async def parse_pending(
    session: AsyncSession,
    *,
    limit: int = 40,
    person_id: int | None = None,
    retry: bool = False,
    redo: bool = False,
    settings: Settings | None = None,
) -> dict[str, int]:
    """Read up to ``limit`` documents not read yet (with ``retry``, also the
    ones that failed or need review; with ``redo``, every one). The OCR text
    already stored is reused. Commits after each one."""
    from app.services.llm_http import LLMUnavailableError

    s = settings or get_settings()
    statuses = ["pending", "failed", "needs_review"] if retry else ["pending"]
    if redo:
        statuses.append("ok")
    q = (
        select(InterestDeclaration, Person.full_name)
        .join(Person, Person.id == InterestDeclaration.person_id)
        .where(InterestDeclaration.parse_status.in_(statuses))
        .order_by(InterestDeclaration.id)
        .limit(limit)
    )
    if person_id is not None:
        q = q.where(InterestDeclaration.person_id == person_id)
    rows = (await session.execute(q)).all()
    counts = {"ok": 0, "needs_review": 0, "failed": 0}
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(180.0, read=180.0), headers={"User-Agent": "Mozilla/5.0"}
    ) as client:
        for decl, full_name in rows:
            try:
                text = decl.ocr_text
                if not text:
                    pdf = await fetch_pdf(client, decl.pdf_url)
                    decl.pdf_sha256 = hashlib.sha256(pdf).hexdigest()
                    text = await ocr_pdf(s, client, pdf)
                data: dict[str, Any]
                problems: list[str]
                if decl.kind == ACTIVITIES and _AWAITING.search(text):
                    data, problems = {"awaiting_plenary": True}, []
                else:
                    raw = await structure(s, client, decl.kind, text)
                    data, problems = normalise(decl.kind, raw, full_name)
            except LLMUnavailableError:
                log.error("interests.llm_unavailable")
                break
            except (httpx.HTTPError, ValueError, KeyError) as e:
                log.warning("interests.parse_failed", id=decl.id, url=decl.pdf_url, error=str(e))
                decl.parse_status = "failed"
                decl.problems = [str(e)[:500]]
                counts["failed"] += 1
                await session.commit()
                continue
            decl.ocr_text = text
            decl.data = data
            decl.problems = problems or None
            decl.parse_status = "needs_review" if problems else "ok"
            decl.model = s.asset_structure_model
            decl.parsed_at = datetime.now(UTC)
            counts[decl.parse_status] += 1
            await session.commit()
    log.info("interests.parsed", **counts)
    return counts


async def _show(person_id: int) -> None:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        rows = (
            (
                await session.execute(
                    select(InterestDeclaration)
                    .where(InterestDeclaration.person_id == person_id)
                    .order_by(InterestDeclaration.kind, InterestDeclaration.id)
                )
            )
            .scalars()
            .all()
        )
    for d in rows:
        print(f"# {d.kind} {d.declared_on} seq={d.sequence} {d.parse_status} {d.pdf_url}")
        if d.problems:
            print("  problems:", d.problems)
        print(json.dumps(d.data, ensure_ascii=False, indent=2))


def main() -> None:
    from app.db.session import AsyncSessionLocal

    configure_logging()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover")
    d.add_argument("--no-recheck", action="store_true")
    p = sub.add_parser("parse")
    p.add_argument("--limit", type=int, default=40)
    p.add_argument("--person", type=int, default=None)
    p.add_argument("--retry", action="store_true")
    p.add_argument("--redo", action="store_true")
    show = sub.add_parser("show")
    show.add_argument("person_id", type=int)
    args = parser.parse_args()

    async def run() -> object:
        if args.cmd == "show":
            await _show(args.person_id)
            return None
        async with AsyncSessionLocal() as session:
            if args.cmd == "discover":
                return await discover(session, recheck=not args.no_recheck)
            return await parse_pending(
                session,
                limit=args.limit,
                person_id=args.person,
                retry=args.retry,
                redo=args.redo,
            )

    result = asyncio.run(run())
    if result is not None:
        print(result)


if __name__ == "__main__":
    main()
