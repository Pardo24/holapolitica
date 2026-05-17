"""Cadence configuration for periodic ingest and newsletter jobs.

We use ``rq-scheduler``'s cron syntax. The scheduler must be run alongside
the worker (the same Redis connection picks up due jobs). To install
schedules at startup, run::

    python -m app.workers.schedule install

Re-running ``install`` is idempotent: each schedule is identified by a
stable id, and we cancel the previous version before recreating it. To
clear everything::

    python -m app.workers.schedule clear

Schedule choices:

- ``ingest_latest_votes`` — every 4 hours. Sessions land 24-48h after
  being held; we don't need to be tighter than that, but checking 6×/day
  costs nothing and keeps freshness reasonable.
- ``ingest_active_deputies`` — daily at 06:30. The portal regenerates the
  CSV/XML/JSON ~05:00, so this gives the publish job time to settle.
- ``ingest_initiatives`` — daily at 06:45.
- ``send_weekly_digest`` — Mondays at 09:00 Europe/Madrid (08:00 UTC).
  Gives a human time to add an editor's note via the preview endpoint
  before the send fires (TODO: a separate "scheduled but unsent" mode if
  we want a soft gate).
"""

from __future__ import annotations

import sys

from redis import Redis
from rq_scheduler import Scheduler  # type: ignore[import-untyped]

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.workers import jobs

configure_logging()
log = get_logger(__name__)


def _scheduler() -> Scheduler:
    return Scheduler(connection=Redis.from_url(get_settings().redis_url))


SCHEDULE_DEFINITIONS: list[tuple[str, str, str, object]] = [
    # (job_id, queue_name, cron_string, callable). Job IDs use dashes/underscores
    # only — rq.validate_job_id rejects dots.
    ("monitor-ingest-latest-votes", "ingest", "0 */4 * * *", jobs.ingest_latest_votes),
    ("monitor-ingest-deputies", "ingest", "30 6 * * *", jobs.ingest_active_deputies),
    ("monitor-ingest-initiatives", "ingest", "45 6 * * *", jobs.ingest_initiatives),
    # Upcoming agenda: daily at 08:00 (after the calendar publishes any
    # overnight Mesa decisions), plus an extra Monday 14:00 run because the
    # Mesa typically tweaks the week's pleno on Friday afternoon / Monday
    # morning. Cron is interpreted in Madrid local time (TZ=Europe/Madrid
    # passed to the rq-scheduler container env). See
    # ``docs/upcoming-votes-source.md`` §"Concrete ingest plan".
    (
        "monitor-ingest-upcoming-agenda",
        "ingest",
        "0 8 * * *",
        jobs.ingest_upcoming_agenda,
    ),
    (
        "monitor-ingest-upcoming-agenda-monday",
        "ingest",
        "0 14 * * 1",
        jobs.ingest_upcoming_agenda,
    ),
    ("monitor-newsletter-weekly", "newsletter", "0 8 * * 1", jobs.send_weekly_digest),
    # Bluesky distribution — runs 30 minutes AFTER each ingest cron so
    # newly-imported votes have a chance to land before we tweet. A no-
    # op when ``BLUESKY_ENABLE`` is false (the default); the job exits
    # cleanly without consuming the rate budget. Operator turns it on
    # by setting BLUESKY_HANDLE + BLUESKY_APP_PASSWORD in .env and
    # flipping BLUESKY_ENABLE=true, then re-running ``install``.
    (
        "monitor-social-bluesky",
        "newsletter",
        "30 */4 * * *",
        jobs.post_recent_votes_to_bluesky,
    ),
    # Open-data enrichment — Wikidata at 03:00 sets the per-locale
    # Wikipedia URLs, Wikipedia summary fetch follows at 03:30 to
    # ingest extracts for any newly-linked persons. Both idempotent.
    # BOE enrichment is NOT scheduled yet: the atom search endpoint our
    # client targets returns 404 against the live site. The job code
    # stays in place so we can switch it back on once the URL format is
    # rewritten against datos.boe.es. See app.ingest.boe.
    ("monitor-enrich-wikidata", "ingest", "0 3 * * *", jobs.enrich_persons_wikidata),
    ("monitor-enrich-wikipedia", "ingest", "30 3 * * *", jobs.enrich_persons_wikipedia),
]


def install() -> None:
    """(Re-)create every recurring schedule defined above."""
    sched = _scheduler()
    # Cancel any prior version with the same id before recreating.
    for existing in sched.get_jobs():
        if existing.id in {jid for jid, *_ in SCHEDULE_DEFINITIONS}:
            sched.cancel(existing)

    for job_id, queue_name, cron_string, fn in SCHEDULE_DEFINITIONS:
        sched.cron(
            cron_string,
            func=fn,
            id=job_id,
            queue_name=queue_name,
            use_local_timezone=False,
            repeat=None,
        )
        log.info("schedule.installed", job_id=job_id, cron=cron_string, queue=queue_name)


def clear() -> None:
    """Cancel every Monitor Parlamentari schedule (leaves user-created ones alone)."""
    sched = _scheduler()
    cancelled = 0
    for existing in sched.get_jobs():
        if existing.id.startswith("monitor-") or existing.id.startswith("monitor."):
            sched.cancel(existing)
            cancelled += 1
    log.info("schedule.cleared", count=cancelled)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"install", "clear"}:
        raise SystemExit("Usage: python -m app.workers.schedule {install|clear}")
    if sys.argv[1] == "install":
        install()
    else:
        clear()


if __name__ == "__main__":
    main()
