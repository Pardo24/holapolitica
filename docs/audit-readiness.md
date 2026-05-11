# Audit readiness checklist

What an external auditor (CCN, Civio, an academic) would flag if they
opened the project today, ranked by how easy each gap is to close. The
goal is "would pass a neutrality + data-reliability audit cleanly", not
"is functional".

Last reviewed: 2026-05-08. Project status at that date: 1/177 sessions
ingested, 401/430 initiatives classified by Mistral, 317/350 deputies
photographed.

---

## What already passes

These are the items where the codebase is defensible. Cite them when an
auditor asks for evidence.

- **Editorial discipline tested in CI**. `tests/test_newsletter_render.py`
  asserts that words like `polèmica`, `important`, `destacada`,
  `controvèrsia`, `highlight` never appear in rendered HTML. Adding new
  surfaces should reuse this guardrail.
- **Symmetric comparative metrics**. `compute_group_coincidence_matrix`
  returns the full N×N matrix; `compute_group_cohesion_for_vote` returns
  every group present; `TopicBars.tsx` only renders the
  most-supported / most-rejected pair when BOTH ends qualify
  (`MIN_N_FOR_HIGHLIGHT = 15` AND each end exists). Single-sided
  highlights are impossible by construction.
- **Methodology documented**. `docs/research-stats-methodology.md`
  pre-registers denominators, min-N rules, and how multi-topic votes are
  counted. Anyone re-implementing should land the same numbers.
- **Date-aware vote attribution**. Vote→group attribution uses
  `GroupMembership` open on the vote's date, not the deputy's current
  group. The unit test
  `test_congreso_votes::test_does_not_match_wrong_format` and the
  importer's reconciliation logic enforce this.
- **Provenance per row**. `initiative_topics.classified_by` records
  whether a topic came from `llm:mistral-small`, `keyword:congreso-es`,
  or future humans. Auditors can filter and challenge per source.
- **No reactions, no comments, no rankings**. Every model that could
  carry user opinion is absent. The single subscription surface (alerts /
  newsletter) is one-way.
- **Open data only**. Every record traces to `congreso.es/es/opendata`
  or to the public listing pages; no scraped paywalled content. Personal
  data is restricted to public-figure facets (full name, photo,
  constituency, mandate dates).

---

## Items to close before claiming "audit-ready"

Six of these. None is hard. In suggested order:

### 1. Surface methodology to users (not just to devs in the repo)

**Why it matters**: a journalist citing a number from `/persons/2` should
land on a page that explains how the number was computed, not have to dig
through `docs/`.

**Action**: add a `/about/methodology` route that pulls (translates to
Catalan) the contents of `docs/research-stats-methodology.md`. Link to
it from every "?"-style help text — TopicBars subtitle, KPI strip
caption, /stats page header.

**Effort**: 2-3 hours. Scope: 1 new page, 1 link from each surface.

### 2. Show the source of every classification

**Why it matters**: if an LLM said "this housing bill is about justice",
the user has no way to question it. The audit response shouldn't be
"trust the LLM".

**Action**: on `/topics/[slug]` and on the per-topic count chips on
`/votes`, render a small `i` icon that on hover shows
`Classified by: llm:mistral-small · confidence 0.85 · 2026-05-08`. Hide
behind a `?source=true` query during MVP if you don't want it always on.

**Effort**: 1 hour. Field already exists in the DB.

### 3. Add data freshness indicator

**Why it matters**: if the cron stops running, today's "12 votes" might
be the entire data set indefinitely with no signal of staleness.

**Action**: add `GET /stats/freshness` returning `last_vote_ingested_at`,
`last_classified_at`, `last_deputy_sync_at`. Render a single line in the
footer: "Última actualització: fa 3h · 1 sessió ingerida". Red dot when
> 48h since the last vote ingest.

**Effort**: 2 hours. Reuses ingest job logging if we add timestamps.

### 4. Photo licensing attribution must render

**Why it matters**: `docs/research-similar-projects.md` notes the
Povedano photos require attribution. We don't render it today.

**Action**: under each `/persons/[id]` photo, add `© Congreso de los
Diputados · Foto: Povedano` in 11px muted text. On `/persons` cards,
link to a single attribution paragraph in `/about`.

**Effort**: 30 minutes.

### 5. Min-N caveat on the person KPI strip

**Why it matters**: today a deputy with 3 votes shows "Assistència 100%
· Dissidència 0%" as bold numbers. An auditor would flag the missing
denominator.

**Action**: when `votes_total < 15`, dim the percentage and append
`(n=3)`; when `< 5`, hide percentages entirely and surface only the raw
counts. Reuse the `MIN_N_FOR_HIGHLIGHT` constant from
`TopicBars.tsx`.

**Effort**: 30 minutes.

### 6. "Report an inaccuracy" feedback channel

**Why it matters**: an audit will ask "what happens when you're wrong?".
"Email us" is OK; nothing is not.

**Action**: tiny form at the bottom of `/votes/[id]`, `/persons/[id]`
and `/groups/[slug]` that says `Heu vist una imprecisió? [report]`. POST
to a new `corrections` table; admin email notification. No public moderation queue
yet — manual review.

**Effort**: 3 hours. New model, migration, endpoint, form.

---

## Items the auditor will accept as "in progress"

These can be on the roadmap; not blockers if the roadmap is visible.

- **Historical vote backfill** (~177 sessions of XV missing). Document
  the plan (`docs/research-similar-projects.md` has the DSCD probing
  approach) on the public methodology page.
- **PNL / Moción initiative datasets** to make `vote.initiative_id`
  resolve. Note in the methodology page: "current vote→initiative match
  rate is 0% because dataset coverage is incomplete; we display
  `expediente_raw` so you can trace manually."
- **Dedup by `cod_parlamentario`** rather than `full_name`. Document
  the homonym risk in the methodology page; explain we'll migrate when
  any homonym actually appears.

---

## Items to push back on

Auditors sometimes ask for things that, if granted, would violate the
neutrality rule. Examples:

- **"Sort representatives by trustworthiness / responsiveness."** No.
  We don't compute trustworthiness; we'd be inventing a ranking. Cite
  CLAUDE.md "regla de simetria" in the response.
- **"Highlight the most polarising votes of the week."** Polarisation
  is computable (we have cohesion + coincidence) but "most polarising"
  is editorial framing. We can publish the metric, not curate around it.
- **"Add a 'fact-checked by' badge."** Implies we authenticate truth.
  We authenticate the SOURCE (open data feed), not the truth value of
  political claims.
- **"Recommend who to vote for."** Out of scope, ever. We're a mirror.

---

## Re-audit cadence

Re-run this checklist at every major release (after each phase: Congreso
→ Catalan Parliament → Barcelona). Update the date at the top.
