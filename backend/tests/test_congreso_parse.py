"""Tests for the pure parsers used by the Congreso importer."""

from __future__ import annotations

from datetime import date

import pytest

from app.ingest.congreso.parse import (
    parliamentary_group_short_name,
    parliamentary_group_slug,
    parse_active_deputy,
    parse_dmy_date,
    parse_person_name,
)


def test_parse_dmy_date() -> None:
    assert parse_dmy_date("17/08/2023") == date(2023, 8, 17)
    assert parse_dmy_date("  03/01/2024  ") == date(2024, 1, 3)


def test_parse_dmy_date_rejects_iso() -> None:
    with pytest.raises(ValueError):
        parse_dmy_date("2023-08-17")


@pytest.mark.parametrize(
    "raw, full, given, family",
    [
        ("Abades Martínez, Cristina", "Cristina Abades Martínez", "Cristina", "Abades Martínez"),
        ("Abascal Conde, Santiago", "Santiago Abascal Conde", "Santiago", "Abascal Conde"),
        # Multiple given names
        (
            "García López, María del Carmen",
            "María del Carmen García López",
            "María del Carmen",
            "García López",
        ),
        # Internal whitespace gets collapsed
        ("Pérez   ,  Juan", "Juan Pérez", "Juan", "Pérez"),
    ],
)
def test_parse_person_name_splits_on_comma(raw: str, full: str, given: str, family: str) -> None:
    name = parse_person_name(raw)
    assert name.full_name == full
    assert name.given_names == given
    assert name.family_names == family


def test_parse_person_name_without_comma() -> None:
    name = parse_person_name("Madonna")
    assert name.full_name == "Madonna"
    assert name.given_names is None
    assert name.family_names is None


@pytest.mark.parametrize(
    "long_name, short_name, slug",
    [
        ("Grupo Parlamentario Popular en el Congreso", "GP Popular", "gp-popular"),
        ("Grupo Parlamentario VOX", "GP VOX", "gp-vox"),
        ("Grupo Parlamentario Socialista", "GP Socialista", "gp-socialista"),
        (
            "Grupo Parlamentario Plurinacional SUMAR",
            "GP Plurinacional SUMAR",
            "gp-plurinacional-sumar",
        ),
        ("Grupo Parlamentario Vasco (EAJ-PNV)", "GP Vasco (EAJ-PNV)", "gp-vasco-eaj-pnv"),
        (
            "Grupo Parlamentario Junts per Catalunya",
            "GP Junts per Catalunya",
            "gp-junts-per-catalunya",
        ),
        (
            "Grupo Parlamentario Euskal Herria Bildu",
            "GP Euskal Herria Bildu",
            "gp-euskal-herria-bildu",
        ),
        ("Grupo Parlamentario Republicano", "GP Republicano", "gp-republicano"),
        ("Grupo Parlamentario Mixto", "GP Mixto", "gp-mixto"),
    ],
)
def test_group_short_name_and_slug(long_name: str, short_name: str, slug: str) -> None:
    assert parliamentary_group_short_name(long_name) == short_name
    assert parliamentary_group_slug(long_name) == slug


def test_group_short_name_falls_back_to_long_when_unstrippable() -> None:
    assert parliamentary_group_short_name("Other Format") == "GP Other Format"


def test_parse_active_deputy_full_record() -> None:
    raw = {
        "NOMBRE": "Abades Martínez, Cristina",
        "CIRCUNSCRIPCION": "Lugo",
        "FORMACIONELECTORAL": "PP",
        "FECHACONDICIONPLENA": "17/08/2023",
        "FECHAALTA": "08/08/2023",
        "GRUPOPARLAMENTARIO": "Grupo Parlamentario Popular en el Congreso",
        "FECHAALTAENGRUPOPARLAMENTARIO": "18/08/2023",
        "BIOGRAFIA": "...",
    }
    parsed = parse_active_deputy(raw)

    assert parsed.name.full_name == "Cristina Abades Martínez"
    assert parsed.constituency == "Lugo"
    assert parsed.electoral_list_party == "PP"
    assert parsed.mandate_start_date == date(2023, 8, 17)
    assert parsed.group_name_long == "Grupo Parlamentario Popular en el Congreso"
    assert parsed.group_name_short == "GP Popular"
    assert parsed.group_slug == "gp-popular"
    assert parsed.group_membership_start_date == date(2023, 8, 18)


def test_parse_active_deputy_handles_blank_optional_fields() -> None:
    raw = {
        "NOMBRE": "Solo, Han",
        "CIRCUNSCRIPCION": "  ",
        "FORMACIONELECTORAL": "",
        "FECHACONDICIONPLENA": "01/01/2024",
        "GRUPOPARLAMENTARIO": "Grupo Parlamentario Mixto",
        "FECHAALTAENGRUPOPARLAMENTARIO": "01/01/2024",
    }
    parsed = parse_active_deputy(raw)
    assert parsed.constituency is None
    assert parsed.electoral_list_party is None


def test_parse_active_deputy_missing_required_field_raises() -> None:
    with pytest.raises(KeyError):
        parse_active_deputy({"NOMBRE": "X"})
