"""What a party's deputies declared, side by side (the party's "Béns" tab).

Built only from the declaration each deputy filed on taking the seat: a later
one lists just what changed. It compares what the form lets us compare: where
income comes from, how much of it (as a median and in wide bands), how many
properties, and who has shares or loans.

It never adds up wealth and never orders people by money: the form asks no
value for homes or land, and one misread figure would put the wrong person on
top. Deputies always come by name, each with what they wrote.

Income amounts are rough on purpose. The form does not say gross or net and
deputies write both, some monthly: a person whose figures say a period, or
have no figure, is left out of the median and the bands.
"""

from __future__ import annotations

import re
import statistics
import unicodedata
from collections import Counter
from datetime import date
from typing import Any, Final

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AssetDeclaration,
    AssetIncomeSource,
    GroupMembership,
    Mandate,
    ParliamentaryGroup,
    Person,
)

UNSPECIFIED: Final = "unspecified"
CAPITAL: Final = "capital"
# Below this many comparable people a median is one or two people's income.
MIN_FOR_MEDIAN: Final = 5
MEDIAN_ROUNDED_TO: Final = 1000
INCOME_BANDS: Final[tuple[tuple[str, float | None], ...]] = (
    ("under_30k", 30_000),
    ("30k_60k", 60_000),
    ("60k_100k", 100_000),
    ("100k_200k", 200_000),
    ("over_200k", None),
)

_PERIOD = re.compile(r"\bmes\b|/\s*mes|mensual|\bpagas?\b|trimestr|semestr|semana", re.I)
_NUMBER = r"(?P<n>\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)"
_WORD_NUMBERS: Final = {
    "DOS": 2,
    "TRES": 3,
    "CUATRO": 4,
    "CINCO": 5,
    "SEIS": 6,
    "SIETE": 7,
    "OCHO": 8,
    "NUEVE": 9,
    "DIEZ": 10,
}
_HOME = r"VIVIENDAS?|VIVENDAS?|PISOS?|APARTAMENTOS?|CASAS?|CHALETS?|DUPLEX|LOFTS?|ESTUDIOS?|ATICOS?|CASERIOS?|RESIDENCIAL"
_STORAGE = r"GARAJES?|GARAGES?|COCHERAS?|APARCAMIENTOS?|TRASTEROS?|PLAZAS? DE (?:GARAJE|PARKING)"
_LAND = r"SOLAR(?:ES)?|TERRENOS?|PARCELAS?|HUERTAS?"
_COMMERCIAL = r"LOCAL(?:ES)?|OFICINAS?|NAVES?|DESPACHOS?|EDIFICIOS?|ALMACEN(?:ES)?"
_FINCA = r"FINCAS?"
_CLASSES: Final = (
    ("homes", re.compile(rf"\b(?:{_HOME})\b")),
    ("storage", re.compile(rf"\b(?:{_STORAGE})\b|^PLAZAS?\b")),
    ("land", re.compile(rf"\b(?:{_LAND})\b")),
    ("commercial", re.compile(rf"\b(?:{_COMMERCIAL})\b")),
)
_COUNT = re.compile(
    rf"^{_NUMBER}\s+(?:{_HOME}|{_STORAGE}|{_LAND}|{_COMMERCIAL}|{_FINCA}|PLAZAS?)\b", re.I
)


class PropertyCounts(BaseModel):
    homes: int = 0
    storage: int = 0
    land: int = 0
    commercial: int = 0
    company: int = 0
    other: int = 0


class MemberIncome(BaseModel):
    concept: str | None = None
    source: str
    amount: float | None = None
    as_written: str | None = None


class MemberAssets(BaseModel):
    """One deputy, as declared. ``declared_on`` is null when the declaration
    made on taking the seat could not be read or was not found."""

    person_id: int
    full_name: str
    photo_url: str | None = None
    constituency: str | None = None
    declared_on: date | None = None
    income: list[MemberIncome] = []
    properties: PropertyCounts = PropertyCounts()
    shares: list[str] = []
    loans: int = 0
    other_debts: bool = False


class Count(BaseModel):
    key: str
    people: int


class GroupAssets(BaseModel):
    """A party's figures. Counts are of people; nothing here is a sum."""

    slug: str
    name_short: str
    color_hex: str | None = None
    members: int
    read: int
    income_comparable: int
    income_median: int | None = None
    income_bands: list[Count]
    income_sources: list[Count]
    with_property: int
    with_two_or_more_homes: int
    homes_median: float | None = None
    with_shares: int
    with_loans: int


class GroupAssetsDetail(GroupAssets):
    people: list[MemberAssets]


def normalise_concept(concept: str) -> str:
    """The key a concept is classified under: the same words, however typed."""
    return " ".join(concept.split()).upper()[:500]


def property_counts(rows: list[dict[str, Any]]) -> PropertyCounts:
    """What each row of the form holds, read from its description.

    One row can hold several things ("VIVIENDA, GARAJE Y TRASTERO") or say how
    many ("4 FINCAS URBANAS"). A part-share counts as one: the form gives the
    share, not its worth. A "finca" is land only on the rustic part of the
    form; an urban one may be anything.
    """
    counts = PropertyCounts()
    for row in rows:
        text = _plain(row.get("description"))
        match = _COUNT.match(text)
        n = 1
        if match:
            n = int(match["n"]) if match["n"].isdigit() else _WORD_NUMBERS[match["n"].upper()]
        if row.get("kind") == "company":
            counts.company += n
            continue
        found = [name for name, pattern in _CLASSES if pattern.search(text)]
        if not found and row.get("kind") == "rustic":
            found = ["land"]
        if not found:
            counts.other += n
        for name in found:
            setattr(counts, name, getattr(counts, name) + n)
    return counts


