"""Pure parsers for fields published by the Congreso open data portal.

The portal exposes deputy data as JSON records like::

    {
        "NOMBRE": "Abades Martínez, Cristina",
        "CIRCUNSCRIPCION": "Lugo",
        "FORMACIONELECTORAL": "PP",
        "FECHACONDICIONPLENA": "17/08/2023",
        "FECHAALTA": "08/08/2023",
        "GRUPOPARLAMENTARIO": "Grupo Parlamentario Popular en el Congreso",
        "FECHAALTAENGRUPOPARLAMENTARIO": "18/08/2023",
        "BIOGRAFIA": "..."
    }

This module turns those raw fields into typed values our domain model can use.
All functions here are pure (no I/O, no DB) so they are trivially unit-tested.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from slugify import slugify


@dataclass(frozen=True, slots=True)
class PersonName:
    """A person's name split into the parts our domain model stores."""

    full_name: str
    given_names: str | None
    family_names: str | None


@dataclass(frozen=True, slots=True)
class ParsedDeputy:
    """A deputy record from the Congreso JSON, normalized into typed fields."""

    name: PersonName
    constituency: str | None
    electoral_list_party: str | None
    mandate_start_date: date
    group_name_long: str
    group_name_short: str
    group_slug: str
    group_membership_start_date: date


def parse_dmy_date(value: str) -> date:
    """Parse a DD/MM/YYYY string into a :class:`datetime.date`.

    The portal serves dates in the Spanish convention (day/month/year).
    Accepts an optional surrounding whitespace.
    """
    return datetime.strptime(value.strip(), "%d/%m/%Y").date()


def parse_person_name(raw: str) -> PersonName:
    """Split a Spanish ``"Apellidos, Nombre"`` string into name components.

    Examples
    --------
    >>> parse_person_name("Abades Martínez, Cristina")
    PersonName(full_name='Cristina Abades Martínez', given_names='Cristina', family_names='Abades Martínez')

    If the comma is missing (e.g. mononymic or imported edge cases), the whole
    string becomes ``full_name`` and the split fields are ``None``.
    """
    cleaned = " ".join(raw.split())  # collapse internal whitespace
    if "," in cleaned:
        family, _, given = cleaned.partition(",")
        family = family.strip()
        given = given.strip()
        if family and given:
            return PersonName(
                full_name=f"{given} {family}",
                given_names=given,
                family_names=family,
            )
    return PersonName(full_name=cleaned, given_names=None, family_names=None)


# Tokens we strip when deriving a parliamentary group's short name. The portal
# verbosely names every group as "Grupo Parlamentario X en el Congreso"; users
# read shorter labels everywhere ("GP Popular", "GP VOX", …).
_GROUP_PREFIX = "Grupo Parlamentario"
_GROUP_SUFFIXES = ("en el Congreso",)


def parliamentary_group_short_name(long_name: str) -> str:
    """Derive a compact human-readable label like ``"GP Popular"``.

    >>> parliamentary_group_short_name("Grupo Parlamentario Popular en el Congreso")
    'GP Popular'
    >>> parliamentary_group_short_name("Grupo Parlamentario VOX")
    'GP VOX'
    >>> parliamentary_group_short_name("Grupo Parlamentario Vasco (EAJ-PNV)")
    'GP Vasco (EAJ-PNV)'
    """
    rest = long_name.strip()
    if rest.startswith(_GROUP_PREFIX):
        rest = rest[len(_GROUP_PREFIX) :].strip()
    for suffix in _GROUP_SUFFIXES:
        if rest.endswith(suffix):
            rest = rest[: -len(suffix)].strip()
    return f"GP {rest}".strip() if rest else long_name


def parliamentary_group_slug(long_name: str) -> str:
    """Stable kebab-case slug for a parliamentary group.

    Derived from the short name, so that two long names that collapse to the
    same short label also collapse to the same slug.
    """
    return slugify(parliamentary_group_short_name(long_name))


@dataclass(frozen=True, slots=True)
class ParsedInitiative:
    """An initiative record from the Congreso JSON, normalized."""

    official_id: str
    type_code: str
    title: str
    submitted_at: date | None
    submitted_by: str | None
    situation_raw: str | None
    result_raw: str | None
    source_url: str | None


