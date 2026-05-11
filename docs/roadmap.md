# Hola Política — Roadmap

> Consolidated forward plan as of 2026-05-11. Updated when scope changes.
> Each phase ends with concrete shippable artefacts and a funding milestone.

## Status quo (already shipped)

### Backend
- FastAPI + Postgres 16 + Redis 7 + RQ workers
- Multi-chamber architecture (`chamber_id` everywhere)
- **Congreso XV ingested in full**: 1.840 votes / 617.580 vote_records /
  123 sessions / 2023-09-19 → 2026-04-30
- Initiative classifier (LLM via Mistral) — 17 editorial themes + 17 SDGs
  (two knowledge bases)
- Plain-language summaries (CA + ES) on initiatives + votes
- Forward-only ingest scheduled (votes 4h, deputies daily, initiatives
  daily, agenda daily + Monday boost, newsletter weekly)
- Web Push notifications (VAPID + service worker + per-topic
  subscriptions)
- Listmonk newsletter integration (dry-run + send)
- Public API at `/docs` + `/redoc` + four `/dump/*` endpoints
  (CC-BY 4.0)
- Audit-ready cross-checks (vote count vs vote_records, 99.95%)
- Redis cache on heavy `/stats` paths (≤200ms warm)
- 145+ tests, mypy --strict clean, CI/CD via GitHub Actions

### Frontend
- Next.js 15 + Tailwind + i18n CA/ES/EN
- PWA installable (manifest + icons + service worker)
- Mirall design system (paper/ink, oklch palette, editorial atlas)
- Pages: `/`, `/votes`, `/votes/[id]`, `/persons`, `/persons/[id]`,
  `/groups`, `/groups/[slug]`, `/topics`, `/topics/[slug]`,
  `/stats?topic=&group=`, `/about`, `/notifications`
- OG image generation per-page (vote, person, stats, home)
- Share button (Web Share API + clipboard)
- Tooltips with summaries (`SummaryHover`) and glossary terms (`Tooltip`)
- Coincidence matrix · Highlights carousel · Donut panels ·
  Vertical bars · Composition cards (gender / age / parties)

### Mobile + Ops
- Capacitor scaffold ready in `mobile/`
- Production frontend served via `next start` (≤0.5s on cached pages)
- Local Listmonk + listmonk-db services in docker-compose
- CI/CD: backend-ci, frontend-ci, pr-quality, release workflows

## Imminent (weeks 1-2, blocking the demo phase)

| Task | Effort | Blocker | Owner |
|---|---|---|---|
| Buy `holapolitica.org` at Porkbun | 5 min | None | **User** |
| Rebrand UI strings + manifest + OG cards | 1 day | Domain | Dev |
| Deploy to Vercel (frontend) + Hetzner/Fly (backend) | 1-2 days | Domain + decision | Dev |
| Listmonk admin user + API user + list creation | 30 min | None | **User** |
| First real newsletter send | 10 min | Listmonk creds | Dev |
| Apply to NLnet NGI Zero Discovery (Round dates: see nlnet.nl) | 2 days | Stable URL | **User + Dev** |

## Phase 1 — close the Congreso loop (weeks 3-6)

Two ingest sources + one demographic unlock.

### 1.1 Intervencions Congrés (3-5 days)
**Why**: adds the textual layer — "què DIUEN els diputats" vs "com voten". Foundation for full-text search and storytelling.
- Ingest `congreso.es/opendata/intervenciones` (DSCD XML transcripts)
- New table `interventions` (FK Person + Session)
- Postgres tsvector index for full-text search
- New page `/intervencions` + section in `/persons/[id]`
- Optional: push notification "El diputat X ha parlat avui"

### 1.2 BOE cross-linking (5 days)
**Why**: closes the policy circle — "llei aprovada → text vigent publicat"
- Ingest `boe.es/datosabiertos` filtered to leyes/RDLs
- New table `boe_entries` (one row per publication)
- Add `initiative.boe_published_id` FK
- Badge on `/votes/[id]` and `/topics/[slug]`: "📜 Publicada al BOE 18/03/2026"

### 1.3 Birthday widget unblock (1 day)
- Migration `0016` adding `birth_date: date | None` to `persons`
- Ingester `birth_dates.py` scraping per-deputy ficha
- Home widget "Avui cumpleixen anys" (up to 4 cards with photo + group color + age)

### 1.4 Historical roster (~3 days)
**Why**: unlocks Congreso XIV+ backfill (today blocked by `person_not_found` for resignees)
- New step `import_historical_deputies(legislature)` scraping the Congreso roster page per legislature
- Then re-run `backfill_xiv` cleanly
- ~2.000+ additional votes added per legislature

