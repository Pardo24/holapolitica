"""A deputy's votes one by one, and where they broke with their group.

Same dissent rule as the KPI: a cast vote different from the majority of
the group the deputy sat in. Absences are not dissent; amendment votes are
not listed (a "no" to another group's amendment is not a "no" to the law).
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Vote, VoteChoice
from app.services.person_votes import describe, is_dissent, person_vote_rows
from tests.test_metrics_tenure import _add_deputy, _add_vote, _cast, _seed_scaffold, db_session

__all__ = ["db_session"]


async def test_votes_and_dissent(db_session: AsyncSession) -> None:
    chamber, leg, group = await _seed_scaffold(db_session)
    start = date(2023, 8, 17)
    me = await _add_deputy(
        db_session, chamber=chamber, leg=leg, group=group, full_name="Jo", mandate_start=start
    )
    a = await _add_deputy(
        db_session, chamber=chamber, leg=leg, group=group, full_name="A", mandate_start=start
    )
    b = await _add_deputy(
        db_session, chamber=chamber, leg=leg, group=group, full_name="B", mandate_start=start
    )

    with_group = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 1, 10, 12, tzinfo=UTC)
    )
    broke = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 2, 10, 12, tzinfo=UTC)
    )
    absent = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 3, 10, 12, tzinfo=UTC)
    )
    amendment = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 4, 10, 12, tzinfo=UTC)
    )
    amendment.subgroup_title = "Enmiendas presentadas por el Grupo Parlamentario Popular"
    amendment.title = "Dictámenes de Comisiones sobre iniciativas legislativas."

    for v, mine in (
        (with_group, VoteChoice.AYE),
        (broke, VoteChoice.NO),
        (absent, VoteChoice.NO_VOTE_RECORDED),
        (amendment, VoteChoice.NO),
    ):
        await _cast(db_session, vote=v, mandate=me, group=group, choice=mine)
        for other in (a, b):
            await _cast(db_session, vote=v, mandate=other, group=group, choice=VoteChoice.AYE)
    await db_session.commit()

    rows = await person_vote_rows(db_session, me.person_id)
    assert [r[0] for r in rows] == [
        absent.id,
        broke.id,
        with_group.id,
    ]  # newest first, no amendment
    assert [is_dissent(r) for r in rows] == [False, True, False]

    page = await describe(db_session, rows)
    by_id = {p["vote_id"]: p for p in page}
    assert by_id[broke.id]["choice"] == "no" and by_id[broke.id]["group_majority"] == "aye"
    assert by_id[broke.id]["dissent"] is True
    assert by_id[broke.id]["group"]["slug"] == "gp-socialista"
    assert isinstance(await db_session.get(Vote, broke.id), Vote)
