"""RQ worker runner.

Started by `docker compose up worker`. Listens on Redis queues and executes
background jobs (ingestion, classification, alert dispatching, newsletter
generation).

For now this is a minimal scaffold — no jobs are registered yet. As we add
features, they'll define their job functions and enqueue them from API
endpoints or scheduled tasks.
"""

from __future__ import annotations

from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger

configure_logging()
log = get_logger(__name__)


# Queue names we plan to use:
# - default: catch-all
# - ingest: data ingestion from external sources
# - classify: LLM-based topic classification
# - alerts: email dispatch
# - newsletter: weekly digest generation
QUEUE_NAMES = ["default", "ingest", "classify", "alerts", "newsletter", "push"]


def main() -> None:
    settings = get_settings()
    redis_conn = Redis.from_url(settings.redis_url)
    queues = [Queue(name, connection=redis_conn) for name in QUEUE_NAMES]

    log.info("worker.starting", queues=QUEUE_NAMES)
    worker = Worker(queues, connection=redis_conn)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
