---
title: Primer ús de l'API
description: Crida un endpoint del Congrés en menys d'un minut.
---

L'API pública de Hola Política viu a
[`https://api.holapolitica.org`](https://api.holapolitica.org). Cap
clau d'API, cap registre, cap *cookie*. Tot retorna JSON.

## 1. Llista les 5 últimes votacions

```bash
curl 'https://api.holapolitica.org/votes?page=1&page_size=5' \
  | jq '.items[] | {voted_at, title, result, ayes, noes}'
```

Sortida (simplificada):

```json
{
  "voted_at": "2026-04-30T16:42:00+00:00",
  "title": "Proyecto de Ley orgánica de seguridad ciudadana",
  "result": "approved",
  "ayes": 178,
  "noes": 162
}
```

## 2. Obté una votació concreta

```bash
curl 'https://api.holapolitica.org/votes/1840' | jq '.'
```

El camp `initiative_id` enllaça amb l'iniciativa, si existeix:

```bash
INI=$(curl -s 'https://api.holapolitica.org/votes/1840' | jq '.initiative_id')
curl "https://api.holapolitica.org/initiatives/${INI}" | jq '.title_ca, .plain_summary_ca'
```

## 3. Filtra per tema

Llista totes les votacions classificades sota *Habitatge*:

```bash
curl 'https://api.holapolitica.org/votes?topic_slug=habitatge&page_size=50' \
  | jq '.items[] | .title'
```

Tots els temes disponibles:

```bash
curl 'https://api.holapolitica.org/topics' | jq '.[] | .slug + " — " + .name_ca'
```

## 4. Cohesió interna per grup en una votació

```bash
curl 'https://api.holapolitica.org/metrics/cohesion/1840' \
  | jq '.[] | {grup: .group_name_short, ayes, noes, abstentions, cohesion}'
```

## 5. Dump massiu

Descàrrega completa d'iniciatives (430 files, ~600 kB):

```bash
curl -fsSL 'https://api.holapolitica.org/dump/initiatives' \
  > initiatives.json
```

Llicència: **CC-BY 4.0**. Atribució requerida: `Hola Política,
holapolitica.org`.

## Què ve a continuació

- Vés a [API · Votacions](/api/votes) per a tots els filtres i
  paràmetres del *endpoint*.
- Vés a [Iniciatives](/api/initiatives) per al model d'una llei
  individual, els seus temes i les votacions vinculades.
- Vés a [Diccionari de dades](/data/dictionary) si vols entendre
  el significat exacte de cada camp.
