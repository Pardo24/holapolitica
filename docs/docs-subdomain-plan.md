# `docs.holapolitica.org` — separation plan

Status: design — not deployed yet.

## Why a separate subdomain

The civic-facing UI at `holapolitica.org` is built for non-technical readers
(citizens, journalists). Today the API surface bleeds into it via two
links:

- `/about/data` mentions the public `/api/v1/*` JSON endpoints in passing.
- `/dump/*` returns raw JSON dumps with CC-BY 4.0 metadata.

That mix risks a non-developer landing on Swagger UI and bouncing off. We
want to move every technical document and the OpenAPI explorer to a
dedicated subdomain so the main site stays civic-only.

## Target audience

- **Journalists with Python/JS scripting**.
- **Researchers** ingesting the JSON dumps.
- **Civic-tech maintainers** wiring up similar projects.
- **NLnet / NGI Zero reviewers** evaluating API surface during a grant
  decision.

Not the target: regular readers. They should never need this site.

## Scope

What lives under `docs.holapolitica.org`:

1. **API reference** — Swagger UI at `/` (mirrors `api.holapolitica.org/docs`).
2. **Getting started** — short examples for `/votes`, `/topics`,
   `/initiatives/{id}`, `/dump/*`.
3. **Data dictionary** — every field on every model with provenance
   notes (sourced from `backend/app/schemas/__init__.py` and
   `docs/data-sources.md`).
4. **Methodology** — `docs/research-stats-methodology.md` (cohesion,
   coincidence, attendance definitions).
5. **Bulk dumps** — pointers to the four `/dump/*` endpoints and how to
   rate-limit politely.
6. **Embed widgets** — iframe contract, sandbox flags, no-tracker
   commitment.
7. **Changelog** — releases with breaking-change call-outs.

## Implementation options

### Option A — Static site at `docs.*` (Recommended)

Build with **Astro Starlight** or **MkDocs Material**. Build pipeline:

```
docs/
  astro.config.mjs
  src/content/docs/
    getting-started.md
    api/votes.md
    api/topics.md
    api/initiatives.md
    methodology.md
    embed.md
  package.json
```

Deploy as a sibling Vercel project; point `docs.holapolitica.org` DNS
to it. The OpenAPI page embeds the live spec from
`api.holapolitica.org/openapi.json` so it stays in sync without manual
copying. Estimated effort: 1-2 days for v1.

### Option B — Caddy reverse-proxy to FastAPI `/docs`

Add to the Hetzner Caddyfile:

```caddyfile
docs.holapolitica.org {
    reverse_proxy backend:8000 {
        header_up Host {host}
    }
    handle_path /openapi.json {
        reverse_proxy backend:8000
    }
}
```

Pro: zero new code, OpenAPI/Swagger are already generated. Con: you
inherit FastAPI's Swagger UI styling, which looks "tech-tool", not
"civic project". Best as a stopgap.

### Option C — Hybrid

Use Caddy to forward `docs.holapolitica.org/api/*` to FastAPI's
`/docs`/`/redoc`/`/openapi.json`, but serve `/` (the landing) and
`/getting-started` etc. from a static Astro/MkDocs build. Single
subdomain, two routing tiers. Recommended once we have actual technical
prose to write — not on day one.

## DNS + Vercel wiring

1. Add `CNAME docs.holapolitica.org` → `cname.vercel-dns.com` (or the
   Hetzner IP if going Caddy-only).
2. In Vercel: add `docs.holapolitica.org` to the docs project.
3. Set the canonical link on the main site `/about/data` page to
   `https://docs.holapolitica.org` so SEO consolidates.

## Guarding the entry from the public site

The main site should expose the docs from exactly ONE place: a small
"Per a desenvolupadors / For developers" callout box at the bottom of
`/about/data`, with an external-link icon (`↗`) that opens
`docs.holapolitica.org` in a new tab.

- No mention in the top nav.
- No mention in the home hero.
- No mention in the footer (legal links only).
- The link rel must be `rel="external"` so we get a clean signal in
  outbound-link analytics if/when we add them.

## Open questions

- Should the API dumps stay at `dump.holapolitica.org` as a third
  subdomain, or are they fine living under the API origin? Probably
  fine as-is until we hit bandwidth issues.
- Do we want a `/changelog` route or a Git-rendered CHANGELOG.md? Start
  with the latter, promote to a route when stable.
