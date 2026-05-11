# Competitor analysis — quehacenlosdiputados.es

Date: 2026-05-11
Author: autonomous audit (Daniel review pending)
Method: HTTP-level inspection of the SPA shell, the public Swagger API at
`api.quehacenlosdiputados.es`, the GitHub org `politicalwatch`, and the
parent NGO site `politicalwatch.es`. The site is a Vue SPA so static
WebFetch only returns the shell; everything below comes from the public
JSON API (Swagger advertised at `/docs`) and the JS bundle's route table.

## Resum executiu

Qué hacen los diputados (QHLD) is the most directly adjacent live Spanish
civic-tech project to ours. It is operated by **Political Watch**, an
established NGO with international civic-tech alliances (Code for All,
OECD Citizen Participation Innovation Network) and a sibling project
`parlamento2030.es`. The site is **active** (data ingested 2026-05-09;
backend repo last commit 2026-04-13), **open source under AGPL-3.0**, with
a **public Swagger-documented REST API** at `api.quehacenlosdiputados.es`.

Their product is different from ours in one decisive way: **QHLD tracks
INITIATIVES classified by topic, not VOTES**. Their headline metric is
"huella parlamentaria" — how much each deputy or group has tabled
initiatives in a given topic, normalised 0–100. They have **no vote→bill
linking, no roll-call analysis, no cohesion metric**, and their classifier
is **regex/keyword-based**, not LLM. They cover only legislature XV
(Congreso), Spanish UI only, with Google Tag Manager loaded.

We compete on a different axis: roll-call vote analysis, multilingual UI,
neutrality discipline, tracker-free embeds. We can borrow heavily — open
API surface, agenda-footprint metric (as symmetric pair), birthday
widget, knowledge-base concept — without colliding on positioning.

## Feature matrix

Legend: ✓ have today; ~ scaffolded/partial; ✗ none; + roadmap.

