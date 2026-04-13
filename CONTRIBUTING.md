# Contributing to Monitor Parlamentari

Thanks for your interest! This project is in its very early stage. The codebase is small but the principles are strong — please read them before contributing.

## Before you start

1. Read `README.md` and `docs/neutrality-guidelines.md`. The neutrality principle is non-negotiable.
2. Look at open issues and the `docs/STATUS.md` file to see what's being worked on.
3. For non-trivial changes, please open an issue first to discuss.

## Local development

```bash
git clone <repo-url>
cd monitor-parlamentari
cp .env.example .env
docker compose up --build
```

## Running tests

```bash
docker compose exec backend pytest
docker compose exec frontend npm run type-check
```

## Code style

- **Backend:** ruff + black for format, mypy --strict for types. Run `ruff check . && black . && mypy app` before committing.
- **Frontend:** ESLint + Prettier. Run `npm run lint && npm run type-check` before committing.

## Commit messages

Use Conventional Commits format:
- `feat(scope): add X`
- `fix(scope): correct Y`
- `docs: update Z`

## What we accept

- Bug fixes.
- Improvements to data ingestion robustness.
- New chamber importers (with prior discussion).
- Documentation improvements.
- Translations.

## What we do NOT accept

Per `docs/neutrality-guidelines.md`:
- Features that introduce user reactions, comments, votes or polls on parliamentary content.
- Editorial value judgements (automatic or otherwise).
- Asymmetric rankings without simetric counterparts.
- Third-party trackers or non-essential cookies.

## License

By contributing, you agree your contributions will be licensed under EUPL-1.2 (code) and CC-BY 4.0 (data).
