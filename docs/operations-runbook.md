# Operations runbook — May 2026

Concrete commands to execute on the production server to clear the
operational backlog described in
[backlog_pending.md](../memory/backlog_pending.md) and
[roadmap.md §2](roadmap.md).

> Last updated: 2026-05-12.
> All commands assume you are SSH'd into the Hetzner host as the
> `monitorparlamentari` user with the project checked out at
> `~/monitor-parlamentari` and `docker compose` running.

---

## Step 1 — Upgrade Mistral La Plateforme to Tier 1 (5 €/mes)

The free tier gives you **1 request per minute**, which makes every
LLM batch run hit 429s. Tier 1 gives **60 RPM** and unblocks the
queue of ~860 plain-summary regenerations and ~430 SDG
classifications.

### 1.1 Pay

1. Open <https://console.mistral.ai/billing>.
2. Sign in with the project account.
3. Click **"Add payment method"** → SEPA or card.
4. Upgrade to **"La Plateforme Tier 1"** — 5 €/month flat, paid
   monthly. Cancel anytime.
5. Confirm. The console shows `Plan: Tier 1` and the rate-limit
   counters jump to 60 RPM.

### 1.2 Verify from the server

```bash
ssh monitorparlamentari@178.105.128.194
cd ~/monitor-parlamentari
docker compose exec backend python -c "
import asyncio
from app.classify.providers.mistral import MistralClassifier
async def main():
    c = MistralClassifier()
    out = await c.classify_text('Proposición de Ley sobre violencia de género', kind='theme')
    print(out)
asyncio.run(main())
"
```

If you get a topic suggestion back without a 429, the tier change has
propagated.

### 1.3 What unblocks (now safe to run — see Step 4 below)

- Plain-summary regeneration with `object_text` as the LLM input
  (massive quality improvement over the current title-only summaries).
- SDG classification of all 430 initiatives.
- Vote-level plain summaries.

Without Tier 1, each of these takes 10-14 hours of overnight
trickle-running with sleep retries. With Tier 1, ~15 minutes.

---

## Step 2 — Ingest PNLs (closes the biggest data gap)

The PNL scraper is already implemented at
`backend/app/ingest/congreso/pnl.py` and registered as the `pnl_xv`
step. It scrapes the Liferay search portlet for series 162
(Proposiciones no de Ley) and upserts them via the standard
`InitiativeImporter`.

### 2.1 Run the importer

```bash
cd ~/monitor-parlamentari
docker compose exec backend python -m app.ingest.congreso.bootstrap pnl_xv
```

Expected output (≈13 minutes):

```
congreso.pnl.total legislature=XV tipo=162 total=789
congreso.pnl.fetch legislature=XV page=1 tipo=162
...
congreso.pnl.import.done legislature=XV parsed_ok=789 parse_errors=0 created=789 updated=0 skipped=0
```

~789 new initiative rows. Idempotent — safe to re-run.

### 2.2 Link votes ↔ initiatives

Once the PNLs are in, the linkage backfill runs across every vote
with an unmatched `expediente_raw` and fills in the `initiative_id`
foreign key.

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap link_votes_xv
```

Expected output (~2 minutes):

```
congreso.backfill.start total_unlinked=1300
congreso.backfill.matched 162-series=720 173-series=0 121-series=140
congreso.backfill.done linked=860 still_unmatched=440
```

The 440 remaining are mostly:
- Mociones (series 173) — pending its own scraper.
- Real Decreto-ley convalidations (series 130).
- Constitutional reform votes (series 102).

These are separate PRs; see [roadmap §2](roadmap.md).

### 2.3 Verify on the public API

```bash
curl https://api.holapolitica.org/votes/1826 | jq '.initiative_id'
curl https://api.holapolitica.org/votes/1827 | jq '.initiative_id'
```

Both should return integers (not `null`). Spot-check the linked
initiative page in the UI: `https://holapolitica.org/initiatives/<id>`.

---

## Step 3 — Regenerate plain summaries with `object_text` as input

