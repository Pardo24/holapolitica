# Hola Política · kit de premsa

**Una sola frase**: una eina cívica oberta que mostra com vota cada diputat del Congrés, classificat per tema, sense valoracions ni rànquings unilaterals.

**Demo**: <https://holapolitica.org>
**API oberta**: <https://api.holapolitica.org/docs>
**Embeds per a redaccions**: <https://holapolitica.org/journalists>
**Codi**: <https://github.com/Pardo24/holapolitica> · EUPL-1.2 (codi) · CC-BY 4.0 (dades)

---

## El que ens diferencia

**1. "Mirall, no megàfon"** — l'eina dóna fets, mai opinions. Cap reacció, cap rànquing partidista, cap text valoratiu. Les mètriques comparatives entre grups sempre es publiquen completes (les dues bandes del rang, totes les parelles d'una matriu de coincidència). És infraestructura cívica neutra, no plataforma editorial.

**2. Recorregut del tràmit visible** — cada llei, decret o moció obre amb una banda fosca a dalt que mostra el seu recorregut (Presentació → BOCG → Comissió → Ple → Senat → BOE per a un projecte de llei; Presentació → Esmenes → Debat → Votació per a una PNL; etcètera). El pas actual surt destacat. És el que reglament del Congrés diu, mai un punt de vista nostre.

**3. Hemicicle acolorit pel vot** — 350 escons en SVG amb cada diputat al seu lloc real del Congrés, pintat de verd / vermell / ocre / gris segons com va votar. Cada escó és clicable: porta a la fitxa del diputat. Cap valoració editorial sobre el vot, només la representació gràfica de qui va dir què.

També oferim: classificació temàtica automàtica amb LLM europeu (Mistral); newsletter setmanal amb Listmonk self-hosted; notificacions push opcionals per tema; matriu de coincidència entre grups; cohesió per grup en cada vot; widgets `<iframe>` per encastar a articles.

---

## Casos d'ús per a periodisme

| Pregunta | Camí |
|---|---|
| "Com va votar [grup] sobre [tema]?" | `/topics/[slug]` o filtre `?proposing_group_slug=` |
| "Quines lleis sobre habitatge estan en tràmit ara?" | `/topics/habitatge` |
| "Qui van ser els dissidents en aquesta votació?" | `/votes/[id]` (secció Dissidents) |
| "Quina cohesió té cada grup en general?" | `/stats` |
| "Quin grup vota més vegades amb quin altre?" | `/stats` (matriu de coincidència) |
| "Quines lleis va proposar el Govern aquest mes?" | `/votes?proposing_group_slug=govern&date_from=...` |
| "Una crònica diària del ple?" | `/avui` |

Tots els endpoints estan disponibles a l'API REST oberta, sense claus, sense registre. Un script Python o Node pot consumir-los directament. Veure `/journalists` per als snippets d'`iframe`.

---

## Tres prinicipis innegociables

- **Cap reacció d'usuari, cap comentari, cap valoració editorial.** Eines de pressió → no és la nostra missió.
- **Cap rànquing unilateral.** Si publiquem "diputats amb menor assistència", també hi és "amb major"; si publiquem coincidències PP-Vox, també la matriu completa amb tots els parells.
- **Cap tracker de tercers.** No Google Analytics, no píxels socials. Hostatgem nosaltres tot — backend a Hetzner (Europa), Vercel pel frontend, Listmonk self-hosted per a la newsletter.

Si una sol·licitud sembla raonable però viola algun d'aquests principis, ho fem en un microsite separat amb marca diferenciada, mai integrat al producte principal.

---

## Equip

Petit grup voluntari amb perfils complementaris: cloud infra, dades, certificació, programació web. Cap vinculació partidista. Cap finançament a hora d'ara — el projecte busca col·laboració de Civio, fundacions europees de transparència i institucions acadèmiques.

---

## Contacte premsa

**Daniel Pardo** — daniel@holapolitica.org (o danielpc.144@gmail.com)
Disponible per a entrevistes, demos en directe i suport amb la inserció d'embeds en articles.

Per consultes tècniques sobre l'API, veure la documentació pública a <https://api.holapolitica.org/docs>.
