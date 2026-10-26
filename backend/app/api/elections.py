"""The general election of 29 November 2026: official Congress candidacies.

Lists come from the BOE (app/ingest/candidacies.py): the proclaimed ones once
published, the presented ones before that, nothing before either. Names are
shown as published. A candidate who sat in the outgoing Congress links to
their page; that is a fact about the person, not about the list.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.ingest.candidacies import ELECTION, ELECTIONS
from app.models import (
    ElectionCandidacy,
    ElectionResultSnapshot,
    Legislature,
    Mandate,
    Person,
)
from app.services.cache import cached
from app.services.candidate_match import Deputy, DeputyIndex, fold
from app.services.election_parties import party_for_list

router = APIRouter(prefix="/elections/2026", tags=["elections"])


class ConstituencySummary(BaseModel):
    constituency: str
    seats: int
    lists: int


class CandidaciesStatus(BaseModel):
    election_day: date
    #: "proclaimed", "presented", or None while the BOE has published neither.
    stage: str | None
    boe_id: str | None
    published_on: date | None
    constituencies: list[ConstituencySummary]


class Candidate(BaseModel):
    name: str
    #: Their page on the site if they sat in the outgoing Congress.
    person_id: int | None = None


class CandidacyList(BaseModel):
    ballot_order: int
    name: str
    acronym: str | None
    party: str | None
    candidates: list[Candidate]
    substitutes: list[Candidate]


class PersonCandidacy(BaseModel):
    constituency: str
    list_name: str
    acronym: str | None
    party: str | None
    #: 1-based place on the list (among candidates, or among substitutes).
    position: int
    substitute: bool


class PersonCandidacies(BaseModel):
    stage: str | None
    boe_id: str | None
    published_on: date | None
    #: Empty when they are not on a list we could link to them. That is not
    #: "not standing": a name the BOE spells differently is not matched.
    candidacies: list[PersonCandidacy]


class ConstituencyCandidacies(BaseModel):
    constituency: str
    seats: int
    stage: str | None
    boe_id: str | None
    published_on: date | None
    lists: list[CandidacyList]


async def _stage(
    session: AsyncSession, election: str
) -> tuple[str | None, str | None, date | None]:
    """The newest stage we have: proclaimed wins over presented."""
    for stage in ("proclaimed", "presented"):
        row = (
            await session.execute(
                select(ElectionCandidacy.boe_id, ElectionCandidacy.published_on)
                .where(ElectionCandidacy.election == election, ElectionCandidacy.stage == stage)
                .limit(1)
            )
        ).first()
        if row:
            return stage, row[0], row[1]
    return None, None, None


_ELECTION_Q = Query(ELECTION, pattern="^(2026-11|2023-07)$")


@router.get("/candidacies", response_model=CandidaciesStatus)
async def candidacies_status(
    election: str = _ELECTION_Q, session: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    day, seats_by = ELECTIONS[election]

    async def _factory() -> dict[str, object]:
        stage, boe_id, published_on = await _stage(session, election)
        counts: dict[str, int] = {}
        if stage:
            rows = (
                await session.execute(
                    select(ElectionCandidacy.constituency, func.count())
                    .where(ElectionCandidacy.election == election, ElectionCandidacy.stage == stage)
                    .group_by(ElectionCandidacy.constituency)
                )
            ).all()
            counts = {c: int(n) for c, n in rows}
        return {
            "election_day": day.isoformat(),
            "stage": stage,
            "boe_id": boe_id,
            "published_on": published_on.isoformat() if published_on else None,
            "constituencies": [
                {"constituency": c, "seats": seats, "lists": counts.get(c, 0)}
                for c, seats in seats_by.items()
            ],
        }

    return await cached(f"elections:2026:candidacies:status:{election}:v1", 600, _factory)


async def _outgoing_deputies(session: AsyncSession) -> DeputyIndex:
    """Everyone who sat in the latest Congress, to link from the lists."""
    latest = (
        await session.execute(
            select(Legislature.id).order_by(Legislature.start_date.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if latest is None:
        return DeputyIndex([])
    rows = (
        await session.execute(
            select(
                Person.id,
                Person.full_name,
                Person.family_names,
                Person.given_names,
                Mandate.constituency,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            .where(Mandate.legislature_id == latest)
            .distinct()
        )
    ).all()
    return DeputyIndex([Deputy(int(r[0]), r[1], r[2], r[3], r[4]) for r in rows])


def candidacies_by_person(
    lists: Iterable[ElectionCandidacy], deputies: DeputyIndex
) -> dict[int, list[dict[str, object]]]:
    """Every outgoing deputy found on a list: where, on which list, at which
    place. For the "standing on 29-N" note on their profile."""
    found: dict[int, list[dict[str, object]]] = {}
    for lst in lists:
        for substitute, names in ((False, lst.candidates), (True, lst.substitutes)):
            for position, name in enumerate(names, start=1):
                person_id = deputies.match(name, lst.constituency)
                if person_id is None:
                    continue
                found.setdefault(person_id, []).append(
                    {
                        "constituency": lst.constituency,
                        "list_name": lst.name,
                        "acronym": lst.acronym,
                        "party": party_for_list(lst.name, lst.acronym),
                        "position": position,
                        "substitute": substitute,
                    }
                )
    return found


@router.get("/candidacies/person/{person_id}", response_model=PersonCandidacies)
async def person_candidacies(
    person_id: int,
    election: str = _ELECTION_Q,
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Whether an outgoing deputy is on a list, as the BOE published it."""

    async def _factory() -> dict[str, object]:
        stage, boe_id, published_on = await _stage(session, election)
        by_person: dict[int, list[dict[str, object]]] = {}
        if stage:
            rows = (
                await session.execute(
                    select(ElectionCandidacy).where(
                        ElectionCandidacy.election == election, ElectionCandidacy.stage == stage
                    )
                )
            ).scalars()
            by_person = candidacies_by_person(rows, await _outgoing_deputies(session))
        return {
            "stage": stage,
            "boe_id": boe_id,
            "published_on": published_on.isoformat() if published_on else None,
            # JSON keys are strings once cached.
            "by_person": {str(k): v for k, v in by_person.items()},
        }

    # One build for every profile: matching ~4,000 lists of names is the
    # expensive part, the lookup is not.
    data = await cached(f"elections:2026:candidacies:by-person:{election}:v1", 600, _factory)
    by_person = cast(dict[str, list[dict[str, object]]], data["by_person"])
    return {
        "stage": data["stage"],
        "boe_id": data["boe_id"],
        "published_on": data["published_on"],
        "candidacies": by_person.get(str(person_id), []),
    }


