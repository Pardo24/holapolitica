"""Bulk JSON dump endpoints for press, academic, and civic-tech consumers.

These endpoints expose the project's public-interest dataset in
chunky, cache-friendly shapes — one HTTP round trip yields a useful
working set without paginating through hundreds of pages of `/votes`,
`/persons`, or `/initiatives`.

Design principles
~~~~~~~~~~~~~~~~~

- **Public, read-only, no auth.** The data is already public by law
  (Llei 19/2013 de Transparència) and downstream remixing is what we
  want.
- **Bounded payload size.** We never dump per-deputy ``vote_records``
  for more than one vote at a time: there are ~600k rows across the XV
  legislature and a single JSON dump would defeat the point. Bulk roll-
  call data is exposed one ``vote_id`` per request, which is what the
  archival / academic use case actually needs (researchers iterate over
  vote IDs, not over the whole table).
- **Idempotent + cacheable.** Each endpoint wraps its query in the
  shared :func:`app.services.cache.cached` helper with a one-hour TTL,
  matching the ingest cadence. Cache keys encode every parameter so two
  callers with different date ranges don't collide.
- **License-tagged.** Every response is wrapped in an envelope with an
  explicit ``data_license: "CC-BY 4.0"`` field so downstream users know
  what they can do with the bytes. (See `LICENSE` and
  ``docs/public-api.md``.)

CORS for these endpoints is opened up to ``*`` in :mod:`app.main` so
that researcher / journalist JS code can ``fetch()`` them directly from
the browser without a proxy.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import (
    GroupMembership,
    Initiative,
    InitiativeTopic,
    Mandate,
    ParliamentaryGroup,
    Person,
    Topic,
    Vote,
    VoteRecord,
)
from app.services.cache import cached

router = APIRouter(prefix="/dump", tags=["dump"])

# All dumps share the same TTL: 1h, matching the ingest cadence.
_CACHE_TTL = 3600

# Single source of truth for the data licence we attach to every dump.
_DATA_LICENSE = "CC-BY 4.0"


def _envelope(items: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    """Wrap a list of records with the standard dump metadata envelope.

    Always includes ``data_license`` (CC-BY 4.0), the record ``count``,
    and a UTC ``generated_at`` timestamp the caller can use to detect
    cache staleness on their side.
    """
    payload: dict[str, Any] = {
        "data_license": _DATA_LICENSE,
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "count": len(items),
        **extra,
        "items": items,
    }
    return payload


# ---------------------------------------------------------------------------
# /dump/deputies
# ---------------------------------------------------------------------------


@router.get("/deputies", response_model=dict)
async def dump_deputies(
    legislature_id: int = Query(..., description="Legislature whose mandates to dump"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Dump every active mandate in ``legislature_id`` with current group + constituency.

    "Active" here means an open ``Mandate`` (``end_date IS NULL``). For
    historical mandates use the paginated ``/persons`` endpoint instead
    — we deliberately don't include them in the dump because the typical
    consumer wants "the current Congress" snapshot.

    Group attribution uses the *open* GroupMembership (no end date). A
    deputy who has switched groups mid-legislature appears under their
    current group only.
    """
    cache_key = f"dump:deputies:legislature:{legislature_id}"

    async def factory() -> dict[str, Any]:
        rows = (
            await session.execute(
                select(
                    Person.id,
                    Person.full_name,
                    Person.given_names,
                    Person.family_names,
                    Person.gender,
                    Person.birth_year,
                    Person.photo_url,
                    Person.biography_url,
                    Mandate.id,
                    Mandate.constituency,
                    Mandate.electoral_list_party,
                    Mandate.start_date,
                    Mandate.end_date,
                    Mandate.external_id,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.name_long,
                    ParliamentaryGroup.color_hex,
                )
                .select_from(Mandate)
                .join(Person, Person.id == Mandate.person_id)
                .outerjoin(
                    GroupMembership,
                    (GroupMembership.mandate_id == Mandate.id)
                    & (GroupMembership.end_date.is_(None)),
                )
                .outerjoin(
                    ParliamentaryGroup,
                    ParliamentaryGroup.id == GroupMembership.group_id,
                )
                .where(Mandate.legislature_id == legislature_id)
                .where(Mandate.end_date.is_(None))
                .order_by(Person.family_names.asc(), Person.given_names.asc())
            )
        ).all()

        items: list[dict[str, Any]] = []
        for (
            person_id,
            full_name,
            given_names,
            family_names,
            gender,
            birth_year,
            photo_url,
            biography_url,
            mandate_id,
            constituency,
            electoral_list_party,
            start_date,
            end_date,
            external_id,
            group_slug,
            group_short,
            group_long,
            group_color,
        ) in rows:
            items.append(
                {
                    "person_id": person_id,
                    "mandate_id": mandate_id,
                    "full_name": full_name,
                    "given_names": given_names,
                    "family_names": family_names,
                    "gender": gender,
                    "birth_year": birth_year,
                    "photo_url": photo_url,
                    "biography_url": biography_url,
                    "constituency": constituency,
                    "electoral_list_party": electoral_list_party,
                    "mandate_start_date": start_date.isoformat() if start_date else None,
                    "mandate_end_date": end_date.isoformat() if end_date else None,
                    "external_id": external_id,
                    "current_group": (
                        {
                            "slug": group_slug,
                            "name_short": group_short,
                            "name_long": group_long,
                            "color_hex": group_color,
                        }
                        if group_slug is not None
                        else None
                    ),
                }
            )

        return _envelope(items, legislature_id=legislature_id)

    return await cached(cache_key, _CACHE_TTL, factory)


