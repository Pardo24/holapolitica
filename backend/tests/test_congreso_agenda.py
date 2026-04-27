"""Tests for the orden del día parser and the calendar HTML parser.

Fixtures:

- ``fixtures/pleno_175_28042026.pdf`` — the ~7-page PDF for the pleno held
  on 2026-04-28; verified end-to-end against the live source on
  2026-05-08.
- ``fixtures/pleno_178_07052026.pdf`` — the 1-page PDF for the next
  upcoming pleno (PUNTO ÚNICO comparecencia).
- ``fixtures/calendar.html`` — saved snapshot of the
  ``/es/calendario-de-sesiones-plenarias`` landing page on the same date.

If the live PDF format changes, refresh the fixtures by re-running the
``curl`` commands documented in ``docs/upcoming-votes-source.md``.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.ingest.congreso.agenda import (
    parse_calendar_html,
    parse_orden_del_dia_pdf,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def pdf_175() -> bytes:
    return (FIXTURES / "pleno_175_28042026.pdf").read_bytes()


@pytest.fixture(scope="module")
def pdf_178() -> bytes:
    return (FIXTURES / "pleno_178_07052026.pdf").read_bytes()


@pytest.fixture(scope="module")
def calendar_html() -> str:
    return (FIXTURES / "calendar.html").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Calendar HTML
# ---------------------------------------------------------------------------


def test_calendar_extracts_next_pdf(calendar_html: str) -> None:
    result = parse_calendar_html(calendar_html)
    assert result.next_pdf_url is not None
    assert "pleno_178_07052026.pdf" in result.next_pdf_url
    assert result.next_pdf_session_number == 178
    assert result.next_pdf_date == date(2026, 5, 7)


def test_calendar_extracts_plenary_days(calendar_html: str) -> None:
    result = parse_calendar_html(calendar_html)
    # The May 2026 page has multiple ``day pleno`` cells; we just sanity-check
    # that we found a non-empty list and that one of them matches the next-
    # PDF date.
    assert len(result.plenary_days) > 0
    matching = [d for d in result.plenary_days if d.date == date(2026, 5, 7)]
    assert matching, "next pleno date 2026-05-07 must be flagged in the grid"
    assert matching[0].has_pdf is True


def test_calendar_year_inferred_from_pdf_url(calendar_html: str) -> None:
    """All extracted plenary days share the year encoded in the PDF URL."""
    result = parse_calendar_html(calendar_html)
    assert all(d.date.year == 2026 for d in result.plenary_days)


def test_calendar_handles_missing_pdf() -> None:
    """If no PDF link is present, the parser still returns an empty result
    instead of crashing."""
    result = parse_calendar_html("<html><body>nothing here</body></html>")
    assert result.next_pdf_url is None
    assert result.next_pdf_session_number is None
    assert result.next_pdf_date is None
    assert result.plenary_days == ()


# ---------------------------------------------------------------------------
# Orden del día PDF (full session)
# ---------------------------------------------------------------------------


def test_pdf_175_session_header(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    assert result.session_number == 175
    assert result.session_date == date(2026, 4, 28)


def test_pdf_175_extracts_modification_note(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    # The Mesa published a modification excluding item 29 — the parser must
    # surface that as a note so the UI can show a "modified" badge.
    assert any("excluir el punto 29" in n for n in result.notes)


def test_pdf_175_finds_first_proposicion_de_ley(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    items = [i for i in result.items if i.position == 1]
    assert len(items) == 1
    item = items[0]
    assert item.kind == "proposicion_ley"
    assert item.section.startswith("I.")
    assert item.proposing_group is not None
    assert "Republicano" in item.proposing_group
    assert item.official_id == "122/000262"
    assert "Generalitat de Cataluña" in item.subject


def test_pdf_175_decreto_ley_item(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    item = next(i for i in result.items if i.position == 3)
    assert item.kind == "decreto_ley"
    assert item.section.startswith("II.")
    assert item.official_id == "130/000039"
    assert "Real Decreto-ley" in item.subject


def test_pdf_175_pregunta_has_target_minister(pdf_175: bytes) -> None:
    """Section V items carry the most-recent minister header."""
    result = parse_orden_del_dia_pdf(pdf_175)
    # Item 23 in the PDF is addressed to MINISTRO DE HACIENDA.
    item = next(i for i in result.items if i.position == 23)
    assert item.kind == "pregunta"
    assert item.target_minister is not None
    assert "MINISTRO DE HACIENDA" in item.target_minister


def test_pdf_175_no_duplicate_positions(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    positions = [i.position for i in result.items]
    assert len(positions) == len(set(positions))


def test_pdf_175_items_are_sorted(pdf_175: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_175)
    positions = [i.position for i in result.items]
    assert positions == sorted(positions)


def test_pdf_175_no_editorial_text(pdf_175: bytes) -> None:
    """CLAUDE.md neutrality: subjects must not contain valuative tokens
    we would only insert ourselves. This guards against a future change
    that wires plain-summary generation here by accident.
    """
    result = parse_orden_del_dia_pdf(pdf_175)
    banned = ["MALAMENT", "BÉ", "[VALORACIÓ]", "[OPINIÓ]"]
    for item in result.items:
        for tok in banned:
            assert tok not in item.subject, f"item {item.position}: {tok!r} in subject"


# ---------------------------------------------------------------------------
# Orden del día PDF (single-item session)
# ---------------------------------------------------------------------------


def test_pdf_178_session_header(pdf_178: bytes) -> None:
    result = parse_orden_del_dia_pdf(pdf_178)
    assert result.session_number == 178
    assert result.session_date == date(2026, 5, 7)
