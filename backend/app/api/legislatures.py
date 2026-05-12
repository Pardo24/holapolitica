"""API endpoints for legislatures."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
