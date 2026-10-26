"""Names on the official lists → outgoing deputies (app/services/candidate_match.py).

The pairs are real: the 2023 lists against the deputies' names in Congress.
"""

from __future__ import annotations

import pytest

from app.services.candidate_match import Deputy, DeputyIndex

DEPUTIES = [
    Deputy(1, "Carmen Navarro Lacoba", "Navarro Lacoba", "Carmen", "Albacete"),
    Deputy(2, "Gabriel Rufián Romero", "Rufián Romero", "Gabriel", "Barcelona"),
    Deputy(3, "Nacho Martín Blanco", "Martín Blanco", "Nacho", "Barcelona"),
    Deputy(4, "Marta Madrenas i Mir", "Madrenas i Mir", "Marta", "Girona"),
    Deputy(5, "Miguel Tellado Filgueira", "Tellado Filgueira", "Miguel", "Coruña (A)"),
    Deputy(6, "María Mercè Perea i Conillas", "Perea i Conillas", "María Mercè", "Barcelona"),
    Deputy(7, "José Ignacio Romaní Cantera", "Romaní Cantera", "José Ignacio", "Cádiz"),
    Deputy(8, "Jimena Delgado-Taramona Hernández", "Delgado-Taramona Hernández", "Jimena", "Palmas (Las)"),
    Deputy(9, "Emilio Sáez Cruz", "Sáez Cruz", "Emilio", "Albacete"),
]  # fmt: skip


@pytest.mark.parametrize(
    ("name", "constituency", "expected"),
    [
        ("Emilio Sáez Cruz", "Albacete", 9),
        # Exact names link across constituencies too.
        ("Emilio Sáez Cruz", "Madrid", 9),
        ("María Carmen Navarro Lacoba", "Albacete", 1),
        ("Gabriel Rufián i Romero", "Barcelona", 2),
        ("Ignacio (Nacho) Martín Blanco", "Barcelona", 3),
        ("Marta Madrenas Mir", "Girona", 4),
        ("Miguel Ángel Tellado Filgueira", "Coruña (A)", 5),
        ("Mercè Perea Conillas", "Barcelona", 6),
        ("Ignacio Romaní Cantera", "Cádiz", 7),
        ("Jimena Mercedes Delgado-Taramona Hernández", "Palmas (Las)", 8),
        # Not them: another given name, another constituency, a namesake.
        ("Carlos Tellado Pérez", "Coruña (A)", None),
        ("Lucía Requena Perea", "Córdoba", None),
        ("María Carmen Navarro Lacoba", "Madrid", None),
        ("Antonio Navarro Lacoba", "Albacete", None),
    ],
)
def test_match(name: str, constituency: str, expected: int | None) -> None:
    assert DeputyIndex(DEPUTIES).match(name, constituency) == expected


def test_two_deputies_with_one_name_get_no_link() -> None:
    twins = [
        Deputy(1, "Ana García López", "García López", "Ana", "Madrid"),
        Deputy(2, "Ana García López", "García López", "Ana", "Madrid"),
    ]
    assert DeputyIndex(twins).match("Ana García López", "Madrid") is None


def test_candidacies_by_person_gives_place_and_list() -> None:
    from datetime import date

    from app.api.elections import candidacies_by_person
    from app.models import ElectionCandidacy

    lists = [
        ElectionCandidacy(
            election="2026-11",
            stage="presented",
            constituency="Barcelona",
            ballot_order=1,
            name="Esquerra Republicana de Catalunya",
            acronym="ERC",
            candidates=["Gabriel Rufián i Romero", "Pilar Vallugera Balañà"],
            substitutes=["Ignacio (Nacho) Martín Blanco"],
            boe_id="BOE-A-2026-1",
            published_on=date(2026, 10, 28),
        ),
    ]
    found = candidacies_by_person(lists, DeputyIndex(DEPUTIES))
    assert found[2] == [
        {
            "constituency": "Barcelona",
            "list_name": "Esquerra Republicana de Catalunya",
            "acronym": "ERC",
            "party": found[2][0]["party"],
            "position": 1,
            "substitute": False,
        }
    ]
    assert found[3][0]["substitute"] is True and found[3][0]["position"] == 1
    assert set(found) == {2, 3}
