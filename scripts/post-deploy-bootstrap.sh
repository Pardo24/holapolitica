#!/usr/bin/env bash
# Run on the production server (Hetzner) after a major code update.
#
# What this does (idempotent — safe to re-run):
#   1. Pulls the latest code from the public GitHub repo
#   2. Rebuilds the backend image so new Python deps land
#   3. Restarts the backend + worker so the new image is used
#   4. Re-ingests initiatives + latest votes with the updated lookup logic
#   5. Backfills the vote↔initiative linkage for the existing 1840 votes
#   6. Re-runs the photos backfill (now extracts birth_year too)
#   7. Enqueues the SDG classification for every initiative
#   8. Flushes Redis cache so the public site shows fresh numbers
#
# Usage on the server:
#   cd /opt/holapolitica
#   git pull
#   bash scripts/post-deploy-bootstrap.sh
#
# Estimated runtime: 10-25 minutes depending on Mistral rate-limit.

set -euo pipefail

COMPOSE="docker compose -f /opt/holapolitica/docker-compose.prod.yml"

echo "==> 1/8  Pulling latest code"
cd /opt/holapolitica
git pull --ff-only

echo "==> 2/8  Rebuilding backend image (new deps: aiosmtplib + others)"
$COMPOSE build backend

echo "==> 3/8  Restarting backend + worker"
$COMPOSE up -d backend worker

# Give the backend a moment to become healthy before we hit it with jobs.
until curl -sf http://127.0.0.1:8000/ >/dev/null; do
  sleep 2
done
echo "    backend is up"

echo "==> 4/8  Re-ingest initiatives + latest votes (idempotent)"
$COMPOSE exec -T backend python -m app.ingest.congreso.bootstrap initiatives
$COMPOSE exec -T backend python -m app.ingest.congreso.bootstrap latest_votes

echo "==> 5/8  Backfill vote↔initiative linkage for existing 1840 votes"
$COMPOSE exec -T backend python -m app.ingest.congreso.bootstrap link_votes_xv

echo "==> 6/8  Re-run photos backfill (now also extracts birth_year)"
$COMPOSE exec -T backend python -m app.ingest.congreso.bootstrap photos

echo "==> 7/8  Enqueue SDG / Agenda 2030 classification for every initiative"
$COMPOSE exec -T backend python -c "
from redis import Redis
from rq import Queue
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models import Initiative
from app.classify.service import ClassificationService
from app.classify.providers import build_classifier
import asyncio

async def enqueue_all_sdg():
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(Initiative.id))).scalars().all()
    print(f'enqueueing SDG classification for {len(rows)} initiatives')
    conn = Redis.from_url(get_settings().redis_url)
    q = Queue('classify', connection=conn)
    for iid in rows:
        # Re-uses classify_initiative; kind='sdg' targets the SDG taxonomy.
        q.enqueue('app.workers.jobs.classify_initiative', iid, kind='sdg', job_timeout=120)
    print('done')

asyncio.run(enqueue_all_sdg())
"

echo "==> 8/8  Flush Redis cache (so /stats and /topics show new data now)"
$COMPOSE exec -T redis redis-cli FLUSHDB

echo
echo "✓ Bootstrap complete."
echo "  Check progress with: $COMPOSE logs worker -f --tail 20"
echo "  Verify on the web:"
echo "    curl https://api.holapolitica.org/stats/summary"
echo "    curl https://api.holapolitica.org/groups/gp-popular/topic-stats | head -c 300"
echo "    curl https://api.holapolitica.org/persons?page_size=5 | grep -o 'birth_year[^,]*' | head -5"