@router.get("/candidacies/constituency", response_model=ConstituencyCandidacies)
async def constituency_candidacies(
    name: str = Query(..., max_length=100),
    election: str = _ELECTION_Q,
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """The lists of one constituency (by its Congress name, e.g. 'Coruña (A)')."""
    _, seats_by = ELECTIONS[election]
    if name not in seats_by:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown constituency")

    async def _factory() -> dict[str, object]:
        stage, boe_id, published_on = await _stage(session, election)
        lists: list[dict[str, object]] = []
        if stage:
            deputies = await _outgoing_deputies(session)
            rows = (
                await session.execute(
                    select(ElectionCandidacy)
                    .where(
                        ElectionCandidacy.election == election,
                        ElectionCandidacy.stage == stage,
                        ElectionCandidacy.constituency == name,
                    )
                    .order_by(ElectionCandidacy.ballot_order)
                )
            ).scalars()

            def people(names: list[str]) -> list[dict[str, object]]:
                return [{"name": n, "person_id": deputies.match(n, name)} for n in names]

            lists = [
                {
                    "ballot_order": r.ballot_order,
                    "name": r.name,
                    "acronym": r.acronym,
                    "party": party_for_list(r.name, r.acronym),
                    "candidates": people(r.candidates),
                    "substitutes": people(r.substitutes),
                }
                for r in rows
            ]
        return {
            "constituency": name,
            "seats": seats_by[name],
            "stage": stage,
            "boe_id": boe_id,
            "published_on": published_on.isoformat() if published_on else None,
            "lists": lists,
        }

    return await cached(f"elections:2026:candidacies:{election}:{fold(name)}:v2", 600, _factory)


# --- Results ----------------------------------------------------------------

#: The election each one is compared with.
_PREVIOUS: dict[str, str] = {"2026-11": "2023-07"}


async def _previous_by_party(session: AsyncSession, election: str) -> dict[str, dict[str, object]]:
    """The previous election's official result, keyed by party slug (or the
    list's initials for lists without one)."""
    prev = _PREVIOUS.get(election)
    if prev is None:
        return {}
    payload = (
        await session.execute(
            select(ElectionResultSnapshot.payload)
            .where(ElectionResultSnapshot.election == prev, ElectionResultSnapshot.official)
            .order_by(ElectionResultSnapshot.step.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if payload is None:
        return {}
    parties = cast(list[dict[str, object]], payload["parties"])
    return {
        str(p["party"] or p["acronym"]): {"seats": p["seats"], "pct": p["pct"]} for p in parties
    }


async def _elected(
    session: AsyncSession, election: str, constituencies: list[dict[str, object]]
) -> None:
    """Each list's first N candidates, N its seats: who would sit in the
    Congress on this count. Lists matched to the BOE's by initials, then by
    name, then by party; outgoing deputies link to their page."""
    stage, _boe, _pub = await _stage(session, election)
    if stage is None:
        return
    rows = (
        await session.execute(
            select(ElectionCandidacy).where(
                ElectionCandidacy.election == election, ElectionCandidacy.stage == stage
            )
        )
    ).scalars()
    by_constituency: dict[str, list[ElectionCandidacy]] = {}
    for r in rows:
        by_constituency.setdefault(r.constituency, []).append(r)
    deputies = await _outgoing_deputies(session)

    for c in constituencies:
        name = str(c["name"])
        boe_lists = by_constituency.get(name, [])
        for lst in cast(list[dict[str, object]], c["lists"]):
            seats = int(cast(int, lst["seats"]))
            if seats <= 0:
                continue
            match = (
                next(
                    (
                        b
                        for b in boe_lists
                        if b.acronym and fold(b.acronym) == fold(str(lst["acronym"]))
                    ),
                    None,
                )
                or next((b for b in boe_lists if fold(b.name) == fold(str(lst["name"]))), None)
                or next(
                    (
                        b
                        for b in boe_lists
                        if lst["party"] and party_for_list(b.name, b.acronym) == lst["party"]
                    ),
                    None,
                )
            )
            if match is not None:
                lst["elected"] = [
                    {"name": n, "person_id": deputies.match(n, name)}
                    for n in match.candidates[:seats]
                ]


@router.get("/results")
async def results(
    election: str = _ELECTION_Q,
    step: int | None = Query(None, ge=1, le=10_000),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """The count at its latest snapshot (or at ``step``): national totals,
    every constituency, the provisionally elected, and the previous
    election's seats per party to compare. ``snapshot`` is None until the
    first one."""

    async def _factory() -> dict[str, object]:
        steps = (
            await session.execute(
                select(
                    ElectionResultSnapshot.step,
                    ElectionResultSnapshot.counted_pct,
                    ElectionResultSnapshot.official,
                    ElectionResultSnapshot.taken_at,
                )
                .where(ElectionResultSnapshot.election == election)
                .order_by(ElectionResultSnapshot.step)
            )
        ).all()
        out: dict[str, object] = {
            "election": election,
            "steps": [
                {"step": s, "counted_pct": pct, "official": off, "taken_at": at.isoformat()}
                for s, pct, off, at in steps
            ],
            "step": None,
            "snapshot": None,
        }
        if not steps:
            return out
        chosen = step if step is not None and any(s[0] == step for s in steps) else steps[-1][0]
        payload = (
            await session.execute(
                select(ElectionResultSnapshot.payload).where(
                    ElectionResultSnapshot.election == election,
                    ElectionResultSnapshot.step == chosen,
                )
            )
        ).scalar_one()
        snapshot = dict(payload)
        previous = await _previous_by_party(session, election)
        for p in cast(list[dict[str, object]], snapshot["parties"]):
            prev = previous.get(str(p["party"] or p["acronym"]))
            p["prev_seats"] = prev["seats"] if prev else None
            p["prev_pct"] = prev["pct"] if prev else None
        await _elected(session, election, cast(list[dict[str, object]], snapshot["constituencies"]))
        out["step"] = chosen
        out["snapshot"] = snapshot
        return out

    # Short: on the night a new snapshot lands every minute or so.
    return await cached(f"elections:results:{election}:{step or 'latest'}:v1", 20, _factory)
