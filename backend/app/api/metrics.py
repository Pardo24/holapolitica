"""HTTP endpoints exposing aggregate metrics.

CLAUDE.md "regla de simetria" — every comparative metric MUST return the full
matrix or full per-deputy list. The endpoints below never paginate or filter
to a subset based on outcome (e.g. "top dissidents only"). The frontend may
sort and slice for display, but the canonical API response is always the
complete dataset for the requested scope.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.metrics import (
    AttendanceRow,
    CohesionResult,
    CoincidenceCell,
    DissidenceRow,
    GroupSummaryRow,
    compute_deputy_attendance,
    compute_deputy_dissidence,
    compute_group_cohesion_for_vote,
    compute_group_coincidence_matrix,
    compute_group_summary,
)
from app.models import Vote
from app.services.cache import cached

router = APIRouter(prefix="/metrics", tags=["metrics"])

# Same TTL as the stats endpoints. Both namespaces are wiped by
# ``_invalidate_aggregate_caches`` on every ingest run, so a 24 h
# value is event-driven freshness with a long safety net.
_CACHE_TTL = 86400


@router.get("/group-summary", response_model=list[GroupSummaryRow])
async def group_summary(
    legislature_id: int = Query(..., description="Legislature scope"),
    session: AsyncSession = Depends(get_session),
) -> list[GroupSummaryRow]:
    """Per-group composition + cohesion + attendance for the stats hero."""
    return await cached(
        f"metrics:group-summary:{legislature_id}",
        _CACHE_TTL,
        lambda: compute_group_summary(session, legislature_id=legislature_id),
    )


@router.get("/cohesion", response_model=list[CohesionResult])
async def cohesion(
    vote_id: int = Query(..., description="ID of the vote to analyze"),
    session: AsyncSession = Depends(get_session),
) -> list[CohesionResult]:
    # "No per-deputy records" is a legitimate outcome, not a missing
    # resource: approval by assent holds no division, and secret ballots
    # (dictámenes of the Comisión del Estatuto de los Diputados) publish
    # totals but never individual votes. Returning 404 made callers treat
    # those votes as non-existent — the vote-detail page turned every one
    # of them into a 404 page, so ~140 real votes were dead links.
    # An empty list is the honest answer; 404 stays for an unknown vote id.
    if not await session.get(Vote, vote_id):
        raise HTTPException(status_code=404, detail="Vote not found")
    return await compute_group_cohesion_for_vote(session, vote_id)


@router.get("/coincidence", response_model=list[CoincidenceCell])
async def coincidence(
    legislature_id: int = Query(..., description="Legislature scope"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    session: AsyncSession = Depends(get_session),
) -> list[CoincidenceCell]:
    key = (
        f"metrics:coincidence:{legislature_id}:"
        f"{from_date.isoformat() if from_date else 'any'}:"
        f"{to_date.isoformat() if to_date else 'any'}"
    )
    return await cached(
        key,
        _CACHE_TTL,
        lambda: compute_group_coincidence_matrix(
            session,
            legislature_id=legislature_id,
            from_date=from_date,
            to_date=to_date,
        ),
    )


@router.get("/attendance", response_model=list[AttendanceRow])
async def attendance(
    legislature_id: int = Query(...),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    session: AsyncSession = Depends(get_session),
) -> list[AttendanceRow]:
    return await compute_deputy_attendance(
        session, legislature_id=legislature_id, from_date=from_date, to_date=to_date
    )


@router.get("/dissidence", response_model=list[DissidenceRow])
async def dissidence(
    legislature_id: int = Query(...),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    session: AsyncSession = Depends(get_session),
) -> list[DissidenceRow]:
    return await compute_deputy_dissidence(
        session, legislature_id=legislature_id, from_date=from_date, to_date=to_date
    )