The current `plain_summary_*` fields were generated from the title
alone, because `object_text` (the bill's full preámbulo) hadn't been
extracted yet. Now that it is, regenerating with the full text gives
much better summaries.

### 3.1 Reset existing summaries

```bash
docker compose exec backend python -c "
import asyncio
from sqlalchemy import update
from app.db.session import AsyncSessionLocal
from app.models import Initiative
async def main():
    async with AsyncSessionLocal() as s:
        await s.execute(
            update(Initiative)
            .where(Initiative.object_text.is_not(None))
            .values(plain_summary_ca=None, plain_summary_es=None)
        )
        await s.commit()
        print('reset')
asyncio.run(main())
"
```

### 3.2 Re-enqueue the LLM jobs

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap plain_summaries
docker compose exec backend python -m app.ingest.congreso.bootstrap plain_summaries_es
```

With **Mistral Tier 1**: ~15 minutes per language → 30 min total.
With **free tier**: ~7 hours per language → run overnight.

### 3.3 Re-enqueue the vote-level summaries

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap vote_plain_summaries
docker compose exec backend python -m app.ingest.congreso.bootstrap vote_plain_summaries_es
```

### 3.4 Flush the API cache

```bash
docker compose exec redis redis-cli FLUSHDB
```

---

## Step 4 — Classify every initiative under an SDG

Powers the new `/agenda-2030` page (now empty for most SDGs until
this runs).

```bash
docker compose exec backend python -c "
from app.workers.queue import enqueue
from app.db.session import AsyncSessionLocal
from sqlalchemy import select
from app.models import Initiative
import asyncio
async def main():
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(Initiative.id))).scalars().all()
        for iid in rows:
            enqueue('classify_initiative', iid, 'sdg')
        print(f'enqueued {len(rows)} jobs')
asyncio.run(main())
"
```

With **Tier 1**: ~7 minutes for all 430 initiatives.
With **free tier**: ~7 hours.

Watch the queue:

```bash
docker compose exec redis redis-cli LLEN rq:queue:default
```

### Verify on the UI

Once done, `https://holapolitica.org/agenda-2030` should show a
non-zero count under each of the 17 SDG cards (some will be very
small — e.g. SDG-14 *Life below water* — and that's the honest
result; the page renders the empty state explicitly).

---

## Step 5 — Re-scrape hemicycle seat positions

The Mesa periodically reassigns seats (substitutions, group switches).
Run monthly to keep the chamber visualisation accurate.

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap hemicycle_xv
```

Expected output (~30 seconds):

```
congreso.hemicycle.fetched seats=350
congreso.hemicycle.matched matched=350 unmatched=0
```

If `unmatched > 0`, a new deputy has joined whose photo importer
hasn't run yet. Run `bootstrap deputies` then re-run hemicycle.

---

## Step 6 — Production smoke test

After running steps 1-4:

```bash
# API health
curl -fsS https://api.holapolitica.org/healthz | jq

# Sample initiative with object_text-driven summary
curl -fsS https://api.holapolitica.org/initiatives/371 | jq '.plain_summary_ca, .topics'

# Stats endpoint freshness
curl -fsS https://api.holapolitica.org/stats/topics-global | jq 'length'
```

All three should return non-empty data in under 500ms.

UI smoke:
- <https://holapolitica.org/votes> loads in < 1.5s
- <https://holapolitica.org/agenda-2030> shows non-zero counts for at
  least 5 SDGs
- <https://holapolitica.org/initiatives/371> shows the AI summary
- <https://holapolitica.org/recorregut> renders the 8-step diagram

---

## Step 7 — Document what changed in `docs/STATUS.md`

After each operational pass, append a dated note:

```markdown
## 2026-05-12

- Mistral Tier 1 activated.
- PNL ingest complete: 789 PNLs / 720 vote↔initiative links.
- Plain summaries regenerated with `object_text`: 430 × 2 languages.
- SDG classification: 17/17 SDGs with ≥1 classified initiative.
- Hemicycle re-scraped.
```

This is what funders read first when they audit the project's
operational discipline.

---

## Total runtime (with Mistral Tier 1)

| Step | Time |
|---|---|
| 1. Mistral upgrade | 5 min |
| 2. PNL ingest + link backfill | 15 min |
| 3. Plain summaries (CA + ES + votes ×2) | 60 min |
| 4. SDG classification | 7 min |
| 5. Hemicycle | 30 s |
| 6. Smoke test | 5 min |
| 7. Update STATUS.md | 5 min |
| **TOTAL** | **~95 minutes** |

This is the single highest-leverage operations pass available today.
After it, you can credibly say "Hola Política covers ~95% of XV
legislature plenary activity with topic classification, plain summaries
and SDG mapping". That sentence is the spine of the NLnet pitch.
