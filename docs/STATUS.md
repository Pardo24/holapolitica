# Status

Última actualització: 2026-05-08 (sessió autònoma — pendent de revisió de Daniel)

## Phase

**Phase 1 — Live data + MVP backend & frontend.** End-to-end ingest of the
Spanish XV legislature is working against the live portal: deputies,
initiatives, and the latest session of votes. API exposes search, detail
and aggregate metrics endpoints. Frontend has list + detail pages for
votes, persons and topics. Subscriptions and newsletter are scaffolded.

## What works (verified end-to-end)

- **Backend boots and migrations apply cleanly** (3 migrations).
- **Active-deputy importer** — `python -m app.ingest.congreso.bootstrap deputies`. Live run on 2026-05-08: 350 persons, 350 mandates, 9 parliamentary groups, 350 open group memberships. Idempotent (re-running creates 0 rows).
- **Vote importer (forward-only)** — `... bootstrap latest_votes`. Live run: 12 votes from session 177 (2026-04-30) and all 4,200 individual `vote_records`. Idempotent. Vote-to-group attribution looks up `GroupMembership` open on the vote's date, not the deputy's current group. Vote→initiative linking implemented per the proyecto-colibri pattern: scrape `(Núm. expte. NNN/NNNNNN)` from the votes listing HTML, store in `votes.expediente_raw`, and resolve to `votes.initiative_id` if a matching `Initiative` row exists. End-to-end verified: all 12 session-177 votes carry an expediente; 0 link to initiatives today only because the relevant initiative type codes (PNL, Moción, RDL) are not in the iniciativas opendata feed yet.
- **Initiative importer** — `... bootstrap initiatives`. Live run: 92 ProyectosDeLey + 336 ProposicionesDeLey + 2 PropuestasDeReforma = 430 initiatives. Status (approved / rejected / in_debate / submitted / withdrawn / expired) inferred from `RESULTADOTRAMITACION` and `SITUACIONACTUAL`.
- **Aggregate metrics endpoints** — `/metrics/{cohesion,coincidence,attendance,dissidence}`. Computed on demand via SQL (no cached tables yet). All returns are full matrices/full lists per the symmetry rule in CLAUDE.md.
- **Subscription endpoints** — `POST /alerts`, `POST /newsletter`, `GET /confirm/{kind}/{token}`, `DELETE /unsubscribe/{kind}/{token}`. Email sender falls back to `LogSender` when SMTP is not configured (so dev sees the confirmation token in logs).
- **Frontend pages** — list of votes (`/votes`), vote detail (`/votes/[id]` with cohesion table), person detail (`/persons/[id]` with mandates), topic detail (`/topics/[slug]` with recent votes). All three detail pages verified end-to-end against live data (vote 2 → PNL "Rebutjada" with GP Popular cohesion row; person 2 → Santiago Abascal Madrid/VOX; topic `habitatge` → Catalan+Spanish names + "no votes yet" message). Translations live in `messages/{ca,es,en}.json`.
- **Newsletter pipeline end-to-end** — Listmonk integration verified live on 2026-05-08. `send_weekly_digest` against the populated period (24-30/04/2026) creates a campaign in Listmonk via API. SMTP not yet configured at Listmonk's side, so subscribers won't receive mail until either Mailpit or a transactional provider is wired in (the digest itself rendered correctly: 8.3 KB of inline-styled HTML, subject `Monitor Parlamentari — 24–30/04/2026 (12 votacions)`).
- **68 unit tests passing**, **mypy --strict clean** across 42 source files.

## What's scaffolded but not live (needs credentials or config)

- **LLM topic classifier**. `app/classify/` has Mistral, Anthropic and Qwen providers, a strict-output prompt and full JSON parsing. RQ job `classify_initiative(id)` is registered. **Blocked on `MISTRAL_API_KEY` (or `ANTHROPIC_API_KEY`).** Once a key is set, enqueue a job per new initiative or backfill all 430 in `initiative_topics`.
- **Newsletter digest pipeline**. `app/newsletter/digest.py` builds a structured `Digest` from the live DB (sessions, votes-most-consensual, votes-most-divided, ties, freshly submitted initiatives). `render.py` produces both HTML (mail-safe inline-styled, ~8 KB) and plain text. Preview at `/admin/newsletter/preview` (HTML) and `/admin/newsletter/preview.txt`. RQ job `send_weekly_digest(dry_run=True|False)` is registered; scheduler runs it Mondays 08:00 UTC (`app/workers/schedule.py install`). **Send is blocked on `LISTMONK_BASE_URL` + API user/key + list id**; everything up to the Listmonk call works today and is exercised by 9 unit tests including editorial-discipline guards (no "polèmic", "important", "destacat" wording).
- **SMTP email** (transactional double-opt-in). `SmtpSender` is implemented but `aiosmtplib` is not in `pyproject.toml` deps yet — the import is lazy, runtime-only. Add the dep once an SMTP host is provisioned. For dev, point Listmonk at Mailpit (`localhost:1025`) and our LogSender will continue handling backend confirmations.

## Periodic ingestion

- `app/workers/schedule.py` registers the cron schedule into Redis via
  `python -m app.workers.schedule install`. The schedules registered:
  - **Every 4h**: `ingest_latest_votes`
  - **Daily 06:30 UTC**: `ingest_active_deputies`
  - **Daily 06:45 UTC**: `ingest_initiatives`
  - **Mondays 08:00 UTC**: `send_weekly_digest`
