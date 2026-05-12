# Hola Política — Pitch

Last updated: 2026-05-12.

A reusable, one-page pitch for funders, advisory-board prospects, and
press. Pulled directly from the live product, the
[roadmap](roadmap.md), and the [competitor analysis](competitor-quehacenlosdiputados.md);
no aspirational claims that aren't already on disk.

Production: <https://holapolitica.org> · Code: EUPL-1.2 · Data: CC-BY 4.0
Contact: `daniel@holapolitica.org`

---

## One-line

**Hola Política is the only civic platform that publishes, by name and
by topic, how every Spanish representative votes — open data, open API,
GDPR-by-construction, no editorial filter.**

## The problem

In a representative democracy the contract is simple: we delegate
decisions to people we elect, and we get to see what they do with that
mandate.

In practice, in Spain that visibility breaks at the most important
layer: **roll-call votes**. The official portal publishes them as raw
XML buried in PDF agendas, with no topic classification, no
deputy-level KPIs, and no way for a non-specialist to ask "how did my
representative vote on housing this year". Civio covers procurement
and lobbying. Qué hacen los diputados covers initiative-filing. Nobody
covers *what they vote, on which laws, classified by topic*.

## What we ship today

| Surface | What's live |
|---|---|
| **Roll-call vote data** | 1,840+ Congreso votes, 617,580 individual vote records, 350 active deputies, XV legislature complete |
| **Topic classification** | 17 editorial themes + 17 UN SDGs, Mistral-classified, provenance per row |
| **Plain-language summaries** | Auto-generated 2–3 sentence law summary in CA and ES, with banned-word guardrails (no "polèmica", "important") |
| **Symmetric metrics** | Cohesion per group, full N×N coincidence matrix, per-deputy attendance + dissidence — all generated such that single-sided rankings are *impossible by construction* |
| **Initiative detail page** | Every law gets its own page: AI summary, official PDF link, the vote (if cast), proposing group, classified topics, related laws |
| **Public REST API** | OpenAPI spec, four JSON dumps under CC-BY 4.0, used today by anyone with curl |
| **Newsletter** | Weekly Listmonk-rendered digest, **editorial-discipline tests in CI** asserting banned terms never appear in rendered HTML |
| **PWA + social cards** | Installable, `@vercel/og` cards templates exist (factual data only, no opinion text), embed widgets designed |
| **Multilingual** | CA default, ES, EN — every UI string, every email body |
| **Lifecycle infographic** | `/recorregut` — the 8-step path a bill takes through Congreso, factual, no commentary |
| **SDG dashboard** | `/agenda-2030` — UN-framed view of the same data; useful for AECID and SDG-implementation budget lines |

## What separates us from the field

| | Hola Política | Qué hacen los diputados (Political Watch) | Civio |
|---|---|---|---|
| Roll-call vote records | ✓ 617k | ✗ no votes | ✗ |
| Vote→initiative linking | ✓ | n/a | n/a |
| Cohesion / coincidence matrices | ✓ symmetric, tested | ✗ | ✗ |
| Plain-language summaries (LLM) | ✓ CA + ES | ✗ | ✗ |
| Symmetric-by-test newsletter | ✓ | ✗ no newsletter | (different beat) |
| Multilingual UI | ✓ CA / ES / EN | ✗ ES only | ES only |
| No third-party trackers | ✓ enforced | ✗ Google Tag Manager | ✓ |
| Open API + dumps under CC-BY | ✓ both | ✓ Swagger only | ✗ |
| Multi-chamber architecture | ✓ scaffolded | ✗ Congreso only | n/a |

Detailed competitor breakdown:
[`docs/competitor-quehacenlosdiputados.md`](competitor-quehacenlosdiputados.md).

## The neutrality stance, in code

Most civic-tech projects say they are neutral; we make it a CI
constraint. Two examples from the repo:

- The newsletter renderer (`backend/app/newsletter/`) is **unit-tested
  against banned editorial language** — words like *polèmic*,
  *important*, *destacat*, *highlight* MUST NOT appear in any rendered
  HTML. Tests in `backend/tests/test_newsletter_render.py`.
