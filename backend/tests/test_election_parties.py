"""Which parties a headline names (the /pactes party filter)."""

from __future__ import annotations

import pytest

from app.services.election_parties import PARTIES, parties_in, party_query


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        (
            "Llistes d'ERC a les eleccions espanyoles del 29-N: qui acompanya Gabriel Rufián?",
            ["erc"],
        ),
        ("Albiol veu molt complicat un acord d'investidura PP-Junts", ["pp", "junts"]),
        (
            "Frente Amplio y el PSOE niegan estar en conversaciones para las listas",
            ["psoe", "frente-amplio"],
        ),
        (
            "Montero diu que la falta d'acord amb el Frente Amplio es deu a discrepàncies",
            ["frente-amplio"],
        ),
        ("Irene Montero encabezará la lista de Podemos en Madrid", ["podemos"]),
        ("Consulte aquí las cabezas de lista de Vox: Abascal por Madrid", ["vox"]),
        ("Feijóo promete bajar impuestos si gana el 29N", ["pp"]),
        ("ERC incorpora membres de Podem a les llistes del 29N", ["erc", "podemos"]),
        ("Coalición Canaria y el PNV, a la espera del 29N", ["pnv", "cc"]),
        # Not parties: a verb, an adjective, the left in general.
        ("L'esquerra encara l'obertura del termini per a llistes al 29N", []),
        ("Podem dir que les llistes ja estan tancades", []),
        ("Los partidos buscan sumar apoyos antes del 29N", []),
        ("Els béns comuns, a debat abans de les eleccions", []),
    ],
)
def test_parties_in(title: str, expected: list[str]) -> None:
    assert parties_in(title) == expected


def test_every_party_has_a_search() -> None:
    for party in PARTIES:
        q = party_query(party.slug, "ca")
        assert q.startswith("(") and "when:14d" in q
