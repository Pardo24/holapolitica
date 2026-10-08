# Operations

Scripts that run on the Hetzner VM, in the repo so they survive a rebuild of
the machine and so a change to them is reviewable like any other change.

Install (as root, on the box):

```sh
cd /opt/holapolitica && git pull --ff-only
chmod +x ops/*.sh
cp ops/cron.d-holapolitica /etc/cron.d/holapolitica
```

And, once, add the mailbox that should receive alerts to `/opt/holapolitica/.env`:

```
OPS_ALERT_EMAIL=dades@holapolitica.org
```

## pg-backup.sh — daily at 03:30 UTC

`pg_dump -Fc` of the production database into `/var/backups/holapolitica`,
**read back with `pg_restore --list`** before it counts as a backup, and
compared against the previous day's size so a half-written or half-empty
dump is reported instead of quietly replacing a good one.

Retention: 14 dailies, plus Sunday's dump hard-linked into `weekly/` and kept
for 8 weeks. At ~150 MB a dump that is a couple of GB on a disk with 29 GB
free.

### Restoring

```sh
# Inspect what is in an archive without touching anything:
docker exec -i holapolitica-postgres-1 pg_restore --list < /var/backups/holapolitica/daily/<file>.dump | head -40

# One table back into the live database:
docker exec -i holapolitica-postgres-1 pg_restore -U holapolitica -d holapolitica \
  --data-only --table=votes < /var/backups/holapolitica/daily/<file>.dump

# Everything, into a scratch database first — never straight over the live one:
docker exec holapolitica-postgres-1 createdb -U holapolitica holapolitica_restore
docker exec -i holapolitica-postgres-1 pg_restore -U holapolitica -d holapolitica_restore \
  < /var/backups/holapolitica/daily/<file>.dump
```

### What this does NOT protect against

Losing the machine. The dumps sit on the same disk as the database, so this
covers a bad migration, a dropped table or a corrupted database, and nothing
else. Offsite needs a destination and a credential, which are decisions for
the operator:

- **Hetzner Storage Box** (about €4/month for 1 TB) is the obvious one here,
  since it is a `scp`/`rsync` target in the same datacentre. Add a key and
  one line to the backup script.
- **Backblaze B2 / S3** via `rclone`, which would have to be installed.
- A pull from a machine at home: safest of all, because the credential lives
  on the machine doing the pulling and the server holds nothing.

**Done (2026-10-08): pull from home.** `ops/pull-backup-home.sh` runs on the
home server (Nubul) every day at 08:15 local time and copies
`/var/backups/holapolitica` to `/mnt/nas/backups/holapolitica`, keeping 60
days. On the VM the user `hpbackup` has a single key forced to
`rrsync -ro /var/backups/holapolitica` with `restrict`: it can read the
dumps and nothing else (no shell). A failed pull, or a newest dump older
than 36 h, sends an ntfy alert. First pull verified by checksum against the
VM's copy.

### Scaling for a traffic peak

The API runs `UVICORN_WORKERS` processes (default 2, set in
`/opt/holapolitica/.env`). After resizing the VM (4 vCPU / 8 GB), set
`UVICORN_WORKERS=4` there and recreate the backend:
`docker compose -f docker-compose.prod.yml up -d backend`.

Encrypt before it leaves the box: the dump carries newsletter subscribers'
email addresses and their confirmation tokens. `gpg --symmetric` is already
installed.

## healthcheck.sh — every 10 minutes

Containers running, `/health` answering on the box, the public site
answering, rq-scheduler's next run not drifting into the past (the exact
failure that silently stalled every ingest for three weeks in June 2026) and
a backup newer than 36 hours.

Edge-triggered: one mail when something breaks, one when it recovers. A
check that mails every ten minutes gets filtered, and then it is worth
nothing.

## notify.sh

Sends the mail from inside the backend container, which already holds the
SMTP credentials, so there is no second mail setup to keep alive. Reads the
recipient from `OPS_ALERT_EMAIL`; without it, it logs and exits 0 rather
than failing a backup over a missing mailbox.
