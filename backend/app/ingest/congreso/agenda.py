"""Parsers for the Congreso "Calendario de Sesiones Plenarias" page and the
per-session ``orden del día`` PDFs.

Source URLs (verified May 2026, see ``docs/upcoming-votes-source.md``):

- Calendar: ``https://www.congreso.es/es/calendario-de-sesiones-plenarias``
- PDF:      ``https://www.congreso.es/backoffice_doc/atp/orden_dia/pleno_<NNN>_<DDMMYYYY>.pdf``

Two pure entrypoints expose the parsed data:

- :func:`parse_calendar_html` — extracts the URL of the next published PDF
  plus a list of ``(year, month, day)`` "plenary day" markers from the six
  monthly calendar grids the page renders. The cells we care about carry
  ``class="day pleno"``; we don't follow ``class="day"`` (non-plenary
  days). The year is inferred from the URL of the next published PDF;
  this is reliable in practice — the Mesa always re-publishes the link
  for the next session.

- :func:`parse_orden_del_dia_pdf` — extracts the session number, the
  session date, and a list of agenda items (position, section, kind,
  proposing group, subject, official id, target minister where
  applicable). Built on ``pypdf``'s ``extract_text``; the PDF is Word-
  generated and yields stable, structured plain text.

Both functions are completely IO-free. The HTTP layer lives in
``app.ingest.congreso.client``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

import pypdf

# We do not import client._EXPTE_RE here: the votes-listing variant requires a
# period after "expte" ("Núm. expte. NNN/NNNNNN"), but the orden-del-día PDF
# omits the period ("Núm. expte NNN/NNNNNN"). The agenda-local pattern below
# matches both with an optional period — same capture group name kept for
# parity with the votes regex.
_EXPTE_RE = re.compile(
    r"N[uú]m\.\s*expte\.?\s*(?P<official_id>\d+/\d+(?:/\d+)?)",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Calendar HTML
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CalendarPlenoDay:
    """A day flagged on the calendar as a plenary day (``class="day pleno"``)."""

    date: date
    has_pdf: bool


@dataclass(frozen=True, slots=True)
class CalendarParseResult:
    """Result of parsing the calendar landing page."""

    next_pdf_url: str | None
    next_pdf_session_number: int | None
    next_pdf_date: date | None
    plenary_days: tuple[CalendarPlenoDay, ...]


# Match the orden-del-día PDF link. Captures session number and DDMMYYYY.
_PDF_LINK_RE = re.compile(
    r'href=["\'](?P<href>[^"\']*?/backoffice_doc/atp/orden_dia/'
    r"pleno_(?P<num>\d+)_(?P<dd>\d{2})(?P<mm>\d{2})(?P<yyyy>\d{4})\.pdf)"
    r'["\']',
    re.IGNORECASE,
)

# Spanish month label inside the calendar grid (one ``<div class="mes-sp">``
# per month, in source order: enero, febrero, ...).
_MONTH_LABEL_RE = re.compile(
    r'<div\s+class="mes-sp"[^>]*>\s*<strong>\s*(?P<name>[a-záéíóú]+)\s*</strong>',
    re.IGNORECASE | re.UNICODE,
)

# Each calendar day cell. ``class="day pleno"`` ⇒ plenary day; ``class="day"``
# ⇒ working day (no pleno). We need the day number from the inner ``<span>``.
_DAY_CELL_RE = re.compile(
    r'<td\s+class="day(?P<pleno>\s+pleno)?"\s*>' r"\s*<span[^>]*>\s*(?P<day>\d{1,2})\s*</span>",
    re.IGNORECASE,
)

_SPANISH_MONTHS: dict[str, int] = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def parse_calendar_html(html: str) -> CalendarParseResult:
    """Parse the calendar landing page.

    The page renders one or two semester views (e.g. February-June 2026).
    Each month is bounded by a ``<div class="mes-sp">`` heading and its
    table of day cells. The same year applies to every month rendered;
    we infer it from the next-pleno PDF's ``DDMMYYYY`` filename.
    """
    pdf_match = _PDF_LINK_RE.search(html)
    if pdf_match is None:
        next_pdf_url: str | None = None
        next_pdf_number: int | None = None
        next_pdf_date: date | None = None
        inferred_year: int | None = None
    else:
        href = pdf_match.group("href")
        next_pdf_url = (
            href if href.startswith(("http://", "https://")) else f"https://www.congreso.es{href}"
        )
        next_pdf_number = int(pdf_match.group("num"))
        next_pdf_date = date(
            int(pdf_match.group("yyyy")),
            int(pdf_match.group("mm")),
            int(pdf_match.group("dd")),
        )
        inferred_year = next_pdf_date.year

    days: list[CalendarPlenoDay] = []
    if inferred_year is not None:
        # Walk months in source order. Between two consecutive month markers
        # we collect every day cell flagged ``pleno``.
        month_iter = list(_MONTH_LABEL_RE.finditer(html))
        for i, m in enumerate(month_iter):
            month_name = m.group("name").lower()
            month_num = _SPANISH_MONTHS.get(month_name)
            if month_num is None:
                continue
            start = m.end()
            end = month_iter[i + 1].start() if i + 1 < len(month_iter) else len(html)
            chunk = html[start:end]
            for cell in _DAY_CELL_RE.finditer(chunk):
                if cell.group("pleno") is None:
                    continue
                day_num = int(cell.group("day"))
                try:
                    d = date(inferred_year, month_num, day_num)
                except ValueError:
                    # Defensive: malformed cell → skip.
                    continue
                days.append(
                    CalendarPlenoDay(
                        date=d,
                        has_pdf=(d == next_pdf_date),
                    )
                )

    return CalendarParseResult(
        next_pdf_url=next_pdf_url,
        next_pdf_session_number=next_pdf_number,
        next_pdf_date=next_pdf_date,
        plenary_days=tuple(days),
    )


# ---------------------------------------------------------------------------
# Orden del día PDF
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ParsedAgendaItem:
    """One numbered item in the orden del día."""

    position: int
    section: str
    kind: str
    proposing_group: str | None
    subject: str
    official_id: str | None
    target_minister: str | None


@dataclass(frozen=True, slots=True)
class OrdenDelDiaParseResult:
    """Result of parsing one orden del día PDF."""

    session_number: int
    session_date: date
    items: tuple[ParsedAgendaItem, ...]
    notes: tuple[str, ...] = field(default_factory=tuple)


# ``Sesión nº175`` (the digits may have surrounding whitespace).
_SESION_NUM_RE = re.compile(r"Sesi[oó]n\s*n[ºo]\s*(?P<num>\d+)", re.IGNORECASE)

# The header date line, e.g. ``Martes, 28 de abril de 2026``. Matches any
# Spanish weekday and any of the months in :data:`_SPANISH_MONTHS`.
_SESION_DATE_RE = re.compile(
    r"(?:Lunes|Martes|Mi[ée]rcoles|Jueves|Viernes|S[áa]bado|Domingo)\s*,\s*"
    r"(?P<day>\d{1,2})\s+de\s+(?P<month>"
    + "|".join(_SPANISH_MONTHS.keys())
    + r")\s+de\s+(?P<year>\d{4})",
    re.IGNORECASE,
)

# Section heading (Roman numeral, optional whitespace, period, label).
# Real PDFs sometimes render the numeral with stray internal whitespace
# (``IV . Mociones consecuencia ...``); we accept that.
_SECTION_HEADING_RE = re.compile(
    r"^\s*(?P<roman>VIII|VII|VI|IV|V|III|II|I)\s*\.\s+(?P<label>[^\n]+?)\s*\.?\s*$",
    re.MULTILINE,
)

# All-caps weekday header (``MARTES, 28 DE ABRIL``). Acts as an item
# separator: agenda items don't span across day blocks.
_WEEKDAY_HEADER_RE = re.compile(
    r"^\s*(?:LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[ÁA]BADO|DOMINGO)"
    r"\s*,\s*\d{1,2}\s+DE\s+[A-ZÁÉÍÓÚÑ]+\s*$",
    re.MULTILINE | re.UNICODE,
)

# Line that starts a numbered agenda item: ``"3. Real Decreto-ley ..."``.
_ITEM_START_RE = re.compile(r"^\s*(?P<n>\d+)\.\s+(?P<rest>.+)$")

# Some items use ``--.`` instead of a number (e.g. urgent comparecencias on
# pleno_178). We treat them as items with synthetic position 0 / ordered last.
_ITEM_DASH_RE = re.compile(r"^\s*--\.\s+(?P<rest>.+)$")

# "Del Grupo Parlamentario X" — captures the proposing group name verbatim
# (incl. accents). Stops at the first comma, which always follows in this
# corpus, or at end-of-line.
_GROUP_PROPOSER_RE = re.compile(
    r"Del\s+Grupo\s+Parlamentario\s+(?P<g>[^,\n]+?)(?:,|$)",
    re.IGNORECASE | re.UNICODE,
)

# All-caps minister header, e.g. ``MINISTRO DE HACIENDA`` or
# ``VICEPRESIDENTA SEGUNDA Y MINISTRA DE TRABAJO Y ECONOMÍA SOCIAL``.
# The PDF puts these on their own line, all uppercase, with optional
# parenthetical content. We accept lines that are >=80% uppercase letters.
_MINISTER_HEADER_RE = re.compile(
    r"^\s*(?P<text>(?:VICEPRESIDENT[AE](?:\s+(?:PRIMER[AO]|SEGUND[AO]))?\s+Y\s+)?"
    r"(?:MINISTR[AO]|PRESIDENTE)[^a-z\n]*)$",
    re.MULTILINE,
)


# Map roman numeral / section label to a coarse ``kind`` for items in that
# section. Items in section V can be further normalised (preguntas) but we
# keep ``pregunta`` regardless of which sub-minister header precedes them.
# ``PUNTO_UNICO`` is a synthetic section we assign to extraordinary single-
# item plenos (e.g. comparecencia del Gobierno) that the PDF marks with the
# header ``PUNTO ÚNICO.`` instead of a roman numeral.
_SECTION_KIND: dict[str, str] = {
    "I": "proposicion_ley",
    "II": "decreto_ley",
    "III": "pnl",
    "IV": "mocion",
    "V": "pregunta",
    "VI": "interpelacion",
    "VII": "decreto_ley",  # "VII. Convalidación o derogación de RDL"
    "VIII": "reforma_const",
    "PUNTO_UNICO": "comparecencia",
}

# ``PUNTO ÚNICO. <label>`` — extraordinary single-item plenos.
_PUNTO_UNICO_RE = re.compile(
    r"^\s*PUNTO\s+[ÚU]NICO\s*\.\s*(?P<label>[^\n]+?)\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def parse_orden_del_dia_pdf(pdf_bytes: bytes) -> OrdenDelDiaParseResult:
    """Extract the orden del día structure from a PDF byte payload.

    Layout assumptions (verified on ``pleno_175_28042026.pdf`` and
    ``pleno_178_07052026.pdf``):

    1. The PDF is a "Word-generated" 1-7 page document with selectable
       text. ``pypdf.PdfReader.extract_text()`` produces clean line-broken
       output where headings (``I. ...``), numbered items (``1. ...``)
       and minister labels (``MINISTRO DE HACIENDA``) sit on their own
       lines.
    2. The first page carries ``Sesión nº<N>`` and a long-form date line
       like ``Martes, 28 de abril de 2026``.
    3. Notes about modifications appear before the first per-day header
       (``MARTES, 28 DE ABRIL``); we capture them as free-text strings.
    4. Items inherit the most recently seen section heading and, within
       section V, the most recently seen minister header.

    Anything we can't classify under a section is dropped (defensively,
    to keep ``items`` clean and predictable). The few short PDFs that
    have only a ``PUNTO ÚNICO`` (e.g. comparecencia) end up with zero or
    one items; the calendar still records the session, so the API can
    surface the date even when the orden has no scrutable items.
    """
    from io import BytesIO

    reader = pypdf.PdfReader(BytesIO(pdf_bytes))
    raw_pages = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(raw_pages)

    # ---------- session number + date ----------
    num_match = _SESION_NUM_RE.search(full_text)
    date_match = _SESION_DATE_RE.search(full_text)
    if num_match is None or date_match is None:
        raise ValueError("orden del día PDF missing session header (Sesión nº / weekday date)")
    session_number = int(num_match.group("num"))
    session_date = date(
        int(date_match.group("year")),
        _SPANISH_MONTHS[date_match.group("month").lower()],
        int(date_match.group("day")),
    )

    # ---------- notes ----------
    # Heuristic: any paragraph between "Sesión nº..." and the first all-caps
    # weekday line ("MARTES, 28 DE ABRIL") that mentions "modificación" is a
    # note worth preserving.
    notes: list[str] = []
    weekday_split = re.search(
        r"^\s*(?:LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES)\s*,",
        full_text,
        re.MULTILINE,
    )
    header_end = weekday_split.start() if weekday_split is not None else min(2000, len(full_text))
    head_block = full_text[:header_end]
    for paragraph in re.split(r"\n\s*\n", head_block):
        if "modificación del orden" in paragraph.lower() or (
            "ha acordado" in paragraph.lower() and "punto" in paragraph.lower()
        ):
            notes.append(_collapse_whitespace(paragraph))

    # ---------- iterate items ----------
    items: list[ParsedAgendaItem] = []
    seen_positions: set[int] = set()

    current_section_roman: str | None = None
    current_section_label: str | None = None
    current_minister: str | None = None
    pending_position: int | None = None
    pending_buffer: list[str] = []

    def flush_pending() -> None:
        nonlocal pending_position, pending_buffer
        if pending_position is None or current_section_roman is None:
            pending_position = None
            pending_buffer = []
            return
        if pending_position in seen_positions:
            # Re-publishing of the same item number (e.g. across pages)
            # — keep the first occurrence, drop the duplicate.
            pending_position = None
            pending_buffer = []
            return
        text = _collapse_whitespace(" ".join(pending_buffer))
        if not text:
            pending_position = None
            pending_buffer = []
            return
        proposing = _extract_proposing_group(text)
        official = _extract_official_id(text)
        subject = _strip_metadata(text)
        items.append(
            ParsedAgendaItem(
                position=pending_position,
                section=current_section_label or current_section_roman,
                kind=_SECTION_KIND.get(current_section_roman, "otro"),
                proposing_group=proposing,
                subject=subject,
                official_id=official,
                target_minister=(
                    current_minister
                    if _SECTION_KIND.get(current_section_roman) == "pregunta"
                    else None
                ),
            )
        )
        seen_positions.add(pending_position)
        pending_position = None
        pending_buffer = []

    for raw_line in full_text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue

        # Skip page-number-only lines (a single bare digit at start of a page).
        if re.fullmatch(r"\s*\d{1,3}\s*", line):
            continue

        sec = _SECTION_HEADING_RE.match(line)
        if sec is not None and sec.group("roman") in _SECTION_KIND:
            flush_pending()
            current_section_roman = sec.group("roman")
            current_section_label = f"{current_section_roman}. {sec.group('label')}"
            current_minister = None
            continue

        # ``PUNTO ÚNICO.`` extraordinary plenos — synthetic section header.
        punto = _PUNTO_UNICO_RE.match(line)
        if punto is not None:
            flush_pending()
            current_section_roman = "PUNTO_UNICO"
            current_section_label = f"PUNTO ÚNICO. {punto.group('label')}"
            current_minister = None
            continue

        # Weekday header (``MARTES, 28 DE ABRIL``) — treat as a soft item
        # separator. The current section persists across days (e.g. section
        # III "Proposiciones no de Ley (continuación)" splits across two
        # weekdays).
        if _WEEKDAY_HEADER_RE.match(line):
            flush_pending()
            continue

        # ``A las HH horas`` / ``A las 9 horas`` — same separator role.
        if re.match(r"^\s*A\s+las\s+\d+\s+horas\s*$", line, re.IGNORECASE):
            continue

        # All-caps minister header (only meaningful inside section V).
        min_match = _MINISTER_HEADER_RE.match(line)
        if min_match is not None and current_section_roman == "V" and _looks_uppercase_header(line):
            flush_pending()
            current_minister = _collapse_whitespace(min_match.group("text"))
            continue

        # Numbered item start.
        item = _ITEM_START_RE.match(line)
        if item is not None:
            flush_pending()
            pending_position = int(item.group("n"))
            pending_buffer = [item.group("rest")]
            continue

        # ``--.`` placeholder item.
        dash_item = _ITEM_DASH_RE.match(line)
        if dash_item is not None:
            flush_pending()
            # Synthesize a position one past the current max (keeps uniqueness
            # within (session_id, position)).
            pending_position = max(seen_positions, default=0) + 1 if seen_positions else 1
            pending_buffer = [dash_item.group("rest")]
            continue

        # Continuation of the current item.
        if pending_position is not None:
            pending_buffer.append(line)

    flush_pending()
    items.sort(key=lambda x: x.position)
    return OrdenDelDiaParseResult(
        session_number=session_number,
        session_date=session_date,
        items=tuple(items),
        notes=tuple(notes),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_WHITESPACE_RE = re.compile(r"\s+")


def _collapse_whitespace(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def _looks_uppercase_header(line: str) -> bool:
    """Return ``True`` if at least 80% of letter chars in ``line`` are uppercase.

    Spanish minister headers in the PDF are written in upper case
    (``MINISTRO DE HACIENDA``). Lines like ``del Grupo Parlamentario``
    will fail this check even when they happen to match the broad regex
    because most of the letters are lowercase.
    """
    letters = [c for c in line if c.isalpha()]
    if not letters:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) >= 0.8


def _extract_proposing_group(text: str) -> str | None:
    m = _GROUP_PROPOSER_RE.search(text)
    if m is None:
        return None
    return _collapse_whitespace(m.group("g"))


def _extract_official_id(text: str) -> str | None:
    m = _EXPTE_RE.search(text)
    if m is None:
        return None
    return m.group("official_id")


# Drop trailing metadata lines that aren't part of the human subject:
# ``"BOCG. Congreso de los Diputados", serie B, número 313-1``,
# ``(Núm. expte 122/000262)``, and the lone procedural keywords
# ``Procedimiento`` / ``Texto`` / ``Enmienda(s)`` / ``Criterio del Gobierno``
# that decorate items. We keep the leading paragraph that describes the
# initiative — that's the human-readable subject.
_METADATA_PATTERNS = [
    re.compile(r'\s*"BOCG[^"]*"[^.]*\.', re.IGNORECASE),
    re.compile(r"\s*\(N[uú]m\.\s*expte[^)]+\)", re.IGNORECASE),
    re.compile(r"\s*\(B\.O\.E\.[^)]+\)", re.IGNORECASE),
    re.compile(
        r"\s*\b(?:Procedimiento|Texto|Enmiendas?|Criterio del Gobierno)\b\s*",
        re.IGNORECASE,
    ),
]


def _strip_metadata(text: str) -> str:
    out = text
    for pat in _METADATA_PATTERNS:
        out = pat.sub(" ", out)
    return _collapse_whitespace(out)
