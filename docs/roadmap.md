# Hola Política — Roadmap

> Document canònic actualitzat a 2026-05-11. Pensat per ser compartit amb
> finançadors (NLnet, AECID, OSF, EU CERV, Goteo, Fundació Bofill, etc.)
> i amb el consell assessor.
>
> Lloc en producció: **https://holapolitica.org**
> Codi: EUPL-1.2 · Dades: CC-BY 4.0 · Contacte: `daniel@holapolitica.org`

---

## 1. Què tenim avui (maig 2026)

Hola Política és una plataforma cívica neutra que centralitza l'activitat
parlamentària espanyola. Avui està **desplegada i en funcionament**, no
és una promesa.

### Desplegament

- **Frontend** a Vercel (Next.js 15, App Router, TypeScript estricte).
- **Backend** a un VPS de Hetzner (FastAPI, Postgres 16, Redis 7, RQ).
- **Cost operatiu actual**: < 10 €/mes (VPS + dominis + correu
  transaccional).
- **CI/CD** complet a GitHub Actions (backend, frontend, qualitat de PRs,
  releases).

### Cobertura de dades (Congrés dels Diputats, XV legislatura)

| Entitat                 | Volum       |
|-------------------------|-------------|
| Iniciatives             | 430         |
| Votacions               | 1.840+      |
| Registres individuals   | 617.580     |
| Diputats actius         | 350         |
| Grups parlamentaris     | 9           |
| Sessions                | 123         |
| Període                 | 2023-09-19 → 2026-04-30 |
| Auditoria interna       | 99,95 % de concordança entre `vote_records` i totals oficials |

Ingesta forward-only programada amb RQ Scheduler: vots cada 4 h,
diputats i iniciatives diàries, agenda diària amb reforç els dilluns,
newsletter setmanal.

> **Actualització juny 2026 — cobertura històrica.** A més de la XV, ara
> hi ha les legislatures **X-XIV (2011-2026)** carregades a producció:
> ~14.400 votacions en total i ~4,97M registres individuals de vot. Això
> obre la porta a mètriques comparatives entre legislatures. La dada ja és
> consultable per l'API; falta el selector de legislatura al frontend per
> fer-la navegable.

### Capa intel·ligent

