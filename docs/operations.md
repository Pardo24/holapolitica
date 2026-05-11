# Operations — how data flows through the system

This is the runbook for keeping Monitor Parlamentari fresh. Read once,
revisit when something looks wrong on the live site.

## Cadence

The scheduler ([`app/workers/schedule.py`](../backend/app/workers/schedule.py))
defines four periodic jobs. They live in Redis once installed; the
``worker`` Docker service picks them up.

| When | Job | What it does |
|---|---|---|
| Every 4h | `ingest_latest_votes` | Scrape the votes listing page, download the latest session ZIP if we haven't seen it, parse all per-vote XML, upsert votes + per-deputy records. **Forward-only.** Cheap, idempotent. |
| Daily 06:30 UTC | `ingest_active_deputies` | Refresh the 350-row active deputies snapshot. The portal regenerates its files at ~05:00 UTC, so 06:30 is safe. |
| Daily 06:45 UTC | `ingest_initiatives` | Refresh the three initiative datasets (Proyectos, Proposiciones, Reformas). **Auto-enriches new rows** with topic classification + plain-language summaries (CA + ES) — see `bootstrap.import_initiatives`. |
| Mondays 08:00 UTC | `send_weekly_digest` | Build the weekly Listmonk newsletter. Skips silently if the digest is empty for the period. |

## First-time activation

Once per deployment:

```sh
# 1. Bring up postgres + redis if they're not running
docker compose up -d postgres redis

# 2. Apply any pending migrations
docker compose run --rm backend alembic upgrade head

# 3. Bring up the worker — it auto-runs `with_scheduler=True`
docker compose up -d worker

# 4. Install the cron schedules into Redis (idempotent, safe to re-run)
docker compose run --rm backend python -m app.workers.schedule install
```

To clear all schedules: `docker compose run --rm backend python -m app.workers.schedule clear`.

## What each job costs

- **`ingest_latest_votes`** — zero LLM, just HTTP. Few seconds when there's
  a new session, milliseconds when there's not. Idempotent.
- **`ingest_active_deputies`** — zero LLM. Refreshes 350 rows in a single
  upsert pass. ~2 seconds.
- **`ingest_initiatives`** — light HTTP for the three feeds. THEN, for
  each initiative *newly* created in this run, fires the LLM:
  - 1 classification call (Mistral Small)
  - 2 summary calls (CA + ES)
  - = 3 LLM calls per new initiative ≈ $0.0003 each at Mistral pricing
  - For ~50 new initiatives a week: ~$0.015/week. Trivial.
- **`send_weekly_digest`** — zero LLM. SQL queries + HTML render + Listmonk
  API call.

## Manual one-shots

The scheduler steps are also the one-shot `bootstrap` subcommands. Run
manually from the host:

```sh
# Bring data up to current state (idempotent)
docker compose run --rm backend python -m app.ingest.congreso.bootstrap deputies
docker compose run --rm backend python -m app.ingest.congreso.bootstrap latest_votes
docker compose run --rm backend python -m app.ingest.congreso.bootstrap initiatives  # auto-enriches new rows

# Backfill operations (one-time)
docker compose run --rm backend python -m app.ingest.congreso.bootstrap photos        # ~2 min
docker compose run --rm backend python -m app.ingest.congreso.bootstrap classify      # ~7 min, all initiatives
docker compose run --rm backend python -m app.ingest.congreso.bootstrap plain_summaries     # CA, ~10 min
docker compose run --rm backend python -m app.ingest.congreso.bootstrap plain_summaries_es  # ES, ~10 min
```

`classify` and `plain_summaries*` are idempotent: they skip rows that
already have the relevant column populated. To force a regeneration,
clear the column first via SQL.

## Newsletter — first activation

The weekly digest is built and rendered automatically (Mondays 08:00 UTC)
but Listmonk has to be reachable for the campaign to actually go out.
Until `LISTMONK_BASE_URL` is set the job logs `newsletter.listmonk.unavailable`
and exits cleanly — it does **not** crash the worker.

### 1. Bring up Listmonk

We deploy Listmonk as a sidecar container. Once it's running, log in to
the admin UI (default `http://localhost:9000`) and:

1. **Settings → Users → New** → create an API user (e.g.
   `monitor-backend`). Save the API key shown — you cannot retrieve it
   later. Grant it permissions on **Campaigns** and **Lists**.
