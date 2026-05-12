# Fundació Jaume Bofill — borrador de sol·licitud

> Línia objectiu: **convocatòries específiques de la Fundació Bofill**
> per a projectes d'**innovació democràtica i transparència** que
> incideixin a Catalunya. La Bofill té tradició de finançar
> experiments cívics petits-mitjans (5.000-30.000 €) amb impacte
> demostrable en l'esfera pública catalana.
>
> No tots els anys publiquen la mateixa convocatòria. Convé seguir
> el seu butlletí (`fbofill.cat`) i preguntar directament per correu
> a `bofill@fbofill.cat` quina convocatòria oberta encaixaria millor.
>
> Última revisió: 2026-05-12.

---

## Resum executiu (1 paràgraf, ~150 paraules)

**Hola Política** és una plataforma cívica neutral que publica, en
obert, les **votacions nominals del Congrés dels Diputats** classificades
per tema, en català i castellà. Avui ja conté 1.840 votacions de
l'actual legislatura, 617.580 registres individuals, 430 lleis i 350
diputats, amb resums automàtics en llenguatge planer i una API
pública sota CC-BY 4.0. És **l'única infraestructura cívica que
publica votacions amb attribució per diputat i classificació
temàtica oberta a Catalunya**. Sol·licitem **15.000 €** per dotar el
projecte de l'estructura jurídica que li manca (associació catalana),
estabilitzar-ne la infraestructura operativa durant 12 mesos i obrir
la **fase 2** d'ingesta de dades del **Parlament de Catalunya** (parsing
del BOPC).

---

## Encaix amb la missió de la Bofill

La Bofill té com a línia central **"educació i innovació democràtica
per a una Catalunya més justa i cohesionada"**. Hola Política
aporta:

1. **Innovació democràtica concreta**: democratitza l'accés a una
   informació pública que avui és tècnicament inaccessible (XMLs i
   PDFs).
2. **Educació cívica**: la pàgina `/recorregut` explica el cicle de
   vida d'una llei al Congrés en 8 etapes amb llenguatge planer; les
   fitxes de cada llei tenen un resum de 2-3 frases.
3. **Catalunya com a beneficiari principal**: encara que la cobertura
   actual és del Congrés espanyol, l'objectiu d'aquesta sol·licitud
   és **portar la mateixa eina al Parlament de Catalunya** —
   contingut originalment català, públic català, en llengua catalana
   per defecte.
4. **Compromís amb la sobirania digital**: codi sota llicència
   europea EUPL-1.2, dades sota CC-BY 4.0, infraestructura europea
   (Hetzner, Vercel), classificador LLM europeu (Mistral).

---

## Què demanem (15.000 €) i a què es destina

| Partida | Import | Justificació |
|---|---|---|
| Compensació hores de desenvolupament (parser BOPC + ingesta Parlament) | 9.000 | Estimació: 12 setmanes × 15 h/setmana × 50 €/h. El BOPC és en PDF: requereix parser dedicat amb extracció de votacions per nom i identificació de grups parlamentaris. |
| Infraestructura (servidors, dominis, correu, LLM API) 12 mesos | 600 | Hetzner CPX22 (~10 €/mes), Mistral La Plateforme Tier 1 (5 €/mes), domini, correu transaccional (Brevo). |
| Constitució de l'associació + comptabilitat any 1 | 700 | Taxa 04.18 del Registre, comptabilitat externa per la presentació de comptes (any 1). |
| Disseny i comunicació | 2.500 | Identitat visual de l'associació (logotip, plantilles socials), col·lecció de cards educatives sobre el Parlament de Catalunya per a Mastodon/Twitter. |
| Reunions del consell assessor (4 sessions/any, dietes) | 800 | 4 sessions × 5 persones × 40 €/persona. Consell assessor: 1 acadèmic ciència política, 1 periodista d'investigació, 1 representant de societat civil organitzada, 1 expert legal/RGPD, 1 representant del consell editorial de Civio (a confirmar). |
| Activitat de difusió (esdeveniment de presentació) | 600 | Lloguer d'espai, càtering bàsic, presentació pública del projecte un cop completada la fase 2 (Parlament de Catalunya). |
| Auditoria externa de neutralitat editorial | 800 | Una persona externa al projecte (acadèmic) revisa l'aplicació pràctica del codi de neutralitat sobre 100 votacions a l'atzar i publica un informe. |
| **TOTAL** | **15.000 €** | |

---

## Beneficiaris directes

- **Ciutadania catalana** amb interès informatiu — usuaris de la
  plataforma (mesura: visites úniques mensuals).
- **Mitjans de comunicació catalans** (Vilaweb, El Crític, Mèdia.cat,
  Crític) — usuaris potencials de l'API i de les eines per a
  periodistes.
- **Centres educatius i graus de periodisme** — la plataforma serà
  ús didàctic verificat a finals de l'any.
