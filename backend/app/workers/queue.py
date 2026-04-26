"""Helpers for enqueuing background jobs from API endpoints and importers."""

from __future__ import annotations

from functools import lru_cache

from redis import Redis
from rq import Queue

from app.core.config import get_settings
from app.workers import jobs


@lru_cache(maxsize=1)
def _redis() -> Redis:
    return Redis.from_url(get_settings().redis_url)


def enqueue_classify_initiative(initiative_id: int) -> str:
    """Enqueue a classification job and return the RQ job id."""
    queue = Queue("classify", connection=_redis())
    job = queue.enqueue(jobs.classify_initiative, initiative_id)
    return job.id


def enqueue_ingest_latest_votes() -> str:
    queue = Queue("ingest", connection=_redis())
    return queue.enqueue(jobs.ingest_latest_votes).id


def enqueue_ingest_active_deputies() -> str:
    queue = Queue("ingest", connection=_redis())
    return queue.enqueue(jobs.ingest_active_deputies).id


def enqueue_ingest_initiatives() -> str:
    queue = Queue("ingest", connection=_redis())
    return queue.enqueue(jobs.ingest_initiatives).id


def enqueue_send_weekly_digest(*, dry_run: bool = False) -> str:
    queue = Queue("newsletter", connection=_redis())
    return queue.enqueue(jobs.send_weekly_digest, dry_run=dry_run).id


def enqueue_push_fanout(vote_id: int) -> str:
    """Enqueue a per-vote Web Push fan-out and return the RQ job id."""
    queue = Queue("push", connection=_redis())
    return queue.enqueue(jobs.fan_out_vote_push, vote_id).id
