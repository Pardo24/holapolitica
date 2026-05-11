"""API endpoints for parliamentary groups.

A group exists per ``(legislature, slug)`` — a group's identity changes between
legislatures (coalitions split, names rebrand) so we never aggregate across
legislatures unless the caller asks for it.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.metrics import (
    TopicVoteStatRow,
    compute_topic_stats_for_group,
)
from app.models import (
    GroupMembership,
    Legislature,
    Mandate,
    ParliamentaryGroup,
    Person,
)
from app.schemas import ParliamentaryGroupRead
from app.services.cache import cached

router = APIRouter(prefix="/groups", tags=["groups"])


class ParliamentaryGroupSummary(ParliamentaryGroupRead):
    """A group, plus its current member count for at-a-glance lists."""

    members_active: int


class GroupMemberRow(BaseModel):
    """One row of a group's membership list, with the open-membership dates."""

    model_config = ConfigDict(from_attributes=True)

    person_id: int
    full_name: str
    constituency: str | None
    role: str | None
    member_since: date


class GroupCompositionPartyRow(BaseModel):
    """One constituent party/electoral-list of the group, with member count."""

    name: str
    count: int


class GroupComposition(BaseModel):
    """Demographic composition of a group's *currently open* memberships.

    Symmetry guarantee: every category — including ``unknown`` — is always
    present in the returned histograms. We never hide a bucket because it
    happens to be empty; an empty bucket is a fact, and the frontend can
    render it as a zero rather than infer one. See CLAUDE.md "Mètriques
    agregades — regla de simetria" and "neutrality-guidelines.md".
    """

    members_total: int
    # Keys are constant; counts default to 0 when no member matches. We use
    # plain ``dict[str, int]`` (not nested BaseModels) so the JSON shape is
    # cheap to render and easy to consume from the frontend.
    gender_distribution: dict[str, int]
    age_buckets: dict[str, int]
    # Sorted desc by count, then alpha by name. Parties parsed from the
    # ``Mandate.electoral_list_party`` field — many groups are coalitions,
    # so a single membership can contribute to multiple parties.
    member_parties: list[GroupCompositionPartyRow]


# Static category lists — order is the canonical UI order and MUST be
# preserved by the API so the donut/bar chart legends are stable across
# requests. Including ``unknown`` is non-negotiable (symmetry rule).
_GENDER_KEYS: Final[tuple[str, ...]] = ("F", "M", "X", "unknown")
_AGE_BUCKETS: Final[tuple[str, ...]] = (
    "<30",
    "30-39",
    "40-49",
    "50-59",
    "60+",
    "unknown",
)

# Coalition party-list separator. Real-world strings observed in the
# Congreso "FORMACIONELECTORAL" field: "SUMAR-IU-MÁS MADRID",
# "PSC-PSOE", "JxCat-Junts", "ECP-GUANYEM EL CANVI". Splitting on a small
# whitelist of separators keeps composite labels intact (we do NOT split
# on spaces) and collapses obvious duplicates after a strip.
_PARTY_SEPARATOR = re.compile(r"\s*[/–—]\s*|\s*-\s*")


def _age_bucket_for(birth_year: int | None, as_of: date) -> str:
    """Return the canonical age-bucket key for a deputy.

    ``birth_year`` of ``None`` (or ``< 1900`` / ``> as_of.year``) maps to
    ``"unknown"`` — we never silently impute. Buckets follow the spec in
    the original task. The boundary convention is age-on-the-reference-date
    inclusive of the lower bound, exclusive of the upper.
    """
    if birth_year is None or birth_year < 1900 or birth_year > as_of.year:
        return "unknown"
    age = as_of.year - birth_year
    if age < 30:
        return "<30"
    if age < 40:
        return "30-39"
    if age < 50:
        return "40-49"
    if age < 60:
        return "50-59"
    return "60+"


def _split_parties(raw: str | None) -> list[str]:
    """Split a coalition list into its constituent party labels.

    Empty input returns ``[]`` — callers MUST tally an explicit
    ``"Sense dada"`` row using ``members_total - sum(party counts)`` if
    they want to surface the unknowns. We do not synthesise one here so
    the row is opt-in at the API consumer level.
    """
    if not raw:
        return []
    parts = [p.strip() for p in _PARTY_SEPARATOR.split(raw) if p and p.strip()]
    # De-dup case-insensitively while preserving first-seen case (for
    # display); coalitions occasionally double-list the same party
    # under variant capitalisation.
    seen: dict[str, str] = {}
    for p in parts:
        key = p.casefold()
        if key not in seen:
            seen[key] = p
    return list(seen.values())


