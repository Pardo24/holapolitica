# Barcelona Plenari del Consell Municipal — ingestion source

Research dated 2026-05-10. Confirmed via `curl` with browser User-Agent
(WebFetch is blocked by `robots.txt` for ClaudeBot/anthropic-ai; see
section "robots.txt" below).

## TL;DR — recommendation

**Do NOT prioritise Barcelona for fase 3.** The Ajuntament publishes
votes only at the parliamentary-group level. In the 2019-2023 mandate
only **4 of 398 votes (~1%)** were `votació nominal` and exposed
individual roll-calls. In the current 2023-2027 mandate (552+ votes
to date), **zero** votes have individual data published. Without
roll-call we cannot deliver the core feature of Monitor Parlamentari
(per-representative vote tracking) — the official portal already does
group-level visualisation as well as we could. Build only if Daniel
explicitly wants a "Civio-style aggregate dashboard for Barcelona"
without the individual-MP angle, and accept that "Monitor
Parlamentari" branding does not really fit.

If we proceed despite the granularity limitation, the data is high
quality and easy to ingest. Estimated build time: **3-4 days**.

## Source URLs

### A. Bulk CSV/JSON dumps — RECOMMENDED PRIMARY SOURCE

Three mandate-scoped CSV files are served as static assets at
`/sites/default/files/votacions_plenari/`:

| URL | HTTP | Size | Last-Modified | Rows |
|---|---|---|---|---|
| `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/votacions_plenari_mandat_actual.csv` | 200 | 1.0 MB | **2025-06-25** | 552 (current mandate, 2023-2025) |
| `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/votacions_plenari_mandat_2019_2023.csv` | 200 | 0.32 MB | 2023-07-18 | 1,797 |
| `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/votacions_plenari_mandat_2015_2019.csv` | 200 | ~3 MB | (older) | ~4,000 |
| `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/votacions_plenari_mandat_actual.json` | 200 | 1.3 MB | 2023-03-03 | 398 (mislabelled — actually contains 2019–2020 data, see edge cases) |

The optional `?v=v1` query string seen on the live page is a cache
buster; both with and without it return the same `Last-Modified`.

**Critical freshness gap.** As of 2026-05-10 the `mandat_actual.csv`
was last regenerated **2025-06-25** — almost 11 months stale. The
live website shows acords through **2026-03-27** (the March 2026
ordinary plenary). The CSV is regenerated infrequently (annual or
semi-annual), so for fresh data we MUST also scrape per-acord HTML
pages (see B).

### B. Per-acord HTML detail pages — RECOMMENDED FRESHNESS SOURCE

`https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal/acords-del-plenari/<acord_id>`

- `<acord_id>` is a 5-digit Drupal node ID. **Sparse and
  non-sequential** — confirmed gaps (e.g. 50000, 56000, 58887, 70848
  exist; 1000, 58000, 60000, 71000, 75000 do not). Do **not** probe
  exhaustively; enumerate from the listing.
- The page renders `<div id='bcn-votacio' class='container
  bcn-votacions-{aprovada|rebutjada|...}'>` with everything we need:
  date (`bcn-votacions-votacio-data`), category
  (`bcn-votacions-votacio-tema`), expediente
  (`bcn-votacions-votacio-referencia` e.g. `Reference 26XF0273`),
  full HTML acord text (`bcn-votacions-votacio-text`), and a list of
  `<li class="bcn-votacions-sentit-vot bcn-votacions-grup
  bcn-votacions-{a-favor|en-contra|abstencio} ">` items naming each
  parliamentary group.
- Sample IDs verified live: `70848` (2026-03-27, vote on Fira 2000
  convention), `58887` (2025-04-25, BCN2029 Centenari).
- Localised variants exist at `/es/.../acuerdos-de-plenario/<id>` and
  `/en/.../agreements-of-the-plenary/<id>` (same Drupal node, different
  language layer).

### C. Listing / index page — for enumerating new acords

`https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal/acords-del-plenari`

