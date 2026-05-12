---
title: API — Votacions
description: Endpoints REST del recurs /votes amb filtres combinables.
---

Recursos rellevants:

- `GET /votes` — llistat paginat amb filtres combinables.
- `GET /votes/{id}` — una votació amb totes les seves dades.
- `GET /metrics/cohesion/{id}` — desglossament de cohesió per grup.
- `GET /metrics/coincidence` — matriu N×N de coincidència entre grups.

## `GET /votes`

```http
GET /votes?topic_slug=habitatge&result=approved&page=1&page_size=20
Accept: application/json
```

### Paràmetres acceptats

| Paràmetre | Tipus | Descripció |
|---|---|---|
| `chamber_id` | `int` | Cambra (Congreso=1, Catalunya=2, BCN=3 quan estiguin actives). |
| `legislature_id` | `int` | Legislatura (XV = 1). |
| `topic_slug` | `string` | Slug d'un tema editorial o un ODS. |
| `initiative_type` | `string` | Tipus d'iniciativa: `proyecto_ley`, `proposicion_ley`, `proposicion_no_ley`, … |
| `proposing_group_slug` | `string` | Slug del grup proposant. `govern` per a iniciatives del Govern. |
| `result` | `approved \| rejected \| tie` | Resultat de la votació. |
| `date_from` | `date` | Data mínima (inclusiva). |
| `date_to` | `date` | Data màxima (inclusiva). |
| `q` | `string` | Cerca a títol i descripció. |
| `page` | `int` | Pàgina, comença per `1`. |
| `page_size` | `int` | Mida de pàgina, entre 1 i 100. Per defecte 20. |

### Resposta

```json
{
  "total": 1840,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1840,
      "voted_at": "2026-04-30T16:42:00+00:00",
      "title": "Proyecto de Ley orgánica de seguridad ciudadana",
      "description": "Texto del Senado",
      "result": "approved",
      "ayes": 178,
      "noes": 162,
      "abstentions": 7,
      "absent": 3,
      "initiative_id": 421,
      "proposing_group_slug": null,
      "proposed_by_government": true,
      "plain_summary_ca": "La llei modifica…",
      "plain_summary_es": "La ley modifica…"
    }
  ]
}
```

## `GET /votes/{id}`

Retorna l'objecte `Vote` complet (mateixos camps que dins `items` a
dalt). Resposta `404` si l'ID no existeix.

## Mètriques associades

### Cohesió per grup en una votació

```http
GET /metrics/cohesion/{vote_id}
```

Resposta: array d'objectes, **un per cada grup** amb representació
parlamentària en aquesta votació. Mai s'omet un grup ni quan el seu
recompte és zero (regla de simetria — vegeu
[neutralitat](/data/neutrality)).

```json
[
  {
    "group_slug": "psoe",
    "group_name_short": "PSOE",
    "group_color_hex": "#E03A3E",
    "cohesion": 0.99,
    "members_voting": 119,
    "ayes": 119,
    "noes": 0,
    "abstentions": 0,
    "no_vote": 1
  },
  ...
]
```

### Matriu de coincidència entre grups

```http
GET /metrics/coincidence?legislature_id=1
```

Matriu N×N amb el % de votacions on cada parell de grups ha votat el
mateix sentit (Sí / No / Abst). Sempre completa: cap parell omès.

## Notes per a periodistes

- Si vols **tots els vots d'un diputat sobre un tema**, encadena
  `/persons/{id}/topic-stats` amb `/votes?topic_slug=…`.
- L'API **no exposa** el vot individual cru de cada diputat per
  defecte. Per a recerca acadèmica que el necessiti, escriu-nos —
  publiquem el *dump* `/dump/vote_records` sota CC-BY 4.0 amb hash
  pseudonimitzat al mandat (no al diputat) per evitar perfils
  socials secundaris.
