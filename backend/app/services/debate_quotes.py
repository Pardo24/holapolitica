"""Which debate's quotes go with a vote (see app/ingest/congreso/debate_quotes.py)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DebateQuote, ParliamentaryGroup, Vote
from app.models import Session as SessionModel
from app.schemas import DebateQuoteRead

# A plenary debates an item one day and votes on it at the end of that day or
# later that week (Tuesday to Thursday, as a rule). Wide enough for the week,
# too narrow to reach the same bill's previous stage, months earlier.
DEBATE_WINDOW_DAYS = 6


async def load_debate_quotes(
    session: AsyncSession, vote_id: int, expediente: str | None
) -> list[DebateQuoteRead]:
    """The quotes from the debate that led to this vote, or none.

    ``expediente`` may carry the vote's trailing ``/0000``. Several debates in
    the window resolve to the latest one, closest to the vote.
    """
    if not expediente:
        return []
    voted_on = (
        await session.execute(
            select(SessionModel.date)
            .join(Vote, Vote.session_id == SessionModel.id)
            .where(Vote.id == vote_id)
        )
    ).scalar_one_or_none()
    if voted_on is None:
        return []
    rows = (
        await session.execute(
            select(DebateQuote, ParliamentaryGroup)
            .join(ParliamentaryGroup, ParliamentaryGroup.id == DebateQuote.group_id)
            .where(
                DebateQuote.expediente == "/".join(expediente.split("/")[:2]),
                DebateQuote.debate_date >= voted_on - timedelta(days=DEBATE_WINDOW_DAYS),
                DebateQuote.debate_date <= voted_on,
                DebateQuote.quote.is_not(None),
            )
            .order_by(DebateQuote.debate_date.desc(), DebateQuote.id)
        )
    ).all()
    if not rows:
        return []
    latest = rows[0][0].debate_date
    return [
        DebateQuoteRead(
            group_slug=group.slug,
            group_short=group.name_short,
            group_color=group.color_hex,
            speaker_name=row.speaker_name,
            quote=str(row.quote),
            debate_date=row.debate_date,
            dscd_ref=row.dscd_ref,
            page=row.page,
            source_url=row.source_url,
        )
        for row, group in rows
        if row.debate_date == latest
    ]