- `python -m app.workers.runner` (already wired in `docker-compose.yml`) runs the worker with `with_scheduler=True`, which picks up due jobs.
- After deployment, run `install` once. To clear: `python -m app.workers.schedule clear`.

## What's pending

1. **Backfill of historical votes**. **Resolved 2026-05-10.** The votaciones portlet accepts `?targetDate=DD/MM/YYYY` (slash-delimited, NOT `YYYYMMDD`) statelessly and renders the full session inline — same shape as the latest-session listing. `CongresoClient.fetch_session_zip_for_date(legislature_roman, date)` plus `app.ingest.congreso.backfill.backfill_legislature` walk the legislature's `diasVotaciones` array at 1 req/s. `python -m app.ingest.congreso.bootstrap backfill_xv_smoke` runs 5 dates as a smoke test; `backfill_xv` runs the full legislature. Smoke verified 2026-05-10: 5/5 dates fetched, votes ingested for the days that had vote XMLs (2 days yielded vote rows; 3 days were procedural-only ZIPs with no XML, no Session row created). See `docs/research-similar-projects.md` § "Historical backfill — viable path" for the URL pattern.
2. **Backfill missing initiative datasets** so vote→initiative linking actually resolves. The vote listing exposes expedientes for all 12 votes of session 177, but their type codes (162 = PNL, 173 = Moción, 130 = RDL convalidación, 102 = reforma constitucional) are not among the three datasets the portal publishes (121, 122, 127). We already store the raw expediente in `votes.expediente_raw` so a future iteration can link them without re-scraping. Investigation needed: do PNL/Moción have a separate opendata feed, or do we need to scrape `/busqueda-de-iniciativas`?
3. **Ingestion scheduler**. Weekly cron job (RQ Scheduler, system cron, or a dedicated worker) to run `bootstrap latest_votes` so new sessions land automatically. Currently manual.
4. **Stable deputy IDs (`codParlamentario`)**. The portal's individual deputy URL exposes a numeric `codParlamentario` (e.g. Santiago Abascal = 317) that is more reliable than `full_name` for dedup, but the search page is JS-driven and the static HTML doesn't contain the codes. Two viable enrichments: (a) reverse-engineer the Liferay AJAX endpoint behind the search, or (b) probe `?codParlamentario=N` sequentially. Not blocking — current `full_name` dedup works for all 350 active deputies.
5. **Cards socials i embed widgets**. Endpoints exist as templates; not exercised against real data yet.
6. **Press tools** (`app/press/`) — empty package.
7. **Phase 2 (Parlament de Catalunya, BOPC PDFs)** and **Phase 3 (Plenari Barcelona)** — not started.
8. **Senate (Phase 1.5?)**. The Senate's open-data portal natively links votes to initiatives (no scraping required). Could be an easier insertion point between Congreso and Catalunya — see `docs/research-similar-projects.md`.

## Schema changes made in this session (review needed)

- `0003_widen_submitted_by`: `initiatives.submitted_by` from `VARCHAR(255)` to `TEXT`. Reason: some Proposiciones de Ley list every co-signer's name and group as a single multi-line string (largest seen: 843 chars). Truncating would lose data; widening was the only correct fix.
- `0004_vote_expediente`: adds `votes.expediente_raw VARCHAR(50)` (indexed). Reason: the per-vote XML does not expose `NUMEXPEDIENTE`, but the public votes listing page renders each vote's initiative as `(Núm. expte. NNN/NNNNNN)`. Scraped during `fetch_latest_session_zip()`. Stored even when no `Initiative` row matches yet — see pending item 2.

## Decisions made autonomously (worth a Daniel review)

- **Vote importer is forward-only.** Backfill is a real gap (item 1 above) but did not fit this session's scope.
- **`Vote.initiative_id` stays NULL on import.** Linking deferred to future work; no fake links inserted.
- **Group code mapping in vote XML is informational only.** We attribute by `GroupMembership` history (date-aware), so if the XML says "GP" but our membership record disagrees, we trust our record. So far there are zero disagreements.
- **`ABSENT` vs `NO_VOTE_RECORDED`.** The vote XML uses one label ("No vota") for both cases; we map to `NO_VOTE_RECORDED`. Aggregate "absence" is computable from `votes_total - votes_attended` in attendance metric.
- **Per-row flush in importers**. Async SQLAlchemy needs flushes between create and lookup-by-id; we flush only after a creation, not pre-emptively, so steady-state runs (idempotent re-imports) issue zero flushes.
- **Listmonk over self-hosted SMTP for the newsletter.** Aligns with CLAUDE.md (RGPD, sobiranisme); SMTP is reserved for transactional double-opt-in confirmations.

## Known issues / decisions deferred

- Person dedup uses `full_name` only. If two active deputies share an exact full name (none today, but possible historically), the importer collapses them. Will add a discriminator (e.g. birth year) the first time the data warrants it.
- No authentication system. Admin endpoints will need JWT-based auth before any moderation feature.
- Locale routing is single-locale (Catalan only). When we add `/ca`, `/es`, `/en` URLs we'll need to refactor the i18n setup.
- Frontend ports moved: host port now **3002** (3000 occupied by other dev tooling on Daniel's machine, 3001 by WSL relay). Container still listens on 3000 internally.
- Frontend → backend URL must be reachable from BOTH the browser and the Server Components in the frontend container. We use `http://host.docker.internal:8000` in `.env` (`NEXT_PUBLIC_API_URL`); plain `localhost` only works from the browser, not from inside the container. After changing this var, recreate the container with `docker compose up -d --force-recreate frontend` — `restart` does not re-read `env_file`.
