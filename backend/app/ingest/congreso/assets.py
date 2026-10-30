"""Deputies' asset declarations ("Declaración de Bienes y Rentas"), from the Congreso.

Every deputy files one on taking the seat and another whenever something
changes or the mandate ends. The Congreso publishes them only as PDFs
linked from the deputy's ficha, ``/docbienes/leg15/{n}/{n}_{seq}_e_{reg}_{yyyymmdd}.pdf``
(``n`` is an internal number, not ``codParlamentario``; ``seq`` 000 is
the first one). There is no open-data version, and the BOCG reprint
(Serie D) is the same scan.

The PDFs are scans of a fixed five-page form, typed (the rules forbid
handwriting), with a useless embedded OCR layer. So we read them in two
steps: Mistral's OCR model turns each scan into text, and the large model
copies the form's fields from that text into JSON, amounts exactly as
written. Then :func:`normalise_declaration` parses the amounts and checks
the result (the name on page one must be the deputy's, amounts must read
as euros); a failed check marks the row "needs_review" and the site shows
only the link to the PDF for it.

Two things the form imposes, and the site must respect: it asks no value
for homes or land, so no total wealth can be worked out; and a later
declaration only lists what changed ("sin cambios en lo no especificado"),
so declarations are shown one by one, never merged.

Usage (inside the backend container)::

    python -m app.ingest.congreso.assets discover          # find new PDFs
    python -m app.ingest.congreso.assets parse --limit 20  # read pending ones
    python -m app.ingest.congreso.assets parse --person 123 --retry
    python -m app.ingest.congreso.assets parse --redo --retry --limit 500  # all, after a fix here
    python -m app.ingest.congreso.assets classify          # label who pays each income concept
    python -m app.ingest.congreso.assets show 123          # print what we read
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime
from difflib import SequenceMatcher
from typing import Any, Final

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.photos import _FICHA_PATH, legislature_number_to_roman
from app.models import AssetDeclaration, AssetIncomeSource, Person

log = get_logger(__name__)

_LINK_RE: Final = re.compile(
    r'href="(?P<path>/docbienes/leg(?P<leg>\d+)/(?P<n>\d+)/(?P=n)_(?P<seq>\d{3})_e_\d+_(?P<ymd>\d{8})\.pdf)"',
    re.IGNORECASE,
)

_BASE_URL: Final = "https://www.congreso.es"

#: Amounts above this are surely a misread (a date or a registry number).
_MAX_AMOUNT: Final = 50_000_000.0


@dataclass(frozen=True, slots=True)
class DeclarationLink:
    url: str
    legislature: int
    sequence: int
    declared_on: date


def extract_declaration_links(html: str) -> list[DeclarationLink]:
    """Every asset-declaration PDF linked from a ficha, oldest first."""
    seen: dict[str, DeclarationLink] = {}
    for m in _LINK_RE.finditer(html):
        ymd = m.group("ymd")
        try:
            day = date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:]))
        except ValueError:
            continue
        url = _BASE_URL + m.group("path")
        seen[url] = DeclarationLink(
            url=url, legislature=int(m.group("leg")), sequence=int(m.group("seq")), declared_on=day
        )
    return sorted(seen.values(), key=lambda d: (d.sequence, d.declared_on))


# ---------------------------------------------------------------------------
# Reading the amounts and checking what the model returned
# ---------------------------------------------------------------------------


class SeveralAmountsError(ValueError):
    """The box holds more than one figure ("15.000 € 1.500 €", "62.613 + 87.142",
    "50.000 a fecha 15/12/2023"): readable, but not as one amount, so the
    page shows it as written."""


_CURRENCY_WORDS: Final = re.compile(r"€|\beuros?\b|\beur\b", re.IGNORECASE)
_FIGURE: Final = re.compile(r"-?\d(?:[\d.,']*\d)?")


def _figure(piece: str) -> float:
    """One figure, with Spanish or English separators."""
    negative = piece.startswith("-")
    digits = piece.lstrip("-").replace("'", ",")  # "6.297'68"
    if "." in digits and "," in digits:
        decimal = "," if digits.rfind(",") > digits.rfind(".") else "."
        thousands = "." if decimal == "," else ","
        digits = digits.replace(thousands, "").replace(decimal, ".")
    elif "," in digits or "." in digits:
        sep = "," if "," in digits else "."
        head, *groups = digits.split(sep)
        *middle, last = groups
        if not middle:
            # "36.000" and "1,500" are thousands; "12,30" and "1591.68" decimals.
            thousands_sep = len(head) <= 3 and len(last) == 3
            digits = head + last if thousands_sep else f"{head}.{last}"
        elif len(head) <= 3 and all(len(g) == 3 for g in middle) and 1 <= len(last) <= 3:
            # "1.234.567"; the last group short means a decimal typed with the
            # same sign ("62.857.92", "33,170,34").
            whole = "".join([head, *middle])
            digits = whole + last if len(last) == 3 else f"{whole}.{last}"
        else:
            raise ValueError(piece)
    if digits.count(".") > 1 or not digits.replace(".", "").isdigit():
        raise ValueError(piece)
    amount = float(digits)
    return -amount if negative else amount


def parse_amount(value: Any) -> float | None:
    """A euro amount as the form shows it ("10.803,87 €", "36.000", "11 .037 ,82 EUROS",
    "28.300.-", "107.849,07 € (31-7-2023)").

    Returns None when there is no number. Raises :class:`SeveralAmountsError`
    when the box holds more than one figure, and ValueError when there is
    something that is not a readable amount (two figures run together by
    the OCR, say).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    core = re.sub(r"\([^)]*\)", " ", text)  # "(31-7-2023)", "(valor a ...)"
    # A date next to the amount ("A fecha 2.09.26 la cantidad de 7.172,07"):
    # a middle group of one or two digits is never a thousands group.
    core = re.sub(r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b", " ", core)
    core = _CURRENCY_WORDS.sub(" ", core)
    core = re.sub(r"(?<=\d)\s?[.,]?\s?-(?!\d)", " ", core)  # "28.300.-", "29.218,-"
    core = re.sub(r"(?<=\d)\s+([.,'])(?=\d)", r"\1", core)  # OCR spacing: "11 .037 ,82"
    pieces = _FIGURE.findall(core)
    if not pieces:
        if re.search(r"\d", text):
            raise ValueError(text)
        return None
    try:
        figures = [_figure(p) for p in pieces]
    except ValueError:
        raise ValueError(text) from None
    if len(figures) > 1:
        raise SeveralAmountsError(text)
    return figures[0]


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def name_matches(declared: str | None, full_name: str) -> bool:
    """Whether the name on the form is the deputy's: every surname-length
    word of ``full_name`` (3+ letters) but at most one must appear in it,
    spelling variants allowed ("Idoya" for "Idoia", "Uncetabarrenechea"
    for "Unzetabarrenetxea")."""
    if not declared:
        return False
    have = set(re.findall(r"[a-z]+", _fold(declared)))
    want = [w for w in re.findall(r"[a-z]+", _fold(full_name)) if len(w) >= 3]
    if not want:
        return False

    def found(word: str) -> bool:
        return word in have or any(SequenceMatcher(None, word, h).ratio() >= 0.8 for h in have)

    missing = sum(1 for w in want if not found(w))
    return missing <= (1 if len(want) >= 3 else 0)


_INCOME_KINDS: Final = ("salary", "dividends", "interest", "other")
_PROPERTY_KINDS: Final = ("urban", "rustic", "company")
_SECURITY_KINDS: Final = ("debt", "shares", "stake")
_SOURCES: Final = (
    "public",
    "party",
    "private",
    "self_employed",
    "rental",
    "capital",
    "pension",
    "unspecified",
)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _as_written(value: Any) -> str | None:
    """The amount's text when it says more than one number ("1.100 MENSUAL",
    "719,07 al mes", "62.613 + 87.142"), so the page can show it as written
    instead of passing a monthly figure off as the year's."""
    text = _text(value) if isinstance(value, str) else None
    if not text:
        return None
    if re.search(r"[^\W\d_]", _CURRENCY_WORDS.sub("", text)):
        return text
    try:
        parse_amount(text)
    except SeveralAmountsError:
        return text
    except ValueError:
        pass
    return None


# The form asks not to give number plates; some deputies do anyway. Only
# a plate after "matrícula" is cut: a bare "2019 BMW" looks like one.
_PLATE: Final = re.compile(
    r",?\s*(?:con\s+)?(?:la\s+)?matr[ií]cula\s*:?\s*"
    r"(?:\d{4}[\s-]?[A-Z]{3}|[A-Z]{1,2}[\s-]?\d{4}(?:[\s-]?[A-Z]{1,2})?)\b",
    re.IGNORECASE,
)


def _without_plate(text: str | None) -> str | None:
    return _text(_PLATE.sub("", text)) if text else None


def normalise_declaration(raw: dict[str, Any], full_name: str) -> tuple[dict[str, Any], list[str]]:
    """Clean what the model returned and list what fails a check.

    Rows with no description and no amount are dropped. Amounts are parsed
    here, not by the model; when the text says more than a number (a period,
    a date) it is kept next to the amount as ``as_written``.
    """
    problems: list[str] = []

    def amount(value: Any, where: str, *, signed: bool = False) -> float | None:
        try:
            parsed = parse_amount(value)
        except SeveralAmountsError:
            return None  # shown as written
        except ValueError:
            problems.append(f"unreadable amount in {where}: {value!r}")
            return None
        if parsed is not None and not (-_MAX_AMOUNT if signed else 0) <= parsed <= _MAX_AMOUNT:
            problems.append(f"implausible amount in {where}: {value!r}")
        return parsed

    def rows(key: str) -> list[dict[str, Any]]:
        value = raw.get(key)
        return [r for r in value if isinstance(r, dict)] if isinstance(value, list) else []

    name = _text(raw.get("name"))
    if not name_matches(name, full_name):
        problems.append(f"name on the form ({name!r}) is not {full_name!r}")

    income = []
    for r in rows("income"):
        kind = r.get("kind") if r.get("kind") in _INCOME_KINDS else "other"
        concept = _text(r.get("concept"))
        value = amount(r.get("amount"), f"income {concept!r}")
        if concept or value is not None:
            income.append(
                {
                    "kind": kind,
                    "concept": concept,
                    "amount": value,
                    "as_written": _as_written(r.get("amount")),
                }
            )

    properties = []
    for r in rows("properties"):
        kind = r.get("kind") if r.get("kind") in _PROPERTY_KINDS else "urban"
        item = {
            "kind": kind,
            "description": _text(r.get("description")),
            "location": _text(r.get("location")),
            "acquired": _text(r.get("acquired")),
            "right": _text(r.get("right")),
        }
        if item["description"] or item["location"]:
            properties.append(item)

    securities = []
    for r in rows("securities"):
        kind = r.get("kind") if r.get("kind") in _SECURITY_KINDS else "shares"
        description = _text(r.get("description"))
        value = amount(r.get("value"), f"securities {description!r}")
        if description or value is not None:
            securities.append(
                {
                    "kind": kind,
                    "description": description,
                    "value": value,
                    "as_written": _as_written(r.get("value")),
                }
            )

    vehicles = []
    for r in rows("vehicles"):
        description = _without_plate(_text(r.get("description")))
        if description:
            vehicles.append({"acquired": _text(r.get("acquired")), "description": description})

    other_assets = []
    for r in rows("other_assets"):
        description = _text(r.get("description"))
        value = amount(r.get("value"), f"other assets {description!r}")
        if description or value is not None:
            other_assets.append(
                {
                    "description": description,
                    "value": value,
                    "as_written": _as_written(r.get("value")),
                }
            )

    loans = []
    for r in rows("loans"):
        description = _text(r.get("description"))
        granted = amount(r.get("amount"), f"loan {description!r}")
        outstanding = amount(r.get("outstanding"), f"loan {description!r} outstanding")
        if description or granted is not None or outstanding is not None:
            loans.append(
                {
                    "description": description,
                    "granted_on": _text(r.get("granted_on")),
                    "amount": granted,
                    "amount_as_written": _as_written(r.get("amount")),
                    "outstanding": outstanding,
                    "outstanding_as_written": _as_written(r.get("outstanding")),
                }
            )

    # One row per line the deputy filled; the form wants a single total but
    # many list each account. Never summed here.
    deposits = []
    for r in rows("deposits"):
        description = _text(r.get("description"))
        value = amount(r.get("amount"), f"deposits {description!r}")
        if description or value is not None:
            deposits.append(
                {
                    "description": description,
                    "amount": value,
                    "as_written": _as_written(r.get("amount")),
                }
            )

    data = {
        "name": name,
        "income": income,
        # Signed: some write the refund ("-91,32 €").
        "income_tax_paid": amount(raw.get("income_tax_paid"), "income tax", signed=True),
        "income_tax_as_written": _as_written(raw.get("income_tax_paid")),
        "properties": properties,
        "deposits": deposits,
        "securities": securities,
        "vehicles": vehicles,
        "other_assets": other_assets,
        "loans": loans,
        "other_debts": _text(raw.get("other_debts")),
        "observations": _text(raw.get("observations")),
    }
    return data, problems


# ---------------------------------------------------------------------------
# Mistral: OCR, then the form's fields
# ---------------------------------------------------------------------------

_SYSTEM: Final = """Eres un transcriptor. Recibes el texto (OCR) de una "Declaración de Bienes y Rentas"
de un diputado del Congreso, un formulario fijo de cinco páginas. Copia sus casillas en JSON
con EXACTAMENTE estas claves, sin inventar nada:

{
  "name": "nombre y apellidos tal como figuran",
  "income": [{"kind": "salary|dividends|interest|other", "concept": "texto", "amount": "importe tal cual"}],
  "income_tax_paid": "cuota de IRPF pagada, tal cual, o null",
  "properties": [{"kind": "urban|rustic|company", "description": "clase y características",
                  "location": "situación (provincia o país)", "acquired": "fecha de adquisición",
                  "right": "derecho sobre el bien y título de adquisición"}],
  "deposits": [{"description": "clase de depósito", "amount": "saldo tal cual"}],
  "securities": [{"kind": "debt|shares|stake", "description": "texto", "value": "valor tal cual"}],
  "vehicles": [{"acquired": "fecha", "description": "texto"}],
  "other_assets": [{"description": "texto", "value": "valor tal cual"}],
  "loans": [{"description": "descripción y acreedor", "granted_on": "fecha de concesión",
             "amount": "importe concedido tal cual", "outstanding": "saldo pendiente tal cual"}],
  "other_debts": "otras deudas y obligaciones, texto, o null",
  "observations": "texto completo de OBSERVACIONES, o null"
}

Reglas:
- Solo lo que el declarante ha escrito en las casillas. Ignora los títulos impresos del formulario,
  las notas al pie y los sellos ("C.DIP ...", "REGISTRO DE INTERESES").
- Casilla vacía: no pongas la fila. Lista sin filas: []. Valor sin dato: null.
- Importes y fechas exactamente como están escritos (por ejemplo "10.803,87 €"); no los calcules.
  Copia también lo que acompañe al importe en su casilla (por ejemplo "1.100 MENSUAL").
  Cada fila del formulario es un elemento de su lista: no juntes dos filas en una.
- income.kind: "salary" para percepciones de tipo salarial, sueldos, honorarios; "dividends" para
  dividendos y participación en beneficios; "interest" para intereses o rendimientos de cuentas;
  "other" para otras rentas.
- properties.kind: "urban" inmuebles urbanos, "rustic" rústicos, "company" inmuebles de una sociedad.
- securities.kind: "debt" deuda pública, bonos, pagarés...; "shares" acciones y participaciones;
  "stake" sociedades participadas en más de un 5%.
- Devuelve solo el objeto JSON."""


async def fetch_pdf(client: httpx.AsyncClient, url: str) -> bytes:
    response = await client.get(url, follow_redirects=True)
    response.raise_for_status()
    return response.content


async def ocr_pdf(settings: Settings, client: httpx.AsyncClient, pdf: bytes) -> str:
    """The scan's text, page by page, from Mistral's OCR model."""
    from app.services.llm_http import post_llm

    body = {
        "model": settings.asset_ocr_model,
        "document": {
            "type": "document_url",
            "document_url": "data:application/pdf;base64," + base64.b64encode(pdf).decode(),
        },
        "include_image_base64": False,
    }
    r = await post_llm(
        client,
        "https://api.mistral.ai/v1/ocr",
        json_body=body,
        headers=_headers(settings),
        min_interval_s=settings.llm_min_interval_s,
    )
    pages = r.json().get("pages") or []
    return "\n\n".join(
        f"--- página {p.get('index', i) + 1} ---\n{p.get('markdown', '')}"
        for i, p in enumerate(pages)
    )


async def structure(settings: Settings, client: httpx.AsyncClient, ocr_text: str) -> dict[str, Any]:
    """The form's fields from the OCR text, as the large model copies them."""
    from app.services.llm_http import post_llm

    body = {
        "model": settings.asset_structure_model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
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


_SOURCES_SYSTEM: Final = """Clasificas conceptos de ingresos de la declaración de bienes de un diputado:
quién paga cada uno, según lo que dicen sus palabras. Recibes una lista JSON de textos y devuelves
{"sources": [...]} con una etiqueta por texto, en el mismo orden:

- "public": administración o entidad pública (Congreso, Senado, parlamentos, ayuntamientos,
  diputaciones, gobiernos, universidades y hospitales públicos, funcionarios, trienios).
- "party": un partido político o un grupo parlamentario.
- "private": una empresa o entidad privada que se nombra (S.L., S.A., bufetes, editoriales...).
- "self_employed": actividad económica o profesional por cuenta propia, sin nombrar quién paga.
- "rental": alquileres y rendimientos de inmuebles.
- "capital": dividendos, intereses, fondos, otros rendimientos del capital.
- "pension": pensiones, jubilación, prestación por desempleo u otras prestaciones.
- "unspecified": no dice quién paga ("SALARIO", "RENDIMIENTOS DEL TRABAJO", "SUELDO NETO").

No adivines: si las palabras no lo dicen, "unspecified". Devuelve solo el objeto JSON."""


async def classify_batch(
    settings: Settings, client: httpx.AsyncClient, concepts: list[str]
) -> list[str]:
    """One label per concept, in order. A reply of another length raises."""
    from app.services.llm_http import post_llm

    body = {
        "model": settings.asset_structure_model,
        "messages": [
            {"role": "system", "content": _SOURCES_SYSTEM},
            {"role": "user", "content": json.dumps(concepts, ensure_ascii=False)},
        ],
        "temperature": 0,
        "max_tokens": 2000,
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
    sources = json.loads(content[content.find("{") : content.rfind("}") + 1]).get("sources")
    if not isinstance(sources, list) or len(sources) != len(concepts):
        raise ValueError("model did not return one label per concept")
    return [s if s in _SOURCES else "unspecified" for s in sources]


def _headers(settings: Settings) -> dict[str, str]:
    if not settings.mistral_api_key:
        raise RuntimeError("MISTRAL_API_KEY is not configured")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.mistral_api_key}",
    }


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


async def discover(
    session: AsyncSession, *, legislature: str = "15", delay_seconds: float = 0.5
) -> dict[str, int]:
    """Add a "pending" row for every declaration PDF not seen yet, reading
    the ficha of each person with a ``cod_parlamentario``."""
    persons = (
        (await session.execute(select(Person).where(Person.cod_parlamentario.is_not(None))))
        .scalars()
        .all()
    )
    known = set((await session.execute(select(AssetDeclaration.pdf_url))).scalars().all())
    roman = legislature_number_to_roman(legislature)
    counts = {"fichas": 0, "found": 0, "new": 0, "failed": 0}
    async with CongresoClient() as client:
        for person in persons:
            try:
                html = await client.fetch_html(
                    _FICHA_PATH.format(cod=person.cod_parlamentario, leg=roman)
                )
            except Exception as e:  # one ficha failing must not stop the run
                log.warning("assets.ficha_failed", person_id=person.id, error=str(e))
                counts["failed"] += 1
                continue
            counts["fichas"] += 1
            for link in extract_declaration_links(html):
                counts["found"] += 1
                if link.url in known:
                    continue
                session.add(
                    AssetDeclaration(
                        person_id=person.id,
                        legislature=link.legislature,
                        sequence=link.sequence,
                        declared_on=link.declared_on,
                        pdf_url=link.url,
                        parse_status="pending",
                    )
                )
                known.add(link.url)
                counts["new"] += 1
            await asyncio.sleep(delay_seconds)
    await session.commit()
    log.info("assets.discovered", **counts)
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
    """Read up to ``limit`` declarations not read yet (with ``retry``, also
    the ones that failed or need review; with ``redo``, every one, e.g.
    after a fix here). The OCR text already stored is reused. Commits after
    each one."""
    from app.services.llm_http import LLMUnavailableError

    s = settings or get_settings()
    statuses = ["pending", "failed", "needs_review"] if retry else ["pending"]
    if redo:
        statuses.append("ok")
    q = (
        select(AssetDeclaration, Person.full_name)
        .join(Person, Person.id == AssetDeclaration.person_id)
        .where(AssetDeclaration.parse_status.in_(statuses))
        .order_by(AssetDeclaration.declared_on.desc())
        .limit(limit)
    )
    if person_id is not None:
        q = q.where(AssetDeclaration.person_id == person_id)
    rows = (await session.execute(q)).all()
    counts = {"ok": 0, "needs_review": 0, "failed": 0}
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(180.0, read=180.0), headers={"User-Agent": "Mozilla/5.0"}
    ) as client:
        for decl, full_name in rows:
            try:
                text = decl.ocr_text or await ocr_pdf(
                    s, client, await fetch_pdf(client, decl.pdf_url)
                )
                raw = await structure(s, client, text)
                data, problems = normalise_declaration(raw, full_name)
            except LLMUnavailableError:
                log.error("assets.llm_unavailable")
                break
            except (httpx.HTTPError, ValueError, KeyError) as e:
                log.warning("assets.parse_failed", id=decl.id, url=decl.pdf_url, error=str(e))
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
    log.info("assets.parsed", **counts)
    return counts


