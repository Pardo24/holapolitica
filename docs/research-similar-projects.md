# Research: similar parliamentary tracker projects

Date: 2026-05-08
Source: autonomous research (Daniel review pending)
Time-boxed: ~20 minutes of WebFetch + GitHub API + targeted web search.

## TL;DR — what we can borrow

- **Vote → initiative linking is solved by scraping the vote DETAIL HTML page, not the XML.** The XML at `/webpublica/opendata/votaciones/...VOT_*.xml` does NOT contain the expediente. But the public HTML page at congreso.es renders each vote row with a link whose visible text is `(Núm. expte. NNN/NNNNNN)`. proyecto-colibri (the only Spanish project that actually solved this) extracts it with a regex on the link text. We should mirror that.
- **There is no clean "list all historical sessions" API at congreso.es today.** The reference index is the per-legislature Diario de Sesiones page (`/es/cem/dspl<NN>-<roman>`) and the historical archive at `app.congreso.es/est_sesiones/` (1808–1977 only). Plenary diary PDFs are deterministic and sequential: `/public_oficiales/L<NN>/CONG/DS/PL/DSCD-<NN>-PL-<NNN>.PDF`. **Probing this sequence is the cleanest enumeration** — no 403 directory listing, just a numeric range.
- **No active Spanish open-source competitor exists.** quesevota.es is the only live tracker with vote→initiative linking, but it's closed-source. proyecto-colibri (the historical reference) is dead since 2019-01 and targets the OLD congreso.es portal — every URL it uses is now broken. Civio (which CLAUDE.md cites as referent) has zero vote/MP-tracker repos; their work is budgets, lobby and contracts. **We are the only credible candidate to fill this gap in 2026.**
- **The international peers all have it easier than us.** Canada (openparliament.ca) and the UK (TWFY) work from native bill-aware XML feeds where vote→bill is upstream. Germany's abgeordnetenwatch is an API-first national NGO with backing — they normalize and republish; their Bundestag uses an open polls API where vote-to-bill is materialized server-side. None of them solved a problem isomorphic to ours, but Canada's "fetch list XML, then per-vote XML" pattern is a good template once we have the session enumerator.
- **Pragmatic fallback for ambiguous titles:** TF-IDF / fuzzy match the vote's `TextoExpediente` string against the iniciativas index `(/es/iniciativas)`, and flag low-confidence matches for human review. proyecto-colibri did the lookup by exact `record` extraction; if HTML scraping breaks, this is the backup.

---

## Per project

### proyecto-colibri (`openkratio/proyecto-colibri`)

- **Scope:** Spanish Congreso. Diputados, parliamentary groups, terms, votes, initiatives, commissions, alerts. Django 1.x + Tastypie REST + Scrapy.
- **Status:** Dead. Last push 2019-01-03. 35 stars, GPL-3.0. Created 2013-03.
- **Tech stack:** Python (Django, Scrapy, Tastypie, BeautifulSoup), JavaScript front-end, MySQL/Postgres.
- **Languages:** Spanish for content, English for code identifiers.
- **Data sources & files:**
  - `scrap/spiders/votes.py` — votes spider. Allowed-URL pattern: `'/votaciones/OpenData\?sesion=\d+&votacion=\d+&legislatura=\d+'`. Historical navigation: `'/wc/accesoHistoricoVotaciones&fechaSeleccionada=' + date_session`.
  - `scrap/spiders/inits.py` — initiatives spider. Start URL: `http://www.congreso.es/portal/page/portal/Congreso/Congreso/Iniciativas/Indice de Iniciativas`. Pagination via `DOCS=\d+-\d+` and `PIECE=\w+` URL params on the `servidorCGI` endpoint with `BASE=IW10`.
  - `scrap/spiders/members.py` — diputados spider. Start: `…/Diputados?_piref73_…/menuAbecedarioInicio&tipoBusqueda=completo&idLegislatura=`. Detail: `fichaDiputado?idDiputado=\d+&idLegislatura=`.
- **Historical-vote enumeration:** They drove the spider with a date parameter, then followed `accesoHistoricoVotaciones&fechaSeleccionada=DD/MM/YYYY` links. Effectively they paginated a server-side calendar by feeding it dates. The old portal's date-driven endpoint **does not exist on the new (post-2020) portal**; every URL listed above returns 404 today.
- **Vote → initiative linking:** Solved by HTML scrape, not XML.
  - Verbatim from `votes.py`: `record = re.sub('\(N\\xfam. expte. ', '', link.text).strip(')')` then `Initiative.objects.filter(record__exact=record)`.
  - Translation: each row in the vote-details HTML page has a link whose visible text is something like `Proposición no de Ley relativa a … (Núm. expte. 162/000123)`. They strip the `(Núm. expte. ` prefix and `)` suffix and use the resulting `162/000123` as a key into the previously-scraped initiatives table.
  - This is the **single most important finding** for our problem (b). The expediente IS in the public surface — just on the HTML page, not the XML.
- **What they don't do:** No metric/cohesion analysis. No newsletter, no embeds, no social cards. No Catalan parliament. No multilingual UI.
- **Reusable today:** The IDEA (HTML extraction of expte. from link text) and the data model (member / mandate / parliamentary_group / vote / initiative / record). The CODE is dead — Django 1, Python 2 (note `\xfa` for "ú" hints Py2), all URLs broken.

### TheyWorkForYou (`mysociety/theyworkforyou` + `mysociety/parlparse`)

