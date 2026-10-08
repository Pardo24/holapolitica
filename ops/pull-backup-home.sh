#!/usr/bin/env bash
# Offsite copy of the production database dumps, pulled from home.
#
# Runs on the home server (Nubul), not on the VM: the VM's daily dumps
# (ops/pg-backup.sh, 03:30 UTC) only protect against a bad migration or a
# corrupted table, because they sit on the same disk as the database. This
# pulls them to the home NAS, so losing the VM no longer loses the data.
#
# Access is read-only by construction: on the VM the user ``hpbackup`` has
# one key, forced to ``rrsync -ro /var/backups/holapolitica`` with
# ``restrict`` (no shell, no forwarding). This key can read the dumps and
# nothing else.
#
# Keeps 60 days at home (the VM keeps 14 dailies and 8 weeklies). A failed
# pull, or a newest dump older than 36 h, sends an ntfy alert.
#
# Install (home server, user dani):
#   ~/.ssh/hp_backup_ed25519   (key whose .pub is in hpbackup's authorized_keys)
#   crontab: 15 8 * * * /home/dani/Nubul/scripts/holapolitica-backup-pull.sh >> /home/dani/Nubul/scripts/holapolitica-backup-pull.log 2>&1
set -uo pipefail

DEST=${DEST:-/mnt/nas/backups/holapolitica}
KEY=${KEY:-$HOME/.ssh/hp_backup_ed25519}
SRC=${SRC:-hpbackup@178.105.128.194}
KEEP_DAYS=${KEEP_DAYS:-60}
ENV_FILE=${ENV_FILE:-/home/dani/Nubul/.env}
NTFY_URL=${NTFY_URL:-https://ntfy.nubul.art/nubul}

notify() {
  local token
  token="$(grep -E '^NTFY_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)"
  [ -n "$token" ] || { echo "no NTFY_TOKEN, cannot alert: $1"; return; }
  curl -s -H "Authorization: Bearer $token" -H "Title: $1" -H "Priority: high" \
    -H "Tags: warning,floppy_disk" -d "$2" "$NTFY_URL" >/dev/null || true
}

mkdir -p "$DEST"

if ! rsync -a --timeout=180 \
  -e "ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20" \
  "$SRC:./" "$DEST/"; then
  notify "Hola Política: còpia externa fallida" \
    "No s'han pogut baixar les còpies de la base de dades del servidor a Nubul."
  exit 1
fi

newest=$(find "$DEST/daily" -name '*.dump' -mmin -$((36 * 60)) -printf '%f\n' 2>/dev/null | sort | tail -1)
if [ -z "$newest" ]; then
  notify "Hola Política: còpia externa antiga" \
    "La còpia més recent baixada a Nubul té més de 36 hores. Revisa el backup del servidor."
  exit 1
fi

find "$DEST/daily" -name '*.dump' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
echo "$(date -Is) ok $newest"
