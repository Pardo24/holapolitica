# Hola Política — docs.holapolitica.org

Astro Starlight site that ships the technical reference for the
public API, the data dictionary, the methodology, and the bulk dumps.

Lives in its own directory (`apidocs/`) so it deploys as a sibling
Vercel project. See [`docs/docs-subdomain-plan.md`](../docs/docs-subdomain-plan.md)
for the rationale and DNS wiring.

## Local development

```bash
cd apidocs
npm install
npm run dev   # http://localhost:4321
```

## Build

```bash
npm run build
# Output: ./dist
```

## Deploy

The recommended deploy is a separate Vercel project pointed at this
folder.

1. **Create a new Vercel project** from the same Git repo.
2. **Root directory**: `apidocs`.
3. **Build command**: `npm run build`.
4. **Output directory**: `dist`.
5. **Custom domain**: `docs.holapolitica.org` — add the `CNAME` from
   the registrar to `cname.vercel-dns.com`.

## Content roadmap

The bare-minimum content scaffolding is in place (`intro`,
`first-call`, `api/votes`, `api/initiatives`, `data/neutrality`,
`data/dumps`). Still to add:

- `api/topics.md`, `api/groups.md`, `api/persons.md`, `api/stats.md`.
- `data/dictionary.md` — full field reference per model.
- `data/methodology.md` — port from
  `../docs/research-stats-methodology.md`.
- `embed/widgets.md`, `embed/cards.md` — once the embed templates
  ship.
- ES / EN translations of every page (defaultLocale is `ca`).

Each is a few hundred lines of Markdown; budget half a day for the
full content pass.

## Anti-pitch (intentional gaps)

- No search bar yet (Starlight ships one by default but it indexes
  everything; we keep this in CA-only first pass).
- No live API explorer embedded (the FastAPI `/docs` endpoint at
  `api.holapolitica.org/docs` is the canonical interactive surface).
  We can embed it later via an `<iframe>` if we want.
- No versioning. Once we ship `/api/v2`, we'll split the sidebar by
  version.