@router.get("", response_model=list[ParliamentaryGroupSummary])
async def list_groups(
    legislature_id: int | None = Query(
        None, description="Restrict to one legislature; defaults to all"
    ),
    session: AsyncSession = Depends(get_session),
) -> list[ParliamentaryGroupSummary]:
    """List parliamentary groups with current member counts."""
    stmt = (
        select(
            ParliamentaryGroup,
            func.count(GroupMembership.id).label("active_count"),
        )
        .outerjoin(
            GroupMembership,
            (GroupMembership.group_id == ParliamentaryGroup.id)
            & (GroupMembership.end_date.is_(None)),
        )
        .group_by(ParliamentaryGroup.id)
        .order_by(ParliamentaryGroup.name_short.asc())
    )
    if legislature_id is not None:
        stmt = stmt.where(ParliamentaryGroup.legislature_id == legislature_id)

    rows = (await session.execute(stmt)).all()
    return [
        ParliamentaryGroupSummary(
            id=g.id,
            legislature_id=g.legislature_id,
            slug=g.slug,
            name_short=g.name_short,
            name_long=g.name_long,
            color_hex=g.color_hex,
            members_active=int(active_count),
        )
        for g, active_count in rows
    ]


@router.get("/{slug}", response_model=ParliamentaryGroupSummary)
async def get_group(
    slug: str,
    legislature_id: int | None = Query(
        None,
        description="Disambiguate when the same slug exists in multiple legislatures",
    ),
    session: AsyncSession = Depends(get_session),
) -> ParliamentaryGroupSummary:
    """Get a single group by slug.

    If multiple legislatures have a group with this slug we pick the most
    recent one unless ``legislature_id`` is provided.
    """
    # Pick the most recent legislature whose group has this slug. We do
    # this in two steps because mixing GROUP BY with ORDER BY on a JOINed
    # column requires also grouping by that column — clearer this way.
    group_stmt = (
        select(ParliamentaryGroup)
        .join(Legislature, Legislature.id == ParliamentaryGroup.legislature_id)
        .where(ParliamentaryGroup.slug == slug)
        .order_by(Legislature.start_date.desc())
        .limit(1)
    )
    if legislature_id is not None:
        group_stmt = group_stmt.where(ParliamentaryGroup.legislature_id == legislature_id)

    g = (await session.execute(group_stmt)).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")

    active_count = (
        await session.execute(
            select(func.count(GroupMembership.id))
            .where(GroupMembership.group_id == g.id)
            .where(GroupMembership.end_date.is_(None))
        )
    ).scalar_one()
    return ParliamentaryGroupSummary(
        id=g.id,
        legislature_id=g.legislature_id,
        slug=g.slug,
        name_short=g.name_short,
        name_long=g.name_long,
        color_hex=g.color_hex,
        members_active=int(active_count),
    )