- **Scope:** UK Westminster + Lords + devolved (Scotland, Wales, NI). Speeches, divisions, written answers, bills.
- **Status:** Very active. theyworkforyou last push 2026-05-07 (yesterday); parlparse 2026-05-07. 250 / 68 stars. mySociety is a 20-year-old civic-tech NGO; this is institutional-grade.
- **Tech stack:** PHP front-end (legacy), Perl + Python scrapers in `parlparse`. Scrapers include `pyscraper/wa/parse.py` (Welsh Assembly), `pyscraper/ni/`, `pyscraper/lords/`, `new_hansard.py`.
- **Data sources:** Hansard XML feeds from `data.parliament.uk`. Member data from data.parliament.uk + manual curation in `parlparse/members/*.json`.
- **Historical-vote enumeration:** Hansard has structured XML by date. Scrapers like `parse.py` use `BeautifulSoup(votes, "xml")` and iterate elements `XML_Plenary_Vote`. The pattern is "fetch a daily/weekly XML index, parse each entry." Not directly applicable to us — Spain has no equivalent index.
- **Vote → bill linking:** UK Hansard XML for divisions includes the bill reference inline; no scraping/regex required upstream. They also have a downstream PublicWhip / TWFY-Votes pipeline where voting "policies" group divisions semantically — but that's editorial layered ON TOP of clean upstream linkage.
- **What they don't do:** They don't do social cards, embed widgets, newsletter (TWFY has email alerts but not editorial digest), or non-UK parliaments. So even at the global state of the art, "embed widget for any vote" and "weekly editorial newsletter" are still gaps to fill.
- **Useful for us:** The repo structure (separate scraper repo from web app) and their decade-long approach to MP identity reconciliation across name changes (`gidmatching.py`, `members/*.json`). When we hit the "diputados change groups mid-legislature" problem, look at `parlparse/members`.

### openparliament.ca (`rhymeswithcycle/openparliament`)

- **Scope:** Canadian House of Commons. Bills, votes, members, debates, committees, hansards.
- **Status:** Active. Last push 2025-06-11. 307 stars, AGPL-3.0. Single maintainer (Michael Mulley) but consistent.
- **Tech stack:** Python / Django, Postgres, Solr-ish text search. Modules under `parliament/{bills,politicians,hansards,imports,…}`.
- **Data sources & files:**
  - `parliament/imports/parlvotes.py` — votes:
    - List feed: `https://www.ourcommons.ca/members/{lang}/votes/xml`
    - Per-vote detail: `https://www.ourcommons.ca/members/en/votes/{parliamentnum}/{sessnum}/{votenumber}/xml`
  - `parliament/imports/legisinfo.py` — bills:
    - Bill list: `https://www.parl.ca/legisinfo/en/bills/json?parlsession={sessid}`
    - Bill detail: `https://www.parl.ca/LegisInfo/en/bill/{parlnum}-{sessnum}/{billnumber}/json`
  - Other importers in `parliament/imports/`: `mps.py`, `parlvotes.py`, `parl_cmte.py`, `parl_document.py`, `legisinfo.py`, `billtext.py`, `election.py`.
- **Historical-vote enumeration:** Easy — the master XML feed `/votes/xml` returns ALL votes for the parliament. They iterate, dedup against DB, and only fetch detail XML for new ones. Spain has no such master feed; this approach doesn't translate.
- **Vote → bill linking:** Trivial here — the per-vote XML response has the associated bill ID as a structured field. Canada solved upstream what Spain forces downstream.
- **What they don't do:** No social cards, no embed widgets, no provincial parliaments. Bilingual UI (EN/FR) but nothing beyond Canadian federal level.
- **Useful for us:** The two-tier import pattern (cheap list-fetch → diff against DB → expensive per-item fetch) is exactly the shape `backend/app/ingest/congreso/` should take. When we have a working session-enumerator, the rest of the importer should look like `parlvotes.py`.

### openpolis / openparlamento (`openpolis/openparlamento`)

- **Scope:** Italian Parliament tracker (Camera + Senato), part of Fondazione Openpolis ecosystem.
- **Status:** Effectively dormant on GitHub. Last push 2021-10-06 on the public repo, marked "perfectly working legacy code." Note: the LIVE service (`parlamento.openpolis.it`) is still operating — they just don't push to GitHub anymore. 45 stars.
- **Tech stack:** PHP 84%, symfony 1.0 (very legacy). The Italian parliament feeds them structured XML directly, so the scraper code we'd want isn't open-sourced; the `openparlamento` repo is mostly the front-end and ORM.
- **Other openpolis repos:** `op_api3` (Django REST), `open_municipio` (Italian municipalities), `op_api2`, none addresses our two problems.
- **Historical-vote enumeration:** Not visible from the public repo. Italian Camera publishes structured XML per session, so Openpolis likely follows a sitemap-style index.
- **Vote → bill linking:** Italian XML includes the atto identifier upstream. Same pattern as Canada/UK — they receive linked data, don't have to reconstruct it.
- **What they don't do:** Source-code transparency, evidently. The visible repo doesn't help us with our specific problems.
- **Useful for us:** The Italian "Indice di Productività" methodology (referenced in `op_indice` repo) is a good model for cohesion/productivity metrics IF we ever do them — but only with the symmetric-pair guardrail from CLAUDE.md.

### abgeordnetenwatch.de

- **Scope:** Bundestag, all 16 Länder parliaments, EU Parliament. Politicians, polls (votes), candidacies.
- **Status:** Very active commercial NGO product. They are an API-first project, not a scraper. Public API at `https://www.abgeordnetenwatch.de/api/v2`. Data is CC0.
- **Endpoints:**
  - `/api/v2/parliaments`, `/api/v2/parliament-periods`, `/api/v2/politicians`, `/api/v2/candidacies-mandates`, `/api/v2/polls`
  - Per-poll vote breakdown via `?related_data=votes`