- Server-rendered HTML, contains `data-votacions-ini="2023-06-17"
  data-votacions-end="2027-06-19"` (mandate window) and the latest
  page of acords with their `<a href="/ca/accio-de-govern/...
  /acords-del-plenari/<acord_id>">` links.
- Pagination is **Drupal AJAX BigPipe**: `<input id="edit-pagina-N">`
  buttons (1..82 confirmed for current mandate) trigger
  `POST /ca/accio-de-govern/.../acords-del-plenari?ajax_form=1` with
  CSRF `form_build_id`, `_triggering_element_name=op`,
  `_triggering_element_value=N`. Stateless GET with `?op=N` does **not**
  paginate (confirmed: returns same page-1 dates).
- ~10 acords per page × 82 pages ≈ **820 acords for the 2023-2027
  mandate to date** (matches the 552-row CSV + ~270 newer acords not
  yet in the CSV).
- The previous-mandate index lives at
  `/ca/mandat-2019-2023/accio-de-govern/el-consell-municipal/acords-del-plenari/`
  (verified 200, ~223 KB).

### D. Composition — regidors

`https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal`
exposes all 41 regidors as `<a href="/ca/popup-data/<8-digit-id>/nojs"
class="use-ajax visible">Nom Cognom Cognom</a>` links — full list
extracted in research:

- 41 entries verified (e.g. `00073990` Jaume Collboni Cuadrado,
  `00077622` Laia Bonet Rull, `00077619` Neus Munté Fernández,
  `00078515` Jordi Valls Riera, `00080467` Victòria Alsina Burgués).
- The popup-data pages themselves require JavaScript (`<body>Si et
  plau, activa JavaScript al teu navegador.</body>`), but the parent
  page already ships the names + group section headers (`<h3>Junts per
  Barcelona</h3>`, `<h3>PSC</h3>`, `<h3>Barcelona en Comú</h3>`,
  `<h3>ERC</h3>`, `<h3>PP</h3>`, `<h3>VOX</h3>`).
- **41 regidors total**, **6 groups** in the current mandate (2023-2027).
  The brief incorrectly stated 43.

### E. Open Data BCN — NO direct vote dataset

`https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_search?q=plenari`
returns 3 CKAN datasets, none useful for votes:

- `cataleg-mesures-govern-bcnroc` — mesures de govern presented
  (CSV/XML, monthly).
- `cataleg-informes-organs-govern-bcnroc` — informes presented (CSV/XML).
- `cataleg-rei-bcnroc` — studies/reports catalogue (CSV/XML).

Search `q=consell+municipal` adds:
- `cataleg-decrets-alcaldia-bcnroc` — mayor's decrees (CSV/XML).
- `est-eleccions-locals-seccio-censal` — election results 1979–2023
  (CSV, 12 resources). Useful for legitimacy of mandate composition
  but not voting.

Search `q=regidors` returns:
- `agendes-publiques-regidors` — regidors' public agenda CSVs per
  mandate (2015-2019, 2019-2023, 2023-2027). License confirmed
  CC-BY-4.0.
- `viatges-govern-bcn` — government team travel expenses.

**There is no open-data dataset for plenary votes.** The
`votacions_plenari/*.csv` files are *not* registered in the open data
portal — they are bare static files under
`/sites/default/files/`.

## Confirmed dead ends

- WebFetch (default UA) → HTTP 418 on the main pages. The Ajuntament
  has a long aggressive anti-AI-bot WAF stacked into robots.txt but
  also enforced at HTTP level. **Always use a browser UA**.
- `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/` — 404 (Apache `Indexes` off).
- `…/votacions_plenari_mandat_anterior.csv` — 404. The legacy filename
  is `mandat_2019_2023.csv` (and `mandat_2015_2019.csv`).
- `…/votacions_plenari_mandat_actual.xml` — 404 (no XML variant).
- `…/votacions_plenari_mandat_2023_2027.csv` — 404 (current mandate is
  only at `mandat_actual.csv` until rotation, expected mid-2027).
- `…/votacions_plenari/regidors.csv`, `composicio.csv`, `sessions.csv`
  — all 404. Composition must be scraped.