- **Comunitat civic-tech catalana** (Sentit Crític, OpenData
  Catalunya, Iniciativa de Coneixement Obert) — beneficiari de
  l'expansió del corpus de dades cíviques.

---

## Indicadors d'impacte (any 1)

Hem definit indicadors **mesurables i verificables públicament**:

| Indicador | Objectiu any 1 | Mètrica |
|---|---|---|
| Votacions del Parlament de Catalunya ingerides | ≥ 200 | Recompte públic a `holapolitica.org/stats` |
| Iniciatives del Parlament de Catalunya classificades per tema | ≥ 80 % | Camp `classified_by` del repositori |
| Mitjans catalans utilitzant l'API | ≥ 2 | Logs del subdomini api.holapolitica.org (només referrer domain, sense fingerprinting d'usuari) |
| Subscriptors a la newsletter setmanal | ≥ 200 | Recompte públic |
| Incidents d'editorialització detectats per l'auditoria | 0 | Informe extern semestral |
| Citacions acadèmiques | ≥ 1 | Google Scholar |

---

## Calendari d'execució (12 mesos)

| Mes | Lliurables |
|---|---|
| 1-2 | Constitució de l'associació. Convocatòria del consell assessor. |
| 3-6 | Parser del BOPC en PDF. Ingesta de la legislatura actual del Parlament. |
| 7-8 | Classificació temàtica i integració amb el catàleg de temes existents. |
| 9-10 | UI multilingüe del Parlament de Catalunya. Cards socials per a partits catalans. |
| 11 | Auditoria externa de neutralitat. Esdeveniment de presentació pública. |
| 12 | Informe final, publicació de la memòria i dataset complet sota CC-BY 4.0. |

---

## Equip

**Daniel Pinto** (responsable tècnic) — desenvolupador full-stack
amb 10+ anys d'experiència. Manté Hola Política des de l'inici.

**Consell assessor a constituir** (objectiu: trimestre 1 del
projecte). Perfils objectiu:

- Acadèmic/a de ciència política d'una universitat catalana
  (UPF, UB, UAB) amb interès en participació política i
  representació.
- Periodista d'investigació en actiu (preferentment d'El Crític,
  Vilaweb, Mèdia.cat, Crític).
- Representant de societat civil organitzada
  (associacions de drets digitals, Federació d'Associacions de
  Veïns, etc.).
- Expert/a legal en RGPD aplicat a dades obertes (Eticas Research,
  per exemple, o assessoria voluntària).
- Possible quinta plaça per a un representant del consell editorial
  de Civio (a confirmar amb ells).

---

## Antecedents

- **Producte ja desplegat**: `holapolitica.org` és en producció
  des de gener de 2026 amb cost operatiu inferior a 10 €/mes.
- **Codi obert verificable**: `github.com/danpinto/monitor-parlamentari`
  amb 26 commits, llicència EUPL-1.2, tests automatitzats i CI.
- **Documentació pública**: roadmap, anàlisi de competidors, guia
  de neutralitat, checklist d'auditoria — tots al directori `docs/`
  del repositori.
- **No hi ha conflicte d'interès** amb la Bofill ni amb cap entitat
  del seu ecosistema.

---

## Riscos i mitigacions

| Risc | Mitigació |
|---|---|
| BOPC del Parlament canvia format | Parser modular per fase de tramitació; tests de regressió sobre exemples històrics. |
| Pèrdua del mantenidor únic | Codi obert sota EUPL, documentació exhaustiva, consell assessor com a garant. |
| Repte legal sobre publicació de dades de diputats | Tractament basat en Art. 85 RGPD i Llei 19/2013 de Transparència. Auditoria externa de neutralitat. |
| Captura editorial per pressió externa | Codi de neutralitat com a clàusula constitutiva dels estatuts; modificació requereix 2/3 de l'Assemblea. |

---

## Per què la Bofill i no una altra entitat

Hem identificat la Bofill com a primer interlocutor d'aquesta fase
perquè:

1. **Encaix temàtic precís**: la innovació democràtica i la
   participació informada són eixos centrals de la fundació.
2. **Volum adequat**: 15.000 € és coherent amb les vostres línies de
   finançament petites-mitjanes; no estem demanant 100k+ que us
   trauria d'escala.
3. **Catalunya com a beneficiari**: l'objectiu central d'aquesta
   sol·licitud és precisament estendre l'eina al Parlament de
   Catalunya, alineat amb la vostra missió territorial.
4. **Sense competència interna**: cap projecte cívic actual de
   l'ecosistema català (Civio té seu a Madrid, Maldita opera a tot
   Espanya) cobreix aquest nínxol específic.

---

## Contacte

Daniel Pinto — `daniel@holapolitica.org`

Disposat a presentar el projecte en persona a les vostres oficines
en qualsevol moment. La demo en directe és ràpida (10 min) i deixa
clares les capacitats actuals i la diferenciació respecte als
projectes adjacents.
