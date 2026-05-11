"""Build a structured weekly digest from the live database.

Editorial discipline (CLAUDE.md "mirall, no megàfon"):

- Only factual fields land in the digest. No "highlights", "important",
  "polèmic", "debate ferotge" — those are editorial judgments.
- Where we group votes by characteristic (most cohesive / most divided), we
  always include BOTH ends of the spectrum, never just the side that supports
  a narrative. The renderer can choose to display one panel of "most
  divided votes" but the data structure carries the full pair.
- Counts and dates are objective. Group / chamber names use the seeded
  short labels ("GP Popular", "GP Vasco (EAJ-PNV)").
- This module is pure: it takes an :class:`AsyncSession` and returns a
  :class:`Digest`. Rendering is :mod:`app.newsletter.render`.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.metrics.calc import (
    CohesionResult,
    compute_group_cohesion_for_vote,
)
from app.models import (
    Chamber,
    Initiative,
    InitiativeStatus,
    Legislature,
    Vote,
    VoteResult,
)
from app.models import (
    Session as SessionRow,
)


@dataclass(frozen=True, slots=True)
class DigestVoteEntry:
    vote_id: int
    title: str  # procedural label, e.g. "Proposición no de Ley"
    description: str | None  # actual subject (TextoExpediente)
    plain_summary: str | None  # LLM-generated plain-language summary, CA
    voted_at: datetime
    result: VoteResult
    ayes: int
    noes: int
    abstentions: int
    margin: int  # |ayes - noes|, useful for "closest" sort
    expediente_raw: str | None
    cohesion: list[CohesionResult]


@dataclass(frozen=True, slots=True)
class DigestInitiativeEntry:
    initiative_id: int
    official_id: str
    title: str
    status: InitiativeStatus
    submitted_at: date | None


@dataclass(frozen=True, slots=True)
class Digest:
    chamber: Chamber
    legislature: Legislature
    period_from: date
    period_to: date

    sessions_in_period: int
    votes_in_period: int

    # Symmetry: we surface BOTH the most-consensus and most-divided ends,
    # together with the fully-tied votes, so a reader sees the full spread.
    # Frontend / email body decides how to lay them out, but the data
    # contract carries every angle.
    closest_votes: list[DigestVoteEntry] = field(default_factory=list)
    most_consensual_votes: list[DigestVoteEntry] = field(default_factory=list)
    tied_votes: list[DigestVoteEntry] = field(default_factory=list)

    initiatives_status_changes: list[DigestInitiativeEntry] = field(default_factory=list)

    # Free-text editor's note. Optional and short. CLAUDE.md "capa editorial
    # humana mínima i descriptiva" — we expose the slot so a human can fill
    # it in before sending; the build_digest() function leaves it blank.
    editor_note: str | None = None


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


async def build_digest(
    session: AsyncSession,
    *,
    chamber_slug: str = "es-congreso",
    period_to: date | None = None,
    period_days: int = 7,
    top_k: int = 5,
) -> Digest:
    """Assemble the digest covering the last ``period_days`` ending at ``period_to``.

    ``top_k`` caps each highlighted list (closest / most consensual / tied) so
    a reader gets a comparable size for each angle. Pass a smaller value when
    embedding in space-constrained surfaces (cards, mobile mail clients).
    """
    end = period_to or date.today()
    start = end - timedelta(days=period_days - 1)

    chamber = (
        await session.execute(select(Chamber).where(Chamber.slug == chamber_slug))
    ).scalar_one()
    legislature = (
        await session.execute(
            select(Legislature)
            .where(Legislature.chamber_id == chamber.id)
            .where(Legislature.status == "active")
        )
    ).scalar_one()

    period_filter = (SessionRow.date >= start, SessionRow.date <= end)
    sessions_in_period = (
        await session.execute(
            select(func.count(SessionRow.id))
            .where(SessionRow.chamber_id == chamber.id)
            .where(*period_filter)
        )
    ).scalar_one()

    votes = list(
        (
            await session.execute(
                select(Vote)
                .join(SessionRow, SessionRow.id == Vote.session_id)
                .where(SessionRow.chamber_id == chamber.id)
                .where(*period_filter)
                .order_by(Vote.voted_at.asc())
            )
        )
        .scalars()
        .all()
    )

    closest, most_consensual, tied = await _bucketize_votes(session, votes, top_k=top_k)
    initiatives = await _initiatives_recent(
        session, chamber_id=chamber.id, period_from=start, period_to=end
    )

    return Digest(
        chamber=chamber,
        legislature=legislature,
        period_from=start,
        period_to=end,
        sessions_in_period=sessions_in_period,
        votes_in_period=len(votes),
        closest_votes=closest,
        most_consensual_votes=most_consensual,
        tied_votes=tied,
        initiatives_status_changes=initiatives,
    )


async def _bucketize_votes(
    session: AsyncSession,
    votes: list[Vote],
    *,
    top_k: int,
) -> tuple[list[DigestVoteEntry], list[DigestVoteEntry], list[DigestVoteEntry]]:
    """Split votes by margin; eagerly load cohesion for every emitted entry."""
    if not votes:
        return [], [], []

    decided = [v for v in votes if v.result is not VoteResult.TIE]
    tied = [v for v in votes if v.result is VoteResult.TIE]

    # Closest = smallest non-zero margin first.
    decided_by_margin = sorted(decided, key=lambda v: abs(v.ayes - v.noes))
    closest = decided_by_margin[:top_k]
    # Most consensual = largest margin first.
    most_consensual = list(reversed(decided_by_margin))[:top_k]

    # Cap tied list too (rare, but keeps the digest bounded if a session
    # produces many ties).
    tied = tied[:top_k]

    closest_entries = [await _to_entry(session, v) for v in closest]
    consensual_entries = [await _to_entry(session, v) for v in most_consensual]
    tied_entries = [await _to_entry(session, v) for v in tied]
    return closest_entries, consensual_entries, tied_entries


async def _to_entry(session: AsyncSession, vote: Vote) -> DigestVoteEntry:
    cohesion = await compute_group_cohesion_for_vote(session, vote.id)
    # Prefer the vote's own plain_summary; fall back to the linked Initiative's
    # when the vote was generated from one (PNL/Mocions usually aren't linked).
    plain_summary = vote.plain_summary_ca
    if not plain_summary and vote.initiative_id:
        from app.models import Initiative

        init = (
            await session.execute(select(Initiative).where(Initiative.id == vote.initiative_id))
        ).scalar_one_or_none()
        if init is not None:
            plain_summary = init.plain_summary_ca
    return DigestVoteEntry(
        vote_id=vote.id,
        title=vote.title,
        description=vote.description,
        plain_summary=plain_summary,
        voted_at=vote.voted_at,
        result=vote.result,
        ayes=vote.ayes,
        noes=vote.noes,
        abstentions=vote.abstentions,
        margin=abs(vote.ayes - vote.noes),
        expediente_raw=vote.expediente_raw,
        cohesion=cohesion,
    )


async def _initiatives_recent(
    session: AsyncSession,
    *,
    chamber_id: int,
    period_from: date,
    period_to: date,
) -> list[DigestInitiativeEntry]:
    """Initiatives whose ``submitted_at`` falls in the window.

    We do not yet track status-change events (would require an audit log on
    the initiatives table). For now we surface freshly submitted initiatives
    only; the digest renderer labels this clearly.
    """
    rows = (
        (
            await session.execute(
                select(Initiative)
                .where(Initiative.chamber_id == chamber_id)
                .where(Initiative.submitted_at != None)  # noqa: E711  (SQLAlchemy idiom)
                .where(Initiative.submitted_at >= period_from)
                .where(Initiative.submitted_at <= period_to)
                .order_by(Initiative.submitted_at.asc(), Initiative.official_id.asc())
            )
        )
        .scalars()
        .all()
    )
    return [
        DigestInitiativeEntry(
            initiative_id=i.id,
            official_id=i.official_id,
            title=i.title_original,
            status=i.status,
            submitted_at=i.submitted_at,
        )
        for i in rows
    ]


def is_empty(digest: Digest) -> bool:
    """A digest is empty if there's nothing to report. Don't send the email."""
    return digest.votes_in_period == 0 and not digest.initiatives_status_changes


def summary_counters(digest: Digest) -> Counter[str]:
    """Cheap stats for logging (matches what the renderer surfaces)."""
    return Counter(
        sessions=digest.sessions_in_period,
        votes=digest.votes_in_period,
        closest=len(digest.closest_votes),
        consensual=len(digest.most_consensual_votes),
        tied=len(digest.tied_votes),
        initiatives=len(digest.initiatives_status_changes),
    )


def utc_now_floor_minute() -> datetime:
    return datetime.combine(date.today(), time.min, tzinfo=UTC)


def weekly_campaign_name(period_to: date) -> str:
    """Stable, ISO-week-based campaign name used as the idempotency key.

    Re-runs within the same ISO week (whether cron-triggered, manual, or
    dry-run) collapse onto the same Listmonk campaign because we look it
    up by name. Format: ``monitor-weekly-YYYY-Www`` (e.g.
    ``monitor-weekly-2026-W19``).
    """
    iso_year, iso_week, _ = period_to.isocalendar()
    return f"monitor-weekly-{iso_year}-W{iso_week:02d}"