- Comparative metrics use a **symmetric-pair guard**: a topic-bars
  surface renders the most-supported / most-rejected pair only when
  both ends qualify (`MIN_N_FOR_HIGHLIGHT = 15` AND each end exists).
  Single-sided highlights are unreachable.

This is the kind of artefact NLnet / NGI Zero / OSF reviewers ask
for when they're worried about civic-tech being weaponised. We hand it
to them in a `git log`.

## Cost, today

| Item | Cost |
|---|---|
| Hetzner VPS (CPX22) | ~9.67 €/month |
| Vercel Hobby (frontend) | 0 € |
| Domain + email | ~15 €/year |
| Mistral La Plateforme (free tier) | 0 € — bottleneck; Tier 1 is 5 €/month |
| **All-in** | **~10 €/month** |

A single Tier-1 Mistral upgrade unblocks the entire LLM-dependent
backlog (SDG classification of all 430 initiatives, plain-summary
regeneration, PNL-classified summaries). 5 €/month.

## What funding unlocks

(Full table in [`docs/roadmap.md` §5](roadmap.md).)

| Tier | Unlocks |
|---|---|
| 5-10 k€ | PNL/Moción scraper (closes the biggest data gap in Congreso) + Catalunya Phase 1 ingest design |
| 20-30 k€ | Senate coverage + Barcelona Plenari + cross-chamber metrics |
| 50-80 k€ | Educational / research features + 1 FTE for 6 months |
| 100 k€+ | Multi-chamber federation + 2 FTE for a year |

Target funders by priority: **NLnet (NGI Zero Discovery / NGI Zero
Entrust), AECID (SDG line), OSF, EU CERV, Bofill, Goteo**. Two of those
(EU CERV, AECID) require a constituted legal entity; an associació
catalana sense ànim de lucre at the Registre d'Associacions covers it
in ~80 € and 3-4 weeks.

## Team and governance

Today: 1 maintainer (Daniel Pinto, full-stack). Looking for advisory
board: political-science academic, investigative journalist, civil
society delegate. Open to comaintainers via the `CONTRIBUTING.md`.

## What "no" looks like for us

We will not implement, ever:

- User reactions, likes, emojis, comments on votes, laws, or deputies.
- Parallel votes, polls, opinion surveys.
- Automated "this law is good/bad" labels.
- Single-sided rankings without a symmetric counterpart.
- Third-party trackers (no Google Analytics, no Meta, no GTM).
- Editorialised newsletters or social cards.

These are not aesthetic preferences. They're encoded in
[`CLAUDE.md`](../CLAUDE.md) and in the test suite.

## The ask, by audience

**Funders**: schedule a 30-min call. We have a roadmap with named
milestones tied to euro amounts, deployment evidence, and audit-ready
documentation already on disk (see
[`docs/audit-readiness.md`](audit-readiness.md)).

**Journalists**: the API at `holapolitica.org/api/v1/*` is open. The
dumps at `/dump/*` are CC-BY 4.0. Embed widgets are coming. If you have
a specific story angle that needs custom data, write to us.

**Civic-tech maintainers**: the code is EUPL-1.2 on GitHub. Issues and
PRs welcome. We're particularly interested in scrapers for the
Parlament de Catalunya BOPC PDFs.

**Politicians and chamber staff**: the project tracks public mandates
under Art. 85 GDPR and Llei 19/2013 de Transparència. If you spot a
data error, write to us with traceability — we fix and credit.

---

## Anti-pitch (read before pitching)

For honesty. These are the gaps that should not be hidden in any
conversation:

1. **Solo project today.** One maintainer, no legal entity, no
   advisory board. Most funders want the entity in place before they
   commit; that's the immediate next operational step.
2. **PNL / Moción scrapers not yet built.** The most-impactful Congreso
   data gap. Designed, not coded.
3. **Catalunya Phase 2 is paper-only.** BOPC PDF parsing is hard;
   nothing in the repo yet.
4. **Mistral free tier blocks LLM work.** 1 RPM → 429 floods on any
   batch run. 5 €/month fixes it.
5. **No track record of a delivered grant.** A first micro-grant
   (Goteo, Bofill mini) is the smartest credential to chase before
   approaching NLnet / OSF.

These all have concrete unblockers. None is a structural problem.
