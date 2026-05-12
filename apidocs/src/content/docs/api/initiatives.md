---
title: API — Iniciatives
description: Llei o iniciativa parlamentària amb resum IA, votacions i temes.
---

Una **iniciativa** és el contenidor d'una proposta legislativa o
parlamentària. Pot ser un Projecte de Llei (Govern), una Proposició
de Llei (grup parlamentari), una Proposició no de Llei (PNL), una
Moció, etc.

## `GET /initiatives/{id}`

```http
GET /initiatives/421
Accept: application/json
```

### Resposta

```json
{
  "id": 421,
  "chamber_id": 1,
  "legislature_id": 1,
  "type": "proyecto_ley",
  "official_id": "121/000063",
  "title_original": "Proyecto de Ley orgánica de seguridad ciudadana",
  "title_ca": null,
  "title_es": null,
  "title_en": null,
  "summary": null,
  "object_text": "EXPOSICIÓN DE MOTIVOS\nLa presente ley orgánica…",
  "status": "approved",
  "submitted_at": "2025-11-12",
  "submitted_by": "Gobierno",
  "source_url": "https://www.congreso.es/.../BOCG_A_121_063_…pdf",
  "plain_summary_ca": "Aquest projecte de llei amplia les sancions per…",
  "plain_summary_es": "Este proyecto de ley amplía las sanciones por…",
  "plain_summary_provider": "mistral-small",
  "plain_summary_generated_at": "2026-05-08T10:23:11+00:00",
  "votes": [
    {
      "id": 1840,
      "voted_at": "2026-04-30T16:42:00+00:00",
      "result": "approved",
      "ayes": 178,
      "noes": 162,
      "abstentions": 7,
      "absent": 3
    }
  ],
  "topics": [
    {
      "slug": "justicia",
      "name_ca": "Justícia i drets fonamentals",
      "color_hex": "#5E35B1",
      "kind": "theme"
    },
    {
      "slug": "sdg-16-peace-justice",
      "name_ca": "Pau, justícia i institucions sòlides",
      "color_hex": "#00689D",
      "kind": "sdg"
    }
  ]
}
```

### Camps rellevants

- **`object_text`** — preàmbul de la pròpia llei, extret del BOCG en
  PDF. És **l'input principal del resum IA**. Llarg (entre 500 i
  20.000 caràcters); la UI principal **no el mostra** als usuaris.
- **`plain_summary_ca` / `plain_summary_es`** — resum automàtic en
  llenguatge planer, generat per Mistral a partir del `object_text`.
  2-4 frases. Pot contenir imprecisions; el text legal és sempre
  l'autoritat.
- **`votes`** — totes les votacions enllaçades a aquesta iniciativa.
  Quan és una llei completa, normalment n'hi haurà múltiples
  (totalitat, dictamen, esmenes, retorn del Senat). Per a PNL/Mocions,
  típicament una única votació de fons.
- **`topics`** — classificacions: cada iniciativa pot tenir múltiples
  temes (un editorial + un o més ODS).

## `GET /initiatives/{id}/related`

Iniciatives que comparteixen com a mínim un tema amb la donada.
Ordenades per nombre de temes coincidents (descendent) i després per
data (recents primer).

```http
GET /initiatives/421/related?limit=6
```

Retorna un array d'`Initiative` (sense els camps `votes` i `topics`).

## `GET /topics/{slug}/initiatives`

Totes les iniciatives classificades sota un tema concret:

```http
GET /topics/habitatge/initiatives?legislature_id=1
```

Paràmetres opcionals: `legislature_id`, `status`.

## Notes

- Si `plain_summary_*` és `null` per una iniciativa, vol dir que el
  generador encara no ha passat per ella o que el `object_text` no
  s'havia pogut extreure quan va passar. Eventualment hi serà.
- L'`official_id` segueix el format del Congrés:
  `<tipus>/<expedient>`. Exemples: `121/000063` (Projecte de Llei),
  `162/000789` (PNL), `122/000123` (Proposició de Llei).
- El camp `summary` (no confondre amb `plain_summary_*`) prové del
  *feed* d'open data del Congrés. Sol estar buit; quan no, és curt
  i poc útil.