async def classify_income_sources(
    session: AsyncSession, *, batch_size: int = 40, settings: Settings | None = None
) -> dict[str, int]:
    """Label who pays each income concept not labelled yet, from the words
    the deputy wrote. Dividends and interest need no label (the form's own
    section says), and a row already there, by hand or not, is left alone.
    Commits after each batch."""
    from app.services.asset_summary import normalise_concept
    from app.services.llm_http import LLMUnavailableError

    s = settings or get_settings()
    known = set((await session.execute(select(AssetIncomeSource.concept))).scalars().all())
    data_rows = await session.execute(
        select(AssetDeclaration.data).where(AssetDeclaration.parse_status == "ok")
    )
    declared: list[dict[str, Any]] = [dict(d) for d in data_rows.scalars().all() if d]
    concepts = sorted(
        {
            normalise_concept(str(row["concept"]))
            for data in declared
            for row in data.get("income", [])
            if row.get("concept") and row.get("kind") not in ("dividends", "interest")
        }
        - known
    )
    counts = {"labelled": 0, "failed": 0}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, read=120.0)) as client:
        for start in range(0, len(concepts), batch_size):
            batch = concepts[start : start + batch_size]
            try:
                sources = await classify_batch(s, client, batch)
            except LLMUnavailableError:
                log.error("assets.llm_unavailable")
                break
            except (httpx.HTTPError, ValueError, KeyError) as e:
                log.warning("assets.classify_failed", error=str(e))
                counts["failed"] += len(batch)
                continue
            session.add_all(
                AssetIncomeSource(
                    concept=concept, source=source, classified_by=s.asset_structure_model
                )
                for concept, source in zip(batch, sources, strict=True)
            )
            await session.commit()
            counts["labelled"] += len(batch)
    log.info("assets.classified", **counts)
    return counts


async def _show(person_id: int) -> None:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        rows = (
            (
                await session.execute(
                    select(AssetDeclaration)
                    .where(AssetDeclaration.person_id == person_id)
                    .order_by(AssetDeclaration.declared_on)
                )
            )
            .scalars()
            .all()
        )
    for d in rows:
        print(f"# {d.declared_on} seq={d.sequence} {d.parse_status} {d.pdf_url}")
        if d.problems:
            print("  problems:", d.problems)
        print(json.dumps(d.data, ensure_ascii=False, indent=2))


def main() -> None:
    from app.db.session import AsyncSessionLocal

    configure_logging()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("discover")
    p = sub.add_parser("parse")
    p.add_argument("--limit", type=int, default=40)
    p.add_argument("--person", type=int, default=None)
    p.add_argument("--retry", action="store_true")
    p.add_argument("--redo", action="store_true")
    sub.add_parser("classify")
    show = sub.add_parser("show")
    show.add_argument("person_id", type=int)
    args = parser.parse_args()

    async def run() -> object:
        if args.cmd == "show":
            await _show(args.person_id)
            return None
        async with AsyncSessionLocal() as session:
            if args.cmd == "discover":
                return await discover(session)
            if args.cmd == "classify":
                return await classify_income_sources(session)
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
