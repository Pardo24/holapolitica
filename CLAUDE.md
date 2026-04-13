# CLAUDE.md — Monitor Parlamentari (v2)

Aquest fitxer dóna context permanent a Claude Code sobre aquest projecte. Es llegeix automàticament a cada sessió.

## Què és aquest projecte

Plataforma open source per centralitzar votacions, iniciatives i activitat parlamentària de cambres parlamentàries espanyoles. Comencem pel **Congrés dels Diputats** (única cambra amb dades obertes ben estructurades), després **Parlament de Catalunya** (parsing de BOPC en PDF) i finalment **Plenari del Consell Municipal de Barcelona**.

L'objectiu és complementar l'obra de Civio (transparència institucional, contractació, lobby) cobrint el buit de "tracker de vots individuals per tema i representant" que cap projecte cívic actiu cobreix avui.

## Principi rector: mirall, no megàfon

El projecte és **infraestructura cívica neutra**, no plataforma d'opinió. Aquesta neutralitat és innegociable. Implicacions tècniques directes:

**MAI implementar:**
- Reaccions, likes, emojis o vots d'usuari sobre cap entitat (votacions, lleis, diputats).
- Comentaris d'usuaris.
- Votacions paral·leles, enquestes o sondejos d'opinió.
- Valoracions automàtiques tipus "aquesta llei és bona/dolenta".
- Rànquings unilaterals que destaquin un cantó polític sense paral·lel simètric.
- Text editorial valoratiu a cards socials, embeds o widgets — només dades factuals.

