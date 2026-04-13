# Monitor Parlamentari

Open source platform that centralizes parliamentary votes, initiatives and activity from Spanish chambers. Phase 1 covers the **Congrés dels Diputats** (Spanish Congress); future phases will add the **Parlament de Catalunya** and the **Plenari de l'Ajuntament de Barcelona**.

The project is **civic infrastructure, not a political platform**: it provides facts (how each representative voted, on what, with what result) without editorial judgement. The goal is to be cited by serious journalists and useful for activists, citizens and researchers.

## Status

🚧 Phase 0 — Initial scaffold. Not production-ready yet.

## Quick start

You need Docker and Docker Compose. Then:

```bash
git clone <repo-url>
cd monitor-parlamentari
cp .env.example .env
docker compose up --build
```

When everything is up:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

To run the initial data import (one-shot, downloads current legislature data from Congreso open data):

```bash
docker compose exec backend python -m app.ingest.congreso.bootstrap
```

## Architecture

See `docs/architecture.md` for full details.

- **Backend:** Python 3.11+ with FastAPI, SQLAlchemy 2 async, Alembic migrations.
- **Frontend:** Next.js 15+ with TypeScript, Tailwind, shadcn/ui.
- **Database:** PostgreSQL 16+.
- **Workers:** RQ + Redis.
- **Hosting target:** Hetzner VPS with Caddy reverse proxy.

## Principles

This project follows a strict **"mirror, not megaphone"** principle. We do NOT implement:

- User reactions, likes, emojis or polls on votes, laws or representatives.
- User comments.
- Parallel votes ("how would you have voted?").
- Editorial value judgements ("this law is good/bad").
- Asymmetric rankings highlighting one political side.

We DO provide:

- Comprehensive filtering and search.
- Aggregated objective metrics (group cohesion, attendance, coalition matrices).
- Beautiful social cards for sharing facts.
- Weekly newsletter with brief editorial context.
- Tools for journalists (charts, exports, PDF dossiers).
- Embeddable widgets for media outlets.

See `CLAUDE.md` and `docs/neutrality-guidelines.md` for the full reasoning.

## License

- **Code:** EUPL-1.2 (see `LICENSE`).
- **Data:** CC-BY 4.0.
- **Editorial content:** CC-BY-SA 4.0.

## Contributing

See `CONTRIBUTING.md`.

## Funding

This project is being prepared for a grant application to [NLnet NGI Zero Commons Fund](https://nlnet.nl/commonsfund/). Currently self-funded.
