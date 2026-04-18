"""Tests for the initiative classifier and parser."""

from __future__ import annotations

from datetime import date

import pytest

from app.ingest.congreso.parse import (
    classify_initiative_status,
    classify_initiative_type,
    parse_initiative,
)


@pytest.mark.parametrize(
    "tipo, expected",
    [
        ("Proyecto de ley", "proyecto_ley"),
        ("Proyecto de Ley Orgánica", "proyecto_ley"),
        ("Proposición de ley de Grupos Parlamentarios del Congreso", "proposicion_ley"),
        ("Proposición de ley", "proposicion_ley"),
        ("Proposición no de Ley ante el Pleno", "proposicion_no_ley"),
        ("Real decreto-ley", "real_decreto_ley"),
        ("Moción consecuencia de interpelación urgente", "mocion"),
        ("Interpelación urgente al Gobierno", "interpelacion"),
        ("Propuesta de reforma de Estatuto de Autonomía", "other"),
        ("Algo desconocido", "other"),
    ],
)
def test_classify_initiative_type(tipo: str, expected: str) -> None:
    assert classify_initiative_type(tipo) == expected


@pytest.mark.parametrize(
    "situation, result, expected",
    [
        ("Cerrado", "Aprobado con modificaciones \n10/09/2024", "approved"),
        ("Pleno \nDebate", "Rechazado", "rejected"),
        ("Mesa \nRetirada", None, "withdrawn"),
        (None, "Caducada", "expired"),
        ("Cerrado", None, "expired"),
        ("Pleno \nToma en consideración", None, "in_debate"),
        ("Comisión de Igualdad \nEnmiendas", None, "in_debate"),
        (None, None, "submitted"),
        ("", "", "submitted"),
    ],
)
def test_classify_initiative_status(
    situation: str | None, result: str | None, expected: str
) -> None:
    assert classify_initiative_status(situation, result) == expected


def test_parse_initiative_normalizes_whitespace_in_title() -> None:
    raw = {
        "TIPO": "Proyecto de ley",
        "OBJETO": "Proyecto de Ley Orgánica de representación paritaria y presencia\nequilibrada de mujeres y hombres.",
        "NUMEXPEDIENTE": "121/000001/0000",
        "FECHAPRESENTACION": "07/12/2023",
        "AUTOR": "Gobierno",
        "SITUACIONACTUAL": "Cerrado",
        "RESULTADOTRAMITACION": "Aprobado con modificaciones \n10/09/2024",
        "ENLACESBOCG": "https://www.congreso.es/example.pdf",
    }
    parsed = parse_initiative(raw)
    assert parsed.official_id == "121/000001/0000"
    assert parsed.type_code == "proyecto_ley"
    assert parsed.title == (
        "Proyecto de Ley Orgánica de representación paritaria y "
        "presencia equilibrada de mujeres y hombres."
    )
    assert parsed.submitted_at == date(2023, 12, 7)
    assert parsed.submitted_by == "Gobierno"
    assert parsed.source_url == "https://www.congreso.es/example.pdf"


def test_parse_initiative_handles_missing_optional_fields() -> None:
    raw = {
        "TIPO": "Proposición de ley",
        "OBJETO": "Algo",
        "NUMEXPEDIENTE": "122/000001/0000",
        "FECHAPRESENTACION": "",
    }
    parsed = parse_initiative(raw)
    assert parsed.submitted_at is None
    assert parsed.submitted_by is None
    assert parsed.source_url is None