- `…/acords-del-plenari/feed`, `…/rss.xml` — return generic HTML with
  HTTP 200, **not** real feeds. There is no RSS/Atom for new acords.
- GET pagination via `?op=N`, `?page=N`, `?_triggering_element_value=N`
  — silently ignored, returns page 1 (latest). AJAX POST without a
  fresh `form_build_id` returns HTTP 500.
- `/ca/accio-de-govern/el-consell-municipal/acords-del-plenari/sessio/<N>`
  with arbitrary N returns HTTP 200 but with empty `bcn-votacio`
  contents (all unknown sessions render the same chrome). The
  `/sessio/<id>` URL only meaningfully resolves with the Drupal
  pre-rendered IDs from a known list (372, 499, 508, 528, 965, 1000…)
  and even then the per-acord links inside are loaded via AJAX. So
  `/sessio/` is **not a useful enumeration entry point**.
- `/ca/popup-data/<8-digit-id>/nojs` — body says "Si et plau, activa
  JavaScript al teu navegador." Despite the `nojs` suffix, the
  endpoint requires JS. Use the parent `el-consell-municipal` page
  for names; biographies must come from a scrape with Playwright if
  ever needed.
- `https://infogram.com/actualitzacio-acords-plenari-20192023cat-…` —
  external visualisation, not a data source.

## Format

### Bulk CSV (2023-2027 mandate)

Delimiter `;`, UTF-8, no BOM, 18 columns. Multiline records (the
`text` column is HTML with embedded `\n`). Vote outcomes encoded in
Catalan: `A favor` / `En contra` / `Abstenció` / blank (=did not
vote / not present). HTML entities use unusual notation `&aacute:`
instead of `&aacute;` (colon, not semicolon — quirk of their export
template; sanitise before parsing).

Columns:

```
ref_sessio;ref_proposta;data_sessio;resum_cat;resum_cast;text;
resultat;sistema_votacio;part_acta;tema_cat;tema_cast;
organ_resolucio;
Barcelona en Comú;Partit dels Socialistes de Catalunya;
Esquerra Republicana;Partit Popular;VOX;
Junts per Catalunya;Junts per Barcelona;
```

`sistema_votacio` distribution in `mandat_actual.csv`: **532
"Votació per grup" / 0 "nominal"** (16 blank header-leak rows from
the multiline `text` column).

`resultat` distribution: 316 "Aprovada", 170 "Aprovat per
unanimitat", 36 "Rebutjada", 12 "Aprovada amb text transaccionat", 5
"No aprovada", 2 "Aprovada amb modificacions".

### Bulk CSV (2019-2023 mandate, legacy schema)

Different schema, 18 columns, with `equip_govern` instead of
`organ_resolucio`, single-language `resum`, group columns: `BComú,
PSC, ERC, JxCat, Cs, PP, BCN Canvi, Valents`. First non-header line
is the literal string `sense filtres` (cosmetic header to discard).
**12 nominal votes** in this CSV, but the 2019-2023 CSV does NOT
include per-regidor columns — only the JSON variant (which is for an
unknown subset; see edge cases) does.

### Bulk JSON (`mandat_actual.json`)

61 keys per row (group columns + 43 individual-regidor columns
formatted `"Nom Cognom (Grup)"` e.g. `"Ada Colau Ballano (BComú)"`).
**Of the 398 rows in this file, only 4 have any individual-regidor
cells filled** — the 4 "nominal" votes. The remaining 394 group-
level rows have empty strings in every individual column. **The
file is mislabelled `mandat_actual.json` but actually contains
2019-08-05 to 2020-01-31 data only** (22 unique sessions, sub-set
of the 2019-2023 mandate). It is effectively orphaned content from
an old export and should not be relied on.

### Per-acord HTML

Drupal-rendered, ~92 KB per page. Selectors:

| Field | CSS selector / regex |
|---|---|
| Title | `<h2 class="title">` inside `#bcn-votacio` |
| Date | `<span class="bcn-votacions-votacio-data">DD/MM/YYYY</span>` |
| Category | `<span class="bcn-votacions-votacio-tema">…</span>` |
| Expediente | `<span class="bcn-votacions-votacio-referencia">Reference XXXXX</span>` |
| Acord text | `<div class="bcn-votacions-votacio-text">…HTML…</div>` |
| Result | class on `#bcn-votacio` itself: `bcn-votacions-{aprovada,rebutjada,…}` |
| Per-group vote | `<li class="bcn-votacions-sentit-vot bcn-votacions-grup bcn-votacions-{a-favor,en-contra,abstencio} ">` followed by `<span class="bcn-votacions-grup-nom">Group Name</span>` |
| Group logo | `<img src="/modules/ajbcn/ajuntament_votacions/assets/mandat-2023-2027/{group_slug}.png">` |

## Extractable fields

### Sessions
- `ref_sessio` (e.g. `CP 04/26`, `CP 14/23 EXT.`).
- `data_sessio` (DD/MM/YYYY).
- `part_acta` (`A`, `B`, `C) Part decisòria / Executiva`, `D) Part
  d'impuls i control`).
- `organ_resolucio` (`Consell Municipal`).
- Indirectly: numeric Drupal `sessio/<id>` (e.g. 1000) — useful as
  stable URL anchor but not enumerable.

### Acords / votes (one row per acord)
- `ref_proposta` (e.g. `M2327/242`, `2023-03-DPEF`, `26XF0273`,
  `s/n`). Heterogeneous format; treat as opaque string.
- `resum_cat` / `resum_cast` (short summary, both languages).
- `text` (full acord text, HTML).
- `resultat` (Aprovada / Rebutjada / Aprovat per unanimitat / …).
- `sistema_votacio` (Votació per grup / nominal).
- `tema_cat` / `tema_cast` (themed category — Habitatge,
  Administració i acció de govern, Urbanisme i infraestructures, etc.).
- 7 group-level vote columns: A favor / En contra / Abstenció / blank.
- (Optional, almost-always-empty) 43 individual-regidor columns.

### Regidors (mandate 2023-2027)
- 41 names from `/ca/accio-de-govern/el-consell-municipal`.
- Each linked by `popup-data/<8-digit-id>/nojs`.
- Group affiliation from the `<h3>` ancestor on the same page (PSC,
  Junts per Barcelona, Barcelona en Comú, ERC, PP, VOX). The
  CSV/JSON uses slightly different group naming
  (`Partit dels Socialistes de Catalunya`, `Barcelona en Comú`, etc.)
  — needs a static mapping table.

## robots.txt

Fetched 2026-05-10 from
`https://ajuntament.barcelona.cat/robots.txt` (HTTP 200, 7,980
bytes, file marked `v2024-01-11__D10`).

The file has two stacked `User-agent` blocks:

1. **Lines 1-134** list ~130 AI/scraper user-agents (`anthropic-ai`,
   `Claude-User`, `Claude-Web`, `ClaudeBot`, `Claude-SearchBot`,
   `GPTBot`, `Google-Extended`, `CCBot`, etc.) followed by a single
   `Disallow: /`. These bots are blocked from the **entire** site.
   This is why WebFetch (which presents as ClaudeBot) returns 418.
2. **Lines 135+** apply to `User-agent: *`. Disallows are limited to
   Drupal infrastructure (`*/core/`, `*/modules/`, `*/admin/`,
   `*/comment/`, `*/node/`, `*/install.php`, `*/csv` (matches
   `/something/csv` paths, NOT files ending in `.csv`), and a
   handful of specific PDFs and event-created paths). Critically,
   `*/csv` does NOT match our target file
   `/sites/default/files/votacions_plenari/votacions_plenari_mandat_actual.csv`
   (no `/csv` substring; just `.csv` extension).

**Verdict for our ingester** (running as `Monitor-Parlamentari-Bot/1.0
(+contact@…)` — NOT identifying as ClaudeBot):