### Funding deliverable
- Live site at `holapolitica.org` with everything above
- 3 endorsement letters (Civio, journalism school, civic-tech NGO)
- NLnet application submitted

## Phase 2 — broaden coverage (weeks 7-10)

### 2.1 Senat (10 days)
**Why**: parliamentary bicameralism — Senat is the territorial chamber, ~265 senators
- Source: `senado.es/web/relacionesciudadanos/datosabiertos/`
- Format: XML / JSON (less polished than Congreso but functional)
- Reuses Person/Vote/Session/Initiative models (chamber differentiates)
- Add `chamber_id` selector in navbar
- ~80 sessions/year, ~500 votes/year — much smaller volume than Congreso

### 2.2 Lobby registry (5 days)
**Why**: editorial differentiator. QHLD and Civio don't integrate this. Apply to NLnet Entrust on this basis.
- Source: `congreso.es/es/grupos-de-interes` (HTML + Excel exports)
- New tables `lobby_groups`, `lobby_meetings`
- Top-nav entry "Lobby" with index + per-group detail
- Cross-link on `/persons/[id]`: meetings with lobby groups
- Cross-link on `/votes/[id]`: meetings near voting date

### 2.3 App Store + Play Store submission (5 days, user-blocked)
**Blocker**: Apple Developer Program $99/year + Google Play Console $25 one-time
- iOS: TestFlight beta → App Store submission (Apple review 1-7 days)
- Android: Internal track → Closed beta → Production
- Push notifications via APNs (iOS) + FCM (Android)
- Universal Links + App Links wired to AASA + assetlinks.json files

### 2.4 Real-data validation system (2 days)
- Cron daily comparing 5 random votes against the Congreso portal
- Alerts to `docs/audit-log.md` on divergence
- Public "View source" link on each vote (XML/JSON link to portal)

### Funding deliverable
- App Store + Play Store listings live
- 1000+ Web Push subscribers (target)
- 100+ newsletter subscribers (target)
- NLnet first milestone report

## Phase 3 — complete government activity (weeks 11-14)

### 3.1 Preguntes escrites + orals (3 days)
- Per-MP question tracking, response status
- Section in `/persons/[id]`

### 3.2 Comissions (5 days)
- Committee membership + attendance + agendas
- Page `/comissions` with full list
- Section in `/persons/[id]`

### 3.3 Consell de Ministres (5 days)
- Weekly scraping of `lamoncloa.gob.es/consejodeministros`
- Home widget "Aquesta setmana al Consell"
- Page `/govern/consell-ministres/[date]` per session
- New table `council_sessions`

### 3.4 Iniciatives populars (2 days)
- ILP tracking (citizen petitions formalised)
- Separate page or integrated with `/topics`

### Funding deliverable
- 10.000+ documents searchable
- OECD CPIN membership (community endorsement)
- AECID / Fundació Bofill / Open Society Foundations applications

## Phase 4 — Catalan parliament + editorial (weeks 15-22)

### 4.1 Parlament de Catalunya (2-3 weeks)
**Hardest of all** — no API, BOPC PDFs
- BOPC PDF parser (similar to upcoming-agenda parser)
- Catalan name disambiguation (different conventions than Spanish)
- Group/Party mapping ERC, Junts, PSC-CpC, Comuns, CUP, Vox, Cs, PP
- ~135 deputies, very different election cycles
- Multi-language native support boost: every UI element in Catalan first-class

### 4.2 Editorial features
- `/historia` timeline view: vote → intervention → initiative → BOE → lobby meetings
- Weekly newsletter editorial: factual digest + "quina ha estat la setmana"
- Embed widgets for journalists (iframe with vote breakdowns)
- Per-vote CSV export (already exists; surface UI)

### 4.3 Storytelling for funding
- Case studies: 3 votes deeply documented with the full timeline above
- Press kit: screenshots, embeddable widgets, sample API curls
- Annual transparency report (open finances)

### Funding deliverable
- Catalunya MVP
- Documented annual budget + funding sources
- Goteo crowdfunding campaign live

## Phase 5 — sustain + scale (weeks 23+)

### 5.1 Autonomic parliaments (varies, 2-4 weeks each)
- Asamblea de Madrid
- Junta de Andalucía
- Corts Valencianes
- Each is its own scraping project

### 5.2 Historical backfill (Congreso X-XIV)
- After historical roster is built, backfill 5+ legislatures
- ~10.000+ additional votes

