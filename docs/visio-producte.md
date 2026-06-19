# Hola Política — Visió de producte

> Document de treball (juny 2026). Plantejament de cap a on hauria d'anar el
> producte per complir la seva missió: **fer partícips els ciutadans de la
> democràcia representativa**. No descriu el que tenim, sinó la forma ideal
> cap a la qual evolucionar. Complementa `docs/roadmap.md` (què/quan) amb el
> *per què* i el *com* de l'experiència.

## La missió, dita amb precisió

Democratitzar la democràcia no és publicar més dades. És reduir la distància
entre el ciutadà i les decisions que el governen: que **sàpiga**, que
**entengui**, que vegi **què l'afecta**, que pugui **avaluar si el
representen**, que **recordi** què han fet, i que sàpiga **com participar**
pels canals que el sistema ja ofereix.

Tot això sota una restricció innegociable: **"mirall, no megàfon"**. El
producte no opina, no recomana vot, no enquadra. Augmenta l'agència del
ciutadà sense convertir-se en un actor partidista. La neutralitat no és un
fre a la participació; n'és la condició de confiança.

## El problema de disseny

Gairebé tots els observatoris parlamentaris s'organitzen **com la
institució** (votacions, diputats, comissions). Però el ciutadà no pensa en
aquests termes. Pensa: *"què s'ha decidit sobre l'habitatge?"*, *"em
representa qui vaig votar?"*, *"què va prometre i què ha fet aquest partit?"*.

La web ideal s'organitza **com la ment del ciutadà**, no com l'organigrama
del Congrés.

## L'escala de participació

La participació és una escala; el producte acompanya esglaó a esglaó:

1. **Saber** — què passa. *(tenim)*
2. **Entendre** — què vol dir (llenguatge pla, temes). *(tenim)*
3. **Importar-me** — què afecta el que jo valoro (personalització per tema/territori).
4. **Avaluar** — *em representen?* (alineament amb el meu criteri).
5. **Recordar** — què han fet al llarg del temps (memòria, rendició de comptes).
6. **Actuar** — usar els canals de participació que el sistema ja ofereix.

Els esglaons 3-6 són el salt de "transparència passiva" a "participació".

## Els 6 pilars

### 1. El mirall personal — "La teva democràcia"
La pàgina d'inici no és una llista de votacions recents, sinó *la teva*:
tries temes (habitatge, clima, drets laborals…) i territori (circumscripció),
i la web esdevé un feed de "decisions que t'afecten", en llenguatge pla, amb
la foto simètrica completa (qui ha votat què). Privadesa per disseny: les
preferències viuen al dispositiu, sense perfilat.

### 2. "Com et representen?" — alineament sense adoctrinament
La funció estrella. La web *no té opinió*; et torna *la teva*. Et presenta
votacions reals passades ("hauries votat sí o no?") i et diu quins
partits/diputats van votar com tu hauries votat. Converteix la lectura
passiva en reflexió activa. És neutral perquè el criteri el poses tu — el
sistema només fa de mirall del teu vot contra el registre real. (El `/joc`
n'és la llavor.)

### 3. Memòria i rendició de comptes
Amb 15 anys de dades (legislatures X-XV): *què va fer un partit governant vs.
a l'oposició? com ha evolucionat la seva posició sobre X? promeses vs. vots?*
Perfils històrics de partit i comparativa entre legislatures. Desbloquejat
pel backfill històric de juny 2026.

### 4. Del projecte a la llei a la vida real
Tancar el cicle: iniciativa → debat → votació → **BOE (llei vigent)** → què
canvia. El ciutadà no veu només un vot abstracte, sinó què va acabar sent
llei i què implica.

### 5. Alfabetització deliberativa
Les **intervencions** (què *diuen* els diputats, no només com voten) via el
Diario de Sesiones, amb cerca full-text. Entendre els arguments, no només el
marcador.

### 6. Ponts cap a l'acció (neutrals)
On el sistema *ja* ofereix canals (consultes públiques d'avantprojectes,
contacte amb el diputat), mostrar-los de forma factual al costat de l'ítem
rellevant. No és activisme: és "així et deixa participar el sistema, i aquí
tens l'assumpte".

## La nova arquitectura d'informació

En lloc de *Votacions / Diputats / Lleis*, la navegació partiria del ciutadà:

- **La teva democràcia** — home personal: els teus temes, el teu territori,
  què ha canviat.
- **Temes** — entra per "Habitatge" i veus TOT el que el Parlament ha fet en
  habitatge en 15 anys: registre de tots els partits, lleis aprovades, estat
  actual. (Cobreix "buscar lleis sobre un tema": cerca semàntica + per tema.)
- **Com et representen?** — l'eina d'alineament.
- **Els teus representants** — pels de la teva circumscripció: registre,
  assistència, dissidència.
- **Partits** — perfils (inclòs històric), què proposen/voten per tema,
  evolució.
- **L'arxiu / dades obertes** — el registre complet + API com a bé comú.

## Relació amb el que tenim

No es llença res. El que tenim és la capa **Saber/Entendre** (esglaons 1-2),
fonament imprescindible. El salt és construir a sobre els esglaons 3-6. El
backfill històric ja ha desbloquejat el pilar 3.

## Primera onada recomanada

1. **Selector de legislatura + dades històriques** (esglaó 5, pilar 3) — el
   retorn directe del backfill; fa navegables els 15 anys.
2. **Cerca de lleis per tema** (esglaó 3, pilar 1) — descobrir lleis sobre un
   tema concret.
3. **Comparativa entre legislatures** (pilar 3) — consumeix el nou endpoint
   `/stats/legislatures`.
4. **"Com et representen?"** (esglaó 4, pilar 2) — el salt gran de
   participació; evoluciona el `/joc`.

---

Mantingut per Daniel. Plantejament obert a revisió del consell assessor.
