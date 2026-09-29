#!/bin/sh
# Daily backup of the production database.
#
# Until this existed, the whole dataset lived on one disk: 16k votes, the
# 2011-2026 historical backfill and thousands of generated summaries. The
# Congress can be scraped again; the summaries cost money and days.
#
# Design notes:
#  - ``pg_dump -Fc`` (custom format): compressed, and restorable table by
#    table, which matters when the accident is "one bad migration" rather
#    than "the disk died".
#  - Every dump is READ BACK with ``pg_restore --list``. An unverified dump
#    is not a backup; a truncated file looks fine until the day you need it.
#  - A dump much smaller than the previous one is treated as suspicious and
#    reported, because that is what a half-written or half-empty database
#    looks like.
#  - Retention: 14 dailies, plus Sunday copies kept for 8 weeks. The weekly
#    is a hard link, so it costs no extra disk.
#
# Offsite is NOT handled here: this protects against a bad migration, a
# dropped table or a corrupted database, not against losing the machine.
# See ops/README.md.
set -eu

CONTAINER=${PG_CONTAINER:-holapolitica-postgres-1}
ROOT=${BACKUP_ROOT:-/var/backups/holapolitica}
DAILY="$ROOT/daily"
WEEKLY="$ROOT/weekly"
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
NOTIFY="$(dirname "$0")/notify.sh"
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="$DAILY/holapolitica-$STAMP.dump"

fail() {
  echo "backup FAILED: $1" >&2
  printf '%s\n\nHost: %s\nTime: %s UTC\n' "$1" "$(hostname)" "$(date -u)" \
    | "$NOTIFY" "[Hola Política] La còpia de seguretat ha fallat" || true
  exit 1
}

mkdir -p "$DAILY" "$WEEKLY"

# Previous dump size, to sanity-check the new one against.
PREV=$(ls -t "$DAILY"/*.dump 2>/dev/null | head -1 || true)
PREV_SIZE=0
[ -n "$PREV" ] && PREV_SIZE=$(wc -c < "$PREV")

docker exec "$CONTAINER" sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE.part" \
  || fail "pg_dump did not complete"
mv "$FILE.part" "$FILE"

docker exec -i "$CONTAINER" pg_restore --list > /dev/null < "$FILE" \
  || fail "the dump does not read back ($FILE)"

SIZE=$(wc -c < "$FILE")
[ "$SIZE" -gt 1000000 ] || fail "the dump is only $SIZE bytes ($FILE)"
if [ "$PREV_SIZE" -gt 0 ] && [ "$SIZE" -lt $((PREV_SIZE / 2)) ]; then
  fail "the dump halved: $SIZE bytes against $PREV_SIZE the day before ($FILE)"
fi

# Sunday's dump also becomes that week's keeper.
[ "$(date -u +%u)" = "7" ] && ln -f "$FILE" "$WEEKLY/$(basename "$FILE")"

# Retention, newest first.
ls -t "$DAILY"/*.dump 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f
ls -t "$WEEKLY"/*.dump 2>/dev/null | tail -n +$((KEEP_WEEKLY + 1)) | xargs -r rm -f

date -u +%s > "$ROOT/last-success"
echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') ok $FILE $SIZE bytes"
