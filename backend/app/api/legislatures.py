"""API endpoints for legislatures."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.groups import _AGE_BUCKETS, _GENDER_KEYS, _age_bucket_for
from app.db import get_session
from app.ingest.congreso.hemicycle import (
    HEMICYCLE_IMAGE_HEIGHT,
    HEMICYCLE_IMAGE_WIDTH,
)
from app.models import GroupMembership, Legislature, Mandate, ParliamentaryGroup, Person
from app.schemas import LegislatureRead
from app.services.cache import cached

router = APIRouter(prefix="/legislatures", tags=["legislatures"])


class HemicycleSeat(BaseModel):
    """A single seat on the legislature's hemicycle.

    Coordinates are in the natural pixel space of the official Congreso
    hemicycle PNG (see ``HemicycleLayout.image_width`` and ``image_height``).
    ``seat_x`` / ``seat_y`` are NULL when the
    :mod:`app.ingest.congreso.hemicycle` importer has not yet matched
    this person to a position on the map — the frontend should fall
    back to its synthetic curved-rows layout in that case while keeping
    every other field (colour, group, photo) intact so the dots stay
    clickable.
    """

    person_id: int
    full_name: str
    photo_url: str | None
    group_slug: str | None
    group_short: str | None
    group_color: str | None
    seat_x: int | None
    seat_y: int | None
    constituency: str | None
    # Public role (cabinet, Mesa) — frontend uses this to attach caveats
    # to per-deputy metrics so a 47% attendance on the President of
    # Government isn't read as absenteeism. None for ordinary deputies.
    role_title: str | None = None
    role_kind: str | None = None


class HemicycleLayout(BaseModel):
    """Per-legislature hemicycle response: seats + canonical image-space metadata."""

    legislature_id: int
    image_width: int
    image_height: int
    seats: list[HemicycleSeat]


@router.get("", response_model=list[LegislatureRead])
async def list_legislatures(
    chamber_id: int | None = Query(None, description="Filter by chamber"),
    session: AsyncSession = Depends(get_session),
) -> list[Legislature]:
    """List legislatures, optionally filtered by chamber."""
    stmt = select(Legislature)
    if chamber_id is not None:
        stmt = stmt.where(Legislature.chamber_id == chamber_id)
    stmt = stmt.order_by(Legislature.start_date.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{legislature_id}", response_model=LegislatureRead)
async def get_legislature(
    legislature_id: int, session: AsyncSession = Depends(get_session)
) -> Legislature:
    """Get a single legislature by ID."""
    result = await session.execute(select(Legislature).where(Legislature.id == legislature_id))
    leg = result.scalar_one_or_none()
    if leg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legislature not found")
    return leg


async def _compute_hemicycle(session: AsyncSession, legislature_id: int) -> HemicycleLayout:
    """Build the hemicycle seat list for one legislature.

    Returns every Person with an open Mandate in ``legislature_id``,
    enriched with their current ParliamentaryGroup (open
    GroupMembership) and seat coordinates as scraped by
    :mod:`app.ingest.congreso.hemicycle`. Persons without an ingested
    seat position appear with ``seat_x = seat_y = None`` — the
    frontend uses that to switch to a synthetic curved-rows fallback
    without losing interactivity.

    Persons that have multiple mandates in this legislature (rare but
    possible across history) collapse into a single row keyed by
    person_id, with the most-recently-started mandate winning the
    enrichment columns.
    """
    rows = (
        await session.execute(
            select(
                Person.id,
                Person.full_name,
                Person.photo_url,
                Person.seat_x,
                Person.seat_y,
                Person.role_title,
                Person.role_kind,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
                Mandate.constituency,
                Mandate.start_date,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            # Outer-join the group lookup: the seat is meaningful even
            # when the deputy is between groups (e.g. just renounced
            # group affiliation; sitting at their seat as a "no
            # adscrit" deputy).
            .outerjoin(
                GroupMembership,
                (GroupMembership.mandate_id == Mandate.id) & (GroupMembership.end_date.is_(None)),
            )
            .outerjoin(
                ParliamentaryGroup,
                ParliamentaryGroup.id == GroupMembership.group_id,
            )
            .where(Mandate.legislature_id == legislature_id)
            .where(Mandate.end_date.is_(None))
            .order_by(Person.id, Mandate.start_date.desc())
        )
    ).all()

    # Collapse to one row per person — first-seen wins (we sorted
    # most-recent mandate first), so the deputy's *current* group is
    # what surfaces.
    by_person: dict[int, HemicycleSeat] = {}
    for (
        pid,
        full_name,
        photo_url,
        seat_x,
        seat_y,
        role_title,
        role_kind,
        slug,
        short,
        color,
        constituency,
        _start,
    ) in rows:
        if pid in by_person:
            continue
        by_person[pid] = HemicycleSeat(
            person_id=pid,
            full_name=full_name,
            photo_url=photo_url,
            group_slug=slug,
            group_short=short,
            group_color=color,
            seat_x=seat_x,
            seat_y=seat_y,
            constituency=constituency,
            role_title=role_title,
            role_kind=role_kind,
        )

    # Sort the wire payload for a stable response: persons with a real
    # seat first (top-to-bottom, left-to-right reading order), then
    # un-seated persons in name order. This keeps the SVG render
    # deterministic between refreshes.
    seated = [s for s in by_person.values() if s.seat_y is not None and s.seat_x is not None]
    unseated = [s for s in by_person.values() if s.seat_y is None or s.seat_x is None]
    seated.sort(key=lambda s: ((s.seat_y or 0), (s.seat_x or 0), s.person_id))
    unseated.sort(key=lambda s: (s.full_name, s.person_id))

    return HemicycleLayout(
        legislature_id=legislature_id,
        image_width=HEMICYCLE_IMAGE_WIDTH,
        image_height=HEMICYCLE_IMAGE_HEIGHT,
        seats=seated + unseated,
    )


class LegislatureComposition(BaseModel):
    """Chamber-wide demographic aggregate for one legislature.

    Mirrors :class:`GroupComposition` but computed across **every**
    open mandate in the legislature, not just one group. Used as a
    reference line on the group composition embed so a reader can
    see at a glance whether a given group's gender split or age
    distribution is broadly representative or skews from the
    chamber as a whole.

    No party breakdown here — that's group-specific by construction.
    """

    members_total: int
    gender_distribution: dict[str, int]
    age_buckets: dict[str, int]


async def _compute_legislature_composition(
    session: AsyncSession, legislature_id: int, as_of: date
) -> LegislatureComposition:
    """Aggregate gender + age across every open mandate of the legislature.

    Counts every seat once: a person is in the aggregate if they
    hold an open Mandate in this legislature, regardless of whether
    they belong to a parliamentary group right now (so "no adscrits"
    are included, same as the hemicycle layout).
    """
    rows = (
        await session.execute(
            select(Person.gender, Person.birth_year)
            .join(Mandate, Mandate.person_id == Person.id)
            .where(Mandate.legislature_id == legislature_id)
            .where(Mandate.end_date.is_(None))
        )
    ).all()

    gender_distribution: dict[str, int] = {k: 0 for k in _GENDER_KEYS}
    age_buckets: dict[str, int] = {k: 0 for k in _AGE_BUCKETS}
    for gender, birth_year in rows:
        if gender in ("F", "M", "X"):
            gender_distribution[gender] += 1
        else:
            gender_distribution["unknown"] += 1
        age_buckets[_age_bucket_for(birth_year, as_of)] += 1

    return LegislatureComposition(
        members_total=len(rows),
        gender_distribution=gender_distribution,
        age_buckets=age_buckets,
    )


@router.get(
    "/{legislature_id}/composition",
    response_model=LegislatureComposition,
)
async def get_legislature_composition(
    legislature_id: int,
    session: AsyncSession = Depends(get_session),
) -> LegislatureComposition:
    """Chamber-wide composition aggregate for one legislature.

    Used by the group composition embed widget as a reference line
    so the reader can compare a group's gender split / age bands
    against the chamber as a whole. Cached for 1 h — the underlying
    open-mandate set turns over only when a deputy is substituted
    (days at most), so a stale-by-an-hour snapshot is fine.
    """
    exists = (
        await session.execute(select(Legislature.id).where(Legislature.id == legislature_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legislature not found")

    today = date.today()
    cache_key = f"legislatures:{legislature_id}:composition:{today.isoformat()}"
    return await cached(
        cache_key,
        3600,
        lambda: _compute_legislature_composition(session, legislature_id, today),
    )


@router.get("/{legislature_id}/hemicycle", response_model=HemicycleLayout)
async def get_hemicycle(
    legislature_id: int,
    session: AsyncSession = Depends(get_session),
) -> HemicycleLayout:
    """Return the interactive hemicycle layout for one legislature.

    Cached for 1 h — the underlying data (open mandates, open group
    memberships, scraped seat coordinates) only changes when a deputy
    is substituted or the hemicycle ingest is re-run, both of which
    happen on the order of days at most.
    """
    # Validate the legislature exists so we 404 instead of returning
    # an empty payload for nonsense IDs.
    exists = (
        await session.execute(select(Legislature.id).where(Legislature.id == legislature_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legislature not found")

    return await cached(
        f"legislatures:{legislature_id}:hemicycle:v1",
        3600,
        lambda: _compute_hemicycle(session, legislature_id),
    )