**SÍ implementar (i és l'estratègia central de creixement):**
- Cards socials d'imatge per compartir (només dades factuals).
- Newsletter setmanal amb capa editorial humana mínima i descriptiva.
- Mètriques agregades objectives (cohesió, coincidències, assistència).
- Eines per a periodistes (gràfics, exportació, fitxes PDF).
- Embed widgets per a mitjans (només dades, sense tracking).

Si una sol·licitud sembla raonable però viola aquests principis, **dir-ho clarament** abans d'implementar res. Si Daniel insisteix, suggerir microsite separat amb marca distinta abans d'integrar al producte principal.

## Stack tècnic

- **Backend:** Python 3.11+ amb FastAPI, SQLAlchemy 2 (asyncio), Alembic per migracions, Pydantic v2 per validació.
- **Workers:** RQ + Redis. Celery només si la complexitat ho justifica.
- **DB:** PostgreSQL 16+. Sense pgvector inicialment.
- **Frontend:** Next.js 15+ amb App Router, TypeScript estricte, Tailwind CSS, shadcn/ui per components.
- **Cards socials:** `@vercel/og` (al frontend Next.js). JSX → imatge.
- **i18n:** next-intl al frontend.
- **Tests:** pytest amb pytest-asyncio al backend, Vitest + Playwright al frontend.
- **Lint/format:** ruff + black al backend, ESLint + Prettier al frontend.
- **Newsletter:** Listmonk self-hosted (preferent) o Buttondown (fallback europeu).
- **Infra:** Docker Compose per dev local, deploy a Hetzner VPS amb Caddy com a reverse proxy.

## Llengües del projecte

- **Codi i tots els identificadors tècnics:** anglès (variables, funcions, classes, taules, columnes, slugs).
- **Documentació tècnica i comentaris:** anglès.
- **Comentaris de commit:** anglès, format Conventional Commits.
- **README, CONTRIBUTING, propostes a NLnet:** anglès.
- **Continguts de la base de dades:** multilingüe. Cada entitat traduïble té camps `name_ca`, `name_es`, `name_en`. Els títols originals d'iniciatives es guarden tal com vénen de la font.
- **Interfície d'usuari:** català, castellà i anglès. Català per defecte.

## Estructura del repositori

```
/
├── backend/
│   ├── app/
│   │   ├── api/             # routers FastAPI
│   │   ├── core/            # config, seguretat, logging
│   │   ├── db/              # session, base, init
│   │   ├── models/          # models SQLAlchemy
│   │   ├── schemas/         # esquemes Pydantic
│   │   ├── services/        # lògica de negoci
│   │   ├── ingest/          # ingesta de fonts (un mòdul per cambra)
│   │   ├── classify/        # classificació temàtica via LLM
│   │   ├── metrics/         # càlcul de mètriques agregades
│   │   ├── alerts/          # sistema d'alertes
│   │   ├── newsletter/      # generació de newsletter
│   │   ├── embed/           # render d'embeds
│   │   ├── press/           # eines per a periodistes (gràfics, PDFs, exports)
│   │   └── workers/         # tasques RQ
│   ├── alembic/             # migracions
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── app/                 # rutes Next.js App Router
│   │   ├── (public)/        # pàgines públiques
│   │   ├── api/og/          # generador de cards socials
│   │   └── embed/           # rutes per a embed widgets
│   ├── components/
│   ├── lib/
│   ├── messages/            # traduccions next-intl (ca.json, es.json, en.json)
│   ├── public/
│   ├── tests/
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
│   ├── classification.md
│   ├── metrics.md
│   ├── neutrality-guidelines.md  # IMPORTANT: principi rector i exemples
│   └── deployment.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── .github/workflows/
├── README.md
├── LICENSE                  # EUPL-1.2 o AGPL-3.0
├── CONTRIBUTING.md
└── CLAUDE.md                # aquest fitxer
```

## Convencions de codi

### Backend Python

- Type hints **obligatoris** a tot el codi nou. `mypy --strict` ha de passar.
- Async/await per defecte a tots els endpoints i operacions de DB.
- Funcions petites (<50 línies) i amb una única responsabilitat.
- Repositoris (`*Repository`) per accés a dades, serveis (`*Service`) per lògica de negoci. No barrejar.
- Pydantic v2 per a tots els models de request/response. Mai retornar models SQLAlchemy directament.
- Errors com a excepcions tipades. Cap `raise Exception("...")` genèric.
- Logging amb `structlog`, mai `print()`.

### Frontend TypeScript

- TypeScript estricte (`strict: true`, `noUncheckedIndexedAccess: true`).
- Components funcionals amb hooks. No classes.
- Server Components per defecte; Client Components només quan calgui interactivitat.
- Estats globals amb Zustand si calen, no Redux.
- Fetcher de dades centralitzat (`lib/api.ts`) amb `fetch` natiu envoltat amb tipus.
- Mai textos hardcoded a la UI: tot via `t('...')` de next-intl.

### Naming

- Slugs en kebab-case minúscula sense accents: `habitatge`, `drets-laborals`, `medi-ambient`.
- Identificadors externs (`official_id`, `external_id`) sempre com a string.
- Dates ISO 8601 sempre.

### Commits i branches

- Branch per feature: `feat/ingest-congreso-votes`, `fix/api-pagination`, `docs/add-deployment-guide`.
- Commits petits i atòmics.
- Format: `feat(ingest): add Congreso initiatives importer`.

## Mètriques agregades — regla de simetria

Quan implementis càlcul i visualització de mètriques comparatives entre grups o diputats, **respecta sempre la regla de simetria**:

- Si publiques "diputats amb menor assistència", publica també "diputats amb major assistència". Junts a la mateixa pàgina.
- Si publiques "coincidències PP-Vox", publica la matriu completa amb totes les parelles. No destaquis una.
- Si publiques "lleis més rebutjades", publica també "lleis més votades a favor".

Aquest no és un detall estètic — és el que protegeix el projecte legalment i editorialment. Les mètriques unilaterals són opinió disfressada de dada.

Excepcions: mètriques que no són comparatives entre cantons polítics (ex. "votació amb major marge") són objectivament informatives i no requereixen paral·lel.

## Cards socials — guidelines

Quan implementis o modifiquis cards generades amb @vercel/og:

- **Només dades factuals.** Nom del diputat, partit, com va votar, títol de la votació, resultat.
- **Cap text valoratiu.** No "ha votat MALAMENT", no "ha defensat", no emojis emocionals.
- **Foto oficial del diputat.** No imatges manipulades.
- **Atribució visible.** Logo del projecte i URL.
- **Tipografia llegible** a tamany de Twitter card / Instagram. Fonts: Inter o sistema.
- **Plantilla rendiment:** sub-500ms generació. Cache 24h al CDN.

## Embed widgets — guidelines

Quan implementis o modifiquis widgets embedables:

- **Iframe responsive amb sandbox restrictiu** (`sandbox="allow-scripts"` mínim).
- **Sub-1s de càrrega** total. CSS inline, sense fonts externes.
- **Sense trackers de tercers.** Cap Google Analytics, cap Meta pixel.
- **Logging mínim al teu servidor:** només referrer domain i count agregat per dia. Sense fingerprinting d'usuaris.
- **Atribució visible:** logo + enllaç a la votació original.
- **Accessibilitat:** contrast WCAG AA, navegació amb teclat, alt text on calgui.

## Fonts de dades

### Congrés dels Diputats — fase 1

URL base: `https://www.congreso.es/es/opendata`

Endpoints i datasets (verificats maig 2026):
- `/diputados` — diputats activs i històrics
- `/votaciones` — llistat de votacions per data, amb enllaços a XML/JSON detallat per votació
- `/iniciativas` — projectes de llei, proposicions, iniciatives legislatives aprovades
- `/intervenciones` — intervencions parlamentàries

Notes operacionals:
- Les votacions es publiquen amb cert retard després de la sessió (típicament 24-48h).
- Els canvis de grup parlamentari són freqüents.
- La XV legislatura (actual) ha tingut >50 renúncies a maig 2026; el model ha de gestionar-ho amb `mandates` i `group_memberships` històrics.
- Hi ha legislatures anteriors disponibles, però d'inici només importem la XV completa.

### Parlament de Catalunya — fase 2

- **No hi ha API estructurada de votacions individuals.**
- Les votacions es publiquen al **BOPC (Butlletí Oficial del Parlament de Catalunya)** en PDF.
- El SIAP té cerques web però no API exposada.
- **No començar amb això.** Esperar a tenir el Congrés sòlid.

### Ajuntament de Barcelona — fase 3

URL: `https://ajuntament.barcelona.cat/ca/accio-de-govern/el-consell-municipal/acords-del-plenari`

- Tenen portal específic amb consulta de votacions i descàrrega en formats oberts.
- Pendent investigació detallada al moment d'arribar a fase 3.

## Decisions arquitectòniques importants

### Per què FastAPI i no Django/Flask

- FastAPI té validació automàtica via Pydantic, generació d'OpenAPI gratuïta, suport asyncio nadiu.
- Django seria sobrecarregat per a una API pura.
- Flask requeriria muntar tota la pila manualment.

### Per què Next.js i no SvelteKit/Astro

- Ecosistema més gran, més fàcil incorporar contributors.
- Server Components permeten SEO òptim.
- shadcn/ui dóna un punt de partida visual sòlid.
- `@vercel/og` és nadiu i excel·lent per cards socials.

### Per què sense ORM al frontend (no tRPC)

- API REST clàssica per facilitar integració de tercers (periodistes amb scripts).
- L'API ha de ser ciutadana de primera classe.

### Per què Postgres i no MySQL/MongoDB

- Suport sòlid de tipus avançats (JSONB, arrays, tsvector per cerca full-text).
- Migracions amb Alembic estàndard al món Python.
- Backups i replicació amb tooling madur.

### Per què RQ i no Celery (al MVP)

- RQ és més simple, suficient per al volum esperat.

### Per què Listmonk i no Mailchimp/Substack

- Open source i self-hosted (control total de dades).
- RGPD compliance més senzill.
- Encaix amb la filosofia europea/sobiraní del projecte.

## Prompts i LLMs

### Classificació temàtica

Veure `backend/app/classify/prompts.py`. El prompt base està documentat a `docs/classification.md` i s'ha d'actualitzar allà cada cop que es millori.

Models prioritzats per ordre:
1. **Mistral Small** (europeu) — preferent per producció.
2. **Claude Haiku 3.5** — fallback.
3. **Qwen2.5-7B local** — opcional per estalviar costos.

**Mai utilitzar OpenAI ni Google Gemini** per a aquest projecte.

### Quan demanar a Claude Code que escrigui codi

Sempre proporcionar:
- Context: a quin mòdul pertany, quina és la responsabilitat exacta.
- Inputs i outputs esperats amb tipus.
- Errors que cal gestionar.
- Tests que han de passar.

Mai acceptar codi de Claude Code sense:
- Llegir-lo enter.
- Verificar tipus.
- Executar tests.
- Comprendre cada decisió.

## Què NO fer

- **No retornar mai dades personals no relacionades amb la funció pública.** Si una API exposa accidentalment un correu personal o un telèfon mòbil d'un diputat, NO importar-ho.
- **No utilitzar OpenAI ni Google Gemini.** Posicionament europeu.
- **No "interpretar" el sentit polític d'una votació.** El sistema dóna fets, mai opinions.
- **No fer scraping de dades que NO siguin obertes per llei.**
- **No construir features que no estiguin a la guia del projecte sense discutir-les abans.** L'expansió de l'abast és el principal risc.
- **No implementar reaccions, comentaris, votacions paral·leles, ni res que generi opinió d'usuaris.** Veure principi rector dalt.
- **No publicar mètriques unilaterals comparatives.** Sempre paral·lel simètric.
- **No incloure trackers de tercers** als embed widgets ni a la web principal.

## Errors comuns a evitar

- **No assumir que els IDs del Congrés són numèrics simples.** Hi ha codis com `122/000262` que són strings amb format especial.
- **No descartar l'històric de pertinença a grup.** Mostrar la pertinença correcta del moment de la votació, no l'actual.
- **No carregar tot l'històric en memòria.** Paginació sempre.
- **No fer cron jobs amb `time.sleep`.** Utilitzar APScheduler, RQ Scheduler, o cron del sistema.
- **No comitar secrets, mai.** `.env.example` amb claus buides al repo, `.env` real al `.gitignore`.

## Recursos d'investigació

- Llei 19/2013 de Transparència — base legal per a publicar dades dels càrrecs públics.
- Reglament del Parlament de Catalunya — defineix tipus de votacions, sessions, comissions.
- Reglament del Congrés dels Diputats.
- Civio: `civio.es/transparencia/` — referent. **NO competim amb ells.** Complementem.
- Projecte abandonat útil per inspiració: `github.com/openkratio/proyecto-colibri`.

## Quan demanar a la persona / Daniel

Algunes decisions no s'haurien de prendre sense consultar:
- Canvis a l'esquema de la base de dades.
- Incorporació de noves fonts de dades no previstes a la guia.
- Decisions sobre privacitat o tractament de dades sensibles.
- Comunicacions externes en nom del projecte.
- Alteracions al posicionament neutral del projecte.
- Qualsevol funcionalitat que pugui violar el principi rector "mirall, no megàfon".

Per a la resta, decideix amb aquest context i informa breument del que s'ha fet.

## Estat actual

Quan llegeixis aquest fitxer, comprova `docs/STATUS.md` per saber en quina fase estem i quina és la propera tasca prioritzada.