- **Classificador temàtic LLM** amb Mistral (preferent europeu) i
  fallback a Claude Haiku i Qwen local. Dues bases de coneixement
  paral·leles: 17 temes editorials + taxonomia ODS/Agenda 2030 (aquesta
  segona en curs d'execució a producció).
- **Resums en llenguatge pla** (CA + ES) generats automàticament per
  iniciatives i votacions, amb guàrdies editorials que bloquegen
  vocabulari valoratiu ("polèmic", "important", "destacat").

### Producte públic

- **API REST pública** documentada a `/docs` i `/redoc`.
- **Dumps JSON massius** sota CC-BY 4.0 (`/dump/*`, quatre endpoints).
- **Notificacions Web Push** per tema (VAPID + service worker).
- **Newsletter** via Listmonk autoallotjat + Brevo com a SMTP
  transaccional.
- **Cards socials** generades amb `@vercel/og` per a Twitter/X,
  Instagram i Mastodon (només dades factuals, sense text valoratiu).
- **PWA instal·lable** amb manifest, icones i service worker.
- **UI mòbil optimitzada**: files de votació compactes, matriu de
  coincidència en acordió a mòbil, fitxes de resum AI en bottom-sheet
  per a pantalles tàctils.

### Mètriques simètriques

Totes les visualitzacions agregades respecten la regla de simetria
("mirall, no megàfon") documentada a `docs/neutrality-guidelines.md`:

- Matriu completa de coincidència entre grups.
- Cohesió interna per grup.
- Assistència individual i agregada.
- Resums comparatius per grup, sempre amb totes les parts.

### Salut tècnica

- 145+ tests automatitzats (backend + frontend).
- `mypy --strict` net.
- Caché Redis a `/stats` (≤ 200 ms en calent).
- Codi obert sota **EUPL-1.2**. Dades sota **CC-BY 4.0**.

---

## 2. Pendents immediats (setmanes 1-4)

> Actualitzat juny 2026. Aquesta iteració ha tancat la majoria dels
> pendents codificats; el que queda obert es marca a sota.

| Tasca                                              | Estat                              |
|----------------------------------------------------|------------------------------------|
| Backfill de l'enllaç Vot ↔ Iniciativa              | **Fet (juny 2026)** — executat a producció: 1.699/1.840 votacions enllaçades (92%) |
| **Scraper PNL / Moció / RDL / Reforma (162/173/130/102)** | **Fet (juny 2026)** — raspats del cercador Liferay i a producció; tanca el principal forat de dades |
| Scheduler de cron (ingesta automàtica)             | **Arreglat (juny 2026)** — els crons no s'executaven (faltava el daemon `rqscheduler`); ara desplegat i actiu |
| Filtres avançats                                   | **Fet (juny 2026)** — toolbar net a `/votes` i `/lleis` (cerca + resultat/estat + tema + grup) |
| Vista `/lleis` (les lleis com a superfície principal) | **Fet (juny 2026)** — llista d'iniciatives que creen llei amb desenllaç; les votacions no-llei s'expliquen i s'enllacen |
| Perfil temàtic de partit (proposa/vota Sí/rebutja per tema) | **Fet (juny 2026)** — factual i simètric, amb exemples |
| Extracció de `birth_year` per diputat              | Codi desplegat; execució a producció pendent |
| Execució del job de classificació ODS/Agenda 2030  | Codi desplegat; execució a producció pendent |
| **Push natiu (Capacitor → iOS + Android)**         | Base construïda (taula `device_tokens`, endpoint de registre, sender FCM dorment). Bloquejat en: clau APNs d'Apple Developer ($99/any) + projecte Firebase + build nativa per activar |
| Backfill històric (legislatures XIV→X)             | **Fet (juny 2026)** — executat a producció: ~12.500 votacions noves i ~4,3M registres individuals (X-XV ara cobertes, 2011-2026). Va requerir un importador de diputats històrics, ampliar `parliamentary_groups.slug` i gestionar les votacions per assentiment. Les 28 sessions que donaven 404 a la font (l'agregat ZIP no es va regenerar a la migració de 2020) ara es recuperen reconstruint el ZIP des dels XML per-votació; cal re-executar `backfill_x` + `backfill_xii` (veure `docs/congreso-backfill-404-recovery.md`) |
| Exposar dades històriques a la UI (selector de legislatura) | Pendent — les dades X-XIV ja són a la BD i servibles per l'API (`?legislature_id=`), però el frontend encara no té cap selector per navegar-les |
| Classificació ODS/Agenda 2030 a producció          | Pendent d'execució — 0/1.483 iniciatives classificades; el classificador Mistral està configurat però el job (LLM, ~30 min) encara no s'ha llançat |

El cicle "votació → iniciativa → text aprovat" ja està tancat per a la
XV legislatura: el scraper de sèries (PNL/Moció/RDL/Reforma) i el backfill
d'enllaços es van executar a producció el juny de 2026, així que el 92%
de les votacions ja enllacen amb la seva iniciativa. La pendent més
substantiva ara és **activar el push natiu** (només depèn de credencials
externes d'Apple/Firebase) i el **backfill històric** d'altres
legislatures.

---

## 3. Roadmap a 6-12 mesos

### 3.1 Fase 2 — Parlament de Catalunya

- Parser de BOPC en PDF (sense API; sense votacions nominals
  estructurades).
- Desambiguació de noms en convencions catalanes.
- Mapatge de grups: ERC, Junts, PSC-CpC, Comuns, CUP, Vox, PP, Cs.
- ~135 diputats, cicles electorals propis.
- Integració al model multi-cambra ja existent (`chamber_id`).

### 3.2 Fase 3 — Plenari del Consell Municipal de Barcelona

- Portal específic amb consulta de votacions i descàrrega oberta.
- Investigació detallada de la font al moment d'iniciar la fase.

### 3.3 Cobertura del Senat

Pregunta freqüent. **Diferit deliberadament** fins ara perquè:

- Volum 6× inferior al del Congrés (~500 votacions/any).
- Les iniciatives passen primer pel Congrés en la majoria de casos.
- Prioritzar Catalunya genera més valor diferencial.

**Quan activar-ho:** quan tinguem Catalunya en producció estable, o si
una sol·licitud editorial concreta (per exemple, cobertura d'una
reforma constitucional) ho justifiqui.

### 3.4 Resums setmanals (estil Civio)

Digest setmanal amb capa editorial humana mínima i descriptiva,
factual. Sense valoració política, complementant — no competint amb —
les redaccions especialitzades.

### 3.5 Integració BOE

Enllaçar les iniciatives aprovades amb la seva publicació final al
*Boletín Oficial del Estado*. Tanca el cicle "votació al Congrés → llei
vigent".

### 3.6 Registre de grups d'interès

Cross-link entre el registre oficial de lobby del Congrés i les fitxes
de diputats i votacions. Cap competidor cívic actiu integra aquesta
capa.

### 3.7 Intervencions parlamentàries

Parsing del *Diario de Sesiones del Congreso de los Diputados* per
exposar el text de les intervencions (què diuen els diputats, no només
com voten). Cerca full-text via `tsvector` de Postgres.

### 3.8 Newsletter avançada

- Digests per tema (un subscriptor pot rebre només "habitatge" o "drets
  laborals").
- Resum curat manualment cada setmana per part de l'editor.

---

## 4. Visió a 1-3 anys

Aquestes línies són aspiracionals però sostingudes per l'arquitectura
multi-cambra que ja és al codi.

- **Federació multi-cambra** amb totes les comunitats autònomes amb
  dades obertes (Andalusia, Madrid, València, Galícia, País Basc, etc.).
- **API pública com a bé comú** per a investigadors, periodisme i
  ecosistema cívic-tech. Documentació estable, SLAs informals,
  versionatge clar.
- **Anàlisi de coincidència entre cambres**: amb quina freqüència vota
  el PSOE al Congrés com el PSC al Parlament? Quina és la divergència
  entre la portaveu d'un grup a Madrid i el seu homòleg territorial?
  Sempre amb matriu simètrica completa.
- **Mètriques comparatives entre legislatures** (XV vs XIV vs XIII):
  cohesió històrica, evolució de la fragmentació, taxa d'aprovació.
- **Eines educatives** per a centres educatius i graus de periodisme:
  fitxes PDF, datasets d'aula, exercicis basats en votacions reals.
- **Newsletters federades per cambra**: cada subscriptor tria les
  cambres que vol seguir.
- **Integració amb el Parlament Europeu** (LIM, trackers existents) per
  contextualitzar les votacions espanyoles dins el marc legislatiu
  europeu.

---

## 5. Mil·lestones de finançament

Què desbloqueja cada tram d'inversió. Tots els imports són IVA inclòs i
contemplen overhead de gestió d'una entitat sense ànim de lucre.

| Tram          | Què desbloqueja                                                                                   |
|---------------|----------------------------------------------------------------------------------------------------|
| **5-10 k€**   | Scraper PNL/Moción (tancar el principal forat de dades del Congrés) + ingesta fase 1 del Parlament de Catalunya |
| **20-30 k€**  | Cobertura del Senat + Plenari de Barcelona + mètriques cross-cambra inicials                       |
| **50-80 k€**  | Funcionalitats educatives i orientades a recerca + 1 FTE durant 6 mesos                            |
| **100 k€+**   | Federació completa amb cambres autonòmiques + 2 FTE durant un any + infraestructura pública escalada |

Finançadors objectiu (prioritat decreixent):

- **NLnet** (NGI Zero Discovery + NGI Zero Entrust) — alineament alt
  amb sobirania digital europea.
- **AECID** — angle ODS / Agenda 2030 ja construït a la base.
- **OSF (Open Society Foundations)** — transparència institucional.
- **EU CERV** (Citizens, Equality, Rights, Values) — requereix entitat
  jurídica constituïda.
- **Fundació Bofill** — específic per a l'eix de Catalunya.
- **Goteo** — campanya de proves socials i base comunitària.

---

## 6. Riscos i mitigacions

| Risc                                                | Mitigació                                                                                                  |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| Pèrdua del mantenidor únic                          | Codi obert sota EUPL-1.2, `CONTRIBUTING.md`, pla de constitució d'entitat jurídica per repartir custòdia    |
| Canvi o caiguda dels portals d'opendata             | Monitoratge actiu, alertes per divergència, fallback a scraping del web públic                              |
| Bloqueig per part del proveïdor LLM                 | Abstracció agnòstica al proveïdor; Mistral, Anthropic i Qwen local ja implementats i intercanviables       |
| Repte legal o polític al posicionament neutral      | "Mirall, no megàfon" escrit al *charter* del projecte; regla de simetria a totes les mètriques comparatives |
| Creixement del cost d'infraestructura               | Cost actual < 10 €/mes; escalat incremental; voluntaris poden coallotjar instàncies regionals               |

---

## 7. Mètriques d'èxit per a l'any 1

Concretes, mesurables, públicament verificables.

| Mètrica                                                                       | Objectiu  |
|-------------------------------------------------------------------------------|-----------|
| Sessions de votació publicades de la XV legislatura ingerides en ≤ 48 h       | 100 %     |
| Cobertura de classificació temàtica sobre iniciatives substantives            | ≥ 80 %    |
| Subscriptors setmanals actius a la newsletter                                 | 50+       |
| Mitjans de comunicació utilitzant l'API pública                               | 3+        |
| Citacions acadèmiques                                                         | 1+        |
| Incidents d'enquadrament editorialitzat                                       | 0         |

L'última fila és la més important: és l'únic indicador que, si es
trenca, posa en qüestió el projecte sencer.

---

## 8. Preguntes obertes per al consell assessor

Decisions estructurals que demanen criteri extern abans d'executar-les.

1. **Constitució jurídica.** Quina forma encaixa millor: associació
   sense ànim de lucre catalana, fundació, cooperativa de consum
   cultural? Implicacions fiscals i de governança.
2. **Reclutament de comantenidors.** On publicar la convocatòria
   (universitats, comunitats cívic-tech, llistes de civic-coding
   europees) i quin estipendi és sostenible amb el finançament
   probable.
3. **Consell editorial.** Cal un consell formal? Si sí, composició:
   acadèmic de ciència política + periodista d'investigació + persona
   de societat civil organitzada. Reunions trimestrals?
4. **Model de sostenibilitat.** Combinació entre subvencions públiques,
   patronatge fundacional i serveis (formació, datasets a mida,
   consultoria per a mitjans). Cap d'aquestes línies pot comprometre la
   neutralitat editorial.

---

## Cronologia visual

```
2026 Q2 ─ Congrés XV complet en producció (PNL/Moció/RDL + enllaços fets); /lleis + perfils de partit; Catalunya en preparació
2026 Q3 ─ Backfill històric X-XV FET; pendent: selector de legislatura UI + activació push natiu + fase 1 Catalunya
2026 Q4 ─ Catalunya en producció + newsletter avançada
2027 Q1 ─ Senat + Barcelona Plenari
2027 Q2 ─ Mètriques cross-cambra + integració BOE
2027 Q4 ─ Federació autonòmica iniciada
2028   ─ Federació multi-cambra completa + integració PE
```

---

Document mantingut per Daniel a `docs/roadmap.md`. Contacte:
`daniel@holapolitica.org`. Comentaris i propostes per via pública via
issues a `https://github.com/` (organització en constitució) o per
correu directe.