| Capability | Monitor Parlamentari | QHLD | Notes |
|---|---|---|---|
| Chambers covered | Congreso (XV) live; Catalunya/Barcelona planned | Congreso (XV) only | They are single-chamber, single-legislature |
| Roll-call votes (per deputy) | ✓ 4,200 records live | ✗ `voting/{id}` endpoint returns `[]` empirically | Our core differentiator |
| Initiatives | ✓ 430 (3 dataset types) | ✓ 95,687 (all 84 iniciativa types via Congreso opendata) | They ingest 200x more; we filter to substantive |
| Vote→initiative linking | ~ (`expediente_raw` stored, FK pending) | n/a (no votes) | — |
| Per-deputy stats | ✓ KPI strip on `/persons/[id]` | ✓ Footprint by topic + bio + email + twitter + party logo | They expose more PII (we deliberately don't) |
| Per-group stats | ✓ Member count, per-topic breakdown | ✓ Footprint by topic, composition (gender/age buckets), color | Their gender/age aggregates are a nice addition |
| Cohesion metric (intra-group voting agreement) | ✓ Computed on demand | ✗ | We win — they have no vote data |
| Coincidence matrix (group↔group) | ✓ Full matrix per CLAUDE.md symmetry rule | ✗ | We win |
| Attendance metric | ✓ | ✗ | We win |
| Dissidence metric | ✓ | ✗ | We win |
| Footprint / agenda metric | ✗ | ✓ Headline metric, normalized 0–100 across topics | **Worth borrowing (symmetric)** |
| Plain-language vote summaries | + LLM-generated 2–3 sentences planned | ✗ | We win once shipped |
| Topic classification | ✓ LLM (Mistral/Anthropic/Qwen) — 17 themes, scaffolded | ✓ Regex/keyword on multiple "knowledge bases" (politicas, ods, autismo) | They have 41+ topics across 3 vocabularies; we have 17 |
| Multiple topic vocabularies (SDG + thematic + special) | ✗ Single 17-theme taxonomy | ✓ 3 knowledge bases (`politicas`, `ods` = 17 SDGs, `autismo`) | **Worth borrowing** |
| Public Tagger API (text → topics) | ✗ | ✓ `POST /tagger/` accepts text or file | **Worth borrowing** |
| Open REST API | ✓ `/api/v1/*` + OpenAPI | ✓ Swagger UI at `/docs`, JSON at `/swagger.json` | Both open; ours is async/FastAPI, theirs Flask |
| Bulk data download | ~ via API | ✗ no obvious CSV / dump | Civio publishes dumps — we should too |
| Newsletter | ✓ Listmonk pipeline, weekly digest, editorial discipline tests | ✗ none observed | We win |
| Social cards (OG images) | + `@vercel/og` templates exist | ✓ static `share.png` (1 image for whole site) | We win once shipped |
| Embed widgets | + designed, not exercised | ✗ none observed | We win once shipped |
| Push / alerts | ~ alerts subscription scaffolded | ✗ none observed | We win |
| Mobile app | ✗ | ✗ | Tie |
| PWA / installable | ✓ `manifest.ts` present | ✗ | We win |
| Bilingual / trilingual UI | ✓ ca/es/en (Catalan default), next-intl, single-locale today | ✗ Spanish only | **Strong differentiator** |
| Party logos | ✗ deliberate (neutrality) — colored circles | ✓ inline base64 in deputy detail | Intentional asymmetry |
| Deputy contact info (email/twitter) | ✗ | ✓ Public on deputy detail | Intentional asymmetry — see CLAUDE.md "no personal data not related to public function" — email IS related, twitter is borderline; we could revisit |
| Birthday widget | ✗ | ✓ `/diputados/buscador-cumpleanos` | Quirky, low effort, **worth copying** |
| Third-party trackers | ✗ none | ✓ Google Tag Manager (`gtag/js`) | **Our positioning win** |
| Historical legislatures | ~ XV live; backfill mechanism solved, not yet run | ✗ XV only (data starts week 2023-33) | We will win once XV–X backfill runs |
| Open source license | EUPL-1.2 / AGPL-3.0 planned | AGPL-3.0 | Family-compatible |
| Github stars (frontend) | n/a | 7 (qhld.es), 4 (qhld-backend), 1 (qhld-engine) | Small audience |

## Què fan que nosaltres no fem

Concrete features worth borrowing, with effort estimate. **All must
preserve our neutrality + symmetry guardrails.**

### Worth shipping soon (small effort)

1. **Birthday widget** (`/persons/cumpleanys` or similar). They expose
   `/deputies/todays-birthdays`; we already store `birthdate` on
   `Person`. ~½ day. Pure data, neutral, drives recurring traffic.
2. **Public Swagger UI for our API**. We have OpenAPI from FastAPI; just
   mount `/docs` (already there for dev) on the public host and link from
   `/about`. ~30 min. Press / academic value.
3. **Bulk CSV/JSON dump endpoints** (`/api/v1/dump/deputies`,
   `/api/v1/dump/votes`). Civio publishes dumps; we should too. Makes us
   a real "ciutadania de primera classe" API per CLAUDE.md. ~1 day.
4. **Deputy gender + age composition on `/groups/[slug]`**. We have
   `birthdate` and gender via Congreso JSON; the bucketed display
   `under35 / between35and49 / between50and65 / over65` is informative,
   neutral, and visually rich. ~½ day. **Symmetry-safe**: it's a per-group
   composition, not a comparative ranking.

### Worth shipping in next 6–8 weeks (medium effort)

5. **Per-deputy / per-group "agenda footprint" metric** (how much each
   deputy/group tables initiatives by topic). They normalize 0–100 across
   topics. **Symmetric application required**: never publish "top 10
   without bottom 10"; expose the full matrix. ~3–5 days once topic
   classification is live. Differentiates "activity" from "vote behaviour"
   and is a Civio-friendly mirror metric.
6. **Multiple topic vocabularies (knowledgebases)**. Today we have one
   17-theme taxonomy. Add at minimum a parallel **17 SDGs (ODS)**
   vocabulary as a second `knowledgebase` column on `initiative_topics`.
   This is a known UN/EU framework; matches existing journalism use cases
   (sustainability beats); easy to explain in funding proposals. ~3 days
   (schema + classifier prompt + UI tabs).
7. **Public tagger endpoint** (`POST /api/v1/classify` — paste text, get
   topics back). They expose this and journalists love it. ~2 days
   wrapping our existing classifier; rate-limit + abuse log.
8. **Composition stats on group cards** (parties[] under the group,
   gender split, age buckets). Already mostly in our model. ~1 day.

### Worth considering, design-sensitive (larger)

9. **"Top deputies on topic X" pages** — only ship if implemented as a
   symmetric pair: the page shows the full ranking (or top + bottom)
   simultaneously, AND prominently labels the metric as "agenda
   activity, not vote behaviour" so it isn't read as a virtue ranking.
   Daniel sign-off recommended. ~3 days incl. design copy.
10. **Inline deputy contact info (official email)**. They show
    `santiago.abascal@congreso.es` style addresses. The Congreso publishes
    these as part of public function. CLAUDE.md explicitly allows
    "function-related" data. **Worth a Daniel decision** — useful for
    journalist outreach. ~½ day if approved.

### NOT worth copying

- **Inline party logos as base64.** They serve embedded base64 JPGs of
  party logos per deputy. We deliberately chose neutral colored circles
  for licensing and neutrality reasons (see `design-brief.md`).
- **Google Tag Manager.** Direct positioning violation for us. Their
  inclusion is a real differentiator we should call out in the funding
  pitch.
- **Single-ended top-10 rankings without context.** Even if they get
  away with it because it's an "activity" not "judgement" metric, we
  should always pair with the bottom-10 or the full distribution per
  CLAUDE.md symmetry rule.

## Què fem que ells no fan

Concrete strengths to lead with in the funding pitch:

1. **Roll-call vote tracking with per-deputy attribution.** Their site
   answers "who tabled what about housing"; ours answers "who VOTED on
   the housing law and how." Vote behaviour is the harder, costlier
   problem to solve (vote-XML scraping, vote→initiative linking,
   group-membership history). They explicitly do not solve it.
2. **Cohesion, coincidence, attendance and dissidence metrics** — full
   symmetric matrices, computed on demand from real vote data. Civio
   complement, not duplicate.
3. **LLM-based topic classification** with neutral, prompted output.
   Their classifier is regex-based — it requires hand-curated keyword
   lists per topic, doesn't generalise, and depends on continuous
   editorial maintenance. We can classify any new chamber with the same
   prompt.
4. **Multi-chamber roadmap** (Congreso → Catalunya BOPC → Barcelona
   Plenari). They are explicitly Congreso-only. Catalan civic-tech gap
   we plan to fill is uncontested.
5. **Multilingual UI** (Catalan default, Spanish, English). They are
   Spanish-only. For Catalan civic-tech funders this is decisive.
6. **Tracker-free posture.** No Google Tag Manager, no Meta pixel, no
   external fonts. RGPD-by-construction. Their site loads GTM
   unconditionally. This is a real, demonstrable distinction.
7. **Newsletter pipeline with editorial discipline tests.** Listmonk
   self-hosted; rendered HTML is unit-tested against banned editorial
   language ("polèmic", "destacat", "important"). They have no
   newsletter.
8. **Symmetric metric guardrails** embedded in product and tests, not
   just policy. Our `cohesion` / `coincidence` endpoints always return
   full matrices; the newsletter renderer fails if it ever picks "top
   without bottom." This is a positioning artefact funders care about.
9. **Embeddable widgets + social cards designed for press partners.**
   Templates exist, sandboxed iframes, no third-party beacons, WCAG AA
   target. They have none.
10. **PWA / installable manifest** + planned mobile UX. Theirs is a
    desktop-leaning Vue SPA with no offline / installable signals.

## Senyals de finançament

**Operator: Political Watch** (`politicalwatch.es`).

- **Self-description**: "Data for social change and political innovation
  in the fight against poverty #CivicTech" (GitHub org bio).
- **Mission text**: works toward "a more just world" by trying to "renew
  current democracy, which has disconnected from the citizens it
  represents."
- **Alliances visible on `politicalwatch.es`**: Code for All, Global
  Democracy Coalition, **OECD Citizen Participation Innovation Network**,
  IA Ciudadana, Democracy Narratives Campaign, **Coalición Proacceso**.
- **Sibling projects**: `parlamento2030.es` (SDG-framed companion of
  QHLD), `unmundosalvadorsoler.org` (foundation site they appear to
  develop pro bono — last commit Mar 2026), `ampliando-democracia` (their
  citizen deliberation platform).
- **Funding model**: not disclosed on the public site. No visible donate
  button, no Patreon, no Open Collective, no Goteo campaign visible on
  the home shell or in the routes (`/colabora` exists but returns 404 at
  the underscore path I probed; the in-app `/colabora` page is JS-only).
  No "sponsored by" footer. No Civio / Maldita / mySociety co-branding.
- **Reasonable inference**: Political Watch is an established small NGO,
  funded by a combination of foundation grants (their OECD CPIN
  membership and Code for All affiliation are typical grant-track
  signals), service contracts (sites like
  `unmundosalvadorsoler.org` look like client work), and project-tied
  funding (parlamento2030.es is SDG-framed, which fits Spanish AECID /
  EU SDG-implementation budget lines).
- **What this means for our pitch**: they are *not* a Civio-scale
  organisation, *not* government-affiliated, *not* a hobby project.
  They are roughly **mid-tier civic-tech NGO**. We are positioning lower
  on the curve today (effectively a Daniel-led project) but our
  technical surface is wider in scope (multi-chamber, multi-language,
  vote data) and our public artefacts (this repo's docs alone) match
  small-NGO standards. NLnet / EU NGI-style funders will recognise both
  the gap (we don't have an org yet) and the opportunity (we cover what
  Political Watch deliberately doesn't).

## Estat del projecte

- **Status**: alive and active.
- **Last data update**: 2026-05-09 (`updated` field on initiatives, one
  day before this audit). Data freshness comparable to ours.
- **Last code commit (backend)**: 2026-04-13 (qhld-backend). Frontend:
  2026-03-19 (qhld.es). Engine: 2026-03-28 (qhld-engine). Airflow DAGs:
  2026-03-12 — they orchestrate with Airflow, which is more heavyweight
  than our RQ. Active 1–4× per month on each repo.
- **Total commits**: qhld-backend 292, qhld-engine 616, qhld.es 1,052.
  A few years of sustained development.
- **GitHub stars**: small (7 / 4 / 1). Audience is the data, not the code.
- **Tech stack**: Python 3.8 + Flask backend; Vue + Vite + legacy
  build frontend; Airflow DAGs for ingestion. Older / heavier than our
  stack (FastAPI async, Next.js 15, RQ) but proven over multiple years.
- **Classification**: regex/keyword over three knowledge bases
  (`politicas`, `ods`, `autismo`). Maintained manually.
- **Verdict**: a small NGO with grants, not a solo hobby, not a Civio
  competitor. **Our peer, not our threat.** Differentiation by data type
  (votes vs initiatives) is clear and defensible; there's room for both
  projects to coexist and even cross-reference.

## Inspiració per al naming

QHLD's name is **descriptive, literal, vernacular Spanish**: "What do
the deputies do." Strengths:

- **Memorable** because it's a complete sentence and a real-world
  question citizens ask. The Twitter handle `@QHLD_` survives as an
  abbreviation people learn after one exposure.
- **SEO-strong** for natural-language queries.
- **Frames the product as a service to citizens** ("we answer this
  question for you"), not as data infrastructure.

Spanish civic-tech naming conventions visible in the broader landscape:
- **Descriptive question / statement**: QHLD, "Qué Hace mi
  Ayuntamiento" (defunct).
- **Imperative or aspirational**: "Ampliando Democracia",
  "Parlamento 2030".
- **Acronyms only when paired with a long tagline**: Civio (Centro de
  Investigación e Información sobre Ciudadanía y Organización… though
  Civio dropped the expansion). Maldita.es.
- **Catalan civic-tech**: "Decidim", "Som Energia", "Polítiques" —
  short single noun or imperative verbs. **"Monitor Parlamentari" fits
  the Catalan tradition but is more institutional than
  citizen-vernacular.**

Implications for us:

1. "Monitor Parlamentari" is technically accurate, multilingually
   readable, and Catalan-native. It signals seriousness. **Keep it as
   the project name.**
2. But the **public-facing tagline** should be more vernacular and
   question-shaped: "Qui vota què al Congrés / al Parlament", or
   "Cada vot, cada diputat, en obert". Pick something that completes
   the sentence a citizen would actually type into a search bar.
3. If we ever want a domain hack: `comhanvotat.cat` or
   `quivotaque.cat` would echo the QHLD convention while staying
   Catalan-first. Not urgent; "Monitor Parlamentari" + descriptive
   tagline is enough for v1.
4. For the Spanish-language landing, **don't translate the brand**.
   Mirror the QHLD approach: same project, vernacular question as the
   tagline ("Quién vota qué en el Congreso"). Avoid "Monitor
   Parlamentario" — sounds like government oversight, which is the
   exact wrong frame for a citizen tool.

## Recommended changes to our pitch

1. **Lead with the data-type distinction.** First sentence of the pitch
   should make clear: "Political Watch's QHLD tracks what initiatives
   deputies present; we track how they vote." Both are valuable; we are
   *complementary*, not *duplicative*, exactly like Civio is to both of
   us. This protects against "didn't this already exist?"
2. **Quantify our scope advantage.** Multi-chamber (Congreso + Catalunya
   + Barcelona). Multilingual. Tracker-free. Symmetric metrics
   enforced in tests. Each is a concrete, demonstrable claim QHLD does
   not make.
3. **Cite QHLD favourably**, not as a competitor. NLnet / NGI / Open
   Society fund movements, not lone heroes. Saying "Political Watch
   covers the activity side; we are filling the votes-and-Catalunya
   gap; we will publish bulk dumps both teams can consume" reads as
   ecosystem-building, not turf war.
4. **Mention the AGPL-3.0 alignment.** QHLD code is AGPL-3.0; if we
   adopt AGPL-3.0 or EUPL-1.2 we are compatible for downstream reuse.
   Funders read this as "won't burn bridges."
5. **Frame neutrality + symmetry as an engineering feature.** We have
   tests that block editorial language and unit tests that enforce full
   matrix output. QHLD has none of that visible. Funders concerned
   about political instrumentalisation will weight this heavily.
6. **Point to NLnet's NGI Zero strands.** NGI0 Entrust and NGI0 Commons
   Fund are the natural fit. The "open API + no third-party trackers +
   data sovereignty" framing maps directly onto NGI0 priorities.
7. **De-emphasise the LLM-classification angle slightly.** QHLD's
   regex classifier "just works" today; ours requires LLM credits and
   prompt engineering. Pitch the LLM angle as "scales to new chambers
   without per-topic keyword curation" — that's the real advantage,
   not "we use AI." Funders are tired of "we use AI."
8. **Borrow their "knowledge base" plural-vocabulary framing for the
   pitch.** Saying "we classify votes against three vocabularies: the
   17 SDGs, a 17-theme Catalan civic taxonomy, and a per-chamber
   special-interest layer" sounds richer and more research-grade than
   "we classify into 17 topics."

---

## Appendix — evidence URLs

| Endpoint | What it confirms |
|---|---|
| `https://quehacenlosdiputados.es/` (Vue SPA shell, 5.4 KB) | Site is Vue, twitter `@QHLD_`, GTM loaded, `data-vue-router-controlled` meta tags |
| `https://api.quehacenlosdiputados.es/docs` (Swagger UI) | Public OpenAPI surface; 22 endpoints across topics / deputies / groups / initiatives / stats / footprint / voting / tagger |
| `https://api.quehacenlosdiputados.es/swagger.json` | OpenAPI 2.0 spec, 13 KB |
| `https://api.quehacenlosdiputados.es/stats/overall` | `allinitiatives: 95687`, 3 knowledge bases |
| `https://api.quehacenlosdiputados.es/topics/` | 41+ topics across `politicas`, `ods`, `autismo` |
| `https://api.quehacenlosdiputados.es/stats/by-week` | First week `2023-33` — XV legislature only |
| `https://api.quehacenlosdiputados.es/deputies/abascal-conde-santiago` | Reveals `email`, `twitter`, `bio`, `legislatures: ["XIII", "XIV XV"]`, base64 party logo |
| `https://api.quehacenlosdiputados.es/footprint/by-topic?topic=Vivienda` | Confirms footprint metric is per-topic, deputy and group level, score 0–100 |
| `https://api.quehacenlosdiputados.es/voting/179-002460` | Returns `[]` — voting endpoint exists but is sparsely populated |
| `https://github.com/politicalwatch/qhld.es` | AGPL-3.0, Vue, 1,052 commits, last push 2026-03-19, 7 stars |
| `https://github.com/politicalwatch/qhld-backend` | Flask + Python 3.8, last push 2026-04-13 |
| `https://github.com/politicalwatch/qhld-engine` | Regex-based tagger (NOT LLM), last push 2026-03-28 |
| `https://github.com/politicalwatch` org page | Operator: Political Watch, "Data for social change and political innovation in the fight against poverty #CivicTech", website `politicalwatch.es`, email `info@politicalwatch.es` |
| `https://politicalwatch.es/` | Alliances: Code for All, Global Democracy Coalition, OECD CPIN, IA Ciudadana, Democracy Narratives Campaign, Coalición Proacceso |
| robots.txt | Not present (URL returns the SPA shell as fallback). No `Disallow` rules enforced — scraping is technically permitted but rate-limit politely. |
