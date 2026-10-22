"""BOE candidacy documents → Congress lists (app/ingest/candidacies.py).

The fixture follows the 2023 document (BOE-A-2023-15066) paragraph by
paragraph: its classes, a rejected list, initials with brackets inside
brackets and the Senate section that must be left out.
"""

from __future__ import annotations

import pytest

from app.ingest.candidacies import (
    SEATS,
    _stage_of,
    constituency_for_board,
    parse_candidacies,
    split_list_name,
)
from app.services.election_parties import party_for_list

DOC = """<?xml version="1.0" encoding="utf-8"?>
<documento><texto>
<p class="centro_negrita">JUNTA ELECTORAL DE ALBACETE</p>
<p class="parrafo_2">La Junta Electoral Provincial de Albacete ... ha acordado proclamar ...</p>
<p class="centro_cursiva">CONGRESO DE LOS DIPUTADOS</p>
<p class="centro_redonda">1. PARTIDO SOCIALISTA OBRERO ESPAÑOL (PSOE)</p>
<p class="parrafo_2">1. Emilio Sáez Cruz.</p>
<p class="parrafo">2. Isabel Belén Iniesta Egido.</p>
<p class="parrafo_2">Suplentes:</p>
<p class="parrafo_2">1. María Pilar Sierra Morcillo.</p>
<p class="centro_redonda">2. POR UN MUNDO MÁS JUSTO (PUM+J)</p>
<p class="parrafo_2">No proclamada.</p>
<p class="centro_redonda">3. PARTIDO POPULAR (PP)</p>
<p class="parrafo_2">1. María Carmen Navarro Lacoba.</p>
<p class="centro_cursiva">SENADO</p>
<p class="centro_redonda">1. PARTIDO SOCIALISTA OBRERO ESPAÑOL (PSOE)</p>
<p class="parrafo_2"><span class="sangria-numero">1.</span><span class="sangria-texto">Amparo Torres Valencoso.</span></p>
<p class="centro_negrita">JUNTA ELECTORAL DE BIZKAIA</p>
<p class="centro_cursiva">CONGRESO DE LOS DIPUTADOS</p>
<p class="centro_redonda">3. PARTIDO SOCIALISTA DE EUSKADI-EUSKADIKO EZKERRA (PSOE) (PS<span class="no_partir">E</span><span class="no_partir">-E</span>E (PSOE))</p>
<p class="parrafo_2">1. Patxi López Alvarez.</p>
<p class="centro_negrita">JUNTA ELECTORAL DE BALEARES</p>
<p class="centro_cursiva">CONGRESO DE LOS DIPUTADOS</p>
<p class="centro_redonda">1. VOX (VOX)</p>
<p class="parrafo_2">1. Jorge Campos Asensi.</p>
<p class="centro_negrita">Circunscripción electoral: Mallorca</p>
<p class="centro_cursiva">SENADO</p>
<p class="centro_redonda">1. VOX (VOX)</p>
<p class="parrafo_2">1. Alguien Del Senado.</p>
</texto></documento>"""


def test_parses_congress_lists_only() -> None:
    lists = parse_candidacies(DOC.encode())
    got = [(x.constituency, x.ballot_order, x.acronym, x.candidates, x.substitutes) for x in lists]
    assert got == [
        (
            "Albacete",
            1,
            "PSOE",
            ["Emilio Sáez Cruz", "Isabel Belén Iniesta Egido"],
            ["María Pilar Sierra Morcillo"],
        ),
        # 2 was not proclaimed: it does not stand.
        ("Albacete", 3, "PP", ["María Carmen Navarro Lacoba"], []),
        ("Bizkaia", 3, "PSE-EE (PSOE)", ["Patxi López Alvarez"], []),
        ("Balears (Illes)", 1, "VOX", ["Jorge Campos Asensi"], []),
    ]


@pytest.mark.parametrize(
    ("text", "name", "acronym"),
    [
        ("PARTIDO POPULAR (PP)", "PARTIDO POPULAR", "PP"),
        (
            "PARTIDO SOCIALISTA DE EUSKADI (PSOE) [PSE-EE (PSOE)]",
            "PARTIDO SOCIALISTA DE EUSKADI (PSOE)",
            "PSE-EE (PSOE)",
        ),
        ("ESCAÑOS EN BLANCO (ESCAÑOS EN BLANCO)", "ESCAÑOS EN BLANCO", "ESCAÑOS EN BLANCO"),
        ("SIN SIGLAS", "SIN SIGLAS", None),
    ],
)
def test_split_list_name(text: str, name: str, acronym: str | None) -> None:
    assert split_list_name(text) == (name, acronym)