- **GitHub presence:** They don't open-source the ingest pipeline. The repos under the `abgeordnetenwatch` GitHub user are minor utilities; the third-party clients (`maschinenlesbareregierung/aowatch-client`, `Bluemi/abgeordnetenwatch-python`) just wrap the API.
- **Historical-vote enumeration:** Solved internally and exposed cleanly — `/polls?range_start=…&range_end=…` paginates over all historical polls. Not applicable to us (we're upstream of any such API for Spain).
- **Vote → bill linking:** Polls reference Bundestag-Drucksachen but the linkage detail isn't in the public excerpt I could fetch; my read is they expose the poll-title and a manual editorial reference to the Drucksache. They have paid editors curating this.
- **What they don't do:** Open-source ingest. So we can borrow their data model + the value prop (single-source national+regional MP tracker) but not code.
- **Useful for us:** Their API surface is the gold standard for what our future v2 API should look like. Bookmark `/api/v2/polls` as a model when we design `/api/v1/votes`.

### Spanish secondaries (mostly dead, brief notes)

- **`quehacen/que_hacen`** — Last push 2013-11. PHP. 10 stars. No license. Same problem they tried to solve, abandoned 12 years ago.
- **`quehacen/que_hacen_api`** — Last push 2014-12. JavaScript wrapper around `que_hacen`. 3 stars.
- **`Xayiide/Congreso`** — Last push 2022-10. 0 stars. A student/hobby project, not useful.
- **`rafaparadela/congresoaldia`** — A static-site front-end consuming proyecto-colibri's API, dead with it.
- **`civio/*`** — 30+ repos, 0 about MP votes / parliamentary activity. They explicitly do budgets, contracts, lobby, party register, electoral results. Confirmed: **no overlap, no competition.**
- **`quesevota.es`** — Live as of 2026-05. Closed source. Tracks Spanish Congress votes with expte. linking. Operator unidentified from front-end. **This is the only currently-running Spanish vote tracker.** They likely use the same HTML-scrape trick as proyecto-colibri did.
- **`OpnTec/parliament-scraper` and `kjam/europarl_scraper`** — EU Parliament focus, not Spanish Congreso. Not useful for our two problems.

---

## Recommendations for our two open problems

### Backfill of historical votes

**Recommended approach: deterministic session-number probing, anchored on the Diario de Sesiones index.**

The argument:

1. The Diario de Sesiones plenary PDFs follow a strict deterministic pattern: `https://www.congreso.es/public_oficiales/L<NN>/CONG/DS/PL/DSCD-<NN>-PL-<NNN>.PDF` where `<NN>` = legislature number (zero-padded, e.g. `15`) and `<NNN>` = session number (zero-padded, e.g. `135`). Each plenary session gets exactly one such PDF. Counting them = counting sessions.
2. Probing `DSCD-15-PL-001.PDF, DSCD-15-PL-002.PDF, …` until 404 enumerates all plenary sessions of legislature XV with bounded cost (~200 HEAD requests for a full legislature). This is cheaper and more reliable than scraping calendar HTML.
3. For each session number we get, the actual VOTE ZIP lives at `/webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/VOT_<ts>.zip` — but the date and timestamp are unknown. Solution: scrape the Diario de Sesiones page header to get the date for that session; then we know `Sesion<NNN>/<YYYYMMDD>/`. The unknown is only `VOT_<ts>.zip`.
4. For the unknown timestamp: the per-session HTML vote page (`/es/opendata/votaciones?…sesion=<N>`) typically returns `<a href>` links to each vote XML by its full URL. Scrape the first vote link out of HTML, lift the timestamp directory, then fetch all votes in that session's directory.
5. **Fallback if step 4 breaks:** brute-force probe `VOT_<YYYYMMDD>HHMMSS.zip` is impractical (86400 candidates per day). Better fallback: parse the BOCG (Boletín Oficial de las Cortes Generales) index at `/es/cem/bocg-<NN>` which lists all official publications including vote summaries with their ZIP links.

**What we should NOT do:**
- Scrape the new `/es/busqueda-de-votaciones` portlet — it's stateful, JS-driven, and only shows "current" results without obvious deep-linking.
- Replicate proyecto-colibri's `accesoHistoricoVotaciones` calendar-driven scraping — every URL it uses is dead since the 2020 portal redesign.
- Use `app.congreso.es/est_sesiones/` — that's 1808–1977 archive, irrelevant for current legislatures.

**Concrete next steps:**
- Spike 1 (1 day): write a probe script that hits `DSCD-15-PL-001..N.PDF` and emits a CSV of `(legislature, session_number, date)`. Confirms session count and gives the date map.
- Spike 2 (1 day): for one known session, scrape the vote-list HTML page and extract the `VOT_<ts>` timestamp. If reliable, productionize. If JS-rendered, fall back to BOCG.
- Backfill the XV legislature once both spikes are green.

### Vote → initiative linking

**Recommended approach: scrape the public per-vote HTML detail page, regex the `(Núm. expte. NNN/NNNNNN)` substring, lookup against pre-loaded initiatives table.**

The argument:

1. proyecto-colibri solved this exact problem in 2014–2018 with one regex: `re.sub('\(N\\xfam. expte. ', '', link.text).strip(')')`. The regex still works in 2026 — the convention `(Núm. expte. NNN/NNNNNN)` has been stable across portal redesigns because it comes from the parliamentary office's own document templates, not the website.
2. The expediente codes follow `tipo/numero` where `tipo` is a 3-digit code (121 = Proyecto de Ley, 122 = Proposición de Ley de iniciativa parlamentaria, 161/162 = Proposiciones no de Ley, etc.) and `numero` is 6 zero-padded digits. We should validate format with a regex like `^\d{3}/\d{6}$` and store as a string `official_id`.
3. We pre-import the initiatives index from `/es/busqueda-de-iniciativas` (independently scraped) into a table keyed by `official_id`. At vote-import time, we extract the expte from the vote HTML page, look up by `official_id`, and link via FK. Unmatched expedientes (e.g. votes on a procedural motion not tied to any iniciativa) get NULL `initiative_id` and a `kind = procedural` flag.
4. Some votes legitimately have NO expediente — pure procedural votes, internal organisation votes, vote on the candidacy for a presidente de mesa, etc. We should NOT force-match; about 10–15% of votes should remain unlinked and that's correct.

**Fallback for when HTML scrape returns no expediente but the vote is clearly substantive:**
- Fuzzy-match the vote's `<TextoExpediente>` field (the long subtitle in the XML) against `iniciativas.title_original` using TF-IDF cosine similarity. Threshold ~0.85 and require a unique match. Below threshold → flag for manual review; never auto-link silently.
- LLM-assisted matching is overkill — the title text and initiative title are both bureaucratic templates that match with simple string similarity.

**What we should NOT do:**
- Trust the XML alone. CLAUDE.md is correct that the XML omits the expte. (verified empirically against `VOT_20250408213859.xml`).
- Try to parse the BOCG-by-vote PDF for each vote — too expensive and unstructured.
- Use OpenAI/Gemini for vote-to-initiative matching (CLAUDE.md prohibits, and string similarity is sufficient).

**Concrete next steps:**
- Spike 3 (½ day): for 20 known votes spanning different `tipo` codes, fetch the per-vote HTML page and confirm the `(Núm. expte. ...)` text appears as expected. Document the exact CSS selector / link pattern.
- Spike 4 (1 day): import the iniciativas index for legislature XV (independent scraper). This is needed by the linker anyway.
- Wire the linker into the vote-import pipeline; emit metrics on match rate.

---

## Open questions for Daniel

1. **How aggressive should HEAD-probing be?** ~200 HEAD requests against `congreso.es` to enumerate a legislature is mild but visible in their logs. Should we throttle to 1 req/sec out of politeness, accept 30-min backfill, and mark our user-agent clearly (`Monitor-Parlamentari-Bot/0.1 (+contact@…)`)? My suggestion: yes, throttle, identify ourselves, run from a single IP.
2. **What's the policy on votes without a matching initiative?** ~10–15% of votes are procedural and have no expediente. UI: do we show them? Hide them? Group them in a "procedural" tab? Affects schema (nullable FK) and frontend taxonomy.
3. **What about cases where one vote covers multiple expedientes** (e.g. a vote on amendments to a Proyecto de Ley that touches several other expedientes by reference)? The HTML link text in proyecto-colibri's regex assumed a single `(Núm. expte. ...)`. We should check: many-to-many `vote_initiative` join table, or pick the primary expte? My read is many-to-many but with a `is_primary` flag, but that's a schema decision you should sign off on.
4. **Should we also import the Senate (Senado) at some point?** The Senate's open-data portal at `senado.es/web/relacionesciudadanos/datosabiertos/` actually exposes votes-by-initiative natively (`votacionesini/index.html?legis=10&tipoex=621&numex=000004` style URLs) — solving problem (b) without HTML scraping for that chamber. Out of CLAUDE.md scope today (Congreso → Catalunya → Barcelona), but worth flagging that Senate is an EASIER chamber than Congreso and might fit between phases 1 and 2. Open question: does that change your roadmap?
5. **Catalan parliament:** confirmed there is no API. The decision to start with Congreso is correct; nothing in this research changes that.

---

## Deputy photos and codParlamentario (2026-05-08)

Research session focused on two specific gaps: (1) discovering each XV-legislature deputy's official portrait URL, and (2) mapping our 350 stored names to the `codParlamentario` integer that the Congreso website uses internally.

### 1. Photo URL pattern — CONFIRMED

**Pattern:** `https://www.congreso.es/docu/imgweb/diputados/{codParlamentario}_{legislatura_num}.jpg`

Where `legislatura_num` is the integer form of the Roman numeral (`15` for XV, `14` for XIV, etc.). The codParlamentario is the same integer used in the ficha URL `?codParlamentario=NNN&idLegislatura=XV`.

**Verified samples (all return real JPEGs with Canon EOS R3 + Povedano studio metadata, ©Congreso de los Diputados):**

| codParlamentario | Deputy | URL | Size |
|---|---|---|---|
| 1   | (legacy/historic — 3.9 KB tiny placeholder) | `https://www.congreso.es/docu/imgweb/diputados/1_15.jpg` | 3.9 KB |
| 100 | César Joaquín Ramos Esteban (PSOE) | `https://www.congreso.es/docu/imgweb/diputados/100_15.jpg` | (real photo) |
| 200 | Marta González Vázquez (PP, Coruña) | `https://www.congreso.es/docu/imgweb/diputados/200_15.jpg` | 48.9 KB |
| 317 | Santiago Abascal Conde (Vox) | `https://www.congreso.es/docu/imgweb/diputados/317_15.jpg` | (real photo) |
| 350 | (real photo) | `https://www.congreso.es/docu/imgweb/diputados/350_15.jpg` | 43.7 KB |
| 99999 (invalid) | — | `https://www.congreso.es/docu/imgweb/diputados/99999_15.jpg` | HTTP 404 |

**Image properties:**
- Format: JPEG with embedded XMP metadata.
- Typical size for active XV deputies: **40–50 KB** per image (the source files are several MB, but the served version is compressed).
- Resolution: not measured precisely, but professional portrait dimensions; usable as-is for our cards (≥ 200 px). Likely no need to fetch a larger source.
- Photographer credit: "Povedano" with copyright `©Congreso de los Diputados`. We must respect this attribution if we redistribute.

**Recommended ingest behaviour:**
- Cache locally (e.g. `media/deputies/{official_id}.jpg`) and re-fetch monthly. Photos are stable per legislature.
- Set `User-Agent: Monitor-Parlamentari-Bot/0.1 (+contact)` and throttle to 1 req/sec.
- Add a credit line "Foto: ©Congreso de los Diputados (Povedano)" anywhere we render the portrait.

### 2. codParlamentario enumeration

**Bottom line: the official open-data feed does NOT contain codParlamentario.** Need to enumerate via probe-based discovery against the photo endpoint.

#### What I tried

**(a) AJAX endpoint discovery — DEAD END.**
The `/busqueda-de-diputados` page and the `?statusOpendata=true` variant both render `<div>Cargando...</div>` server-side and load the deputy list via Liferay portlet AJAX client-side. WebFetch sees no `<script>` bodies or `p_p_resource_id` URLs in the static HTML. Probing the obvious portlet URL `?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_resource_id=filtroBusquedaInstantanea&...` from a non-browser client returned no useful body. Without Selenium/Playwright we cannot sniff the real AJAX URL and CSRF/portlet-auth tokens. Spent ~3 minutes; gave up.

**(b) Direct JSON feed — DEAD END for codes.**
`/wc/htdocs/web/diputados/diputados.json` → 404. The real open-data deputy feed at `https://www.congreso.es/es/opendata/diputados` exposes timestamped files (filenames change daily, e.g. `DiputadosActivos__20260508050011.json`):
- `DiputadosActivos__YYYYMMDDHHMMSS.json` — active deputies, ~365 entries (includes some inbound substitutions).
- `Diput__YYYYMMDDHHMMSS.json` — all deputies across all legislatures.
- `odsDiputados14__YYYYMMDDHHMMSS.json` — per-legislature variant; the page labels it "Legislature XIV (Current)" which is mislabelled (XV is current). Needs verification of which legislature the file actually covers.

Schema of `DiputadosActivos`:

```json
{"NOMBRE":"Abades Martínez, Cristina","CIRCUNSCRIPCION":"Lugo",
 "FORMACIONELECTORAL":"PP","FECHACONDICIONPLENA":"17/08/2023",
 "FECHAALTA":"08/08/2023",
 "GRUPOPARLAMENTARIO":"Grupo Parlamentario Popular en el Congreso",
 "FECHAALTAENGRUPOPARLAMENTARIO":"18/08/2023",
 "BIOGRAFIA":"Licenciada en Derecho..."}
```

**No `codParlamentario`, no numeric ID at all.** Schema is name-keyed. So this feed is great for bios + group + constituency + the BIOGRAFIA text — but it does not solve the ID-mapping problem.

The timestamp in the filename is a hard problem for automation. The list URL on `/es/opendata/diputados` is HTML, so we would have to scrape it daily to discover the current filename. That is annoying but not blocking — the HTML structure of that page looks stable.

**(c) Probe-based enumeration — CONFIRMED WORKING.**
For codParlamentario `N` in some range, fetch:

```
https://www.congreso.es/es/busqueda-de-diputados
  ?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view
  &_diputadomodule_mostrarFicha=true
  &codParlamentario={N}
  &idLegislatura=XV
  &mostrarAgenda=false
```

**Detection signal:** the page either contains the deputy ficha card, OR contains the literal string `Hi ha hagut un error en el moment d'obtenir la informació sol·licitada` (Catalan UI on `/ca/`) / `Ha habido un error al obtener la información solicitada` (Spanish UI on `/es/`). Empty or missing codes return that error text with HTTP 200; only real deputies render a profile.

**Cheaper signal — recommended: the photo endpoint.**
HEAD `https://www.congreso.es/docu/imgweb/diputados/{N}_15.jpg`:
- 200 + JPEG → deputy `N` exists in legislature XV (active or substituted-out).
- 404 → no such deputy in XV.

This is dramatically cheaper than fetching the full ficha HTML (a HEAD on a small JPEG vs. a multi-KB Liferay page), so it is the recommended enumeration method. Filter out the tiny placeholder by checking `Content-Length > 5000`.

**Range to probe:** based on samples (1, 100, 200, 317, 350 all valid; legacy `1_15.jpg` is a tiny placeholder), a reasonable scan is `N in 1..500`. We can extend to 1..1000 if any 350-th-percentile codes are missed; the XV legislature has had >50 substitutions, so the live code space is wider than 350 unique codes.

**Pseudocode (Python with httpx):**

```python
import asyncio, httpx

async def probe(client, n):
    r = await client.head(f"https://www.congreso.es/docu/imgweb/diputados/{n}_15.jpg")
    if r.status_code == 200 and int(r.headers.get("content-length", 0)) > 5000:
        return n
    return None

async def enumerate_codes(max_n=500):
    sem = asyncio.Semaphore(2)  # 2 concurrent => ~1-2 req/s
    async with httpx.AsyncClient(
        headers={"User-Agent": "Monitor-Parlamentari-Bot/0.1 (+contact)"},
        timeout=10,
    ) as client:
        async def guarded(n):
            async with sem:
                await asyncio.sleep(0.5)
                return await probe(client, n)
        results = await asyncio.gather(*(guarded(n) for n in range(1, max_n + 1)))
    return [n for n in results if n is not None]
```

**Mapping back to names:** once we have the list of valid codes, fetch each ficha page once and parse:
- the page `<title>` or main heading for the deputy full name (format: "Surname1 Surname2, Name");
- `BIOGRAFIA` and group fields are already in the open-data JSON keyed by NOMBRE, so we join name → JSON entry locally.

That gives us the `(name, codParlamentario, photo_url, biography, group, constituency)` tuple for all 350 active deputies in roughly 500 HEAD requests + 350 ficha fetches, ~15 minutes at 1 req/s. Run once at ingest, then refresh codes only when our ingest sees a name we do not have a code for (a substitution).

**(d) Mirror / third-party CSV — POSSIBLY USEFUL, NOT VERIFIED.**
`github.com/quehacen/que_hacen` (the abandoned "Qué hacen los diputados" Goteo project mentioned in the Civio-adjacent landscape) has `phpDipus/csv/Diputados.csv` in its repo. WebFetch could not pull the raw file content (saw only GitHub UI markup), but the file is plausibly an old-legislature mapping. Not worth pursuing because:
1. The project is dormant (likely pre-XV legislature data).
2. The probe-based approach gives us authoritative current data in 15 minutes.

### Open questions / caveats

1. **Does codParlamentario change across legislatures?** Same person, same number? `Diput__*.json` lists deputies across all legislatures keyed by name + legislature, so we cannot tell directly. Worth checking by sampling 2–3 deputies who served in both XIV and XV (e.g. Sánchez, Feijóo) and HEAD-probing both `_14.jpg` and `_15.jpg` with the same N. If the number is stable per-person, we get persistent IDs for free; if it is per-legislature, we need to re-enumerate every legislature.
2. **Substituted deputies.** XV has had >50 renuncias. Our `mandates` model needs a `(person, legislature, cod_parlamentario, start_date, end_date)` record because the same person could (in theory) hold a different cod in a future legislature, and a single legislature may have multiple persons share the same seat number over time. Need to confirm whether codParlamentario maps to seat-or-person.
3. **Photo licence.** The XMP confirms `©Congreso de los Diputados`. The website legal notice (not re-checked today) generally allows reuse of open-data content with attribution under reuse-of-public-information regulations (Ley 37/2007). Worth a one-line check before we redistribute photos at scale; safe default is to add visible "Foto: ©Congreso de los Diputados" caption on every card.
4. **Open-data filename rotation.** The active-deputies JSON URL has a daily timestamp baked into the filename (`DiputadosActivos__20260508050011.json`). Our ingester needs to scrape `https://www.congreso.es/es/opendata/diputados` first to discover the current filename. If they ever stabilise the URL we should swap to it; otherwise this small HTML-scrape is unavoidable.
5. **Locale variants of the ficha** all exist (`/es/`, `/en/`, `/ca/`). Use `/es/` for canonical text scraping (Catalan returns the same data but with translated chrome).

---

## Historical backfill — viable path (2026-05-08, updated 2026-05-10)

Research session focused on programmatically enumerating **all plenary sessions of any past legislature** so we can backfill historical votes. The previous note speculated that DSCD-`<NN>`-PL-`<NNN>`.PDF probing was the cleanest path; reality turned out different.

### TL;DR (resolved 2026-05-10)

**Solution:** the votaciones portlet DOES navigate to a chosen date statelessly — but `targetDate=` requires the **slash-delimited `DD/MM/YYYY`** format, NOT `YYYYMMDD`. The earlier "silently ignored" note was wrong about the format.

URL template:
```
https://www.congreso.es/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&targetLegislatura=<ROMAN>&targetDate=DD/MM/YYYY
```

The response renders that day's session inline with the same shape as the latest-session listing — ZIP URL, per-vote XML/PNG/PDF URLs, expediente labels, vote totals. No browser, no cookies, no XHR. Works for legislatures X through XV.

**Discovery:** a Playwright spike against the live portlet captured `onChangeDate.toString()` on 2026-05-10:
```js
function onChangeDate( targetDate ){
  var votacionesUrl = getBaseUrl();
  votacionesUrl += "&targetDate=" + formatDate(targetDate);
  window.location.href = votacionesUrl;
}
function formatDate(date) {
  var day = ("0" + date.getDate()).slice(-2);
  var month = ("0"+(date.getMonth()+1)).slice(-2);
  var year = date.getFullYear();
  return day + '/' + month + '/' + year;
}
```
The function navigates to a stateless URL — it just uses a different format than we tried in the earlier round. Verified end-to-end with curl:

- `&targetDate=21/12/2021` (Leg XIV) → `Leg14/Sesion142/20211221/VOT_20230303101442.zip`
- `&targetDate=11/02/2020` (Leg XIV early) → `Leg14/Sesion006/20200211/VOT_20201204105926.zip`
- `&targetDate=19/09/2023` (Leg XV) → `Leg15/Sesion002/20230919/VOT_20230919152000.zip`
- URL-encoded (`%2F` for `/`) also works.

**Implementation:** `CongresoClient.fetch_session_zip_for_date(legislature_roman, date)` (`backend/app/ingest/congreso/client.py`) drives the per-date listing and returns the same `SessionZipBundle` the latest-session pipeline uses. `app.ingest.congreso.backfill.backfill_legislature` walks `diasVotaciones` for the legislature and feeds each pending date through it at 1 req/s. `bootstrap.backfill_xv_smoke` runs 5 dates as a smoke test; `bootstrap.backfill_xv` (or the `backfill_xv` CLI alias) runs the full legislature.

The previous "two-step hybrid" (HEAD-probe `Sesion<NNN>` then map dates) is no longer needed — every date in `diasVotaciones` directly yields a session via the per-date URL. Older notes about HEAD-probing the directory tree are kept below for archival reference.

### TL;DR (original, 2026-05-08, NOW SUPERSEDED)

The cleanest path is a **two-step hybrid**:

1. **GET the votaciones portlet once per legislature** to harvest the complete `var diasVotaciones = [YYYYMMDD, ...]` JS array (every plenary-vote day of that legislature, stable, server-rendered, ~150 dates per full legislature).
2. **HEAD-probe** `Sesion<NNN>` directories (301 = exists, 404 = gap) to map Sesion folder numbers, then HEAD-probe `Sesion<NNN>/<YYYYMMDD>` against each candidate date to recover the date for that session, then HEAD-probe `Sesion<NNN>/<YYYYMMDD>/Votacion<MMM>` to count votes per session.

Plan A (full Liferay portlet reverse-engineering with `targetDate` navigation) **does not work statelessly** — the portlet always returns the latest session of the requested legislature regardless of `targetDate=`. Plan B (DSCD PDF probing for session enumeration) **works partially** — the PDF range gives a count of plenary sessions but not the date-to-Sesion-folder mapping needed by the votes URL scheme. The hybrid above is the only path that actually delivers vote-ZIP URLs for every historical session.

### A. Liferay portlet — what works and what doesn't

**The view URL with portlet args is well-formed:**
```
https://www.congreso.es/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&targetLegislatura=XIV&currentLegislatura=XV
```
- `targetLegislatura` accepts **Roman numerals only** (`X`..`XV`). Numeric values like `14` go to a generic page that always renders the current XV legislature.
- The dropdown only goes back to **legislature X** (2011). Older legislatures (≤IX) are not exposed by the portlet.
- The HTML response embeds, for the chosen legislature, the literal JS array `var diasVotaciones = [YYYYMMDD, ...]` listing **every plenary-vote day** of that legislature. This is the single most useful artefact in this whole research session.
- The portlet also renders **one** session's full vote table inline (the most recent day of the chosen legislature), with full `/webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/VOT_<TS>.{zip,xml,json,pdf}` URLs and inline `Núm. expte. NNN/NNNNNN` strings for the expediente.

**What does NOT work (verified dead ends — do not retry):**

- `&targetDate=YYYYMMDD` is silently ignored on stateless GETs. Every value falls back to the last session of the chosen legislature. Confirmed across XV, XIV, XII, XI, X (4 dates each tested).
- `&targetMonthYear=YYYYMMDD` same — silently ignored.
- `_votaciones_targetDate=`, `_votaciones_targetLegislatura=` namespaced variants, fall back to XV.
- Cookie jar (`-c/-b`) does not change behaviour. The portlet is not state-driven via JSESSIONID for navigation.
- POST with `p_p_lifecycle=1` (action phase) returns **403** without a CSRF token.
- Resource-id probes `cargarSesiones`, `obtenerSesiones`, `listarSesiones`, `resourceLista`, `resourceVotaciones`, `cargarVotaciones` all return **HTTP 200 with empty body** (Liferay default: unknown resource_id → 0-byte response). The only known-good resource_id on this page is `resourceAutoSuggest` and it's bound to the search box, not the votes list.
- `paginationAjaxBuscador.js` has zero AJAX calls — it is a pure client-side DOM paginator that consumes a JSON blob set by `setPaginationData()`. The data must come from somewhere else (likely an inline `<script>` block we did not isolate, or a follow-up portlet refresh URL we did not crack).
- `proyecto-colibri`-era URL patterns (`/wc/accesoHistoricoVotaciones&fechaSeleccionada=DD/MM/YYYY`, `/Congreso/Iniciativas/Indice%20de%20Iniciativas`) — all 404 on the post-2020 portal.
- Directory listing on `/webpublica/opendata/votaciones/Leg14/Sesion262/20230518/` returns **HTTP 403 Forbidden** (Apache `Indexes` is off). Confirmed at every level of the tree.
- The Diario de Sesiones index page `/es/cem/dspl14-XIV` exists (HTTP 200, 79 KB) but **only renders 1 PDF entry in the static HTML** — the rest is loaded via JS (`paginationAjaxBuscador.js` again) from a server-side data source we did not crack.

### B. DSCD PDF probing — partial win

PDFs at `https://www.congreso.es/public_oficiales/L<NN>/CONG/DS/PL/DSCD-<NN>-PL-<NNN>.PDF`:

- **No zero-padding.** `DSCD-14-PL-1.PDF` is 404; `DSCD-14-PL-10.PDF` is 200 (with `Content-Type: application/pdf`).
- `DSCD-14-PL-100.PDF` and `DSCD-14-PL-200.PDF` are 200; `DSCD-14-PL-300.PDF` is 404. So legislature XIV has plenary sessions in roughly 10..~270 range.
- **HEAD probes return 200 application/pdf with size=0** (because HEAD against a static file under this server config returns no body even when the resource exists — `200/application/pdf` is the existence signal, `404/text-html` is the absence signal).
- Date extraction from filename: **NOT possible.** Filename only encodes legislature and PL number, not date. We would have to download and parse each PDF.

**Conclusion:** DSCD PDF probing tells us roughly how many plenary sessions a legislature had, but it does NOT give us per-session dates and does NOT help us build the `Leg<N>/Sesion<NNN>/<YYYYMMDD>/` vote URL paths. **Not the cleanest path on its own.** It is, however, useful as a sanity check on session counts.

### C. The actually-cleanest path — directory probing on the open-data tree

The `/webpublica/opendata/votaciones/` tree responds to HEAD probes with **301 vs 404** discrimination at every level. This is the cleanest signal in the whole stack.

**Verified probe semantics (Leg14 examples):**

| URL | Status | Meaning |
|---|---|---|
| `…/Leg14/Sesion262` | **301** redirect to same URL with trailing slash | Session 262 exists |
| `…/Leg14/Sesion263` | **404** | Session 263 does not exist |
| `…/Leg14/Sesion096` | **404** | Gap (some plenary numbers are unused — investiture, ceremonial, etc.) |
| `…/Leg14/Sesion262/20230518` | **301** | Session 262 happened on 2023-05-18 |
| `…/Leg14/Sesion262/20200518` | **404** | Wrong date for Session 262 |
| `…/Leg14/Sesion262/20230518/Votacion001` | **301** | Session 262 had at least 1 vote |
| `…/Leg14/Sesion262/20230518/Votacion100` | **404** | Session 262 had fewer than 100 votes |
| `…/Leg14/Sesion262/20230518/Votacion050` | **301** | Session 262 had at least 50 votes |
| `…/Leg14/Sesion262/20230518/VOT_20230518121119.zip` | **200 application/zip** | Session-level bundle exists |

**Empirical counts (Leg14):** I HEAD-probed N=1..280 → 174 Sesion folders return 301. The legislature's `diasVotaciones` array has 167 entries. Difference of 7 means **a handful of Sesion folders exist without recorded votes** (likely investiture / ceremonial / emergency sessions where no votes were called). So we cannot map "ith Sesion = ith date" by index alone — there are gaps.

### Concrete URL patterns and cURL commands that work

```bash
UA="Monitor-Parlamentari-Bot/0.1 (+contact@example.org)"

# 1. Get all vote dates for legislature XIV
curl -sS -A "$UA" \
  "https://www.congreso.es/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&targetLegislatura=XIV&currentLegislatura=XV" \
  | grep -oE 'var diasVotaciones = \[[^]]+\]'
# -> var diasVotaciones = [20200204, 20200211, ..., 20230518]   (167 entries for XIV)

# 2. Enumerate Sesion folders for legislature 14 (HEAD probes; expect ~170-180 hits in N=1..280)
for n in $(seq 1 280); do
  nnn=$(printf "%03d" $n)
  code=$(curl -sS -o /dev/null -A "$UA" -I -w "%{http_code}" \
    "https://www.congreso.es/webpublica/opendata/votaciones/Leg14/Sesion${nnn}")
  [ "$code" = "301" ] && echo "$nnn"
done

# 3. For each Sesion folder, find its date by probing against diasVotaciones
#    (because the Sesion->date mapping is not knowable from the Sesion number alone).
#    Cheapest version: walk diasVotaciones and Sesion list in parallel order; on every
#    candidate, HEAD probe Sesion<NNN>/<YYYYMMDD>. Most attempts will hit on the
#    diagonal — typical cost ~1.5 probes per Sesion, ~250 probes total per legislature.
curl -sS -A "$UA" -o /dev/null -I -w "%{http_code}\n" \
  "https://www.congreso.es/webpublica/opendata/votaciones/Leg14/Sesion262/20230518"
# -> 301  (success)

# 4. Per (Sesion, date), count votes by enumerating Votacion<MMM> until 404
for v in $(seq 1 200); do
  vvv=$(printf "%03d" $v)
  code=$(curl -sS -o /dev/null -A "$UA" -I -w "%{http_code}" \
    "https://www.congreso.es/webpublica/opendata/votaciones/Leg14/Sesion262/20230518/Votacion${vvv}")
  [ "$code" = "301" ] && echo "Votacion${vvv}"
  [ "$code" = "404" ] && break
done

# 5. The actual vote ZIP URL is at the SESSION level (one bundle per session date)
#    but its filename uses an unpredictable VOT_<TS> timestamp. So we cannot construct
#    it directly. We must scrape it from a per-day HTML page.
#    Fortunately, when targetLegislatura matches the session's own legislature AND the
#    Sesion is the last session of that legislature, the portlet renders all VOT_<TS>
#    URLs inline. For mid-legislature sessions the only known way to get the
#    timestamp is to fetch the per-vote DETAIL HTML — which we have not solved here.
```

### Open questions / dead ends I already burned time on (do not redo)

1. **How to discover the `VOT_<TS>` timestamp for a mid-legislature session ZIP?** The session-level ZIP exists at `Leg<N>/Sesion<NNN>/<YYYYMMDD>/VOT_<TS>.zip` but the timestamp is not derivable from the date or Sesion number. The portlet renders these URLs only for the LAST session of the chosen legislature. **This is the one remaining gap.** Best guesses we have NOT verified:
   - Per-vote XML lives at `Leg<N>/Sesion<NNN>/<YYYYMMDD>/Votacion<MMM>/VOT_<TS>.xml` and the timestamp may be incrementing-by-second across votes within a session. Probing 86400 candidates per session is impractical, but probing within a 2-hour window seeded by the timestamp of an adjacent vote could be. Untested.
   - The Diario de Sesiones portal `/es/cem/dspl14-XIV` likely lists per-session metadata via the same pagination AJAX we couldn't crack. Worth a 30-minute Playwright spike.
   - There may be an undiscovered open-data manifest file (sitemap, JSON index, etc.) at `/webpublica/opendata/` root. We did NOT enumerate. Worth a one-shot `curl` of a few candidate paths.

2. **Why does `targetDate=` work in the JS but not statelessly?** The JS literally does `window.location.href = url + '&targetDate=YYYYMMDD'`. Yet the same URL fetched with curl returns the latest session. The portlet might be reading `targetDate` only inside a `lifecycle=2` resource-serving phase that the JS triggers via a different cookie/header (Liferay XSRF token? `Liferay-Portal` session?). Three hours of Playwright network-tab capture would resolve this; it is the highest-leverage open question for backfill.

3. **Plan A's portlet could be made to work via Playwright/headless-Chromium.** A 5-line script that opens the page, calls `onChangeDate(new Date(2022,5,30))`, and dumps `document.body.innerHTML` would yield the same per-day HTML the user sees in a browser. This is the simplest unblocking path if the cURL-only approach hits a wall on (1).

4. **Dead end: directory listings.** Apache `Indexes` is off everywhere under `/webpublica/opendata/`. Confirmed 403 at session, day, and Votacion levels. Don't retry.

5. **Dead end: `/es/opendata/votaciones?sesion=N&legislatura=14`.** The proyecto-colibri-era query params return the same default current-XV page. The portlet does not parse them.

6. **Dead end: brute-forcing `VOT_<YYYYMMDDHHMMSS>.zip` timestamps.** Search space is 86400 per day and the timestamp is the FILE-GENERATION time at Congreso, which can be days after the session date. Infeasible without a starting hint.

7. **robots.txt is permissive** for everything we care about. The file is huge (200+ disallow lines) but every disallow is for one specific PDF (mostly oposiciones and a handful of session diaries — none in our scope). `/webpublica/opendata/votaciones/` is **not** disallowed; the `votaciones` portlet is **not** disallowed. We can identify ourselves with a clear User-Agent and proceed at a polite rate.

### Cost estimate

Per legislature backfill (using the hybrid path):

| Step | Requests | Notes |
|---|---|---|
| 1× portlet GET to fetch `diasVotaciones` | 1 | ~150 KB response |
| HEAD-probe Sesion 1..280 | 280 | ~170 hits, ~110 misses |
| HEAD-probe each Sesion against diasVotaciones to recover date | ~250 | best-case 1 hit per Sesion if we walk in parallel |
| HEAD-probe Votacion 1..N per (Sesion, date) | ~30 × 170 sessions = 5100 | typical 30 votes per session |
| Fetch session-level ZIP (PENDING gap 1) | 170 | each ~50–500 KB |
| **Total per legislature** | **~5800 requests + 170 ZIP downloads** | ~95 min @ 1 req/s |

For all six historical legislatures (X..XV) plus current XV, ~6 hours total at 1 req/s. Acceptable for a one-shot backfill if launched politely from a single IP with clear UA.

### Next-action — exactly what to do for legislature 14 backfill

> **To backfill legislature 14**: (1) GET `https://www.congreso.es/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&targetLegislatura=XIV&currentLegislatura=XV` and parse the inline `var diasVotaciones = [...]` array (167 dates). (2) HEAD-probe `https://www.congreso.es/webpublica/opendata/votaciones/Leg14/Sesion${printf "%03d" $n}` for n=1..280; collect the ~170 N values that return 301. (3) For each (date, Sesion) candidate pair, HEAD-probe `…/Leg14/Sesion${nnn}/${yyyymmdd}` and record the 301 hits — this gives the authoritative `(date, Sesion)` mapping. (4) **STOP and resolve the timestamp gap (open question 1) before going further** — without it you cannot construct the actual `VOT_<TS>.zip` URL. The most leveraged way to resolve it is a 1-hour Playwright spike that drives `onChangeDate()` in the live portlet and captures the rendered HTML for one mid-legislature date; the timestamps are then directly in the response. Once that mechanism is known, the rest of the pipeline is mechanical.

### Files / artefacts produced during this research

- `/tmp/votlisting.html` — XV listing page (128 KB). Source of `paginationAjaxBuscador.js` ref, `onChangeLegislatura` JS, the per-day rendered vote table.
- `/tmp/leg_XIV.html`, `/tmp/leg_XII.html`, `/tmp/leg_X.html`, `/tmp/leg_XIII.html`, `/tmp/leg_XI.html`, `/tmp/leg_VIII.html`, `/tmp/leg_IX.html` — per-legislature portlet GETs; useful for grepping `diasVotaciones` arrays.
- `/tmp/leg14_sessions.txt` — empirical list of 174 Sesion 301-hits for Leg14 (n=1..280).