@router.get("/{slug}/members", response_model=list[GroupMemberRow])
async def get_group_members(
    slug: str,
    session: AsyncSession = Depends(get_session),
) -> list[GroupMemberRow]:
    """List the open memberships in a group.

    Includes both regular members and roles (spokesperson, etc.). Sorted by
    family name. Returns ``[]`` if the group exists but has no current
    members (e.g. a group that disbanded mid-legislature).
    """
    group = (
        await session.execute(
            select(ParliamentaryGroup)
            .where(ParliamentaryGroup.slug == slug)
            .order_by(ParliamentaryGroup.legislature_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    rows = (
        await session.execute(
            select(
                Person.id,
                Person.full_name,
                Mandate.constituency,
                GroupMembership.role,
                GroupMembership.start_date,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            .join(GroupMembership, GroupMembership.mandate_id == Mandate.id)
            .where(GroupMembership.group_id == group.id)
            .where(GroupMembership.end_date.is_(None))
            .order_by(Person.family_names.asc(), Person.given_names.asc())
        )
    ).all()

    return [
        GroupMemberRow(
            person_id=person_id,
            full_name=full_name,
            constituency=constituency,
            role=role,
            member_since=start_date,
        )
        for person_id, full_name, constituency, role, start_date in rows
    ]


@router.get("/{slug}/topic-stats", response_model=list[TopicVoteStatRow])
async def get_group_topic_stats(
    slug: str, session: AsyncSession = Depends(get_session)
) -> list[TopicVoteStatRow]:
    """Per-topic Sí/No/Abst breakdown of every vote_record cast under this group."""
    group = (
        await session.execute(
            select(ParliamentaryGroup)
            .where(ParliamentaryGroup.slug == slug)
            .order_by(ParliamentaryGroup.legislature_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    group_id = group.id
    return await cached(
        f"stats:group:{slug}:topic-stats",
        3600,
        lambda: compute_topic_stats_for_group(session, group_id=group_id),
    )


async def _compute_group_composition(
    session: AsyncSession, slug: str, as_of: date
) -> GroupComposition:
    """Compute the composition snapshot for ``slug`` at ``as_of``.

    Pure function over the database: no caching, no HTTP concerns. Pulled
    out so :func:`get_group_composition` stays thin and so tests can call
    it directly without going through the FastAPI app + Redis fake.
    """
    group = (
        await session.execute(
            select(ParliamentaryGroup)
            .where(ParliamentaryGroup.slug == slug)
            .order_by(ParliamentaryGroup.legislature_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    # One query: every (person, mandate) pair tied to an open membership
    # in this group. Fetching the raw rows lets us bucket in Python — the
    # alternative (SQL CASE expressions) is harder to keep symmetric
    # across DB engines (we develop on SQLite, deploy on Postgres).
    rows = (
        await session.execute(
            select(
                Person.gender,
                Person.birth_year,
                Mandate.electoral_list_party,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            .join(GroupMembership, GroupMembership.mandate_id == Mandate.id)
            .where(GroupMembership.group_id == group.id)
            .where(GroupMembership.end_date.is_(None))
        )
    ).all()

    gender_distribution: dict[str, int] = {k: 0 for k in _GENDER_KEYS}
    age_buckets: dict[str, int] = {k: 0 for k in _AGE_BUCKETS}
    # Keyed by casefold(name) so case variants ("SUMAR" vs "Sumar")
    # collapse into a single row. We track first-seen original casing
    # for display.
    party_display: dict[str, str] = {}
    party_counts: dict[str, int] = {}

    for gender, birth_year, electoral_list_party in rows:
        # Gender — anything outside the known set falls into "unknown"
        # (so 'F','M','X' alone are reported, and odd values from
        # historical data don't quietly inflate one bucket).
        if gender in ("F", "M", "X"):
            gender_distribution[gender] += 1
        else:
            gender_distribution["unknown"] += 1

        age_buckets[_age_bucket_for(birth_year, as_of)] += 1

        for party in _split_parties(electoral_list_party):
            key = party.casefold()
            party_counts[key] = party_counts.get(key, 0) + 1
            party_display.setdefault(key, party)

    # Sort parties by count desc, then alpha asc — stable order so the
    # frontend list doesn't reshuffle between requests at parity counts.
    member_parties = [
        GroupCompositionPartyRow(name=party_display[key], count=count)
        for key, count in sorted(party_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    return GroupComposition(
        members_total=len(rows),
        gender_distribution=gender_distribution,
        age_buckets=age_buckets,
        member_parties=member_parties,
    )


@router.get("/{slug}/composition", response_model=GroupComposition)
async def get_group_composition(
    slug: str,
    session: AsyncSession = Depends(get_session),
) -> GroupComposition:
    """Demographic composition of the group's currently open memberships.

    Caches for 1 h — the underlying open-membership set turns over only
    when a deputy switches groups, which happens on the order of days,
    so a stale-by-an-hour snapshot is well inside our freshness budget.
    """
    # The reference date is "today" computed server-side; this keeps the
    # cache key stable for the whole day rather than slicing it per
    # request timestamp.
    today = datetime.utcnow().date()
    cache_key = f"groups:{slug}:composition:{today.isoformat()}"
    return await cached(
        cache_key,
        3600,
        lambda: _compute_group_composition(session, slug, today),
    )
