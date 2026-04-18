"""API endpoints for chambers."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Chamber
from app.schemas import ChamberRead

router = APIRouter(prefix="/chambers", tags=["chambers"])


@router.get("", response_model=list[ChamberRead])
async def list_chambers(session: AsyncSession = Depends(get_session)) -> list[Chamber]:
    """List all chambers."""
    result = await session.execute(select(Chamber).order_by(Chamber.id))
    return list(result.scalars().all())


@router.get("/{slug}", response_model=ChamberRead)
async def get_chamber(slug: str, session: AsyncSession = Depends(get_session)) -> Chamber:
    """Get a chamber by its slug."""
    result = await session.execute(select(Chamber).where(Chamber.slug == slug))
    chamber = result.scalar_one_or_none()
    if chamber is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamber not found")
    return chamber
