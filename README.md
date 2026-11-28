# FPL Core App

Fantasy Premier League analytics built on the
[FPL-Core-Insights](https://github.com/olbauday/FPL-Core-Insights) dataset:
official FPL data + Opta-like per-match stats + ClubElo ratings, all keyed
by FPL IDs.

**Stack**: FastAPI · SQLAlchemy · SQLite · APScheduler · Next.js · Docker

Live: https://fpl-core-app.vercel.app — API: https://fpl-core-api.fly.dev/docs

## Features

- **My Team** — connect your FPL manager by entry ID (no credentials: the
  official entry/picks/leagues endpoints are public; the ID lives in your
  browser's localStorage). Squad with photos, captain/vice chips, bank and
  squad value, plus your classic leagues with rank movement.
- **League standings** — any classic mini-league, paginated, your own row
  highlighted.
- **Players explorer** — every player sortable/filterable by points, form,
  price, ownership, xG/xA, defensive contribution; typeahead search.
- **Player detail** — stat cards, per-GW points chart, per-match stats
  across all competitions.
- **Differentials finder** — low-ownership players in form with soft
  fixtures (Elo-scored).
- **Rotation & fatigue radar** — midweek cup/European minutes and each
  player's historical weekend minutes drop. Unique to this dataset.
- **DefCon scout** — clearances/blocks/interceptions/tackles per 90 and
  threshold watch for the new defensive-points rule.
- **Match timeline explorer** — xG flow, per-minute momentum and shot maps
  for every match.

## Architecture

```
┌──────────────┐  tarball 2x/day   ┌─────────────────────────────┐
│ GitHub repo  │ ───────────────▶  │ FastAPI service (Fly.io)    │
│ (source of   │   APScheduler     │  etl.py → idempotent season │
│  truth)      │ ◀── /api/refresh  │  rebuilds, 08:05/18:05 UTC  │
└──────────────┘                   └────────────┬────────────────┘
                                                ▼
                                     SQLite (Fly volume) ← Next.js (Vercel)
```

- The DB is a **disposable cache** of the repo: refreshes rebuild seasons
  idempotently and skip when the dataset's commit SHA is unchanged.
- Images are not stored: photo/badge URLs derive from `player_code` /
  `team_code` on the official PL CDN.

## Run locally

Backend (SQLite, one season, fast):

```bash
cd backend
pip install -r requirements-dev.txt
DATABASE_URL="sqlite:///./fpl.db" SEASONS="2026-2027" \
  uvicorn app.main:app --reload        # :8000/docs
```

Frontend:

```bash
cd frontend
cp .env.example .env.local            # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install && npm run dev             # :3000
```

Or the full stack: `docker compose up --build`.

## API surface

| Endpoint | Description |
|---|---|
| `GET /api/seasons` | loaded seasons |
| `GET /api/teams?season=` | teams with Elo, badge URLs |
| `GET /api/gameweeks?season=` | GW calendar, deadlines |
| `GET /api/players` | filter/sort/paginate; `team_code` `position` `search` |
| `GET /api/players/{id}` | detail + latest-GW stats + club history |
| `GET /api/players/{id}/gameweeks` | per-GW FPL stats |
| `GET /api/players/{id}/matches` | per-match stats + match context |
| `GET /api/search/players?q=` | typeahead suggestions (slim, points-ordered) |
| `GET /api/differentials` | low-ownership + form + fixture ease score |
| `GET /api/rotation-risk?days=` | midweek matches + historical minutes delta |
| `GET /api/defcon` | CBIT per-90 leaderboard + threshold rate |
| `GET /api/matches` | all comps; `gw` `team_code` `finished` filters |
| `GET /api/matches/{id}/timeline` | shots, momentum, xG-by-minute |
| `POST /api/admin/refresh` | force re-ingestion (`X-Admin-Token` when set) |
| `GET /api/manager/{id}` | FPL manager profile + classic leagues (public FPL API) |
| `GET /api/manager/{id}/team` | manager picks enriched with our player data |
| `GET /api/leagues/{id}/standings?page=` | classic league standings |
| `GET /api/admin/ingestions` | ingestion run log |

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./fpl.db` | SQLAlchemy URL |
| `SEASONS` | all | comma-separated, e.g. `2025-2026,2026-2027` |
| `REFRESH_HOUR` / `REFRESH_MINUTE` | `8,18` / `5` | refresh cron (UTC), after the repo's 07:30/17:30 updates |
| `ETL_ON_STARTUP_IF_EMPTY` | `true` | bootstrap ingestion on first boot |
| `ADMIN_TOKEN` | unset (open) | if set, `/api/admin/*` requires `X-Admin-Token` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | frontend → API base URL |

## Deploy

- **Every merge to `main` is tagged**: `tag.yml` cuts the next patch tag
  (`v0.x.y`) so every commit on main maps to a version.
- **Deploys are release-gated**: publishing a GitHub release (Releases →
  Draft → pick the tag) runs `deploy.yml`, a remote build on Fly from the
  tagged commit. Nothing deploys until you publish a release. Manual escape
  hatch: Actions → Deploy → Run workflow. Never `fly deploy` from a local
  checkout (it may be stale).
- **Frontend (Vercel)**: auto-deploys `frontend/` on every merge; previews
  on every PR. PR frontend previews build against the PR's own preview
  backend when `VERCEL_*` secrets are configured (see CONTRIBUTING).
- **PR previews**: every PR gets an isolated seeded backend on Fly — see
  [CONTRIBUTING.md](CONTRIBUTING.md#preview-environments).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, PR rules, CI checks,
preview environments, the feature checklist, and the dataset landmines to
avoid.
