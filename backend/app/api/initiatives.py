"""API endpoints for individual initiatives.

The bulk ``/dump/initiatives`` endpoint already exposes the full
dataset for journalists and researchers. This router adds the
single-row reader the public frontend needs to render the rich
"Exposición de motivos" prose on the vote-detail page when a vote
links to an initiative.

Aggregate listings (by topic, by group, by status) live elsewhere —
in :mod:`app.api.topics` and :mod:`app.api.stats` — to keep each
router's responsibility narrow.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Initiative
from app.schemas import InitiativeRead

router = APIRouter(prefix="/initiatives", tags=["initiatives"])


@router.get("/{initiative_id}", response_model=InitiativeRead)
async def get_initiative(
    initiative_id: int,
    session: AsyncSession = Depends(get_session),
) -> Initiative:
    """Get a single initiative by its numeric primary key.

    Returns the full :class:`InitiativeRead` shape, including the
    ``object_text`` preamble extracted from the bill's BOCG PDF when
    available. Frontends use this to render the bill author's own
    explanation of the law on the vote-detail page.
    """
    row = (
        await session.execute(select(Initiative).where(Initiative.id == initiative_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative not found")
    return row