2. **Lists → New** → create the public newsletter list (double-opt-in
   recommended). The list id appears in the URL of the list edit page,
   e.g. `/admin/lists/3` → id is `3`.

### 2. Wire the env vars

In `.env`:

```sh
LISTMONK_BASE_URL=http://listmonk:9000   # or http://localhost:9000 when running outside compose
LISTMONK_API_USER=monitor-backend
LISTMONK_API_KEY=<the API key from step 1>
LISTMONK_LIST_ID=3
SMTP_FROM_EMAIL=newsletter@yourdomain.org   # used as the campaign From: address
```

Restart the worker so it reloads settings:

```sh
docker compose restart worker
```

### 3. Test with a dry run

The dry-run path renders the digest and creates a **draft** campaign in
Listmonk. Nothing is sent. Subscribers don't receive anything. The draft
is visible at `http://localhost:9000/admin/campaigns`.

> **Heads up:** the `bootstrap` CLI also imports the agenda module which
> depends on `pypdf`. If your image was built before pypdf was added to
> `pyproject.toml`, run `docker compose build backend` first.

```sh
docker compose run --rm backend python -m app.ingest.congreso.bootstrap send_weekly_digest_now
```

Idempotent: re-running in the same ISO week returns the same draft
campaign id (named `monitor-weekly-YYYY-Www`) without creating a duplicate.

If you only want to verify the renderer side (no Listmonk needed) you
can call the preview endpoint instead:

```sh
curl -s "http://localhost:8000/admin/newsletter/preview?period_days=7" | head -50
```

The job logs:

- `newsletter.empty.skip` if the past 7 days had no votes / initiatives
  (in which case nothing is created — never send an empty digest)
- `newsletter.listmonk.unavailable` if env vars are missing
- `newsletter.digest.dry_run` with the campaign id, subject, body
  character count, and section counters when the dry run succeeds

### 4. Send the first real campaign

After previewing the draft in the Listmonk admin and confirming it looks
right, you have two options:

- Promote the **draft** to running directly inside Listmonk admin (click
  "Start"). Recommended for the first send: you stay in control.
- Or, run the explicit "send" step from the bootstrap CLI:

  ```sh
  docker compose run --rm backend python -m app.ingest.congreso.bootstrap send_weekly_digest_now_send
  ```

  This will create-or-reuse the same `monitor-weekly-YYYY-Www`
  campaign and flip its status to `running`. Idempotent: if the
  campaign is already running or finished it's left alone.

### 5. Verify the schedule is installed

```sh
docker compose run --rm backend python -m app.workers.schedule install
```

The Monday 08:00 UTC `monitor-newsletter-weekly` job will then call
`send_weekly_digest()` (no dry-run) every week. The same idempotency
applies: if you've already run a real send for the current ISO week,
the cron job won't re-send.

## What's NOT yet automated

- **Historical session backfill** (sessions 1-176 of legislature XV).
  Forward-only is the live behaviour today; historical depends on the
  Liferay AJAX research currently in progress (see
  `docs/research-similar-projects.md`).
- **Photo refresh** (`photos` step) is a one-shot. New deputies who
  arrive mid-legislature get NO photo until we re-run it.
- **Vote → initiative linking**. Most current votes (PNL, Mocions,
  RDLs) don't have `vote.initiative_id` set because their type codes
  (162, 173, 130, 102) aren't in the three opendata initiative feeds.
  When they appear, our auto-enrichment will populate them.

## Observability — how to know it's running

- Worker logs: `docker compose logs -f worker`. Each job logs structured
  events (`bootstrap.*.starting`, `*.done`, `bootstrap.*.error`).
- Database freshness query:

  ```sql
  SELECT
      MAX(s.date) AS last_session_date,
      MAX(v.created_at) AS last_vote_ingested_at,
      MAX(i.created_at) AS last_initiative_ingested_at,
      MAX(i.plain_summary_generated_at) AS last_summary_generated_at
  FROM sessions s
  LEFT JOIN votes v ON v.session_id = s.id
  LEFT JOIN initiatives i ON TRUE;
  ```

- Listmonk admin (http://localhost:9000) shows past campaigns and their
  status.

## When things go wrong

Each job catches per-row errors and logs them, so a single transient
failure (Mistral timeout, portal hiccup) doesn't kill the batch. Rows
that errored stay NULL on the relevant columns and the next run picks
them up. If a whole job fails (e.g. portal returns 500 on the listing
page itself), RQ records the failure and the next scheduled run
retries.
