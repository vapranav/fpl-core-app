"""ETL: pull the FPL-Core-Insights dataset into the database.

Flow:
1. Ask GitHub for the repo's latest commit SHA; skip if already loaded.
2. Stream-download the tarball, extract to a temp dir.
3. Discover seasons (data/YYYY-YYYY dirs), honouring the SEASONS filter.
4. Per season: load each known CSV into its table. The season's rows are
   deleted first, so every run is an idempotent rebuild - the repo is the
   source of truth and the DB is a disposable cache.

Dataset layout handled:
- Current:  data/{season}/By Gameweek/GW{n}/{matches,playermatchstats,
            player_gameweek_stats}.csv  (+ season-level master CSVs)
- Legacy:   data/{season}/matches/matches.csv (season-level),
            data/{season}/playermatchstats/GW{n}/playermatchstats.csv

Per-GW files (matches, playermatchstats, player_gameweek_stats) are GW-scoped,
so all GW dirs are loaded; legacy seasons keep a season-level matches master.
"""
from __future__ import annotations

import io
import logging
import re
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal, engine, Base
from . import models

log = logging.getLogger("fpl.etl")

SEASON_RE = re.compile(r"^\d{4}-\d{4}$")
GW_RE = re.compile(r"GW(\d+)$")

SEASON_LEVEL_FILES = {
    "teams.csv": models.Team,
    "players.csv": models.Player,
    "playerstats.csv": models.PlayerStats,
    "gameweek_summaries.csv": models.Gameweek,
    "team_history.csv": models.PlayerTeamHistory,
}

