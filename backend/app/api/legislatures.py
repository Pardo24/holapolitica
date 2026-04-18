"""API endpoints for legislatures."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Legislature
from app.schemas import LegislatureRead

router = APIRouter(prefix="/legislatures", tags=["legislatures"])


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
