#!/bin/sh
# Is anything broken right now?
#
# Nobody was watching: `sentry_dsn` exists in the settings and was never
# wired up, and there was no uptime check, so a backend that fell over on a
# Sunday stayed down until someone happened to open the site.
#
# Checks, in the order they matter:
#  1. the containers are running;
#  2. the API answers /health;
#  3. the public site answers (DNS, Vercel and the edge, not just this box);
#  4. the cron daemon is actually firing (rq-scheduler's next-run scores
#     drift into the past when it dies — that exact failure silently stalled
#     every ingest for three weeks in June);
#  5. yesterday's backup exists.
#
# Alerts are edge-triggered: one mail when something breaks, one when it
# recovers. A check that mails every ten minutes gets filtered, and then it
# is worth nothing.
set -eu

STATE=${MONITOR_STATE:-/var/lib/holapolitica-monitor.state}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/holapolitica}
NOTIFY="$(dirname "$0")/notify.sh"
PROBLEMS=""

note() { PROBLEMS="$PROBLEMS- $1\n"; }

for c in holapolitica-backend-1 holapolitica-worker-1 holapolitica-rqscheduler-1 \
         holapolitica-postgres-1 holapolitica-redis-1; do
  state=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo missing)
  [ "$state" = "true" ] || note "the container $c is not running ($state)"
done

curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:8000/health \
  || note "the API does not answer /health on the box"

curl -fsS --max-time 20 -o /dev/null https://www.holapolitica.org/ \
  || note "the public site does not answer"

# rq-scheduler: the earliest scheduled job should be in the future. An hour
# of slack absorbs a job that is running right now.
# Raw output is two lines, the job id then its score; --no-raw numbers the
# lines and that numbering ended up inside the value, so this check always
# reported that it could not read them.
NEXT=$(docker exec holapolitica-redis-1 redis-cli zrange rq:scheduler:scheduled_jobs 0 0 WITHSCORES 2>/dev/null \
        | tail -1 | tr -cd '0-9' || true)
if [ -n "${NEXT:-}" ] && [ "$NEXT" -gt 0 ] 2>/dev/null; then
  NOW=$(date -u +%s)
  [ "$NEXT" -gt $((NOW - 3600)) ] \
    || note "the cron jobs are overdue: the next one was due $(( (NOW - NEXT) / 3600 ))h ago (is rqscheduler alive?)"
else
  note "cannot read the scheduled jobs from redis"
fi

LAST=$(cat "$BACKUP_ROOT/last-success" 2>/dev/null || echo 0)
NOW=$(date -u +%s)
[ "$LAST" -gt $((NOW - 129600)) ] \
  || note "the last successful backup is more than 36h old"

PREVIOUS=$(cat "$STATE" 2>/dev/null || echo ok)

if [ -n "$PROBLEMS" ]; then
  echo "problems"
  printf '%b' "$PROBLEMS" >&2
  if [ "$PREVIOUS" != "problems" ]; then
    printf 'Hola Política, %s UTC\n\n%b\nThis mail is sent once, when the state changes.\n' \
      "$(date -u)" "$PROBLEMS" \
      | "$NOTIFY" "[Hola Política] Alguna cosa ha caigut" || true
  fi
  echo problems > "$STATE"
  exit 1
fi

if [ "$PREVIOUS" = "problems" ]; then
  printf 'Everything answers again, %s UTC.\n' "$(date -u)" \
    | "$NOTIFY" "[Hola Política] Tot torna a respondre" || true
fi
echo ok > "$STATE"
echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') ok"
