# CI/CD

This project ships with four GitHub Actions workflows. All workflow files
live under `.github/workflows/`. Each is path-filtered so we don't spend
CI minutes on unrelated changes, and each cancels its own superseded runs
via the `concurrency` block.

The matrix below is the source of truth — keep it in sync with the YAML.

## Workflows

| Workflow             | File                                    | Triggers                                       |
|----------------------|-----------------------------------------|------------------------------------------------|
| Backend CI           | `.github/workflows/backend-ci.yml`      | PRs and pushes to `main` touching `backend/**` |
| Frontend CI          | `.github/workflows/frontend-ci.yml`     | PRs and pushes to `main` touching `frontend/**`|
| PR Quality           | `.github/workflows/pr-quality.yml`      | Every PR (no path filter)                      |
| Release              | `.github/workflows/release.yml`         | Pushed tags matching `v*.*.*`                  |

### Backend CI

Three required jobs run on every PR:

1. **`lint`** — `ruff check .` + `black --check .` against `backend/`.
2. **`typecheck`** — `mypy --strict app`.
3. **`test`** — `alembic upgrade head` then `pytest tests/ -v` against a
   `postgres:16-alpine` + `redis:7-alpine` service container pair.

On pushes to `main` only:

4. **`docker-build`** — builds the backend image and pushes it to
   `ghcr.io/<owner>/<repo>-backend:<sha>` (also `:latest`). Skips push
   cleanly when `GHCR_TOKEN` is unset — useful for forks.

### Frontend CI

Three required jobs run on every PR:

1. **`lint`** — `npm run lint` (Next.js ESLint config).
2. **`typecheck`** — `npm run type-check` (`tsc --noEmit`).
3. **`build`** — `npm run build` with placeholder env vars and uploads
   the `.next/` directory as an artifact.

On pushes to `main` only:

4. **`vercel-deploy`** — production deploy via Vercel CLI. **Skips
   cleanly when `VERCEL_TOKEN` is unset.**

### PR Quality

Runs on **every** PR regardless of path filter:

- `actionlint` — lints workflow YAML so a broken trigger doesn't slip in.
- `gitleaks` — scans the PR diff for accidental credential commits.
- `pre-commit` — runs hooks if `.pre-commit-config.yaml` exists. No-op
  otherwise.

### Release

Triggered by pushing a tag matching `v*.*.*` (e.g. `git tag v0.1.0 && git
push origin v0.1.0`). Builds backend + frontend Docker images tagged with
the version, pushes them to GHCR, and creates a GitHub Release whose body
includes the image URLs plus auto-generated notes.

## Required status checks (branch protection)

To enforce the gate at GitHub level:

1. Go to **Settings → Branches → Branch protection rules**.
2. Add a rule for `main` with **Require status checks to pass before merging**
   enabled. Select these checks (the names match the `jobs.<id>.name`
   strings in the YAML):
   - `Backend CI / Lint (ruff + black)`
   - `Backend CI / Typecheck (mypy strict)`
   - `Backend CI / Test (pytest + alembic)`
   - `Frontend CI / Lint (next lint)`
   - `Frontend CI / Typecheck (tsc --noEmit)`
   - `Frontend CI / Build (next build)`
   - `PR Quality / Lint workflows (actionlint)`
   - `PR Quality / Secret scan (gitleaks)`
3. Tick **Require branches to be up to date before merging** so checks
   re-run after a rebase.

The deploy jobs (`docker-build`, `vercel-deploy`) are intentionally NOT
required — they only run on `main` after the merge, and gating merge on
them would create a chicken-and-egg deadlock.

## Secrets

Add these under **Settings → Secrets and variables → Actions**.
Everything is optional — the workflows skip cleanly if a secret is missing.

| Secret name        | Used by                | What for                                                                                  |
|--------------------|------------------------|-------------------------------------------------------------------------------------------|
| `GHCR_TOKEN`       | `backend-ci`, `release`| Push images to GHCR. Optional — the default `GITHUB_TOKEN` already works for same-org repos. |
| `VERCEL_TOKEN`     | `frontend-ci`          | Production deploy to Vercel. Without it, the deploy step short-circuits to a notice.       |
| `VERCEL_ORG_ID`    | `frontend-ci`          | Required by `vercel pull` when deploying. Linked project also needs `VERCEL_PROJECT_ID`.   |
| `VERCEL_PROJECT_ID`| `frontend-ci`          | Linked Vercel project.                                                                     |
| `MISTRAL_API_KEY`  | _not used in CI_       | Real classifier provider in production. CI uses the offline `keyword` provider — never set this in Actions. |

**Never** put `MISTRAL_API_KEY` (or any LLM provider key) into GitHub
Actions secrets for this project. CI uses `LLM_PROVIDER=keyword`, an
offline classifier that needs no network. Tests that exercise LLM-shaped
output mock the provider directly.

## Deploy story

- **PR → no deploy.** Only validation jobs run.
- **Merge to `main` → `docker-build` + `vercel-deploy`** (each gated by
  its respective secret). No manual step needed for the normal happy path.
- **Tag `v*.*.*` → `release`** builds versioned images and creates a
  GitHub Release.

There is no auto-deploy to a VPS (Hetzner / Caddy) yet. When that lands,
add a separate `deploy-vps.yml` triggered by `release` completion, and
wire SSH keys via a `HETZNER_SSH_KEY` secret.

## Running CI locally

Every check in CI is a plain CLI command. To reproduce locally:

```bash
# Backend
cd backend
pip install -e ".[dev]"
ruff check .
black --check .
mypy app
alembic upgrade head
pytest tests/

# Frontend
cd frontend
npm ci
npm run lint
npm run type-check
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
```

The CI test job loads `.env.test` semantics inline via job-level `env:`.
For local pytest you can either source `backend/.env.test` or set the
same vars manually. Postgres + Redis are provided by
`docker-compose up postgres redis`.

### Testing workflows with `act`

You can run a workflow file locally with [`act`](https://github.com/nektos/act):

```bash
# Run the backend lint job against the current branch
act pull_request -W .github/workflows/backend-ci.yml -j lint

# Frontend type-check
act pull_request -W .github/workflows/frontend-ci.yml -j typecheck
```

The first run downloads the `act` runner images (multi-GB). Service
containers (`postgres`, `redis`) require Docker-in-Docker — easier to
debug the test job by running `pytest` natively against
`docker-compose up postgres redis` instead.

## Test environment file

`backend/.env.test` documents the safe-default env variables for tests.
It is checked into git and contains no secrets. CI does not source it
directly — the variables are repeated in the `test` job's `env:` block —
but the file serves as the single canonical reference of "what tests
expect to find in the environment".
