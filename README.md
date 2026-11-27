# FPL Core App

Web app built on the [FPL-Core-Insights](https://github.com/olbauday/FPL-Core-Insights) dataset:
official FPL data + Opta-like per-match stats + ClubElo ratings, all keyed by FPL IDs.

**Stack**: FastAPI · SQLAlchemy · PostgreSQL · APScheduler · Docker

## Architecture

```
┌──────────────┐  tarball 2x/day   ┌─────────────────────────────┐
│ GitHub repo  │ ───────────────▶  │ FastAPI service             │
│ (source of   │   APScheduler     │  ├─ etl.py    idempotent    │
│  truth)      │ ◀── /api/refresh  │  │            season rebuild │
└──────────────┘                   │  ├─ routers.py REST API     │
                                   │  └─ scheduler.py 08:05/18:05│
                                   └────────────┬────────────────┘
                                                ▼
                                        PostgreSQL (or SQLite dev)
```

- The DB is a **disposable cache** of the repo: every refresh deletes and
  rebuilds each season's rows. Skips the download entirely when the repo's
  commit SHA is unchanged (use `POST /api/admin/refresh` to force).
- First boot with an empty DB triggers an initial ingestion in the background.
- Headshots/badges are **not stored** — URLs are built from `player_code` /
  `team_code` against the official PL CDN.

## Run

```bash
docker compose up --build        # API on :8000, Postgres 16
```

Local dev (SQLite, one season, fast):

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL="sqlite:///./fpl.db" SEASONS="2025-2026" \
  uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

## API surface

| Endpoint | Description |
|---|---|
| `GET /api/seasons` | loaded seasons |
| `GET /api/teams?season=` | teams with Elo, strength, badge URL |
| `GET /api/gameweeks?season=` | GW calendar, deadlines, chip data |
| `GET /api/players` | filter `team_code` `position` `search`; sort by `total_points`, `form`, `expected_goals`, `defensive_contribution`, …; paginated |
| `GET /api/players/{id}` | detail + latest-GW stats + per-GW club history |
| `GET /api/players/{id}/gameweeks` | per-GW FPL stats (discrete, per README semantics) |
| `GET /api/players/{id}/matches` | per-match Opta-like stats joined with match context (xG, Elo, score) |
| `GET /api/matches?season=&gw=&team_code=` | all competitions: league, cups, Europe, friendlies |
| `POST /api/admin/refresh` | force re-ingestion (background, 202) |
| `GET /api/admin/ingestions` | ingestion run log |

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./fpl.db` | SQLAlchemy URL |
| `SEASONS` | all | comma-separated, e.g. `2025-2026,2026-2027` |
| `REFRESH_HOUR` / `REFRESH_MINUTE` | `8,18` / `5` | cron schedule (UTC), just after the repo's 07:30/17:30 updates |
| `ETL_ON_STARTUP_IF_EMPTY` | `true` | bootstrap ingestion on first boot |
| `ADMIN_TOKEN` | unset (open) | if set, `/api/admin/*` requires `X-Admin-Token` header |

## Deploy to Railway

1. Push this repo to GitHub.
2. Railway dashboard → **New Project → Deploy from GitHub repo** → select it, set **root directory to `backend`** (Dockerfile + `railway.toml` are detected automatically).
3. **Add → Database → PostgreSQL** in the same project.
4. API service → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference variable; the app normalizes the scheme itself)
   - `ADMIN_TOKEN` = a random secret
   - `SEASONS` = leave empty for all, or e.g. `2025-2026,2026-2027`
5. **Settings → Networking → Generate Domain**. First boot ingests all seasons (~30s); `/api/health` responds immediately while it loads.

CLI alternative: `brew install railway`, `railway login`, then `cd backend && railway init && railway up`.

## Data notes (learned the hard way)

- `playerstats.csv` is a **cumulative snapshot history** (~1 row/player/GW),
  not a master file. The API joins on the latest GW for "current" stats.
- Per-GW `matches.csv` files are **GW-scoped**, not cumulative; cup/European
  fixtures are tagged with the FPL GW they were played in.
- `match_id` is a **string slug** in current seasons (`25-26-prem-…`), an
  integer in legacy ones.
- Current seasons live under `By Gameweek/GW{n}/`; 2024-25 uses legacy
  top-level `matches/` and `playermatchstats/` dirs. The ETL handles both.
