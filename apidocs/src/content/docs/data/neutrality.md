---
title: Codi de neutralitat editorial
description: Què fa i què no fa Hola Política a nivell editorial, i com es verifica.
---

Hola Política és **infraestructura cívica**, no plataforma d'opinió.
Aquest principi té conseqüències tècniques mesurables, no només
declaratives.

## Cinc compromisos fonamentals

1. **Mirall, no megàfon.** Publiquem dades, no opinions.
2. **Simetria.** Tota mètrica comparativa entre grups o representants
   es publica amb totes les parts. Mai destaquem un cantó sense el
   parell simètric.
3. **Sense reaccions d'usuari.** No s'implementen *m'agrada*, emojis,
   votacions paral·leles o comentaris sobre votacions, lleis o
   diputats.
4. **Sense valoracions automatitzades.** No etiquetem ni qualifiquem
   el contingut polític de cap iniciativa.
5. **Sense rastrejadors de tercers.** Cap Google Analytics, cap Meta
   Pixel, cap Google Tag Manager.

## Com es verifica

Aquests compromisos **estan codificats al test suite**, no només a la
documentació:

### Test de llenguatge editorial prohibit

`backend/tests/test_newsletter_render.py` falla si les paraules
*polèmic*, *important*, *destacat*, *controvèrsia* o *highlight*
apareixen mai al HTML renderitzat de la newsletter setmanal.

### Test de simetria en mètriques

A `frontend/components/TopicBars.tsx`, la mètrica "tema amb més
suport" i "tema amb més rebuig" es renderitza **només** si els dos
extrems compleixen `MIN_N_FOR_HIGHLIGHT = 15` votacions cadascun.
Mai apareix un sense l'altre.

### Endpoints sempre complets

`/metrics/cohesion/{id}` i `/metrics/coincidence` retornen **sempre la
matriu completa**. Mai filtrem ni amaguem grups perquè tinguin pocs
membres o pocs vots.

## Què està prohibit per CONSTRUCCIÓ

| Element | Per què no |
|---|---|
| Reaccions, *m'agrada*, emojis sobre vots o lleis | Captura editorial. |
| Comentaris d'usuari | Idem. |
| Votacions paral·leles, enquestes d'opinió | No som plataforma d'opinió. |
| "Aquesta llei és bona/dolenta" automàtic | LLM no opina, només descriu. |
| Rànquings d'un sol cantó | Sempre amb el parell simètric. |
| Text editorial valoratiu a cards o widgets | Només dades factuals. |
| Trackers de tercers | RGPD-by-design. |

## Què sí fem

- **Cards socials** d'imatge per a Twitter/X/Mastodon/Instagram —
  només dades factuals (qui, com va votar, resultat, data).
- **Newsletter setmanal** amb capa editorial humana **mínima i
  descriptiva** (qui ha proposat què, què s'ha aprovat, què s'ha
  rebutjat).
- **Mètriques agregades objectives**: cohesió, coincidència,
  assistència, dissidència.
- **Eines per a periodistes**: gràfics, exportació, fitxes PDF,
  *datasets* a mida.
- **Embed widgets** per a mitjans (només dades, sense tracking).

## Govern d'aquesta neutralitat

L'article 24 dels [estatuts de l'associació](https://github.com/danpinto/monitor-parlamentari/blob/main/docs/legal/estatuts-associacio.md)
incorpora aquests cinc compromisos com a **clàusula constitutiva**:
modificar-los requereix **majoria de dues terceres parts** de
l'Assemblea de l'associació.

Si en algun moment veieu contingut que us sembli editorial o
unilateral al projecte, és un *bug*. Escriviu-nos a
`daniel@holapolitica.org` i ho corregim.
