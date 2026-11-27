# FPL Core App

Web app built on the [FPL-Core-Insights](https://github.com/olbauday/FPL-Core-Insights) dataset:
official FPL data + Opta-like per-match stats + ClubElo ratings, all keyed by FPL IDs.

**Stack**: FastAPI · SQLAlchemy · SQLite · APScheduler · Docker

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
                                        SQLite (local file or volume)
```

- The DB is a **disposable cache** of the repo: every refresh deletes and
  rebuilds each season's rows. Skips the download entirely when the repo's
  commit SHA is unchanged (use `POST /api/admin/refresh` to force).
- First boot with an empty DB triggers an initial ingestion in the background.
- Headshots/badges are **not stored** — URLs are built from `player_code` /
  `team_code` against the official PL CDN.

## Run

```bash
docker compose up --build        # API on :8000, SQLite on a named volume
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

## Deploy to Fly.io

```bash
fly apps create fpl-core-api
fly volumes create fpl_data --size 1 --region iad -a fpl-core-api
fly secrets set DATABASE_URL="sqlite:////data/fpl.db" ADMIN_TOKEN=<random> \
  -a fpl-core-api
cd backend && fly deploy -a fpl-core-api
fly scale count 1 --yes -a fpl-core-api           # 1 machine is enough
```

Live: https://fpl-core-api.fly.dev · Docs: https://fpl-core-api.fly.dev/docs

Cost-minimal setup (~1 machine + 1GB volume ≈ single-digit $/mo):
- **SQLite on a Fly volume**. The DB is a disposable cache of the GitHub
  dataset — losing it costs one ~30s re-ingestion. Fly volumes include free
  scheduled snapshots (5 retained).
- `fly.toml` keeps `auto_stop_machines = "off"` + `min_machines_running = 1` —
  the APScheduler runs in-process and must never be stopped.
- The app VM needs 1GB: the pandas ETL peaks well above the 256MB default.
- Set a spend limit in the Fly dashboard (org → Billing) as a safety net.

## Data notes (learned the hard way)

- `playerstats.csv` is a **cumulative snapshot history** (~1 row/player/GW),
  not a master file. The API joins on the latest GW for "current" stats.
- Per-GW `matches.csv` files are **GW-scoped**, not cumulative; cup/European
  fixtures are tagged with the FPL GW they were played in.
- `match_id` is a **string slug** in current seasons (`25-26-prem-…`), an
  integer in legacy ones.
- Current seasons live under `By Gameweek/GW{n}/`; 2024-25 uses legacy
  top-level `matches/` and `playermatchstats/` dirs. The ETL handles both.
