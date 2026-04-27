"""Importer that upserts ``ScheduledSession`` and ``ScheduledAgendaItem``
rows from the parsed calendar HTML and orden del día PDF outputs.

Workflow (single run):

1. Fetch the calendar HTML, parse it (links to the next PDF + every
   ``class="day pleno"`` cell).
2. Fetch and parse the next orden del día PDF if present.
3. Upsert one ``ScheduledSession`` for the next session (with concrete
   items) and one row per remaining ``day pleno`` cell beyond it
   (``status=planned``, no items).
4. Compare with previously-stored future sessions: any session whose
   date is >= today AND whose ``last_seen_at`` is older than this run's
   ``last_seen_at`` (i.e. it disappeared from the calendar between runs)
   gets flipped to ``cancelled``.
5. For the next session, agenda items that disappear between runs are
   left in place (we don't delete) but the session ``status`` gets
   bumped to ``modified`` if any change is detected — the frontend can
   show a "modified" badge. ``last_seen_at`` is only refreshed for items
   present in the latest PDF.

The importer is idempotent: a no-op run produces zero schema mutations
beyond ``last_seen_at`` updates (and possibly ``status`` flips when
publication metadata genuinely changed).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.agenda import (
    CalendarParseResult,
    OrdenDelDiaParseResult,
    ParsedAgendaItem,
)
from app.models import (
    Chamber,
    Legislature,
    ScheduledAgendaItem,
    ScheduledSession,
    ScheduledSessionStatus,
)

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class AgendaImportStats:
    sessions_seen: int = 0
    sessions_created: int = 0
    sessions_updated: int = 0
    sessions_marked_cancelled: int = 0
    sessions_marked_modified: int = 0
    items_created: int = 0
    items_updated: int = 0


class AgendaImporter:
    """Upsert scheduled sessions + agenda items in a single transaction."""

    def __init__(self, session: AsyncSession, chamber: Chamber, legislature: Legislature) -> None:
        self.session = session
        self.chamber = chamber
        self.legislature = legislature

    async def import_calendar(
        self,
        calendar: CalendarParseResult,
        orden: OrdenDelDiaParseResult | None,
    ) -> AgendaImportStats:
        """Apply one calendar+PDF snapshot.

        ``orden`` may be ``None`` if the calendar exposes no next PDF (rare,
        e.g. summer recess). In that case we only refresh the planned-day
        markers.
        """
        now = datetime.now(UTC)

        # We need to know which (chamber, legislature, session_number) keys
        # we are touching this run, so the cancellation pass can flag
        # anything we DON'T touch as cancelled. Sessions without a number
        # (planned days from the calendar grid that have never had a PDF)
        # are keyed by date.
        touched_numbers: set[int] = set()
        touched_dates: set[str] = set()  # ISO dates for planned-only rows

        stats = AgendaImportStats()

        # ---- 1. The next session: full upsert with items ----
        if orden is not None:
            stats = await self._upsert_session_with_items(
                orden=orden,
                pdf_url=calendar.next_pdf_url,
                now=now,
                stats=stats,
            )
            touched_numbers.add(orden.session_number)

        # ---- 2. Remaining planned days from the calendar grid ----
        # We only ingest plenary days that are >= today. Past plenary days
        # are owned by the votes pipeline.
        today = now.date()
        for day in calendar.plenary_days:
            if day.date < today:
                continue
            if orden is not None and day.date == orden.session_date:
                # Already covered above with full content.
                continue
            stats = await self._upsert_planned_day(day_date=day.date, now=now, stats=stats)
            touched_dates.add(day.date.isoformat())

        # ---- 3. Cancellation sweep ----
        # Anything currently SCHEDULED/PLANNED/MODIFIED whose date is in the
        # future, but which we did NOT touch this run, has dropped off the
        # calendar — flip to cancelled.
        rows = (
            (
                await self.session.execute(
                    select(ScheduledSession)
                    .where(ScheduledSession.chamber_id == self.chamber.id)
                    .where(ScheduledSession.legislature_id == self.legislature.id)
                    .where(ScheduledSession.date >= today)
                    .where(
                        ScheduledSession.status.in_(
                            [
                                ScheduledSessionStatus.SCHEDULED,
                                ScheduledSessionStatus.PLANNED,
                                ScheduledSessionStatus.MODIFIED,
                            ]
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            touched = row.session_number in touched_numbers or row.date.isoformat() in touched_dates
            if touched:
                continue
            row.status = ScheduledSessionStatus.CANCELLED
            row.last_seen_at = now
            stats = AgendaImportStats(
                **{
                    **asdict(stats),
                    "sessions_marked_cancelled": stats.sessions_marked_cancelled + 1,
                }
            )

        await self.session.commit()
        log.info("congreso.agenda.import.done", **asdict(stats))
        return stats

    # ------------------------------------------------------------------
    # Per-session helpers
    # ------------------------------------------------------------------

    async def _upsert_session_with_items(
        self,
        *,
        orden: OrdenDelDiaParseResult,
        pdf_url: str | None,
        now: datetime,
        stats: AgendaImportStats,
    ) -> AgendaImportStats:
        existing = (
            await self.session.execute(
                select(ScheduledSession)
                .where(ScheduledSession.chamber_id == self.chamber.id)
                .where(ScheduledSession.legislature_id == self.legislature.id)
                .where(ScheduledSession.session_number == orden.session_number)
            )
        ).scalar_one_or_none()

        created = False
        was_modified = False
        if existing is None:
            existing = ScheduledSession(
                chamber_id=self.chamber.id,
                legislature_id=self.legislature.id,
                session_number=orden.session_number,
                date=orden.session_date,
                pdf_url=pdf_url,
                status=ScheduledSessionStatus.SCHEDULED,
                fetched_at=now,
                last_seen_at=now,
            )
            self.session.add(existing)
            await self.session.flush()
            created = True
        else:
            # Sanity update: refresh the URL and date in case the Mesa
            # reschedules. If anything legitimately changed, mark as
            # ``modified`` so the frontend can flag it.
            if existing.date != orden.session_date or existing.pdf_url != pdf_url:
                existing.date = orden.session_date
                existing.pdf_url = pdf_url
                was_modified = True
            existing.last_seen_at = now
            existing.fetched_at = now
            if existing.status == ScheduledSessionStatus.CANCELLED:
                # The session reappeared after a previous cancellation —
                # treat it as scheduled again.
                existing.status = ScheduledSessionStatus.SCHEDULED
                was_modified = True

        items_created, items_updated, items_changed = await self._upsert_items(
            session_row=existing, items=orden.items, now=now
        )
        if (
            not created
            and items_changed
            and existing.status != ScheduledSessionStatus.CANCELLED
            and existing.status == ScheduledSessionStatus.SCHEDULED
        ):
            # An item was added or its content changed → bump status.
            existing.status = ScheduledSessionStatus.MODIFIED
            was_modified = True

        return AgendaImportStats(
            sessions_seen=stats.sessions_seen + 1,
            sessions_created=stats.sessions_created + (1 if created else 0),
            sessions_updated=stats.sessions_updated + (0 if created else 1),
            sessions_marked_cancelled=stats.sessions_marked_cancelled,
            sessions_marked_modified=stats.sessions_marked_modified
            + (1 if was_modified and not created else 0),
            items_created=stats.items_created + items_created,
            items_updated=stats.items_updated + items_updated,
        )

    async def _upsert_items(
        self,
        *,
        session_row: ScheduledSession,
        items: tuple[ParsedAgendaItem, ...],
        now: datetime,
    ) -> tuple[int, int, bool]:
        """Insert / update items for ``session_row`` from the parsed PDF.

        Returns ``(created, updated, any_change)``. Stale items (positions
        present last run but not this one) stay in the table — we only
        refresh ``last_seen_at`` for the ones we actually saw, which lets
        the frontend tell users "this item was on the previous version".
        """
        existing = (
            (
                await self.session.execute(
                    select(ScheduledAgendaItem).where(
                        ScheduledAgendaItem.scheduled_session_id == session_row.id
                    )
                )
            )
            .scalars()
            .all()
        )
        existing_by_position = {row.position: row for row in existing}

        created = 0
        updated = 0
        any_change = False
        for parsed in items:
            row = existing_by_position.get(parsed.position)
            if row is None:
                self.session.add(
                    ScheduledAgendaItem(
                        scheduled_session_id=session_row.id,
                        position=parsed.position,
                        section=parsed.section,
                        kind=parsed.kind,
                        proposing_group=parsed.proposing_group,
                        subject=parsed.subject,
                        official_id=parsed.official_id,
                        target_minister=parsed.target_minister,
                        last_seen_at=now,
                    )
                )
                created += 1
                any_change = True
                continue

            changed = (
                row.section != parsed.section
                or row.kind != parsed.kind
                or row.proposing_group != parsed.proposing_group
                or row.subject != parsed.subject
                or row.official_id != parsed.official_id
                or row.target_minister != parsed.target_minister
            )
            if changed:
                row.section = parsed.section
                row.kind = parsed.kind
                row.proposing_group = parsed.proposing_group
                row.subject = parsed.subject
                row.official_id = parsed.official_id
                row.target_minister = parsed.target_minister
                updated += 1
                any_change = True
            row.last_seen_at = now

        return created, updated, any_change

    async def _upsert_planned_day(
        self, *, day_date: object, now: datetime, stats: AgendaImportStats
    ) -> AgendaImportStats:
        """Record a planned plenary day (no PDF yet) keyed by date."""
        # ``date`` is reserved as a column name; use a positional comparison.
        existing = (
            await self.session.execute(
                select(ScheduledSession)
                .where(ScheduledSession.chamber_id == self.chamber.id)
                .where(ScheduledSession.legislature_id == self.legislature.id)
                .where(ScheduledSession.date == day_date)
            )
        ).scalar_one_or_none()

        if existing is None:
            # Allocate a synthetic session_number for planned-only days. The
            # constraint requires uniqueness on (chamber, legislature,
            # session_number), so we negate the day's ordinal to stay out of
            # the way of real numbers (which are small positive ints).
            from datetime import date as _date

            assert isinstance(day_date, _date)
            synthetic = -day_date.toordinal()
            row = ScheduledSession(
                chamber_id=self.chamber.id,
                legislature_id=self.legislature.id,
                session_number=synthetic,
                date=day_date,
                pdf_url=None,
                status=ScheduledSessionStatus.PLANNED,
                fetched_at=None,
                last_seen_at=now,
            )
            self.session.add(row)
            return AgendaImportStats(
                **{
                    **asdict(stats),
                    "sessions_seen": stats.sessions_seen + 1,
                    "sessions_created": stats.sessions_created + 1,
                }
            )

        existing.last_seen_at = now
        if existing.status == ScheduledSessionStatus.CANCELLED:
            existing.status = ScheduledSessionStatus.PLANNED
        return AgendaImportStats(
            **{
                **asdict(stats),
                "sessions_seen": stats.sessions_seen + 1,
                "sessions_updated": stats.sessions_updated + 1,
            }
        )
