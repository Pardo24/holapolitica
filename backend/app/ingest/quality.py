"""Post-ingest data-quality checks.

Every check encodes an invariant that, when broken, has historically
produced (or would produce) silently-wrong pages:

- ``open_mandates`` — an active legislature can never have more open
  mandates than the chamber has seats. The deputies importer used to
  leave departed deputies' mandates open, drifting the count past 350.
- ``cross_legislature_links`` — a vote must never link to an
  initiative of another legislature. Expediente numbers reset each
  term, and an unscoped matcher once attached 2014 votes to a 2026
  law (the "RTVE bug").
- ``vote_totals`` — a nominal (non-assent) plenary vote must have
  between 1 and 350 recorded positions.
- ``duplicate_votes`` — one (session, sequence) pair must map to one
  vote row.
- ``multiple_open_memberships`` — a mandate can belong to at most one
  parliamentary group at a time.

``run_data_quality_checks`` is invoked at the end of the periodic
ingest jobs; failures are structured-logged (``data_quality.failed``)
so they surface in the worker logs, and the report is returned so the
health endpoint can expose it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import (
    GroupMembership,
    Initiative,
    Legislature,
    Mandate,
    Vote,
)
from app.models import Session as SessionRow

log = get_logger(__name__)

# Congreso de los Diputados seat count. If this codebase ever grows a
# second chamber, move this onto the Chamber row.
CHAMBER_SEATS = 350


@dataclass(frozen=True, slots=True)
class CheckResult:
    """Outcome of one invariant check."""

    name: str
    ok: bool
    # Number of offending rows (0 when ok).
    violations: int
    detail: str = ""


@dataclass(frozen=True, slots=True)
class DataQualityReport:
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)


async def _check_open_mandates(session: AsyncSession) -> list[CheckResult]:
    """Every ACTIVE legislature must have ≤ CHAMBER_SEATS open mandates."""
    rows = (
        await session.execute(
            select(Legislature.number, func.count(Mandate.id))
            .join(Mandate, Mandate.legislature_id == Legislature.id)
            .where(Legislature.status == "active")
            .where(Mandate.end_date.is_(None))
            .group_by(Legislature.number)
        )
    ).all()
    results = []
    for number, count in rows:
        over = max(0, int(count) - CHAMBER_SEATS)
        results.append(
            CheckResult(
                name=f"open_mandates:{number}",
                ok=over == 0,
                violations=over,
                detail=f"{count} open mandates for {CHAMBER_SEATS} seats",
            )
        )
    return results


async def _check_cross_legislature_links(session: AsyncSession) -> CheckResult:
    """A vote's initiative must belong to the vote's own legislature."""
    count = (
        await session.execute(
            select(func.count(Vote.id))
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .join(Initiative, Initiative.id == Vote.initiative_id)
            .where(Initiative.legislature_id != SessionRow.legislature_id)
        )
    ).scalar_one()
    return CheckResult(
        name="cross_legislature_links",
        ok=count == 0,
        violations=int(count),
        detail="votes linked to an initiative from another legislature",
    )


async def _check_vote_totals(session: AsyncSession) -> CheckResult:
    """Nominal votes must have 1..CHAMBER_SEATS recorded positions."""
    total = Vote.ayes + Vote.noes + Vote.abstentions + Vote.absent
    count = (
        await session.execute(
            select(func.count(Vote.id)).where(
                and_(
                    Vote.approved_by_assent.is_(False),
                    (total > CHAMBER_SEATS) | (total <= 0),
                )
            )
        )
    ).scalar_one()
    return CheckResult(
        name="vote_totals",
        ok=count == 0,
        violations=int(count),
        detail=f"non-assent votes with totals outside 1..{CHAMBER_SEATS}",
    )


async def _check_duplicate_votes(session: AsyncSession) -> CheckResult:
    """No two vote rows may share (session_id, sequence_in_session)."""
    dupes = (
        await session.execute(
            select(func.count())
            .select_from(
                select(Vote.session_id, Vote.sequence_in_session)
                .where(Vote.sequence_in_session.is_not(None))
                .group_by(Vote.session_id, Vote.sequence_in_session)
                .having(func.count(Vote.id) > 1)
                .subquery()
            )
        )
    ).scalar_one()
    return CheckResult(
        name="duplicate_votes",
        ok=dupes == 0,
        violations=int(dupes),
        detail="(session, sequence) pairs with more than one vote row",
    )


async def _check_multiple_open_memberships(session: AsyncSession) -> CheckResult:
    """A mandate can hold at most one open group membership."""
    count = (
        await session.execute(
            select(func.count())
            .select_from(
                select(GroupMembership.mandate_id)
                .where(GroupMembership.end_date.is_(None))
                .group_by(GroupMembership.mandate_id)
                .having(func.count(GroupMembership.id) > 1)
                .subquery()
            )
        )
    ).scalar_one()
    return CheckResult(
        name="multiple_open_memberships",
        ok=count == 0,
        violations=int(count),
        detail="mandates with more than one open group membership",
    )


async def run_data_quality_checks(session: AsyncSession) -> DataQualityReport:
    """Run every invariant check and structured-log the outcome.

    Never raises on a failed CHECK (the ingest that just ran may still
    have imported good data; the point is to scream, not to roll back)
    — but any check failure lands in the logs as ``data_quality.failed``
    with the violation count, which is what operators grep/alert on.
    """
    checks: list[CheckResult] = []
    checks.extend(await _check_open_mandates(session))
    checks.append(await _check_cross_legislature_links(session))
    checks.append(await _check_vote_totals(session))
    checks.append(await _check_duplicate_votes(session))
    checks.append(await _check_multiple_open_memberships(session))

    report = DataQualityReport(checks=checks)
    for c in report.checks:
        if c.ok:
            log.info("data_quality.ok", check=c.name)
        else:
            log.error(
                "data_quality.failed",
                check=c.name,
                violations=c.violations,
                detail=c.detail,
            )
    return report
