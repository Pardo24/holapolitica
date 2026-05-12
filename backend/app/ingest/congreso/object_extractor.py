"""Extract the human-readable "Exposición de motivos" section from a BOCG PDF.

The Congreso open-data initiatives JSON (``ProyectosDeLey``,
``ProposicionesDeLey``, ``PropuestasDeReforma``) carries the bill's
**title** in the ``OBJETO`` field — not the explanatory prose readers
would call the law's "objeto". The prose lives in the BOCG PDF linked
from ``ENLACESBOCG`` under a heading that, depending on the bill series,
is one of:

- ``Exposición de motivos`` — by far the most common form (Proposición
  de Ley, Proposición de ley orgánica).
- ``Preámbulo`` — used by some government bills (Proyectos de Ley) that
  follow the European-style preamble convention.

After the heading and before the operative articles
(``Artículo único.``, ``Artículo primero.``, ``Disposición final…``,
``TÍTULO I``, ``CAPÍTULO I``, …) the body is plain Spanish prose,
suitable to surface on a vote-detail page so non-lawyers understand
what they're looking at.

This module is intentionally a thin, pure utility:

- :func:`extract_object_text_from_pdf_bytes` is a sync, side-effect-free
  function: bytes in, ``str | None`` out. Unit-tested with embedded
  text fixtures (no I/O).
- :func:`fetch_and_extract_object_text` is the async wrapper that
  reaches the network through :class:`CongresoClient`.

The heuristic is conservative — when in doubt we return ``None`` and
let the caller fall back to the title. We never invent text.
"""

from __future__ import annotations

import io
import re

from pypdf import PdfReader

from app.core.logging import get_logger

log = get_logger(__name__)


# Heading patterns. Order matters: the first match wins, and we look for
# the *first* one that appears anywhere in the document — typically on
# page 2 of the BOCG PDF, right after the cover page boilerplate.
#
# ``Exposici[oó]n de motivos`` is the most common form. ``Preámbulo``
# covers the European-style preamble used in some Proyectos de Ley.
# Both are matched case-insensitively.
_HEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"Exposici[oó]n\s+de\s+motivos", re.IGNORECASE),
    re.compile(r"Pre[aá]mbulo", re.IGNORECASE),
)


# Terminator patterns that mark the end of the prose section. The PDF
# layout puts the heading on its own line and then the operative section
# starts with an Article or Disposition heading, also on its own line.
#
# We require the terminator to start on its own line (preceded by
# whitespace) so we don't accidentally cut on an inline mention of
# "artículo primero" inside the prose itself.
_TERMINATOR_PATTERN = re.compile(
    r"\n\s*("
    r"Art[ií]culo\s+([úu]nico|primero|1\b|I\b)"  # Artículo único / primero / 1 / I
    r"|Disposici[oó]n\s+(adicional|final|transitoria|derogatoria)"
    r"|T[IÍ]TULO\s+(I|primero|preliminar)\b"
    r"|CAP[IÍ]TULO\s+(I|primero|preliminar)\b"
    r"|LIBRO\s+(I|primero|preliminar)\b"
    r")\b",
    re.IGNORECASE,
)


# BOCG-style running header that repeats at the top of every page after
# the cover. We strip it line-by-line so the prose reads as one
# continuous block.
_RUNNING_HEADER_LINES = (
    "BOLETÍN OFICIAL DE LAS CORTES GENERALES",
    "CONGRESO DE LOS DIPUTADOS",
)
_PAGE_FOOTER_PATTERN = re.compile(
    r"^Serie\s+[A-Z]\s+Núm\.\s+\S+.*Pág\.\s+\d+\s*$",
    re.IGNORECASE,
)
_CVE_LINE_PATTERN = re.compile(r"^cve:\s*\S+\s*$", re.IGNORECASE)


# Minimum length below which a candidate section is almost certainly a
# stub (e.g. a one-line "Exposición de motivos" header followed
# immediately by the article body, with no actual prose). We treat such
# cases as "no object text" — better NULL than misleading.
_MIN_PROSE_LENGTH = 200

# Maximum length we'll persist. Very long preambles (looking at you,
# Ley Orgánica del Poder Judicial) can run to tens of thousands of
# characters; truncating at ~12k keeps the column manageable while
# preserving the substance for 99 %+ of bills we've seen.
_MAX_PROSE_LENGTH = 12000


