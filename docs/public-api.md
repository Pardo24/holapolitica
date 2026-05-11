# Public API

Monitor Parlamentari exposes a public, documented REST API. There are no
keys, no signup, no per-IP quotas. The data is open by law (Llei
19/2013 de Transparència) and we want third-party reuse — that is the
point.

This document covers what the API offers, how to hit it, and the
guardrails we ask consumers to respect.

## Endpoints overview

The OpenAPI spec is the source of truth; this file is a human-friendly
companion.

| Surface | URL | Purpose |
|---|---|---|
| Swagger UI | `GET /docs` | Interactive documentation. Try requests in the browser. |
| ReDoc | `GET /redoc` | Alternative documentation, easier to print. |
| OpenAPI JSON | `GET /openapi.json` | Machine-readable spec. Feed it to code generators (e.g. `openapi-generator`, `swagger-codegen`). |

For the deployed base URL, use whatever the project advertises on the
[about page](https://monitorparlamentari.cat/about). Local dev defaults
to `http://localhost:8000`.

## Bulk JSON dump endpoints

The four endpoints below return a complete dataset in a single
request. They're cached server-side (1h TTL) and tagged with an
explicit `data_license`. Their target audience is press, academics,
funders, and other civic-tech projects that want our data without
hand-rolling a paginated crawler.

### `GET /dump/deputies`

Every **active** mandate in a legislature, with current group and
constituency.

```
curl 'https://api.example.org/dump/deputies?legislature_id=1'
```

Response shape:

```json
{
  "data_license": "CC-BY 4.0",
  "generated_at": "2026-05-11T10:30:00+00:00",
  "count": 350,
  "legislature_id": 1,
  "items": [
    {
      "person_id": 123,
      "mandate_id": 456,
      "full_name": "Pedro Sánchez Pérez-Castejón",
      "given_names": "Pedro",
      "family_names": "Sánchez Pérez-Castejón",
      "gender": "M",
      "birth_year": 1972,
      "photo_url": "https://...",
      "biography_url": "https://...",
      "constituency": "Madrid",
      "electoral_list_party": "PSOE",
      "mandate_start_date": "2023-08-17",
      "mandate_end_date": null,
      "external_id": "...",
      "current_group": {
        "slug": "psoe",
        "name_short": "GS",
        "name_long": "Grupo Parlamentario Socialista",
        "color_hex": "#E1112E"
      }
    }
  ]
}
```

Notes:

- Only **open** mandates (`end_date IS NULL`) appear. For history use
  the paginated `/persons/{id}/mandates` endpoint.
- Group attribution uses the open `GroupMembership`. A deputy who
  switched groups mid-legislature appears under their *current* group
  only; for historical attribution use per-vote queries that read
  `VoteRecord.group_id_at_time`.

### `GET /dump/votes`

Every vote in a legislature with aggregate result counts. Per-deputy
roll-call records are **not** included — use
`/dump/vote-records?vote_id=N` for those, one vote at a time.

```
curl 'https://api.example.org/dump/votes?legislature_id=1'
curl 'https://api.example.org/dump/votes?legislature_id=1&from=2024-01-01&to=2024-12-31'
```

The optional `from` / `to` query parameters filter on `voted_at` (ISO
8601 dates, inclusive).

Response shape (truncated):

```json
{
  "data_license": "CC-BY 4.0",
  "generated_at": "2026-05-11T10:30:00+00:00",
  "count": 4200,
  "legislature_id": 1,
  "date_from": null,
  "date_to": null,
  "items": [
    {
      "id": 1,
      "session_id": 1,
      "initiative_id": 12,
      "sequence_in_session": 3,
      "title": "Votación final sobre el conjunto de la iniciativa",
      "description": "Proyecto de Ley...",
      "voted_at": "2023-09-12T17:22:00+00:00",
      "result": "approved",
      "ayes": 178,
      "noes": 169,
      "abstentions": 3,
      "absent": 0,
      "external_id": "0001",
      "source_url": "https://...",
      "expediente_raw": "122/000262",
      "proposing_group_id": null,
      "proposed_by_government": true
    }
  ]
}
```

### `GET /dump/vote-records`

Per-deputy choices for a SINGLE vote. The XV legislature has ~600k
total roll-call records — one dump per vote keeps every response
bounded.

```
curl 'https://api.example.org/dump/vote-records?vote_id=42'
```

Response shape (truncated):

```json
{
  "data_license": "CC-BY 4.0",
  "generated_at": "2026-05-11T10:30:00+00:00",
  "count": 350,
  "vote_id": 42,
  "vote_title": "Votación final...",
  "voted_at": "2023-09-12T17:22:00+00:00",
  "result": "approved",
  "items": [
    {
      "id": 999,
      "mandate_id": 12,
      "choice": "aye",
      "person": {"id": 7, "full_name": "..."},
      "group_at_time": {"slug": "psoe", "name_short": "GS"}
    }
  ]
}
```

`choice` is one of `aye`, `no`, `abstention`, `absent`, `no_vote_recorded`.
`group_at_time` reflects the deputy's group **at the moment of the
vote**, not their current group — group switches mid-legislature are
common and the historical attribution is the whole point of this row.

Returns `404` if `vote_id` is unknown.

### `GET /dump/initiatives`

Every initiative in a legislature with its topic classifications.

```
curl 'https://api.example.org/dump/initiatives?legislature_id=1'
```

Response shape (truncated):

```json
{
  "data_license": "CC-BY 4.0",
  "generated_at": "2026-05-11T10:30:00+00:00",
  "count": 430,
  "legislature_id": 1,
  "items": [
    {
      "id": 1,
      "chamber_id": 1,
      "legislature_id": 1,
      "type": "proyecto_ley",
      "official_id": "121/000001",
      "title_original": "Proyecto de Ley...",
      "title_ca": "Projecte de Llei...",
      "title_es": "Proyecto de Ley...",
      "title_en": null,
      "status": "approved",
      "submitted_at": "2023-12-05",
      "submitted_by": "Gobierno",
      "source_url": "https://...",
      "topics": [
        {
          "slug": "habitatge",
          "name_ca": "Habitatge",
          "name_es": "Vivienda",
          "color_hex": "#3B82F6",
          "confidence": 0.92,
          "classified_by": "llm:mistral-small"
        }
      ]
    }
  ]
}
```

Initiatives without a classification yet have `topics: []`.

## Data licence

All data returned by the API is published under
[Creative Commons BY 4.0](https://creativecommons.org/licenses/by/4.0/).
You can reuse it freely — including commercially — provided you credit
"Monitor Parlamentari" and link back to the project.

The API code itself is licensed under EUPL-1.2 / AGPL-3.0 (see
[`LICENSE`](../LICENSE)).

## CORS

The bulk `/dump/*` endpoints respond with
`Access-Control-Allow-Origin: *` so newsroom and researcher JavaScript
can fetch them directly from the browser without setting up a proxy.

Every other endpoint is scoped to the deployment's configured
`BACKEND_CORS_ORIGINS` list — typically just the project's own
frontend. If you need cross-origin access to a non-dump endpoint,
[open an issue](https://github.com/) describing your use case.

## Rate limits and bulk academic use

There are no hard rate limits today. We ask consumers to keep a
reasonable cadence:

- A single dump per minute is fine for typical journalist use.
- A continuous loop hammering the API at >1 req/s is not — please
  cache the dumps locally instead.
- For large academic harvests, recurring research pipelines, or
  archival use, please [reach out](mailto:hola@monitorparlamentari.cat).
  We're happy to coordinate dataset snapshots or grant a higher quota.

If a deployment starts seeing abuse it may add a per-IP cap; current
plans are documented in `docs/operations.md`.

## Code samples

### Bash + jq

```bash
curl -s 'https://api.example.org/dump/deputies?legislature_id=1' \
  | jq '.items[] | {name: .full_name, group: .current_group.name_short}'
```

### Python (requests)

```python
import requests

resp = requests.get(
    "https://api.example.org/dump/votes",
    params={"legislature_id": 1, "from": "2024-01-01", "to": "2024-12-31"},
    timeout=30,
)
resp.raise_for_status()
data = resp.json()
print(data["data_license"], data["count"])
```

### JavaScript (fetch from a browser)

```js
const r = await fetch(
  "https://api.example.org/dump/initiatives?legislature_id=1"
);
const { data_license, items } = await r.json();
console.log(data_license, items.length);
```

## Spec

The canonical machine-readable description of every endpoint lives at
`GET /openapi.json`. Browse it interactively at `GET /docs` (Swagger UI)
or `GET /redoc` (ReDoc). Both are exposed publicly on every deployment.

## Citing the dataset

If you publish work based on this data, please cite:

> Monitor Parlamentari (2026). Open data dump of the Spanish Congress,
> XV legislature. Retrieved from
> https://monitorparlamentari.cat/dump/votes — CC-BY 4.0.