# model -> datetime columns that need coercion
DATETIME_COLS = {
    models.Match.__tablename__: ["kickoff_time"],
    models.Fixture.__tablename__: ["kickoff_time"],
    models.Gameweek.__tablename__: ["deadline_time"],
}
BOOL_COLS = {
    models.Match.__tablename__: ["finished"],
    models.Fixture.__tablename__: ["finished"],
    models.Gameweek.__tablename__: ["finished", "is_previous", "is_current", "is_next"],
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _latest_commit_sha() -> str:
    r = requests.get(settings.commit_api_url, timeout=30)
    r.raise_for_status()
    return r.json()["sha"]


def _download_tarball(dest: Path) -> None:
    log.info("Downloading %s", settings.tarball_url)
    with requests.get(settings.tarball_url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)


def _extract(tarball: Path, dest: Path) -> Path:
    with tarfile.open(tarball, "r:gz") as tar:
        try:
            tar.extractall(dest, filter="data")  # py3.12+ safe extraction
        except TypeError:
            tar.extractall(dest)  # older Python; source tarball is trusted
    roots = [p for p in dest.iterdir() if p.is_dir()]
    assert len(roots) == 1, f"unexpected tarball layout: {roots}"
    return roots[0]


def _read_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    return df


def _coerce(df: pd.DataFrame, model) -> pd.DataFrame:
    """Align a CSV frame with the model: keep known columns, fix dtypes, NaN->None."""
    table = model.__tablename__
    # `season` is always assigned by the loader; `gw` is kept when the CSV
    # carries it (e.g. playerstats.csv) and assigned from the folder otherwise.
    wanted = {c.name for c in model.__table__.columns} - {"season"}
    extra = [c for c in df.columns if c not in wanted]
    if extra:
        log.debug("%s: ignoring %d unmodelled columns: %s", table, len(extra), extra[:5])
    df = df[[c for c in df.columns if c in wanted]].copy()
    for col in DATETIME_COLS.get(table, []):
        if col in df:
            df[col] = pd.to_datetime(df[col], utc=True, errors="coerce").dt.tz_localize(None)
    for col in BOOL_COLS.get(table, []):
        if col in df:
            df[col] = df[col].map(
                {True: True, False: False, "True": True, "False": False, 1: True, 0: False}
            )
    # astype(object) first: float64 columns would cast the None back to NaN
    return df.astype(object).where(pd.notnull(df), None)


def _replace_season(db: Session, model, season: str, df: pd.DataFrame,
                    extra_cols: dict | None = None) -> int:
    """Bulk-insert df for a season (season rows must be deleted already)."""
    if df.empty:
        return 0
    df = df.copy()
    df["season"] = season
    for k, v in (extra_cols or {}).items():
        df[k] = v
    pk = [c.name for c in model.__table__.primary_key.columns]
    df = df.drop_duplicates(subset=pk, keep="last")
    records = df.to_dict(orient="records")
    db.bulk_insert_mappings(model, records)
    return len(records)


# children before parents so FK constraints survive the rebuild
_DELETE_ORDER = [
    models.PlayerStats, models.PlayerGameweekStats, models.PlayerMatchStats,
    models.PlayerTeamHistory, models.Player, models.Team, models.Match,
    models.Fixture, models.Gameweek,
]


def _clear_season(db: Session, season: str) -> None:
    for model in _DELETE_ORDER:
        db.execute(delete(model).where(model.season == season))


def _gw_of(path: Path) -> int | None:
    """GW number from a GW{n} dir or a file directly inside one."""
    for candidate in (path.name, path.parent.name):
        m = GW_RE.search(candidate)
        if m:
            return int(m.group(1))
    return None


def _load_season(db: Session, root: Path, season: str) -> int:
    sdir = root / "data" / season
    if not sdir.is_dir():
        log.warning("season dir missing: %s", sdir)
        return 0
    _clear_season(db, season)
    rows = 0

    # season-level master files; legacy seasons keep them in per-name subdirs
    # (data/{season}/players/players.csv instead of data/{season}/players.csv)
    for fname, model in SEASON_LEVEL_FILES.items():
        path = sdir / fname
        if not path.exists():
            legacy = sdir / fname.removesuffix(".csv") / fname
            if legacy.exists():
                path = legacy
        if not path.exists():
            continue
        df = _coerce(_read_csv(path), model)
        rows += _replace_season(db, model, season, df)

    # gameweek-scoped files, current and legacy layouts
    gw_dirs: list[Path] = []
    by_gw = sdir / "By Gameweek"
    if by_gw.is_dir():
        gw_dirs = [d for d in by_gw.iterdir() if GW_RE.match(d.name)]
    legacy_pms = sdir / "playermatchstats"
    if legacy_pms.is_dir():
        for d in legacy_pms.iterdir():
            if GW_RE.match(d.name):
                gw_dirs.append(d)

    # matches: legacy seasons have a season-level master; current seasons keep
    # one GW-scoped file per GW dir -> concatenate them all.
    legacy_matches = sdir / "matches" / "matches.csv"
    if legacy_matches.exists():
        df = _coerce(_read_csv(legacy_matches), models.Match)
        rows += _replace_season(db, models.Match, season, df)
    else:
        match_files = [d / "matches.csv" for d in gw_dirs if (d / "matches.csv").exists()]
        if match_files:
            df = pd.concat([_read_csv(p) for p in match_files], ignore_index=True)
            df = _coerce(df, models.Match)
            rows += _replace_season(db, models.Match, season, df)

    # fixtures: "By Tournament/Premier League" holds the full GW1-38 schedule;
    # fall back to the latest "By Gameweek" snapshot (covers only that GW)
    fixture_files: list[Path] = []
    pl_dir = sdir / "By Tournament" / "Premier League"
    if pl_dir.is_dir():
        fixture_files = [
            d / "fixtures.csv"
            for d in pl_dir.iterdir()
            if GW_RE.match(d.name) and (d / "fixtures.csv").exists()
        ]
    if not fixture_files:
        fixture_files = [d / "fixtures.csv" for d in gw_dirs if (d / "fixtures.csv").exists()]
        if fixture_files:
            fixture_files = [max(fixture_files, key=lambda p: _gw_of(p) or 0)]
    if fixture_files:
        df = pd.concat([_read_csv(p) for p in fixture_files], ignore_index=True)
        df = _coerce(df, models.Fixture)
        rows += _replace_season(db, models.Fixture, season, df)

    # per-GW player stats: GW-scoped -> load every GW folder
    for d in gw_dirs:
        gw = _gw_of(d)
        for fname, model in (
            ("playermatchstats.csv", models.PlayerMatchStats),
            ("player_gameweek_stats.csv", models.PlayerGameweekStats),
        ):
            path = d / fname
            if path.exists():
                df = _coerce(_read_csv(path), model)
                df = df.assign(season=season, gw=gw)
                pk = [c.name for c in model.__table__.primary_key.columns]
                df = df.drop_duplicates(subset=pk, keep="last")
                records = df.to_dict(orient="records")
                db.bulk_insert_mappings(model, records)
                rows += len(records)

    log.info("season %s: %d rows", season, rows)
    return rows


def refresh(force: bool = False) -> dict:
    """Run one ingestion cycle. Returns a summary dict."""
    Base.metadata.create_all(engine)
    db: Session = SessionLocal()
    run = models.IngestionRun(started_at=_now(), status="running")
    db.add(run)
    db.commit()
    try:
        sha = _latest_commit_sha()
        run.commit_sha = sha
        if not force:
            last = (
                db.query(models.IngestionRun)
                .filter(models.IngestionRun.status == "success",
                        models.IngestionRun.commit_sha == sha)
                .first()
            )
            if last:
                run.status = "skipped"
                run.finished_at = _now()
                db.commit()
                log.info("commit %s already loaded, skipping", sha[:8])
                return {"status": "skipped", "commit": sha}

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            tarball = tmp / "repo.tar.gz"
            _download_tarball(tarball)
            root = _extract(tarball, tmp)

            all_seasons = sorted(
                d.name for d in (root / "data").iterdir() if SEASON_RE.match(d.name)
            )
            seasons = settings.season_list or all_seasons
            log.info("seasons to load: %s", seasons)

            total = 0
            for season in seasons:
                total += _load_season(db, root, season)
                db.commit()

        run.status = "success"
        run.rows_loaded = total
        run.seasons = ",".join(seasons)
        run.finished_at = _now()
        db.commit()
        log.info("refresh done: %d rows @ %s", total, sha[:8])
        return {"status": "success", "commit": sha, "rows": total, "seasons": seasons}
    except Exception as exc:  # noqa: BLE001 - record and re-raise
        db.rollback()
        run.status = "failed"
        run.error = str(exc)
        run.finished_at = _now()
        db.commit()
        log.exception("refresh failed")
        raise
    finally:
        db.close()


def db_is_empty() -> bool:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        return db.query(models.Player).first() is None