# Mapping from the portal's TIPO label to our InitiativeType enum value.
# Strings are matched case-insensitively against the lowercased ``TIPO`` field.
_INITIATIVE_TYPE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("proyecto de ley", "proyecto_ley"),
    ("proposición de ley de grupos", "proposicion_ley"),
    ("proposición de ley", "proposicion_ley"),
    ("proposición no de ley", "proposicion_no_ley"),
    ("real decreto-ley", "real_decreto_ley"),
    ("real decreto ley", "real_decreto_ley"),
    ("moción", "mocion"),
    ("interpelación", "interpelacion"),
    ("propuesta de reforma de estatuto", "other"),
)


def classify_initiative_type(tipo: str) -> str:
    """Map a portal ``TIPO`` label to an :class:`InitiativeType` value.

    Returns the string form of the enum (e.g. ``"proyecto_ley"``); the importer
    converts it. Unknown labels fall back to ``"other"`` so we never lose a
    record.
    """
    needle = tipo.lower()
    for pattern, code in _INITIATIVE_TYPE_PATTERNS:
        if pattern in needle:
            return code
    return "other"


def classify_initiative_status(situation: str | None, result: str | None) -> str:
    """Heuristic mapping of free-text status fields to :class:`InitiativeStatus`.

    The portal's ``SITUACIONACTUAL`` mixes location ("Pleno", "Comisión …") with
    state ("Toma en consideración", "Cerrado"). ``RESULTADOTRAMITACION``, when
    present, has the final outcome ("Aprobado", "Rechazado", "Retirado",
    "Caducada"). We bias toward the result field and fall back on situation.
    """
    s = (situation or "").lower()
    r = (result or "").lower()
    if "aprob" in r:
        return "approved"
    if "rechaz" in r:
        return "rejected"
    if "retir" in r or "retir" in s:
        return "withdrawn"
    if "caduc" in r or "caduc" in s:
        return "expired"
    if "cerrado" in s and not r:
        # Closed without an explicit result — treat as expired/closed.
        return "expired"
    if any(token in s for token in ("pleno", "comisión", "tramit", "toma", "debate", "enmienda")):
        return "in_debate"
    return "submitted"


def parse_active_deputy(record: dict[str, str]) -> ParsedDeputy:
    """Normalize a single record from the active deputies JSON dataset.

    Raises :class:`KeyError` if a required field is missing, or
    :class:`ValueError` if a date does not match the expected format.
    """
    long_group = record["GRUPOPARLAMENTARIO"].strip()
    return ParsedDeputy(
        name=parse_person_name(record["NOMBRE"]),
        constituency=(record.get("CIRCUNSCRIPCION") or "").strip() or None,
        electoral_list_party=(record.get("FORMACIONELECTORAL") or "").strip() or None,
        mandate_start_date=parse_dmy_date(record["FECHACONDICIONPLENA"]),
        group_name_long=long_group,
        group_name_short=parliamentary_group_short_name(long_group),
        group_slug=parliamentary_group_slug(long_group),
        group_membership_start_date=parse_dmy_date(record["FECHAALTAENGRUPOPARLAMENTARIO"]),
    )


def parse_initiative(record: dict[str, str]) -> ParsedInitiative:
    """Normalize a single record from one of the legislative-process datasets.

    Applies to ``ProyectosDeLey``, ``ProposicionesDeLey`` and
    ``PropuestasDeReforma``; the much smaller ``IniciativasLegislativasAprobadas``
    dataset is published-laws-only and has a different schema, so it is not
    handled here.
    """
    title = " ".join((record.get("OBJETO") or "").split())
    submitted_raw = (record.get("FECHAPRESENTACION") or "").strip()
    return ParsedInitiative(
        official_id=record["NUMEXPEDIENTE"].strip(),
        type_code=classify_initiative_type(record.get("TIPO") or ""),
        title=title,
        submitted_at=parse_dmy_date(submitted_raw) if submitted_raw else None,
        submitted_by=(record.get("AUTOR") or "").strip() or None,
        situation_raw=(record.get("SITUACIONACTUAL") or "").strip() or None,
        result_raw=(record.get("RESULTADOTRAMITACION") or "").strip() or None,
        source_url=(
            (record.get("ENLACESBOCG") or "").strip().splitlines()[0] or None
            if record.get("ENLACESBOCG")
            else None
        ),
    )