### 5.3 Federation
- Self-hosting docs for other countries' chapters
- Multi-tenant infrastructure
- Translation framework for foreign UIs

### 5.4 Community
- Volunteer maintainer onboarding doc
- Code of conduct
- Quarterly community report
- Sponsor / donate page

## Architectural decisions pending

| Decision | Options | Recommendation |
|---|---|---|
| Backend hosting | Hetzner VPS · Fly.io · Railway | Hetzner (5€/mo, full control) |
| Frontend hosting | Vercel free tier · Cloudflare Pages | Vercel (Next.js native) |
| Domain | `.cat` · `.es` · `.org` | `.org` (chosen — neutral) |
| LLM cost cap | Hard limit on Mistral spend | 50€/mo (~enough for full XV reclassification) |
| Data licence | CC-BY 4.0 (current) · CC0 | Stay CC-BY 4.0 |
| Mobile push tokens | FCM v1 · Legacy | FCM v1 (only future-proof option) |
| Monitoring | Sentry free tier · self-hosted | Sentry free tier |

## Funding milestones

| Funder | Target | Amount | Status |
|---|---|---|---|
| NLnet NGI Zero Discovery | Q1 2026 | €5-50k | Application drafting after Vercel deploy |
| NLnet NGI Zero Entrust | Q2 2026 | €5-50k | Privacy + transparency angle |
| AECID | Q3 2026 | €20-50k | SDG knowledge base unlocks this |
| OSF (Open Society Foundations) | Q3 2026 | €30-100k | After 6 months of traction |
| EU CERV (Citizens, Equality, Rights, Values) | 2026-2027 cycle | €50-300k | Requires NGO incorporation |
| Goteo crowdfunding | Q4 2026 | €5-20k | Fallback + community proof |
| Fundació Bofill | Q3 2026 | €5-20k | Catalunya-specific |

## Risks + mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Solo maintainer burnout | Med | High | Volunteer onboarding doc + funding for additional dev |
| Mistral cost runaway | Low | Med | Hard cap via env var + Mistral dashboard alerts |
| Congreso portal format change | Med | High | Per-parser fixtures + monitoring alerts |
| Apple App Store rejection (4.2 wrapper) | Med | Med | Native features documented (push, deep links, share, offline) |
| Lobby registry compliance gaps | High | Low | Scrape what's published, document the gaps editorially |
| Catalunya BOPC PDF brittleness | High | Med | Allow partial parsing — never block whole pipeline |
| Hetzner deploy outage | Low | Med | Backup deploy on Fly.io as cold standby |

## Success metrics (year 1)

| Metric | Target |
|---|---|
| Newsletter subscribers | 500+ |
| Web Push subscriptions | 2.000+ |
| Monthly active users | 5.000+ |
| API requests/day | 1.000+ |
| Mobile installs (iOS+Android) | 500+ |
| Chambers covered | Congreso + Senat |
| Years backfilled | Congreso X-XV |
| Press citations | 5+ |
| Endorsements (NGOs, journalists, academics) | 10+ |
| Funding secured | €15k+ |

## Cross-cutting / ongoing tasks

- **Documentation** kept current as code lands (CLAUDE.md, docs/, README)
- **Editorial guidelines** doc: how to write headlines, what's a "neutral fact"
- **Privacy audit** quarterly (GDPR compliance, data retention)
- **Open data licence** clarity on every endpoint
- **Open-source good citizenship**: respond to GitHub issues, accept PRs
- **Community calls** quarterly once we have 100+ users
- **Transparency report** monthly: ingestion stats, costs, funding sources

## What ISN'T in the roadmap (deliberate)

- Barcelona Plenari — bloquejat per la font (cap vot nominal públic)
- Endorsed political analysis — viola "mirall no megàfon"
- Comments / reactions / likes on votes — same
- Advertising / freemium / paywall — same
- Government affiliation — independence is the whole point
- Tracking analytics (Google Analytics, etc.) — privacy is a feature

## Open questions for the user

1. **NGO incorporation** — when do we register as an association? Required for AECID + EU CERV. Not required for NLnet.
2. **Co-maintainers** — who else might want to commit? Pipeline matters for funding viability.
3. **Editorial board** — for the weekly newsletter, do we want a small editorial committee or stays solo?
4. **Public launch event** — Q1 / Q2 / Q3? Press release? Linked to first funding announce?
5. **Brand kit** — logo design beyond the brand-mark we have? Press materials, business cards (if NGO incorporated)?

---

This roadmap is a living document. Updated on every major scope change.