def _strip_bocg_chrome(text: str) -> str:
    """Remove repeating BOCG running header/footer noise from extracted text.

    pypdf's :meth:`PdfReader.extract_text` returns each page's text as a
    continuous string. Concatenating pages yields a body where the BOCG
    chrome (``BOLETÍN OFICIAL DE LAS CORTES GENERALES`` / ``CONGRESO DE
    LOS DIPUTADOS`` / ``Serie B Núm. 1-1 8 de septiembre de 2023 Pág. 3``
    / ``cve: BOCG-15-B-1-1``) is interleaved every few hundred chars.
    Stripping these line-by-line yields a readable prose block.
    """
    kept: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            kept.append("")
            continue
        if line in _RUNNING_HEADER_LINES:
            continue
        if _PAGE_FOOTER_PATTERN.match(line):
            continue
        if _CVE_LINE_PATTERN.match(line):
            continue
        kept.append(raw_line)
    return "\n".join(kept)


def _collapse_whitespace(text: str) -> str:
    """Collapse runs of whitespace and join hard-wrapped paragraphs.

    BOCG PDFs hard-wrap every line at ~80 chars. After stripping headers
    we re-flow the prose: a single newline inside a paragraph becomes a
    space; a blank line (``\\n\\n``) stays as a paragraph break.
    """
    # Normalise CRLF.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ newlines into 2 (paragraph break).
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Within a paragraph (single newline), join with a space.
    # Paragraph breaks (double newline) survive this because we
    # operate on single newlines only.
    paragraphs = text.split("\n\n")
    joined = ["\n".join(p.splitlines()).replace("\n", " ").strip() for p in paragraphs]
    cleaned = "\n\n".join(p for p in joined if p)
    # Collapse repeated inner spaces.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _find_heading(text: str) -> re.Match[str] | None:
    """Return the earliest heading match across all known forms, or None."""
    best: re.Match[str] | None = None
    for pattern in _HEADING_PATTERNS:
        m = pattern.search(text)
        if m is None:
            continue
        if best is None or m.start() < best.start():
            best = m
    return best


def extract_object_text(full_text: str) -> str | None:
    """Pure extractor: given a PDF's full text, return the object section.

    Returns ``None`` when no recognisable heading is present or when the
    extracted prose is implausibly short. Never raises.

    The function:

    1. Finds the earliest occurrence of any heading from
       :data:`_HEADING_PATTERNS`.
    2. Cuts from the end of that heading to the first terminator
       (Artículo / Disposición / TÍTULO / CAPÍTULO / LIBRO) at the
       start of a line.
    3. Strips BOCG running headers, collapses whitespace, joins
       hard-wrapped lines into paragraphs.
    4. Discards results shorter than :data:`_MIN_PROSE_LENGTH` chars.
    5. Truncates at :data:`_MAX_PROSE_LENGTH` chars (rare).
    """
    heading = _find_heading(full_text)
    if heading is None:
        return None
    after = full_text[heading.end() :]
    terminator = _TERMINATOR_PATTERN.search(after)
    raw_section = after[: terminator.start()] if terminator else after
    cleaned = _collapse_whitespace(_strip_bocg_chrome(raw_section))
    if len(cleaned) < _MIN_PROSE_LENGTH:
        return None
    if len(cleaned) > _MAX_PROSE_LENGTH:
        cleaned = cleaned[:_MAX_PROSE_LENGTH].rstrip() + "…"
    return cleaned


def extract_object_text_from_pdf_bytes(pdf_bytes: bytes) -> str | None:
    """Parse a BOCG PDF and return its object/preamble section.

    Returns ``None`` for unparseable PDFs (encrypted, malformed),
    PDFs with no recognisable heading, or PDFs whose section is too
    short to be useful. Never raises on a malformed input — callers
    treat ``None`` as "no extraction possible, fall back to title".
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:  # pypdf raises many concrete error classes
        log.warning("congreso.object_extractor.pdf_open_failed", error=str(exc))
        return None

    # Only read the first ~10 pages — preambles always live near the
    # front, and full bills can run to hundreds of pages of articles
    # which we don't want to extract just to throw away.
    pages_to_read = reader.pages[:10]
    try:
        full_text = "\n".join(p.extract_text() or "" for p in pages_to_read)
    except Exception as exc:
        log.warning("congreso.object_extractor.pdf_extract_failed", error=str(exc))
        return None

    return extract_object_text(full_text)


def first_pdf_url(enlaces_bocg: str | None) -> str | None:
    """Return the first PDF URL from the newline-separated ``ENLACESBOCG`` field.

    The portal stores one or more BOCG PDF URLs in a single string,
    newline-separated, with trailing ``#page=N`` anchors. We pick the
    first URL (the original publication, before amendments) and drop
    the page anchor for clean fetching.
    """
    if not enlaces_bocg:
        return None
    for raw in enlaces_bocg.splitlines():
        url = raw.strip()
        if not url:
            continue
        # Drop ``#page=N`` and similar anchors — they're only useful in
        # a browser, not for raw fetching.
        url = url.split("#", 1)[0]
        if url.startswith(("http://", "https://")) and url.lower().endswith(".pdf"):
            return url
    return None
