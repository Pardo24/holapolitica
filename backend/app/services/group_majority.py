"""How a deputy's group voted, by majority, on each of the deputy's votes.

Both the dissidence KPI (app/metrics/calc.py, ``compute_person_kpis``) and
the profile's list of breaks (app/services/person_votes.py) compare a
deputy's vote with their group's. They used to fetch every group member's
record for every vote the deputy cast and count them in Python: for a
veteran, ~16,000 votes times ~130 members, two million rows per profile.
Opening a few deputy pages at once held the API's database connections for
tens of seconds and the rest of the site waited for them (2026-10-26:
``/persons/:id/kpis`` p95 31 s, "QueuePool limit ... reached").

The database counts them instead (GROUP BY over the covering index
``ix_vote_records_vote_group_choice``, migration 0039) and only the tallies
come back.

A tie at the top is no majority: a split group has no line to break with.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Mandate, Vote, VoteChoice, VoteRecord
from app.services.vote_stage import is_change_vote_sql

CAST = (VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION)


async def person_group_majorities(
    session: AsyncSession, person_id: int
) -> dict[tuple[int, int], VoteChoice | None]:
    """``{(vote_id, group_id): majority choice or None on a tie}`` for every
    vote the deputy cast (yes / no / abstention) while sitting in a group.

    Votes on changes to a law (amendments, the Senate's changes one by one)
    are left out: they are not a stance on the law, so neither the KPI nor
    the list counts them. A key that is missing is such a vote.
    """
    keys = (
        select(VoteRecord.vote_id.label("vote_id"), VoteRecord.group_id_at_time.label("gid"))
        .select_from(Mandate)
        .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .where(Mandate.person_id == person_id)
        .where(VoteRecord.choice.in_(CAST))
        .where(VoteRecord.group_id_at_time.is_not(None))
        .where(~is_change_vote_sql())
        .distinct()
        .subquery()
    )
    member = aliased(VoteRecord)
    tallies = await session.execute(
        select(member.vote_id, member.group_id_at_time, member.choice, func.count())
        .join(keys, and_(member.vote_id == keys.c.vote_id, member.group_id_at_time == keys.c.gid))
        .where(member.choice.in_(CAST))
        .group_by(member.vote_id, member.group_id_at_time, member.choice)
    )
    counts: dict[tuple[int, int], dict[VoteChoice, int]] = defaultdict(dict)
    for vote_id, group_id, choice, n in tallies:
        counts[(vote_id, group_id)][choice] = n

    majority: dict[tuple[int, int], VoteChoice | None] = {}
    for key, by_choice in counts.items():
        top = max(by_choice.values())
        leaders = [choice for choice, n in by_choice.items() if n == top]
        majority[key] = leaders[0] if len(leaders) == 1 else None
    return majority