def comparable_income(rows: list[dict[str, Any]]) -> float | None:
    """A person's yearly income as far as it can be compared, else None."""
    if not rows:
        return None
    total = 0.0
    for row in rows:
        amount = row.get("amount")
        if amount is None:
            return None
        said = f"{row.get('as_written') or ''} {row.get('concept') or ''}"
        if _PERIOD.search(said):
            return None
        total += float(amount)
    return total


def income_source(row: dict[str, Any], classified: dict[str, str]) -> str:
    """Where one income row comes from; "unspecified" unless the deputy says."""
    if row.get("kind") in ("dividends", "interest"):
        return CAPITAL
    concept = row.get("concept")
    if not concept:
        return UNSPECIFIED
    return classified.get(normalise_concept(str(concept)), UNSPECIFIED)


def member_assets(
    person_id: int,
    full_name: str,
    photo_url: str | None,
    constituency: str | None,
    declared_on: date | None,
    data: dict[str, Any] | None,
    classified: dict[str, str],
) -> MemberAssets:
    member = MemberAssets(
        person_id=person_id, full_name=full_name, photo_url=photo_url, constituency=constituency
    )
    if data is None:
        return member
    member.declared_on = declared_on
    member.income = [
        MemberIncome(
            concept=r.get("concept"),
            source=income_source(r, classified),
            amount=r.get("amount"),
            as_written=r.get("as_written"),
        )
        for r in data.get("income", [])
    ]
    member.properties = property_counts(data.get("properties", []))
    member.shares = [
        r["description"]
        for r in data.get("securities", [])
        if r.get("kind") in ("shares", "stake") and r.get("description")
    ]
    member.loans = len(data.get("loans", []))
    member.other_debts = bool(data.get("other_debts"))
    return member


def summarise(
    group: ParliamentaryGroup,
    people: list[MemberAssets],
    income_by_person: dict[int, float],
) -> GroupAssets:
    read = [p for p in people if p.declared_on is not None]
    incomes = [income_by_person[p.person_id] for p in read if p.person_id in income_by_person]
    bands: Counter[str] = Counter()
    for income in incomes:
        bands[next(k for k, top in INCOME_BANDS if top is None or income < top)] += 1
    sources: Counter[str] = Counter()
    for p in read:
        sources.update({row.source for row in p.income})
    homes = [p.properties.homes for p in read]
    return GroupAssets(
        slug=group.slug,
        name_short=group.name_short,
        color_hex=group.color_hex,
        members=len(people),
        read=len(read),
        income_comparable=len(incomes),
        income_median=(
            round(statistics.median(incomes) / MEDIAN_ROUNDED_TO) * MEDIAN_ROUNDED_TO
            if len(incomes) >= MIN_FOR_MEDIAN
            else None
        ),
        income_bands=[Count(key=k, people=bands[k]) for k, _ in INCOME_BANDS],
        income_sources=[Count(key=k, people=n) for k, n in sorted(sources.items())],
        with_property=sum(1 for p in read if p.properties != PropertyCounts()),
        with_two_or_more_homes=sum(1 for h in homes if h >= 2),
        homes_median=statistics.median(homes) if len(homes) >= MIN_FOR_MEDIAN else None,
        with_shares=sum(1 for p in read if p.shares),
        with_loans=sum(1 for p in read if p.loans or p.other_debts),
    )


async def group_assets(
    session: AsyncSession, groups: list[ParliamentaryGroup]
) -> list[GroupAssetsDetail]:
    """Each group's figures and people, the people in name order."""
    if not groups:
        return []
    members = (
        await session.execute(
            select(
                GroupMembership.group_id,
                Person.id,
                Person.full_name,
                Person.photo_url,
                Mandate.constituency,
            )
            .join(Mandate, Mandate.id == GroupMembership.mandate_id)
            .join(Person, Person.id == Mandate.person_id)
            .where(GroupMembership.group_id.in_([g.id for g in groups]))
            .where(GroupMembership.end_date.is_(None))
            .order_by(Person.family_names.asc(), Person.given_names.asc())
        )
    ).all()
    declarations = {
        d.person_id: d
        for d in (
            await session.execute(
                select(AssetDeclaration)
                .where(AssetDeclaration.person_id.in_({m[1] for m in members}))
                .where(AssetDeclaration.sequence == 0)
                .where(AssetDeclaration.parse_status == "ok")
                .order_by(AssetDeclaration.declared_on.desc())
            )
        )
        .scalars()
        .all()
    }
    classified = {
        c.concept: c.source
        for c in (await session.execute(select(AssetIncomeSource))).scalars().all()
    }

    out: list[GroupAssetsDetail] = []
    for group in groups:
        people: list[MemberAssets] = []
        income_by_person: dict[int, float] = {}
        seen: set[int] = set()
        for group_id, pid, name, photo, constituency in members:
            if group_id != group.id or pid in seen:
                continue
            seen.add(pid)
            decl = declarations.get(pid)
            data: dict[str, Any] | None = decl.data if decl else None
            people.append(
                member_assets(
                    pid,
                    name,
                    photo,
                    constituency,
                    decl.declared_on if decl else None,
                    data,
                    classified,
                )
            )
            income = comparable_income(data.get("income", [])) if data else None
            if income is not None:
                income_by_person[pid] = income
        out.append(
            GroupAssetsDetail(
                **summarise(group, people, income_by_person).model_dump(), people=people
            )
        )
    return out


def _plain(value: object) -> str:
    """Upper case with no accents, so "ÁTICO" and "atico" read the same."""
    text = unicodedata.normalize("NFD", str(value or "").upper())
    return "".join(c for c in text if unicodedata.category(c) != "Mn").strip()
