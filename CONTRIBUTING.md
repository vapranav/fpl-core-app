# Contributing

Thanks for helping build FPL Core! This guide covers everything you need to
ship a change: setup, workflow, checks, previews, and the dataset landmines
we've already stepped on so you don't have to.

## Project layout

```
backend/
  app/
    config.py     # env-driven settings (pydantic-settings)
    db.py         # engine + session factory (SQLite)
    models.py     # SQLAlchemy models; PKs are season + natural id
    etl.py        # tarball -> discover seasons -> idempotent per-season rebuild
    routers.py    # REST API + admin
    scheduler.py  # APScheduler, 08:05/18:05 UTC
    main.py       # lifespan: tables, scheduler, bootstrap ETL thread
  tests/          # pytest; fixture mini-repo in conftest.py, no network
  Dockerfile
  fly.toml          # prod: 1GB VM + fpl_data volume mount
  fly.preview.toml  # PR previews: 512MB, ephemeral SQLite, no volume
frontend/
  app/            # App Router pages: /, /players, /players/[id],
                  # /differentials, /rotation, /defcon, /matches, /matches/[id]
  components/     # navbar, search-bar, player-photo, select, theme-*, timeline/
  lib/api.ts      # typed API client; all server-side fetch
.github/workflows/
  test.yml    # CI: backend-lint, pytest, frontend-lint
  deploy.yml  # release-published -> fly deploy (remote build)
  preview.yml # per-PR preview environments
docker-compose.yml
```

## Dev setup

**Backend** (fast loop: SQLite, one season, no Docker):

```bash
cd backend
python3.12 -m venv ../.venv          # or any >= 3.12; brew install python@3.12
../.venv/bin/pip install -r requirements-dev.txt
DATABASE_URL="sqlite:///./fpl.db" SEASONS="2026-2027" \
  ../.venv/bin/uvicorn app.main:app --reload
# API on :8000, docs on :8000/docs; first boot seeds the DB in the background
```

**Frontend**:

```bash
cd frontend
cp .env.example .env.local          # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                          # http://localhost:3000
```

To work against prod data without a local seed, set
`NEXT_PUBLIC_API_URL=https://fpl-core-api.fly.dev` (read-only usage).

### Behind a TLS-inspecting proxy (Zscaler & co.)

Corporate networks often re-sign TLS with a proxy root CA. Node in the
frontend container then fails `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` when the
image optimizer fetches photos from the PL CDN. Fix (dev only):

```bash
mkdir -p .dev-certs
security find-certificate -c "Zscaler Root CA" -p \
  /Library/Keychains/System.keychain > .dev-certs/zscaler-root.pem
echo "NODE_EXTRA_CA_CERTS=/etc/ssl/extra/zscaler-root.pem" >> .env
docker compose up -d --force-recreate frontend
```

`.dev-certs/` is gitignored; compose mounts it into the container and Node
trusts the proxy root. Never commit proxy certs or set this in production.

## Workflow rules

1. **Everything goes through PRs.** No direct pushes to `main`. Branch naming:
   `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. **CI must be green** (runs on every PR):
   - `backend-lint`: `ruff check app tests` + `ruff format --check app tests`
   - `pytest`: full suite against the fixture repo (no network)
   - `frontend-lint`: `npm run lint` (eslint), `npm run format` (prettier),
     `npm run typecheck` (`next typegen && tsc --noEmit`)
3. **New endpoints need tests.** The convention: add CSVs to the fixture
   mini-repo in `backend/tests/conftest.py` (covers both dataset layouts),
   then assert in `test_api.py` / `test_etl.py`. Give fixture players
   distinct, deterministic values so ordering assertions are stable.
4. **New Python imports go in `requirements.txt`**, not just
   `requirements-dev.txt` — the Docker image installs the former, and a
   dev-only import crashes the deployed app on boot (this actually happened;
   the PR preview environment caught it).
5. **Visual changes need browser verification** before you open the PR —
   serve the production build and check the actual page, desktop and 390px.
6. Branches auto-delete on merge (repo setting).

## Preview environments

Every PR from this repo (forks excluded) gets an **isolated backend**:
`fpl-core-api-pr-N.fly.dev`, created by `preview.yml`, seeded with all 3
seasons, smoke-gated (7 endpoint checks), and **destroyed when the PR closes**.
The bot comments the URL on the PR — use `<url>/docs` to exercise backend
changes. The Vercel preview still points at the prod API; for
frontend+backend combo testing, run the frontend locally with
`NEXT_PUBLIC_API_URL=https://fpl-core-api-pr-N.fly.dev`.

## Deploys

Releases are the deploy gate: publishing a GitHub release runs `deploy.yml`,
which builds on Fly from the merged commit. Never deploy from a local
checkout (it may be stale) — use the release flow or
Actions → Deploy → Run workflow.

## Adding a feature: checklist

1. **Model** (`models.py`): PK = `season` + natural id; numeric stats are
   `Float` (NaN → NULL); add to `_DELETE_ORDER` in `etl.py`.
2. **ETL**: load from the fixture paths; make it idempotent (per-season
   delete + bulk insert, dedupe on PK).
3. **Endpoint** (`routers.py`): typed params with `Query(...)`, slim
   response dicts, season resolution via `_season()`.
4. **Tests**: fixture CSVs + assertions (see rule 3 above).
5. **Frontend**: typed client in `lib/api.ts`, page under `app/`, shared
   components (`Select`, `PlayerPhoto`, theme tokens — no hardcoded colors).
6. **Links**: navbar (`components/navbar.tsx`) and homepage feature cards.
7. PR with verification notes (tests + browser screenshots).

## Dataset notes (learned the hard way)

- `playerstats.csv` is a **cumulative snapshot history** (~1 row/player/GW),
  not a master file. "Current" stats = the latest-GW row.
- Per-GW `matches.csv` files are **GW-scoped**, not cumulative; cup/European
  fixtures are tagged with the FPL GW they were played in.
- Season fixture schedules: `By Gameweek/GW{n}/fixtures.csv` covers **only
  that GW**. The full GW1–38 PL schedule lives under
  `By Tournament/Premier League/GW{n}/`.
- `match_id` is a **string slug** in current seasons (`26-27-prem-…`), an
  integer in legacy ones — model it as String everywhere.
- **Elo is sparse**: `teams.elo` and future-fixture Elo fields are NULL in
  2026-27. Derive current Elo from each team's latest finished match.
- Datetimes are **naive UTC** (no `Z`) — in JS, `new Date(iso + "Z")` or
  you're off by the local offset.
- `shots.csv` often has empty `player_name` — resolve via `player_id`
  (the timeline endpoint does this server-side).
- Current seasons live under `By Gameweek/GW{n}/`; 2024-25 uses legacy
  top-level `matches/`, `playermatchstats/`, `players/` etc. The ETL and the
  conftest fixture repo both cover the two layouts — keep them in sync when
  you touch loading logic.
- Per-GW timeline files (`shots`, `momentum`, `xg_by_minute`) may be absent
  for some GWs/matches — endpoints return empty arrays, pages render an
  empty state.