# ---------------------------------------------------------------------------
# /dump/votes
# ---------------------------------------------------------------------------


@router.get("/votes", response_model=dict)
async def dump_votes(
    legislature_id: int = Query(..., description="Legislature whose votes to dump"),
    date_from: date | None = Query(
        None,
        alias="from",
        description="Earliest vote date (inclusive, ISO 8601)",
    ),
    date_to: date | None = Query(
        None,
        alias="to",
        description="Latest vote date (inclusive, ISO 8601)",
    ),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Dump every vote in ``legislature_id``, plus its aggregate result counts.

    Does NOT include per-deputy ``vote_records`` — that table is in the
    600k-row range and a single dump would defeat the point. To get the
    individual choices for a vote, follow up with
    ``/dump/vote-records?vote_id=N``.

    The optional ``from`` / ``to`` query params filter by ``voted_at``
    date. They use the SQL ``date(voted_at)`` semantics — the timezone of
    the underlying TIMESTAMPTZ is the chamber's local time as ingested.
    """
    from app.models import Session as SessionModel  # local import to avoid name shadow

    from_key = date_from.isoformat() if date_from else "*"
    to_key = date_to.isoformat() if date_to else "*"
    cache_key = f"dump:votes:legislature:{legislature_id}:{from_key}:{to_key}"

    async def factory() -> dict[str, Any]:
        stmt = (
            select(Vote)
            .join(SessionModel, SessionModel.id == Vote.session_id)
            .where(SessionModel.legislature_id == legislature_id)
        )
        if date_from is not None:
            stmt = stmt.where(Vote.voted_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Vote.voted_at <= date_to)
        stmt = stmt.order_by(Vote.voted_at.asc(), Vote.id.asc())

        votes = list((await session.execute(stmt)).scalars().all())

        items: list[dict[str, Any]] = [
            {
                "id": v.id,
                "session_id": v.session_id,
                "initiative_id": v.initiative_id,
                "sequence_in_session": v.sequence_in_session,
                "title": v.title,
                "description": v.description,
                "voted_at": v.voted_at.isoformat(),
                "result": str(v.result),
                "ayes": v.ayes,
                "noes": v.noes,
                "abstentions": v.abstentions,
                "absent": v.absent,
                "external_id": v.external_id,
                "source_url": v.source_url,
                "expediente_raw": v.expediente_raw,
                "proposing_group_id": v.proposing_group_id,
                "proposed_by_government": v.proposed_by_government,
            }
            for v in votes
        ]

        return _envelope(
            items,
            legislature_id=legislature_id,
            date_from=date_from.isoformat() if date_from else None,
            date_to=date_to.isoformat() if date_to else None,
        )

    return await cached(cache_key, _CACHE_TTL, factory)


# ---------------------------------------------------------------------------
# /dump/vote-records
# ---------------------------------------------------------------------------


@router.get("/vote-records", response_model=dict)
async def dump_vote_records(
    vote_id: int = Query(..., description="The vote whose per-deputy records to dump"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Dump the individual ``VoteRecord`` rows for ONE vote.

    One-vote-per-request is deliberate: across the XV legislature there
    are ~600k records, so we never expose a "give me everything" endpoint
    here. Researchers iterate over vote IDs from ``/dump/votes`` and
    issue one of these per vote.

    Each row carries the deputy's mandate id, their group **at the
    moment of the vote** (not their current group — group switches mid-
    legislature are common), and the choice (aye / no / abstention /
    absent / no_vote_recorded).
    """
    cache_key = f"dump:vote-records:{vote_id}"

    async def factory() -> dict[str, Any]:
        # Confirm the vote exists so we can return 404 vs an empty dump.
        vote = (await session.execute(select(Vote).where(Vote.id == vote_id))).scalar_one_or_none()
        if vote is None:
            raise HTTPException(status_code=404, detail="Vote not found")

        rows = (
            await session.execute(
                select(
                    VoteRecord.id,
                    VoteRecord.mandate_id,
                    VoteRecord.choice,
                    VoteRecord.group_id_at_time,
                    Person.id,
                    Person.full_name,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                )
                .select_from(VoteRecord)
                .join(Mandate, Mandate.id == VoteRecord.mandate_id)
                .join(Person, Person.id == Mandate.person_id)
                .outerjoin(
                    ParliamentaryGroup,
                    ParliamentaryGroup.id == VoteRecord.group_id_at_time,
                )
                .where(VoteRecord.vote_id == vote_id)
                .order_by(Person.family_names.asc(), Person.given_names.asc())
            )
        ).all()

        items: list[dict[str, Any]] = [
            {
                "id": record_id,
                "mandate_id": mandate_id,
                "choice": str(choice),
                "person": {"id": person_id, "full_name": full_name},
                "group_at_time": (
                    {"slug": group_slug, "name_short": group_short}
                    if group_slug is not None
                    else None
                ),
            }
            for (
                record_id,
                mandate_id,
                choice,
                _group_id_at_time,
                person_id,
                full_name,
                group_slug,
                group_short,
            ) in rows
        ]

        return _envelope(
            items,
            vote_id=vote_id,
            vote_title=vote.title,
            voted_at=vote.voted_at.isoformat(),
            result=str(vote.result),
        )

    # The factory raises ``HTTPException(404)`` before the cache.set runs
    # when the vote doesn't exist, so 404s propagate to FastAPI's handler
    # without ever being cached.
    return await cached(cache_key, _CACHE_TTL, factory)


# ---------------------------------------------------------------------------
# /dump/initiatives
# ---------------------------------------------------------------------------


@router.get("/initiatives", response_model=dict)
async def dump_initiatives(
    legislature_id: int = Query(..., description="Legislature whose initiatives to dump"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Dump every initiative in ``legislature_id`` with its topic classifications.

    Each row carries the initiative metadata plus a list of
    ``{slug, name_ca, confidence, classified_by}`` entries describing
    how the LLM (or human override) tagged it. Initiatives without a
    classification yet appear with an empty ``topics`` list.
    """
    cache_key = f"dump:initiatives:legislature:{legislature_id}"

    async def factory() -> dict[str, Any]:
        initiatives = list(
            (
                await session.execute(
                    select(Initiative)
                    .where(Initiative.legislature_id == legislature_id)
                    .order_by(Initiative.submitted_at.desc().nullslast(), Initiative.id.asc())
                )
            )
            .scalars()
            .all()
        )

        # Collect topic classifications in a single query to avoid N+1.
        initiative_ids = [i.id for i in initiatives]
        topic_rows: list[Any] = []
        if initiative_ids:
            topic_rows = list(
                (
                    await session.execute(
                        select(
                            InitiativeTopic.initiative_id,
                            Topic.slug,
                            Topic.name_ca,
                            Topic.name_es,
                            Topic.color_hex,
                            InitiativeTopic.confidence,
                            InitiativeTopic.classified_by,
                        )
                        .select_from(InitiativeTopic)
                        .join(Topic, Topic.id == InitiativeTopic.topic_id)
                        .where(InitiativeTopic.initiative_id.in_(initiative_ids))
                    )
                ).all()
            )

        topics_by_initiative: dict[int, list[dict[str, Any]]] = {}
        for init_id, slug, name_ca, name_es, color_hex, confidence, classified_by in topic_rows:
            topics_by_initiative.setdefault(init_id, []).append(
                {
                    "slug": slug,
                    "name_ca": name_ca,
                    "name_es": name_es,
                    "color_hex": color_hex,
                    "confidence": confidence,
                    "classified_by": classified_by,
                }
            )

        items: list[dict[str, Any]] = [
            {
                "id": i.id,
                "chamber_id": i.chamber_id,
                "legislature_id": i.legislature_id,
                "type": str(i.type),
                "official_id": i.official_id,
                "title_original": i.title_original,
                "title_ca": i.title_ca,
                "title_es": i.title_es,
                "title_en": i.title_en,
                "status": str(i.status),
                "submitted_at": i.submitted_at.isoformat() if i.submitted_at else None,
                "submitted_by": i.submitted_by,
                "source_url": i.source_url,
                "topics": topics_by_initiative.get(i.id, []),
            }
            for i in initiatives
        ]

        return _envelope(items, legislature_id=legislature_id)

    return await cached(cache_key, _CACHE_TTL, factory)
