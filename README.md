# Hola Política

Open civic platform that publishes individual parliamentary votes from Spanish chambers, classified by topic, in **Catalan / Spanish / English**. Phase 1 covers the **Congreso de los Diputados** (Spanish Congress); future phases will add the **Parlament de Catalunya** and the **Plenari de l'Ajuntament de Barcelona**.

The project is **civic infrastructure, not a political platform**: it publishes facts (how each representative voted, on what, with what result) without editorial judgement. The audience is serious journalists, researchers, activists, and citizens.

Live at **<https://holapolitica.org>**. Public API at **<https://api.holapolitica.org>** (docs: `/docs`).

## Status

Phase 1 (Congress of Deputies, XV legislature) — **live in production**:

- **~1,840 votes** ingested from the official open-data portal
- **430 initiatives** (laws, PNLs, RDLs, reform proposals)
- **350 active deputies** with full mandates + group-membership history
- **617,000 individual vote records** linking deputy → vote → choice
- Automatic ingestion every 4 hours; idempotent
- Topic classification via **Mistral Small** (European LLM — deliberately not OpenAI/Gemini)
- BOE law-matching via the official consolidated API
- Weekly newsletter via self-hosted **Listmonk**
- Web Push notifications, PWA, social cards (`@vercel/og`)
- 5 embed widgets for newsroom integrations
- Civic-learning quiz at `/joc`

See [`docs/STATUS.md`](docs/STATUS.md) for the current operational state.

## Maintainer

Built and maintained by **[Daniel Pardo](https://github.com/Pardo24)**. Solo project; all architectural decisions, the editorial neutrality discipline, the data model, and the deployed infrastructure are mine.

### AI-assisted development

This project uses **AI-assisted development**, primarily Claude (Anthropic), under continuous human review. Code drafted with AI assistance is reviewed, tested, and committed by the human maintainer; the standard `Co-Authored-By: Claude <noreply@anthropic.com>` trailer appears on commits where Claude contributed substantively (per [Anthropic's attribution convention](https://docs.anthropic.com/claude/docs)).

This is a deliberate engineering choice: it lets a single maintainer ship and operate a production civic-data platform at this scale. **It does not change who is accountable for the project.** Every line shipped has been reviewed by Daniel; the editorial and architectural decisions are not delegated to a model.

This disclosure also applies to grant applications and other formal communications about the project.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for full details.

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic migrations, Pydantic v2.
- **Frontend:** Next.js 15 (App Router), TypeScript (strict), next-intl (CA/ES/EN), Tailwind.
- **Database:** PostgreSQL 16, indexed for read-heavy access.
- **Workers:** RQ + Redis (scheduler + job runners).
- **Classifier:** Mistral Small via Mistral La Plateforme; explicit policy against OpenAI / Google Gemini.
- **Newsletter:** Listmonk (self-hosted, EU-sovereign).
- **Hosting:** Hetzner (backend + DB + workers) + Vercel (frontend), Caddy reverse proxy.
- **OG cards:** `@vercel/og` (JSX → image).

## Quick start (dev)

You need Docker and Docker Compose. Then:

```bash
git clone https://github.com/Pardo24/holapolitica.git
cd holapolitica
cp .env.example .env
docker compose up --build
```

When everything is up:

- Frontend: <http://localhost:3002>
- Backend API: <http://localhost:8000>
- API docs (Swagger): <http://localhost:8000/docs>

To run the initial data import (one-shot, downloads current legislature data from the Spanish Congress open-data portal):

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap
```

## Principles

This project follows a strict **"mirror, not megaphone"** principle. We do NOT implement:

- User reactions, likes, emojis or polls on votes, laws or representatives.
- User comments.
- Parallel votes ("how would you have voted?").
- Editorial value judgements ("this law is good/bad").
- Asymmetric rankings highlighting one political side without a symmetric counterpart.

We DO provide:

- Comprehensive filtering and search.
- Aggregated objective metrics (group cohesion, attendance, coalition matrices) under a strict symmetry rule.
- Embed widgets for newsrooms.
- Weekly newsletter with descriptive editorial framing (no opinion).
- Tools for journalists (charts, exports, PDF dossiers).
- Civic-learning quiz.

See [`CLAUDE.md`](CLAUDE.md) and [`docs/neutrality-guidelines.md`](docs/neutrality-guidelines.md) for the full reasoning.

## License

- **Code:** EUPL-1.2 (see [`LICENSE`](LICENSE)).
- **Data:** CC-BY 4.0.
- **Editorial content:** CC-BY-SA 4.0.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Funding

Currently self-funded by the maintainer. Active grant pipeline:

- **NLnet NGI Zero Commons Fund** — application in preparation (next deadline 2026-06-01).
- **Fundació Jaume Bofill** — draft at [`docs/grants/bofill-application.md`](docs/grants/bofill-application.md).
- **Goteo crowdfunding** — draft at [`docs/grants/goteo-campaign.md`](docs/grants/goteo-campaign.md).

If you'd like to support the project directly, see the "Funding" section above (GitHub Sponsors profile in setup).
