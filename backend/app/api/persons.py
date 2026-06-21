"""API endpoints for persons and their mandates."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.metrics import (
    PersonKPIs,
    TopicVoteStatRow,
    compute_deputy_attendance,
    compute_deputy_dissidence,
    compute_person_kpis,
    compute_topic_stats_for_person,
)
from app.models import (
    GroupMembership,
    Legislature,
    LegislatureStatus,
    Mandate,
    ParliamentaryGroup,
    Person,
)
from app.schemas import MandateWithPerson, PersonRead
from app.services.cache import cached

router = APIRouter(prefix="/persons", tags=["persons"])

# "El teu diputat" aggregates are heavy (a pass over the legislature's records)
# but stable between ingests, so we cache them under the "metrics:" namespace —
# the ingest workers' invalidate("metrics:") then refreshes them when new votes
# land. The TTL is a safety net.
_DEPUTY_CACHE_TTL = 86400


@router.get("", response_model=dict)
async def list_persons(
    q: str | None = Query(None, description="Search by full name (partial match)"),
    legislature_id: int | None = Query(
        None, description="Filter to active mandates in this legislature"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """List persons with optional search and pagination.

    Returns a paginated envelope with:
        - total: total count matching the filter
        - page, page_size: pagination info
        - items: list of PersonRead

    NOTE on legislature filter: returns persons who have an active mandate in
    the given legislature. We use a subquery to keep this efficient.
    """
    stmt = select(Person)
    count_stmt = select(func.count(Person.id))

    if q:
        like = f"%{q}%"
        stmt = stmt.where(Person.full_name.ilike(like))
        count_stmt = count_stmt.where(Person.full_name.ilike(like))

    if legislature_id is not None:
        stmt = stmt.join(Mandate, Mandate.person_id == Person.id).where(
            Mandate.legislature_id == legislature_id
        )
        count_stmt = count_stmt.join(Mandate, Mandate.person_id == Person.id).where(
            Mandate.legislature_id == legislature_id
        )

    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(Person.family_names.asc(), Person.given_names.asc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(stmt)
    persons = list(result.scalars().unique().all())

    enrichment = await _current_group_by_person(session, [p.id for p in persons])

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_serialize_person(p, enrichment) for p in persons],
    }


async def _resolve_legislature_id(session: AsyncSession, legislature_id: int | None) -> int | None:
    if legislature_id is not None:
        return legislature_id
    return (
        await session.execute(
            select(Legislature.id)
            .where(Legislature.status == LegislatureStatus.ACTIVE)
            .order_by(Legislature.start_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


class ConstituencyRow(BaseModel):
    name: str
    deputies: int


@router.get("/constituencies", response_model=list[ConstituencyRow])
async def list_constituencies(
    legislature_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[ConstituencyRow]:
    """Distinct constituencies (provinces) with their deputy count, for the
    "El teu diputat" picker. Defaults to the current legislature."""
    leg_id = await _resolve_legislature_id(session, legislature_id)
    if leg_id is None:
        return []
    rows = (
        await session.execute(
            select(Mandate.constituency, func.count(func.distinct(Mandate.person_id)))
            .where(Mandate.legislature_id == leg_id)
            .where(Mandate.constituency.is_not(None))
            .group_by(Mandate.constituency)
            .order_by(Mandate.constituency.asc())
        )
    ).all()
    return [ConstituencyRow(name=c, deputies=n) for c, n in rows]


class DeputyCard(BaseModel):
    """One representative of a constituency, with the at-a-glance numbers the
    "El teu diputat" cards show: attendance and how often they break with their
    own group (independence)."""

    person_id: int
    full_name: str
    photo_url: str | None = None
    constituency: str | None = None
    group_slug: str | None = None
    group_short: str | None = None
    group_color: str | None = None
    attendance_pct: float | None = None  # 0..1
    dissidence_pct: float | None = None  # 0..1
    votes_cast: int = 0


@router.get("/by-constituency", response_model=list[DeputyCard])
async def deputies_by_constituency(
    constituency: str = Query(..., description="Province name, e.g. 'Barcelona'."),
    legislature_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[DeputyCard]:
    """The deputies who represent a constituency, each with attendance + a
    party-independence score. Reuses the bulk attendance/dissidence metrics
    (two passes over the legislature's records) and filters to the province."""
    leg_id = await _resolve_legislature_id(session, legislature_id)
    if leg_id is None:
        return []

    async def factory() -> list[DeputyCard]:
        person_rows = (
            await session.execute(
                select(
                    Person.id,
                    Person.full_name,
                    Person.photo_url,
                    Mandate.constituency,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                )
                .join(Mandate, Mandate.person_id == Person.id)
                .outerjoin(
                    GroupMembership,
                    (GroupMembership.mandate_id == Mandate.id)
                    & (GroupMembership.end_date.is_(None)),
                )
                .outerjoin(ParliamentaryGroup, ParliamentaryGroup.id == GroupMembership.group_id)
                .where(Mandate.legislature_id == leg_id)
                .where(Mandate.constituency == constituency)
            )
        ).all()
        if not person_rows:
            return []

        attendance = {
            r.person_id: r for r in await compute_deputy_attendance(session, legislature_id=leg_id)
        }
        dissidence = {
            r.person_id: r for r in await compute_deputy_dissidence(session, legislature_id=leg_id)
        }

        cards: list[DeputyCard] = []
        seen: set[int] = set()
        for pid, full_name, photo, const, slug, short, color in person_rows:
            if pid in seen:
                continue
            seen.add(pid)
            att = attendance.get(pid)
            dis = dissidence.get(pid)
            cards.append(
                DeputyCard(
                    person_id=pid,
                    full_name=full_name,
                    photo_url=photo,
                    constituency=const,
                    group_slug=slug,
                    group_short=short,
                    group_color=color,
                    attendance_pct=att.attendance if att else None,
                    dissidence_pct=dis.dissidence if dis else None,
                    votes_cast=att.votes_attended if att else 0,
                )
            )
        # Group-mates together, then most-present first within a group.
        cards.sort(key=lambda c: (c.group_short or "zz", -(c.attendance_pct or 0)))
        return cards

    return await cached(
        f"metrics:persons:by-constituency:{leg_id}:{constituency}", _DEPUTY_CACHE_TTL, factory
    )


@router.get("/{person_id}", response_model=PersonRead)
async def get_person(person_id: int, session: AsyncSession = Depends(get_session)) -> PersonRead:
    """Get a single person by ID, enriched with current group membership."""
    result = await session.execute(select(Person).where(Person.id == person_id))
    person = result.scalar_one_or_none()
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    enrichment = await _current_group_by_person(session, [person.id])
    return _serialize_person(person, enrichment)


async def _current_group_by_person(
    session: AsyncSession, person_ids: list[int]
) -> dict[int, tuple[str, str, str | None, str | None]]:
    """Fetch ``person_id -> (slug, name_short, color_hex, constituency)`` for the open membership.

    A person can have multiple mandates across legislatures; we surface the
    membership tied to the most recently started mandate that has an open
    GroupMembership. Returned dict is keyed by person id; persons without an
    active membership are simply absent.
    """
    if not person_ids:
        return {}
    rows = (
        await session.execute(
            select(
                Person.id,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
                Mandate.constituency,
                Mandate.start_date,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            .join(GroupMembership, GroupMembership.mandate_id == Mandate.id)
            .join(
                ParliamentaryGroup,
                ParliamentaryGroup.id == GroupMembership.group_id,
            )
            .where(Person.id.in_(person_ids))
            .where(GroupMembership.end_date.is_(None))
            .order_by(Person.id, Mandate.start_date.desc())
        )
    ).all()

    out: dict[int, tuple[str, str, str | None, str | None]] = {}
    for pid, slug, short, color, constituency, _start in rows:
        # Order is most-recent first by mandate start_date; first row wins.
        out.setdefault(pid, (slug, short, color, constituency))
    return out


def _serialize_person(
    person: Person,
    enrichment: dict[int, tuple[str, str, str | None, str | None]],
) -> PersonRead:
    base = PersonRead.model_validate(person)
    extra = enrichment.get(person.id)
    if extra is None:
        return base
    slug, short, color, constituency = extra
    return base.model_copy(
        update={
            "current_group_slug": slug,
            "current_group_short": short,
            "current_group_color": color,
            "current_constituency": constituency,
        }
    )


@router.get("/{person_id}/mandates", response_model=list[MandateWithPerson])
async def get_person_mandates(
    person_id: int, session: AsyncSession = Depends(get_session)
) -> list[Mandate]:
    """Get all mandates of a person across legislatures."""
    stmt = (
        select(Mandate)
        .where(Mandate.person_id == person_id)
        .options(selectinload(Mandate.person))
        .order_by(Mandate.start_date.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{person_id}/topic-stats", response_model=list[TopicVoteStatRow])
async def get_person_topic_stats(
    person_id: int, session: AsyncSession = Depends(get_session)
) -> list[TopicVoteStatRow]:
    """Per-topic Sí/No/Abst breakdown for the deputy's full vote history."""
    return await compute_topic_stats_for_person(session, person_id=person_id)


@router.get("/{person_id}/kpis", response_model=PersonKPIs)
async def get_person_kpis(
    person_id: int, session: AsyncSession = Depends(get_session)
) -> PersonKPIs:
    """Three at-a-glance numbers: votes attended, attendance %, dissidence %."""
    return await compute_person_kpis(session, person_id=person_id)
