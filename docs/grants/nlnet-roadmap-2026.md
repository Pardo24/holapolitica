# Hola Política — 12-month Roadmap

**Applicant:** Daniel Pardo
**Project:** Hola Política — open civic infrastructure for parliamentary vote tracking
**Repository:** github.com/Pardo24/holapolitica
**Live site:** holapolitica.org
**Public API:** api.holapolitica.org
**Licence:** EUPL-1.2 (code) · CC-BY 4.0 (data) · CC-BY-SA 4.0 (editorial)
**Funder request:** NLnet NGI Zero Commons Fund — €33,200 over 12 months

---

## Scope summary

Three workstreams, executed in parallel.

| Workstream | % of budget | Outcome at month 12 |
|---|---|---|
| **Phase 2 — Parlament de Catalunya ingest** | 49 % | First multilingual platform tracking individual votes from the Catalan Parliament |
| **Operational stabilisation (Phase 1)** | 30 % | Production reliability sufficient for journalist + research consumption |
| **Accessibility + documentation** | 13 % | WCAG AA compliance + contributor-ready repository |
| **Infrastructure** | 7 % | Hetzner + Mistral + Listmonk costs covered for 12 months |

---

## Phase 2 — Parlament de Catalunya (months 1-6)

### Months 1-2 — BOPC parser foundation
- Investigate Catalan Parliament SIAP backend for any structured endpoint (the public-facing UI is JS-driven; the underlying AJAX may yield JSON).
- If no structured endpoint exists (expected): build pdfplumber + table-heuristic parser on a corpus of 50 BOPC documents across format variations.
- Migration: extend the data model to support a second chamber + per-deputy + group-block vote types. **Additive schema only** — existing `vote_records` preserved unchanged; new column / new table for group-block variant.

### Months 3-4 — Ingestion pipeline
- Periodic BOPC fetcher (weekly cadence — the Catalan Parliament publishes less frequently than the Spanish Congress).
- Multi-chamber data model migration (idempotent, zero-downtime, additive only).
- Catalan Parliament deputies + group-membership history importer.

### Months 5-6 — UI + classifier
- Multilingual UI: Catalan Parliament rendered as a peer chamber, not a subordinate one. URL: `/parlament-catalunya`.
- Topic classifier retraining with Catalan legislative corpus.
- BOPC-specific embed widget variant for Catalan newsrooms (Vilaweb, Ara, El Crític, Mèdia.cat).

**Milestone M6:** Phase 2 BOPC ingest live; Catalan Parliament votes queryable via the public API.

---

## Operational stabilisation (months 1-12, continuous)

### Months 1-3 — Reliability
- Monitoring + alerting for RQ workers (failure recovery, retries).
- Idempotence audit + property-based tests on the importers (current test surface is thin).
- Ingestion backfill robustness (graceful degradation when the official portal changes shape).

### Months 4-9 — Performance + accessibility
- API caching layer (Redis-backed).
- External accessibility audit by a Catalan consultancy.
- Implementation of audit findings (target: WCAG AA, no blocker-level issues).
- Mobile performance pass (the mobile dashboard is the highest-traffic surface).

### Months 10-12 — Documentation + handoff
- Operations runbook (deployment, recovery, monitoring, key rotation).
- Contributor onboarding guide; "good first issue" backlog seeded.
- Architecture decision records (ADRs) for key choices (Mistral over alternatives, EUPL-1.2 over AGPL, etc.).
- Public release process for v1.0 (semver, changelog, signed releases).

**Milestone M9:** Accessibility audit complete; WCAG AA achieved.
**Milestone M12:** v1.0 release; contributor docs published; runbook in operations/.

---

## Success metrics (measured publicly at month 12)

| Metric | Target | How measured |
|---|---|---|
| Catalan Parliament votes ingested | 100 % of current legislature | Public stats page |
| New initiative classification latency | ≥ 90 % within 24 h | Job timings on RQ |
| Public API uptime | ≥ 99.5 % | Status page (UptimeRobot) |
| WCAG AA blockers from audit | 0 | External audit report (published) |
| Newsroom embed integrations | ≥ 2 | Referrer logs (no fingerprinting) |
| Academic citations | ≥ 1 | Google Scholar |
| Time-to-dev-instance (contributor) | ≤ 30 min from fresh clone | Documented in CONTRIBUTING.md |

---

## Risk register

1. **SIAP backend exposes no JSON.** Mitigated by the PDF parser already being the default plan; SIAP discovery is upside, not dependency.
2. **Catalan classifier accuracy lower than Spanish.** Manual review buffer baked into the budget (semi-annual audit).
3. **Solo developer becomes unavailable.** Operations runbook + contributor docs reduce bus factor; advisory board (planned via separate Bofill grant) provides governance continuity.
4. **Volume growth exceeds infrastructure budget.** Reserve included in infrastructure line; Hetzner allows in-place upgrades.
5. **Phase 2 milestone slip.** If BOPC parsing or the multi-chamber migration runs longer than estimated, I will proactively contact NLnet to renegotiate scope — preference is to deliver less BOPC coverage well (e.g. partial legislature ingest with the parser stable) rather than rush a fragile parser into production. Scope adjustments will be agreed in writing before they affect the milestone schedule.

---

## Funding context

- **Self-funded to date** (~€800 in domain + server costs).
- **Drafted but not submitted:** Fundació Jaume Bofill (€15,000, Catalan-focus, complementary scope — association registration + advisory board, not dev work).
- **No corporate sponsorships.** GitHub Sponsors via Open Collective Europe in setup.
- **No revenue.**

If both NLnet and Bofill fund, the combined €48,200 covers Phase 2 ingest, operational stabilisation, association legal-entity registration, and the first advisory board cycle — at which point the project is ready for Civitates / Stichting Democratie en Media size grants for Phase 3.

---

## Why this is right-sized for NGI Zero Commons

- Open civic infrastructure, EUPL-1.2 licensed, no commercial gatekeeping.
- European LLM (Mistral Small) — explicit policy against OpenAI / Google Gemini.
- EU-hosted (Hetzner + Vercel + Listmonk).
- Demonstrable execution: a 6-week solo build is already in production with 617k records ingested.
- Concrete extension scope (Phase 2 BOPC) with a measurable deliverable.
- Maintainer accountable (Daniel Pardo) — no organisational layer between funder and engineer.
