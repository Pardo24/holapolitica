"""Parties running in the general election of 29 November 2026, for the
press page (/pactes): which ones a headline names, and how to search for one.

Order is by seats in the outgoing Congress (XV legislature), the one neutral
order there is; Frente Amplio stands for the Sumar group's parties and Podemos
for its four deputies in the Mixed group. A headline "names" a party when it
says its name, its initials or its leader's name: a check on who the story is
about, never on what it says about them.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class ElectionParty:
    slug: str
    name: str
    #: Names, initials and leaders, as they appear in headlines (es and ca).
    pattern: re.Pattern[str]
    #: Terms for a Google News search about this party.
    search: tuple[str, ...]


def _p(alternatives: str) -> re.Pattern[str]:
    # Case matters: in a headline "Sumar", "Podem" and "Comuns" are parties
    # while "sumar", "podem" and "comuns" are a verb and an adjective, and
    # "l'esquerra" is the left in general ("Podem" only counts past the first
    # word, where a capital is not just the start of a sentence). Boundaries that also hold next
    # to accented letters.
    return re.compile(rf"(?<![\w]){alternatives}(?![\w])")


PARTIES: Final[tuple[ElectionParty, ...]] = (
    ElectionParty(
        "pp",
        "PP",
        _p(r"(?:PP|Partido Popular|Partit Popular|populares|populars|Feij[oó]o)"),
        ('"PP"', '"Partido Popular"', "Feijóo"),
    ),
    ElectionParty(
        "psoe",
        "PSOE",
        _p(r"(?:PSOE|PSC|PSPV|PSdeG|socialistas|socialistes|Pedro S[aá]nchez|S[aá]nchez)"),
        ('"PSOE"', '"Pedro Sánchez"'),
    ),
    ElectionParty("vox", "Vox", _p(r"(?:Vox|VOX|Abascal)"), ("Vox", "Abascal")),
    ElectionParty(
        "frente-amplio",
        "Frente Amplio",
        _p(
            r"(?:Frente Amplio|Front Ampli|Sumar|Yolanda D[ií]az|IU|Izquierda Unida|"
            r"M[aá]s Madrid|Comuns|Colau|Emilio Delgado)"
        ),
        ('"Frente Amplio"', '"Front Ampli"', "Sumar"),
    ),
    ElectionParty(
        "erc",
        "ERC",
        _p(r"(?:ERC|Esquerra Republicana|Rufi[aá]n|Junqueras)"),
        ('"ERC"', "Rufián"),
    ),
    ElectionParty(
        "junts", "Junts", _p(r"(?:Junts|Puigdemont|Turull|Nogueras)"), ("Junts", "Puigdemont")
    ),
    ElectionParty("bildu", "EH Bildu", _p(r"(?:EH Bildu|Bildu|Otegi)"), ('"EH Bildu"',)),
    ElectionParty("pnv", "PNV", _p(r"(?:PNV|EAJ|Aitor Esteban)"), ('"PNV"',)),
    ElectionParty(
        "podemos",
        "Podemos",
        _p(r"(?:Podemos|(?<=.)Podem|Irene Montero|Belarra)"),
        ("Podemos", '"Irene Montero"'),
    ),
    ElectionParty("bng", "BNG", _p(r"(?:BNG|Bloque Nacionalista Galego|Pont[oó]n)"), ('"BNG"',)),
    ElectionParty(
        "cc", "CC", _p(r"(?:Coalici[oó]n Canaria|Coalició Canària|CC)"), ('"Coalición Canaria"',)
    ),
    ElectionParty("upn", "UPN", _p(r"(?:UPN|Uni[oó]n del Pueblo Navarro)"), ('"UPN"',)),
)

BY_SLUG: Final[dict[str, ElectionParty]] = {p.slug: p for p in PARTIES}


def parties_in(title: str) -> list[str]:
    """Slugs of the parties a headline names, in the parties' order."""
    return [p.slug for p in PARTIES if p.pattern.search(title)]


# The election context a party search needs, or it returns everything else
# the party is in the news for.
_CONTEXT: Final[dict[str, str]] = {
    "es": "(elecciones OR 29N OR listas OR candidatura OR pacto OR investidura)",
    "ca": "(eleccions OR 29N OR llistes OR candidatura OR pacte OR investidura)",
}


def party_query(slug: str, feed_locale: str) -> str:
    party = BY_SLUG[slug]
    return f"({' OR '.join(party.search)}) {_CONTEXT[feed_locale]} when:14d"


def party_for_list(name: str, acronym: str | None) -> str | None:
    """The party of an official list, from its name and initials as the BOE
    prints them (upper case): 'PARTIDO POPULAR (PP)' → 'pp'. Joint lists
    under a name of their own ('UNIDAD DEL PUEBLO CANARIO') get none.
    """
    n = _fold_upper(name)
    a = _fold_upper(acronym or "")
    tokens = set(re.split(r"[\s\-/()+,.]+", a)) - {""}
    if "FRENTE AMPLIO" in n or "FRONT AMPLI" in n or "FRENTE AMPLIO" in a or "FRONT AMPLI" in a:
        return "frente-amplio"
    if "PP" in tokens or n.startswith(("PARTIDO POPULAR", "PARTIT POPULAR")):
        return "pp"
    if tokens & {"PSOE", "PSC", "PSPV"} or n.startswith(
        (
            "PARTIDO SOCIALISTA",
            "PARTIT DELS SOCIALISTES",
            "PARTIT SOCIALISTA",
            "PARTIDO DOS SOCIALISTAS",
        )
    ):
        return "psoe"
    if "VOX" in tokens:
        return "vox"
    if "ERC" in tokens or "ESQUERRA REPUBLICANA" in n:
        return "erc"
    if "JUNTS" in tokens or n.startswith("JUNTS"):
        return "junts"
    if "BILDU" in n or "BILDU" in tokens:
        return "bildu"
    if tokens & {"PNV", "EAJ"}:
        return "pnv"
    if "PODEMOS" in tokens or n.startswith("PODEMOS"):
        return "podemos"
    if "BNG" in tokens or n.startswith("BLOQUE NACIONALISTA GALEGO"):
        return "bng"
    if tokens & {"CC", "CCA"} or "COALICION CANARIA" in n:
        return "cc"
    if "UPN" in tokens:
        return "upn"
    return None


def _fold_upper(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).upper()
