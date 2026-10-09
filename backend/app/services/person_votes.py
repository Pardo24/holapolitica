"""A deputy's own votes, one by one, and where they broke with their group.

The profile showed three numbers and a chart by topic but not a single vote
the person cast. This is the list behind those numbers: what they voted on
each law, how their group voted, and whether they parted ways with it.

"Breaking with the group" follows the same rule as the dissidence KPI
(app/metrics/calc.py, ``compute_person_kpis``): a cast vote (yes / no /
abstention) different from the majority of the group the deputy sat in on
that day. Absences are not dissent. Facts only, no reason given: a deputy
can break ranks for conscience, their territory, or a mistaken button.

Amendment votes are left out (and the Senate's changes voted one by one):
they are votes on changes to a law, and a deputy's "no" to another group's
amendment reads as a "no" to the law.

The per-vote rows are computed once per deputy and cached (they change on
ingest only); a page is then a slice of them plus one query for its
details.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Initiative,
    InitiativeTopic,
    Mandate,
    ParliamentaryGroup,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
)
from app.services.vote_stage import is_amendment_sql, vote_stage

_CAST = {VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION}


async def person_vote_rows(session: AsyncSession, person_id: int) -> list[list[Any]]:
    """``[vote_id, voted_at_iso, choice, group_majority | None, group_id | None]``,
    newest first, for every non-amendment vote the deputy has a record on."""
    rows = (
        await session.execute(
            select(Vote.id, Vote.voted_at, VoteRecord.choice, VoteRecord.group_id_at_time)
            .select_from(Mandate)
            .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
            .join(Vote, Vote.id == VoteRecord.vote_id)
            .where(Mandate.person_id == person_id)
            .where(~is_amendment_sql())
            # The Senate's changes, voted one by one: the law's title on
            # each, contradictory results, none of them the law's vote.
            .where(
                ~and_(
                    func.lower(Vote.title).like("enmiendas del senado%"),
                    ~func.lower(func.coalesce(Vote.description, "")).like("votación de conjunto%"),
                )
            )
            .order_by(Vote.voted_at.desc(), Vote.sequence_in_session.desc(), Vote.id.desc())
        )
    ).all()
    keys = {(vid, gid) for vid, _t, choice, gid in rows if gid is not None and choice in _CAST}
    majority: dict[tuple[int, int], str] = {}
    if keys:
        counters: dict[tuple[int, int], Counter[str]] = defaultdict(Counter)
        vote_ids = list({k[0] for k in keys})
        group_ids = list({k[1] for k in keys})
        # In chunks: a veteran deputy has thousands of votes.
        for i in range(0, len(vote_ids), 2000):
            for choice, gid, vid in (
                await session.execute(
                    select(VoteRecord.choice, VoteRecord.group_id_at_time, VoteRecord.vote_id)
                    .where(VoteRecord.vote_id.in_(vote_ids[i : i + 2000]))
                    .where(VoteRecord.group_id_at_time.in_(group_ids))
                )
            ).all():
                if choice in _CAST and (vid, gid) in keys:
                    counters[(vid, gid)][str(choice)] += 1
        for key, counts in counters.items():
            choice, n = counts.most_common(1)[0]
            if n > 0:
                majority[key] = choice
    seen: set[int] = set()
    out: list[list[Any]] = []
    for vid, voted_at, choice, gid in rows:
        if vid in seen:  # one record per vote, even across two mandates
            continue
        seen.add(vid)
        out.append(
            [
                vid,
                voted_at.isoformat(),
                str(choice),
                majority.get((vid, gid)) if gid is not None else None,
                gid,
            ]
        )
    return out


def is_dissent(row: list[Any]) -> bool:
    choice, majority = row[2], row[3]
    return majority is not None and choice in {c.value for c in _CAST} and choice != majority


async def votes_with_topic(session: AsyncSession, vote_ids: list[int], topic_slug: str) -> set[int]:
    found: set[int] = set()
    for i in range(0, len(vote_ids), 2000):
        found.update(
            vid
            for (vid,) in (
                await session.execute(
                    select(Vote.id)
                    .join(InitiativeTopic, InitiativeTopic.initiative_id == Vote.initiative_id)
                    .join(Topic, Topic.id == InitiativeTopic.topic_id)
                    .where(Vote.id.in_(vote_ids[i : i + 2000]))
                    .where(Topic.slug == topic_slug)
                )
            ).all()
        )
    return found


async def describe(session: AsyncSession, page: list[list[Any]]) -> list[dict[str, Any]]:
    """The page's rows with what a card needs: title, outcome, group, topic."""
    if not page:
        return []
    ids = [r[0] for r in page]
    votes = {
        v.id: v
        for v in (await session.execute(select(Vote).where(Vote.id.in_(ids)))).scalars().all()
    }
    init_ids = {v.initiative_id for v in votes.values() if v.initiative_id is not None}
    inits = (
        {
            i.id: i
            for i in (await session.execute(select(Initiative).where(Initiative.id.in_(init_ids))))
            .scalars()
            .all()
        }
        if init_ids
        else {}
    )
    topic_by_init: dict[int, Topic] = {}
    if init_ids:
        for iid, topic in (
            await session.execute(
                select(InitiativeTopic.initiative_id, Topic)
                .join(Topic, Topic.id == InitiativeTopic.topic_id)
                .where(InitiativeTopic.initiative_id.in_(init_ids))
                .where(Topic.kind == "theme")
                .order_by(InitiativeTopic.confidence.desc())
            )
        ).all():
            topic_by_init.setdefault(iid, topic)
    gids = {r[4] for r in page if r[4] is not None}
    groups = (
        {
            g.id: g
            for g in (
                await session.execute(
                    select(ParliamentaryGroup).where(ParliamentaryGroup.id.in_(gids))
                )
            )
            .scalars()
            .all()
        }
        if gids
        else {}
    )
    out: list[dict[str, Any]] = []
    for vid, voted_at, choice, majority, gid in page:
        v = votes.get(vid)
        if v is None:
            continue
        ini = inits.get(v.initiative_id) if v.initiative_id is not None else None
        topic = topic_by_init.get(ini.id) if ini is not None else None
        group = groups.get(gid) if gid is not None else None
        out.append(
            {
                "vote_id": vid,
                "voted_at": voted_at,
                "title_ca": v.plain_title_ca or (ini.plain_title_ca if ini else None),
                "title_es": v.plain_title_es or (ini.plain_title_es if ini else None),
                "subject": v.description or v.title,
                "initiative_id": v.initiative_id,
                "initiative_type": str(ini.type) if ini else None,
                "stage": vote_stage(v.title, v.description, v.subgroup_title, v.subgroup_text),
                "subgroup_text": v.subgroup_text,
                "result": str(v.result),
                "choice": choice,
                "group_majority": majority,
                "dissent": is_dissent([vid, voted_at, choice, majority, gid]),
                "group": (
                    {
                        "slug": group.slug,
                        "name_short": group.name_short,
                        "color_hex": group.color_hex,
                    }
                    if group
                    else None
                ),
                "topic": (
                    {
                        "slug": topic.slug,
                        "name_ca": topic.name_ca,
                        "name_es": topic.name_es,
                        "name_en": topic.name_en,
                        "color_hex": topic.color_hex,
                        "icon": topic.icon,
                        "kind": topic.kind,
                    }
                    if topic
                    else None
                ),
            }
        )
    return out