# Every board heading of the 2023 document.
BOARDS_2023 = [
    "ALBACETE", "ALICANTE", "ALMERÍA", "ÁLAVA", "ASTURIAS", "ÁVILA", "BADAJOZ", "BALEARES",
    "BARCELONA", "BIZKAIA", "BURGOS", "CÁCERES", "CÁDIZ", "CANTABRIA", "CASTELLÓN",
    "CIUDAD REAL", "CÓRDOBA", "A CORUÑA", "CUENCA", "GIPUZKOA", "GIRONA", "GRANADA",
    "GUADALAJARA", "HUELVA", "HUESCA", "JAÉN", "LEÓN", "LLEIDA", "LUGO", "MADRID", "MÁLAGA",
    "MURCIA", "NAVARRA", "OURENSE", "PALENCIA", "LAS PALMAS", "PONTEVEDRA", "LA RIOJA",
    "SALAMANCA", "SANTA CRUZ DE TENERIFE", "SEGOVIA", "SEVILLA", "SORIA", "TARRAGONA",
    "TERUEL", "TOLEDO", "VALENCIA", "VALLADOLID", "ZAMORA", "ZARAGOZA", "CEUTA", "MELILLA",
]  # fmt: skip


def test_every_board_maps_to_a_constituency() -> None:
    mapped = {constituency_for_board(f"JUNTA ELECTORAL DE {b}") for b in BOARDS_2023}
    assert mapped == set(SEATS)
    assert constituency_for_board("JUNTA ELECTORAL PROVINCIAL DE A CORUÑA") == "Coruña (A)"
    assert constituency_for_board("Circunscripción electoral: Mallorca") is None


def test_seats_add_up_to_350() -> None:
    assert sum(SEATS.values()) == 350


@pytest.mark.parametrize(
    ("name", "acronym", "party"),
    [
        ("PARTIDO POPULAR", "PP", "pp"),
        ("PARTIT DELS SOCIALISTES DE CATALUNYA (PSC-PSOE)", "PSC", "psoe"),
        ("PARTIDO SOCIALISTA DE EUSKADI-EUSKADIKO EZKERRA (PSOE)", "PSE-EE (PSOE)", "psoe"),
        ("VOX", "VOX", "vox"),
        ("FRENTE AMPLIO", "FRENTE AMPLIO", "frente-amplio"),
        ("CHUNTA ARAGONESISTA-FRENTE AMPLIO ARAGÓN", "CHA-FA", "frente-amplio"),
        ("ESQUERRA REPUBLICANA DE CATALUNYA", "ERC", "erc"),
        ("JUNTS PER CATALUNYA-JUNTS", "JUNTS", "junts"),
        ("EUSKAL HERRIA BILDU", "EH BILDU", "bildu"),
        ("EUZKO ALDERDI JELTZALEA-PARTIDO NACIONALISTA VASCO", "EAJ-PNV", "pnv"),
        ("PODEMOS", "PODEMOS", "podemos"),
        ("BLOQUE NACIONALISTA GALEGO", "BNG", "bng"),
        ("COALICIÓN CANARIA", "CCa", "cc"),
        ("UNIÓN DEL PUEBLO NAVARRO", "UPN", "upn"),
        ("UNIDAD DEL PUEBLO CANARIO", "UPC", None),
        ("PARTIDO ANIMALISTA CON EL MEDIO AMBIENTE", "PACMA", None),
        ("FRENTE OBRERO", "FO", None),
    ],
)
def test_party_for_list(name: str, acronym: str, party: str | None) -> None:
    assert party_for_list(name, acronym) == party


def test_stage_of_titles() -> None:
    base = "para las elecciones al Congreso de los Diputados y al Senado, convocadas por Real Decreto 806/2026, de 5 de octubre."
    assert _stage_of(f"Candidaturas proclamadas {base}") == "proclaimed"
    assert _stage_of(f"Candidaturas presentadas {base}") == "presented"
    # The 2023 document, or anything else, is not ours.
    assert _stage_of("Candidaturas proclamadas ... Congreso ... Real Decreto 400/2023") is None
