"""Historical-vote backfill for past Congreso legislatures.

The Congreso votaciones portlet renders one specific session inline when given
``?targetLegislatura=<ROMAN>&targetDate=DD/MM/YYYY``. The page that comes back
is the same shape as the latest-session listing — a deterministic ``VOT_<TS>``
ZIP URL, per-vote XML/PNG/PDF URLs, expediente labels, totals — so we can
reuse the latest-session importer machinery as-is.

The discovery that ``targetDate=DD/MM/YYYY`` works statelessly came from a
short Playwright spike (2026-05-10): the portlet's own
``onChangeDate(targetDate)`` JS calls
``getBaseUrl() + "&targetDate=" + formatDate(targetDate)`` where
``formatDate`` produces ``DD/MM/YYYY``. Earlier research had probed
``targetDate=YYYYMMDD`` (silently ignored). The slash-delimited form works
without a browser and without cookies; that's how this module drives it.

Procedure for one legislature:

1. GET the votaciones portlet for the legislature once. Parse the inline
   ``var diasVotaciones = [YYYYMMDD, ...]`` array — every plenary-vote day.
2. For each date, skip the dates whose session is already in the DB
   (lookup by ``Session.date + chamber_id``).
3. For each remaining date, call
   :meth:`CongresoClient.fetch_session_zip_for_date` (rate-limited 1 req/s)
   and run the resulting bundle through ``VoteImporter`` exactly like the
   latest-session pipeline.
4. Stop on a sustained failure rate; otherwise continue. Backfill is
   idempotent — re-running upserts existing sessions/votes/records.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.votes import VoteImporter
from app.models import Chamber, Legislature
from app.models import Session as SessionRow

log = get_logger(__name__)


# The portlet only exposes legislatures back to X (Roman). Numeric values are
# silently ignored. ``XV`` is the current (active) legislature as of 2026.
_LEGISLATURE_ROMAN: dict[int, str] = {
    10: "X",
    11: "XI",
    12: "XII",
    13: "XIII",
    14: "XIV",
    15: "XV",
}

# Polite rate limit; the Congreso open-data servers are public and the
# robots.txt does not restrict our paths but we keep an explicit gap between
# requests so concurrent runs don't overwhelm them.
_RATE_LIMIT_DELAY_S = 1.0

_DIAS_VOTACIONES_RE = re.compile(
    r"var\s+diasVotaciones\s*=\s*\[(?P<inner>[^\]]*)\]",
    re.IGNORECASE,
)
_DATE_INT_RE = re.compile(r"\b(?P<d>\d{8})\b")
_SESSION_ZIP_INLINE_RE = re.compile(
    r"/webpublica/opendata/votaciones/Leg(?P<leg>\d+)/Sesion(?P<sesion>\d+)/"
    r"(?P<y>\d{4})(?P<m>\d{2})(?P<d>\d{2})/VOT_\d+\.zip",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class SessionDescriptor:
    """A located historical session: number and date."""

    legislature_int: int
    session_number: int
    date: date


@dataclass
class BackfillStats:
    legislature: str = ""
    legislature_int: int = 0
    days_in_calendar: int = 0
    days_already_imported: int = 0
    days_attempted: int = 0
    sessions_imported_now: int = 0
    sessions_skipped_no_bundle: int = 0
    sessions_failed: int = 0
    total_votes_added: int = 0
    total_records_added: int = 0
    skipped_dates: list[str] = field(default_factory=list)
    failed_dates: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# HTML parsing helpers
# ---------------------------------------------------------------------------


def parse_dias_votaciones(html: str) -> list[date]:
    """Extract every plenary-vote day from the votaciones portlet HTML.

    The portlet inlines a JavaScript array literal::

        var diasVotaciones = [20230919, 20230921, ..., 20260430];

    Each element is a YYYYMMDD integer (the portal always emits 8-digit
    dates). Returned as ``date`` objects in input (chronological) order.

    Returns an empty list if the array is absent (between legislatures or
    for legislatures the portlet doesn't expose).
    """
    match = _DIAS_VOTACIONES_RE.search(html)
    if match is None:
        return []
    inner = match.group("inner")
    out: list[date] = []
    for token in _DATE_INT_RE.finditer(inner):
        n = token.group("d")
        try:
            out.append(date(int(n[0:4]), int(n[4:6]), int(n[6:8])))
        except ValueError:
            continue
    return out


def find_session_zip_in_html(html: str, *, legislature_int: int, target_date: date) -> str | None:
    """Return the absolute-path ZIP URL for ``target_date`` if inlined in ``html``.

    Path-only (``/webpublica/...``); callers absolutize against the configured
    base URL before fetching. Kept for back-compat with the latest-session
    parser; the per-date driver in ``CongresoClient`` does the same matching
    via ``parse_latest_session_ref``.
    """
    yyyymmdd = target_date.strftime("%Y%m%d")
    for m in _SESSION_ZIP_INLINE_RE.finditer(html):
        if (
            int(m.group("leg")) == legislature_int
            and m.group("y") + m.group("m") + m.group("d") == yyyymmdd
        ):
            return m.group(0)
    return None


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def legislature_to_int(roman_or_int: str | int) -> int:
    if isinstance(roman_or_int, int):
        return roman_or_int
    inv = {v: k for k, v in _LEGISLATURE_ROMAN.items()}
    return inv[roman_or_int]


def legislature_to_roman(roman_or_int: str | int) -> str:
    if isinstance(roman_or_int, str):
        return roman_or_int
    return _LEGISLATURE_ROMAN[roman_or_int]


async def _already_imported_dates(
    db_session: AsyncSession, chamber: Chamber, legislature: Legislature
) -> set[date]:
    """Return the set of session dates already present in the DB for this leg."""
    result = await db_session.execute(
        select(SessionRow.date)
        .where(SessionRow.chamber_id == chamber.id)
        .where(SessionRow.legislature_id == legislature.id)
    )
    return {d for (d,) in result.all()}


async def backfill_legislature(
    db_session: AsyncSession,
    chamber: Chamber,
    legislature: Legislature,
    *,
    legislature_id: str | int = "XV",
    only_first_n: int | None = None,
    skip_already_imported: bool = True,
) -> BackfillStats:
    """Backfill an entire legislature's plenary votes.

    Procedure:
      1. Fetch the votaciones portlet HTML; parse ``diasVotaciones``.
      2. Filter out dates whose session is already imported.
      3. For each remaining date, request the per-date listing via
         :meth:`CongresoClient.fetch_session_zip_for_date` (1 req/s),
         then run the bundle through :class:`VoteImporter`.
      4. Return aggregate stats.

    Args:
        db_session: an async SQLAlchemy session bound to a single
            transaction. The importer commits inside ``import_session_zip``
            for each session; on failure the *previous* sessions stay.
        chamber: the ``es-congreso`` Chamber row.
        legislature: the active Legislature row to attach sessions to.
            All historical dates are recorded under this legislature even
            when the data comes from a prior portlet view — the caller is
            responsible for choosing the right Legislature row.
        legislature_id: Roman numeral (``"XV"``, ``"XIV"`` …) or int
            (``15``, ``14`` …) selecting which legislature the portlet
            should render.
        only_first_n: process at most this many dates from the calendar.
            Useful for smoke tests and progressive rollout. ``None``
            processes everything.
        skip_already_imported: when ``True`` (default), dates already in
            the DB are skipped entirely. Pass ``False`` to force a re-fetch
            (e.g. to refresh expediente / graphic URLs that we may have
            missed in an earlier ingest).

    Idempotent: existing sessions/votes/records are upserted by
    ``VoteImporter`` (it keys on ``(legislature, date)`` for the session
    row and ``(session_id, sequence_in_session)`` for each vote).
    """
    legislature_int = legislature_to_int(legislature_id)
    legislature_roman = legislature_to_roman(legislature_id)
    stats = BackfillStats(legislature=legislature_roman, legislature_int=legislature_int)

    async with CongresoClient() as client:
        portlet_html = await _fetch_portlet_html(client, legislature_roman)
        candidate_dates = parse_dias_votaciones(portlet_html)
        stats.days_in_calendar = len(candidate_dates)
        log.info(
            "congreso.backfill.calendar",
            legislature=legislature_roman,
            days=len(candidate_dates),
        )
        if not candidate_dates:
            log.warning(
                "congreso.backfill.no_calendar",
                legislature=legislature_roman,
            )
            return stats

        already = (
            await _already_imported_dates(db_session, chamber, legislature)
            if skip_already_imported
            else set()
        )
        stats.days_already_imported = sum(1 for d in candidate_dates if d in already)
        pending = [d for d in candidate_dates if d not in already]
        if only_first_n is not None:
            pending = pending[:only_first_n]
        total = len(pending)
        log.info(
            "congreso.backfill.pending",
            legislature=legislature_roman,
            already=stats.days_already_imported,
            pending=total,
            only_first_n=only_first_n,
        )

        for idx, target_date in enumerate(pending, start=1):
            stats.days_attempted += 1
            log.info(
                "backfill.legislature.progress",
                legislature=legislature_roman,
                date=target_date.isoformat(),
                found=idx,
                total=total,
            )
            try:
                bundle = await client.fetch_session_zip_for_date(legislature_roman, target_date)
            except Exception as e:
                stats.sessions_failed += 1
                stats.failed_dates.append(target_date.isoformat())
                log.warning(
                    "congreso.backfill.fetch_failed",
                    legislature=legislature_roman,
                    date=target_date.isoformat(),
                    error=str(e),
                )
                await asyncio.sleep(_RATE_LIMIT_DELAY_S)
                continue

            if bundle is None:
                stats.sessions_skipped_no_bundle += 1
                stats.skipped_dates.append(target_date.isoformat())
                log.info(
                    "congreso.backfill.skip.no_bundle",
                    legislature=legislature_roman,
                    date=target_date.isoformat(),
                )
                await asyncio.sleep(_RATE_LIMIT_DELAY_S)
                continue

            try:
                importer = VoteImporter(db_session, chamber, legislature)
                import_stats = await importer.import_session_zip(
                    session_number=bundle.ref.session_number,
                    vote_date=bundle.ref.date,
                    zip_bytes=bundle.zip_bytes,
                    expedientes_by_vote=bundle.expedientes_by_vote,
                    graphic_urls_by_vote=bundle.graphic_urls_by_vote,
                )
            except Exception as e:
                stats.sessions_failed += 1
                stats.failed_dates.append(target_date.isoformat())
                log.warning(
                    "congreso.backfill.import_failed",
                    legislature=legislature_roman,
                    session_number=bundle.ref.session_number,
                    date=target_date.isoformat(),
                    error=str(e),
                )
                await asyncio.sleep(_RATE_LIMIT_DELAY_S)
                continue

            stats.sessions_imported_now += 1
            stats.total_votes_added += import_stats.votes_created
            stats.total_records_added += import_stats.records_created
            log.info(
                "congreso.backfill.imported",
                legislature=legislature_roman,
                session_number=bundle.ref.session_number,
                date=target_date.isoformat(),
                votes_seen=import_stats.votes_seen,
                votes_created=import_stats.votes_created,
                records_created=import_stats.records_created,
            )
            await asyncio.sleep(_RATE_LIMIT_DELAY_S)

    log.info(
        "congreso.backfill.done",
        legislature=stats.legislature,
        days_in_calendar=stats.days_in_calendar,
        days_already_imported=stats.days_already_imported,
        days_attempted=stats.days_attempted,
        sessions_imported_now=stats.sessions_imported_now,
        sessions_skipped_no_bundle=stats.sessions_skipped_no_bundle,
        sessions_failed=stats.sessions_failed,
        total_votes_added=stats.total_votes_added,
        total_records_added=stats.total_records_added,
    )
    return stats


async def _fetch_portlet_html(client: CongresoClient, legislature_roman: str) -> str:
    """Fetch the votaciones portlet HTML for the chosen legislature."""
    # currentLegislatura is forced to XV (the active one) so the portlet
    # accepts our targetLegislatura without bouncing to the default.
    path = (
        "/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0"
        "&p_p_state=normal&p_p_mode=view"
        f"&targetLegislatura={legislature_roman}&currentLegislatura=XV"
    )
    return await client.fetch_html(path)