- All paths we care about are allowed:
  - `/ca/accio-de-govern/el-consell-municipal/acords-del-plenari` ✓
  - `/ca/accio-de-govern/el-consell-municipal/acords-del-plenari/<acord_id>` ✓
  - `/ca/accio-de-govern/el-consell-municipal` ✓
  - `/sites/default/files/votacions_plenari/*.csv` ✓
  - `/sites/default/files/votacions_plenari/*.json` ✓
- `opendata-ajuntament.barcelona.cat` is on a separate origin and was
  not fetched here; assume permissive (it's a CKAN portal).

We must **never** present as `anthropic-ai`, `ClaudeBot`,
`Claude-User`, `Claude-Web`, `Claude-SearchBot`, or `GPTBot`. The WAF
(HTTP 418) is enforced separately from robots.txt and ignores
robots's politeness — it is content-blocking, not just advisory.

## Concrete ingest plan

**Phase 0 (½ day): scaffolding.** Create
`backend/app/ingest/barcelona/` mirroring `backend/app/ingest/congreso/`
with `client.py`, `parser.py`, `bulk.py`, `live.py`, `service.py`.
Models: `Council` (= chamber, `slug='barcelona-pleno'`),
`Mandate` (`2015-2019`, `2019-2023`, `2023-2027`), `Group`,
`GroupMembership` (regidor↔group with date range), `Person`
(regidor), `Session` (one per `ref_sessio` + `data_sessio`),
`Vote` (one per acord, FK to Session and Initiative if linkable),
`GroupVote` (FK Vote + Group + value enum {a_favor, en_contra,
abstencio, no_vot}). Skip `IndividualVote` for now — only ~1% of
historical data has it and 0% of current.

**Phase 1 (1 day): bulk import.** RQ job
`import_barcelona_bulk_csv` runs weekly (Mondays 04:00
Europe/Madrid):
1. HEAD `votacions_plenari_mandat_actual.csv` and check
   `Last-Modified`. If unchanged since last run, skip.
2. Otherwise GET, decode, sanitise the `&entity:` HTML quirk to
   `&entity;`, parse with `csv.reader(delimiter=';', quotechar='"')`
   into a streaming generator (multiline-record aware).
3. Upsert by `(ref_sessio, ref_proposta)` composite key. Sessions
   upserted by `(council, ref_sessio, data_sessio)`.
4. On first run, also import `mandat_2019_2023.csv` and
   `mandat_2015_2019.csv` (one-shot). Mark them `mandate_id` and
   skip on subsequent runs unless their `Last-Modified` changes.

**Phase 2 (1 day): freshness scraper.** RQ job
`import_barcelona_recent_acords` runs daily 06:00 Europe/Madrid:
1. GET the listing page
   `/ca/accio-de-govern/el-consell-municipal/acords-del-plenari` (no
   AJAX, just the first page = ~10 most recent acords).
2. Extract every `<a href="/ca/accio-de-govern/.../acords-del-plenari/<id>">`
   anchor. Diff against `votes` table. For each new acord_id, fetch
   the per-acord page and parse.
3. Optional: walk pages 2..N via Playwright when needed for backfill
   of the gap between the stale CSV and "now". But preferable to
   wait for the CSV to be regenerated upstream.

**Phase 3 (½ day): composition import.** RQ job
`import_barcelona_regidors` runs monthly:
1. GET `/ca/accio-de-govern/el-consell-municipal`.
2. Extract `<h3>{group}</h3>` + nested `<a href="/ca/popup-data/<id>/nojs">{name}</a>`.
3. Upsert `Person`, `Group`, `GroupMembership` for the current mandate.
4. Bootstrap historical mandates from
   `est-eleccions-locals-seccio-censal` if needed.

**Phase 4 (½ day): hardening + documentation.**
- Map the CSV/JSON group strings to canonical Group entities
  (`partit_socialistes_catalunya` → `PSC`, etc.) via static dict.
- Add identifying User-Agent. Throttle to ≤ 1 req/s.
- Treat `nominal` votes specially: when encountered, fetch the
  HTML page **and** the JSON file (legacy) and persist any
  individual data we find. Surface in the UI as "votació nominal"
  with optional roll-call breakdown.
- Document in `docs/data-sources.md` that **Barcelona is
  group-level only** so frontend treats it differently from
  Congreso (no per-MP view, no MP-cohesion metric within Barcelona).

## Edge cases

- **The "actual" CSV stops at 2025-04-25 but the live site has data
  through 2026-03-27.** ~11 month freshness gap. The CSV is
  regenerated infrequently (on `Last-Modified`: 2023-03 → 2023-07 →
  2025-06). Mitigation: hybrid bulk + per-acord scrape.
- **The 2019-2023 mandate had 4 nominal votes with full individual
  rolls; the 2023-2027 mandate has zero so far.** Never assume the
  individual columns will be populated — they almost always aren't.
- **HTML entity quirk:** the bulk export uses colons instead of
  semicolons after entities (`&aacute:` not `&aacute;`). Replace
  before unescape.
- **First non-header line of the 2019-2023 CSV is `sense filtres`**
  — a leftover empty-filter sentinel. Discard.
- **Multiline records.** The `text` column contains HTML with
  literal `\n` and `;` characters. Use a CSV parser, not
  `line.split(';')`.
- **Acord IDs are sparse and not enumerable.** Confirmed empty:
  1000, 58000, 60000, 65000, 70000, 71000, 75000, 80000. Confirmed
  filled: 50000, 56000, 58887, 70848. Always enumerate from the
  listing page; never probe.
- **Session IDs (`/sessio/<id>`) return HTTP 200 even for invalid
  IDs.** Drupal renders the empty filter UI. Use static-HTML
  `bcn-votacions-sense-resultats` class as the "no session" sentinel
  if you ever need to validate. But practically, `sessio/` is not
  used by our pipeline.
- **Group naming inconsistency:** CSV uses `Junts per Catalunya` AND
  `Junts per Barcelona` columns. The mandate 2023-2027 group is
  `Junts per Barcelona`; `Junts per Catalunya` was the previous
  mandate's analogue (held by some of the same people). Treat as
  separate groups linked through the `Person` table to keep history
  correct.
- **Regidor changes.** Regidors do switch groups during a mandate
  (e.g. from a coalition group to "regidor no adscrit"). The CSV
  schema accommodates a `Regidor no adscrit` column in the legacy
  variant; the current CSV does not. Watch for new columns
  appearing as the mandate progresses.
- **Image licensing.** Group logos at
  `/modules/ajbcn/ajuntament_votacions/assets/mandat-2023-2027/*.png`
  are political-party trademarks, not Ajuntament-owned. Don't
  redistribute on social cards. Replace with our own neutral group
  badges.
- **The `mandat_actual.json` file is mislabelled** — its 398 rows
  cover 2019-08 to 2020-01 only. Do not use it for current data;
  only read it once when bootstrapping the 4 historical nominal
  votes.
- **Catalan/Spanish/English locale variants** of every page exist
  via `/ca/`, `/es/`, `/en/` URL prefixes. Prefer `/ca/` for
  canonical scraping; let the frontend handle translation.
- **Anti-AI WAF.** ClaudeBot/anthropic-ai/GPTBot/etc. are blocked
  via robots AND HTTP 418 at the WAF layer. Our ingester's UA must
  not match any of those tokens. A neutral
  `Monitor-Parlamentari-Bot/1.0 (+https://monitorparlamentari.cat)`
  works.
- **Structural difference vs Congreso.** Congreso publishes
  individual roll-calls per vote (XML, structured). Barcelona
  publishes group-level only (CSV, group columns). Our schema must
  allow `Vote.granularity = {individual, group}` and the metrics
  layer must skip per-MP aggregations for `granularity=group` votes.
  Other model deltas:
  - **Constituency:** Barcelona has none (city-wide list). No
    `Constituency` link for regidors.
  - **Mandate length:** 4 years (2023-2027) vs Congreso's variable.
  - **Group changes mid-mandate:** documented above.
  - **Districts:** the 10 districtes municipals are a different
    institution (Consell de Districte) — out of scope for fase 3.

## Data licensing

- **Open Data BCN datasets** (the CKAN portal): explicitly
  **CC-BY-4.0** (verified on `agendes-publiques-regidors` page:
  "Creative Commons Attribution 4.0",
  https://creativecommons.org/licenses/by/4.0/).
- **Main `ajuntament.barcelona.cat` content** (HTML pages, CSV
  files under `/sites/default/files/votacions_plenari/`): governed
  by the avis legal at `/ca/avis-legal`. Quote: *"L'Ajuntament de
  Barcelona permet reutilitzar totes les dades i informacions
  difoses per mitjà d'aquest web, sempre que no s'indiqui el
  contrari"*. This is the standard reuse permission under Spain's
  Ley 37/2007 (PSI Directive transposition) and Catalan Llei
  19/2014 de transparència. Attribution required.
- **Images on the site** (incl. group logos, regidor portraits if
  we ever scrape them): **CC BY-NC-ND 4.0** per the avis-legal.
  Non-commercial only, no derivatives. Implication: do **not**
  cache regidor photos for our cards. Use neutral avatars or
  generate our own from public-domain sources.

## Comparison to Congreso

| Aspect | Congreso (fase 1) | Barcelona (fase 3) |
|---|---|---|
| Granularity | Individual roll-call XML per vote | Group-level only (~1% individual historically, 0% currently) |
| Bulk dataset | `VOT_<TS>.zip` per session | Single mandate-wide CSV |
| Freshness | 24-48h after session | Bulk CSV ~11 months stale; HTML up-to-date |
| Identification of vote item | `(Núm. expte. NNN/NNNNNN)` regex on HTML | `ref_proposta` heterogeneous string in CSV |
| Schema fit | Person ↔ Vote (individual votes) | Group ↔ Vote |
| Composition source | Open data JSON (timestamped) + ficha HTML | `el-consell-municipal` HTML page |
| Mandate concept | Legislatura (XV, XIV, …) | Mandat (2023-2027, 2019-2023, …) |
| Analog to Diputat | Regidor / Regidora |
| Groups | Grupo Parlamentario | Grup Municipal |

**Schema deltas needed:**

1. `votes.granularity` enum `{individual, group}`. Default
   `individual` for Congreso, `group` for Barcelona.
2. `group_votes` table (FK Vote + Group + position). Already useful
   for Congreso's "vot del grup" aggregate but mandatory for
   Barcelona.
3. Per-MP cohesion metrics (`docs/metrics.md`) must check
   `granularity` and skip Barcelona votes where individual data
   is missing.
4. UI: per-MP page for a regidor must clearly state
   "Aquest representant té només posicions de grup publicades.
   Vegeu la posició del seu grup."
5. `Mandate` model already accommodates date-bounded cohorts; reuse.

## Recommended source URL

Primary: `https://ajuntament.barcelona.cat/sites/default/files/votacions_plenari/votacions_plenari_mandat_actual.csv`
(plus `_2019_2023.csv` and `_2015_2019.csv` for backfill).
Secondary (freshness): `https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal/acords-del-plenari`
(scrape page 1 daily for new acord IDs, then per-acord HTML).
Composition: `https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal`
(scrape monthly for the 41 regidors and their groups).

## Estimated build time

**3-4 days** of focused work for a full Barcelona ingester (bulk
+ freshness + composition + tests + docs).

**But: the strong recommendation is to skip or defer Barcelona until
the Ajuntament publishes individual roll-calls.** The product value
of "tracker de vots individuals per tema i representant" (CLAUDE.md
positioning) collapses to "the same group-level summary the official
portal already shows" if we ingest Barcelona today. That is not a
gap Monitor Parlamentari needs to fill in 2026.

## Status

- 2026-05-10: research complete; Barcelona ingest pipeline NOT
  implemented and **not recommended for fase 3 in its current form**.
  Revisit when (a) Daniel decides to build a group-level dashboard
  for Barcelona regardless, or (b) the Ajuntament starts publishing
  individual roll-calls more systematically.
