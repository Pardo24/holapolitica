"""API endpoints for the upcoming-sessions agenda.

Two endpoints:

- ``GET /agenda/upcoming`` — the next (most imminent) ``ScheduledSession``
  with status ∈ {``scheduled``, ``modified``} and date >= today, plus its
  agenda items. Returns 404 when nothing is scheduled.
- ``GET /agenda/sessions`` — list endpoint with optional filters by
  ``legislature_id`` and ``status``. Default order: ascending by date.

The home page widget on the frontend hits ``/agenda/upcoming``; the
``/agenda/sessions`` endpoint is the list surface for "all upcoming"
pages and journalists pulling raw data.
"""

from __future__ import annotations

from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import (
    Initiative,
    InitiativeTopic,
    ScheduledAgendaItem,
    ScheduledSession,
    ScheduledSessionStatus,
    Topic,
)
from app.schemas import ScheduledAgendaItemRead, ScheduledSessionRead

router = APIRouter(prefix="/agenda", tags=["agenda"])


@router.get("/upcoming", response_model=ScheduledSessionRead)
async def get_upcoming(
    session: AsyncSession = Depends(get_session),
) -> ScheduledSession:
    """Return the next plenary session whose orden del día is published.

    "Next" = earliest date >= today with status ∈ {``scheduled``,
    ``modified``}. ``planned`` rows (calendar markers, no PDF yet) are
    excluded here — the home widget would have nothing to render. They
    surface via :func:`list_sessions` for callers that explicitly want
    them.
    """
    today = _date.today()
    stmt = (
        select(ScheduledSession)
        .where(ScheduledSession.date >= today)
        .where(
            ScheduledSession.status.in_(
                [
                    ScheduledSessionStatus.SCHEDULED,
                    ScheduledSessionStatus.MODIFIED,
                ]
            )
        )
        .options(selectinload(ScheduledSession.items))
        .order_by(ScheduledSession.date.asc())
        .limit(1)
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upcoming session scheduled",
        )
    return row


@router.get("/items/by-topic/{topic_slug}", response_model=list[ScheduledAgendaItemRead])
async def items_by_topic(
    topic_slug: str,
    legislature_id: int = Query(...),
    session: AsyncSession = Depends(get_session),
) -> list[ScheduledAgendaItem]:
    """Upcoming agenda items whose initiative is classified under ``topic_slug``.

    Joins ``scheduled_agenda_items`` → ``initiatives`` (by ``official_id``) →
    ``initiative_topics`` → ``topics``. Items whose ``official_id`` doesn't
    match any classified initiative are omitted. Ordered by session date,
    then position within the session.
    """
    today = _date.today()
    stmt = (
        select(ScheduledAgendaItem)
        .join(
            ScheduledSession,
            ScheduledSession.id == ScheduledAgendaItem.scheduled_session_id,
        )
        .join(Initiative, Initiative.official_id == ScheduledAgendaItem.official_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(Topic.slug == topic_slug)
        .where(ScheduledSession.legislature_id == legislature_id)
        .where(ScheduledSession.date >= today)
        .where(
            ScheduledSession.status.in_(
                [
                    ScheduledSessionStatus.SCHEDULED,
                    ScheduledSessionStatus.MODIFIED,
                    ScheduledSessionStatus.PLANNED,
                ]
            )
        )
        .order_by(ScheduledSession.date.asc(), ScheduledAgendaItem.position.asc())
    )
    return list((await session.execute(stmt)).scalars().all())


@router.get("/sessions", response_model=list[ScheduledSessionRead])
async def list_sessions(
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    status_filter: ScheduledSessionStatus | None = Query(
        None,
        alias="status",
        description="Filter by status (scheduled, modified, planned, cancelled, completed)",
    ),
    upcoming_only: bool = Query(True, description="Restrict to dates >= today (default true)"),
    session: AsyncSession = Depends(get_session),
) -> list[ScheduledSession]:
    """List scheduled sessions with optional filters.

    Default ordering is ascending by date — useful for the "calendar of
    upcoming plenos" view. Pass ``upcoming_only=false`` to also include
    past rows (e.g. for historical agenda comparisons).
    """
    stmt = select(ScheduledSession).options(selectinload(ScheduledSession.items))
    if legislature_id is not None:
        stmt = stmt.where(ScheduledSession.legislature_id == legislature_id)
    if status_filter is not None:
        stmt = stmt.where(ScheduledSession.status == status_filter)
    if upcoming_only:
        stmt = stmt.where(ScheduledSession.date >= _date.today())
    stmt = stmt.order_by(ScheduledSession.date.asc())
    rows = list((await session.execute(stmt)).scalars().unique().all())
    return rows
