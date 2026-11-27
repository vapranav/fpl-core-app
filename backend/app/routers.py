"""API routers."""
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy import asc, desc, distinct, func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .etl import refresh
from .models import (
    Gameweek, IngestionRun, Match, Player, PlayerGameweekStats,
    PlayerMatchStats, PlayerStats, PlayerTeamHistory, Team,
)
from .schemas import player_photo_url, team_badge_url

api = APIRouter(prefix="/api")


def _require_admin(x_admin_token: str | None = Header(None)):
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(401, "invalid or missing X-Admin-Token")


admin = APIRouter(prefix="/api/admin", dependencies=[Depends(_require_admin)])


def _row(obj) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _latest_season(db: Session) -> str:
    s = db.scalar(select(func.max(Player.season)))
    if s is None:
        raise HTTPException(503, "database is empty - ingestion has not run yet")
    return s


def _season(db: Session, season: str | None) -> str:
    return season or _latest_season(db)


def _latest_gw(db: Session, season: str) -> int:
    """Highest GW present in the cumulative playerstats snapshots."""
    return db.scalar(
        select(func.max(PlayerStats.gw)).where(PlayerStats.season == season)
    ) or 0


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/seasons")
def seasons(db: Session = Depends(get_db)):
    rows = db.scalars(select(distinct(Player.season)).order_by(Player.season)).all()
    return {"seasons": rows}


@api.get("/teams")
def teams(season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(
        select(Team).where(Team.season == season).order_by(Team.name)
    ).all()
    return {
        "season": season,
        "teams": [{**_row(t), "badge_url": team_badge_url(t.code)} for t in rows],
    }


@api.get("/gameweeks")
def gameweeks(season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(
        select(Gameweek).where(Gameweek.season == season).order_by(Gameweek.id)
    ).all()
    return {"season": season, "gameweeks": [_row(g) for g in rows]}


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------

_SORTABLE = {
    "total_points", "event_points", "form", "now_cost", "selected_by_percent",
    "expected_goals", "expected_assists", "goals_scored", "assists",
    "defensive_contribution", "points_per_game", "ict_index", "minutes",
}


@api.get("/players")
def players(
    season: str | None = None,
    team_code: int | None = None,
    position: str | None = Query(None, pattern="^(Goalkeeper|Defender|Midfielder|Forward)$"),
    search: str | None = None,
    sort: str = Query("total_points"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    season = _season(db, season)
    gw = _latest_gw(db, season)
    q = (
        select(Player, PlayerStats, Team.name.label("team_name"))
        .join(PlayerStats, (PlayerStats.season == Player.season)
              & (PlayerStats.id == Player.player_id)
              & (PlayerStats.gw == gw))
        .join(Team, (Team.season == Player.season) & (Team.code == Player.team_code))
        .where(Player.season == season)
    )
    if team_code is not None:
        q = q.where(Player.team_code == team_code)
    if position:
        q = q.where(Player.position == position)
    if search:
        q = q.where(Player.web_name.ilike(f"%{search}%"))

    if sort not in _SORTABLE:
        raise HTTPException(400, f"sort must be one of {sorted(_SORTABLE)}")
    col = getattr(PlayerStats, sort)
    q = q.order_by((asc if order == "asc" else desc)(col).nulls_last())

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.limit(limit).offset(offset)).all()
    return {
        "season": season,
        "total": total,
        "limit": limit,
        "offset": offset,
        "players": [
            {
                **_row(p),
                "photo_url": player_photo_url(p.player_code),
                "team_name": team_name,
                "stats": _row(st),
            }
            for p, st, team_name in rows
        ],
    }


@api.get("/players/{player_id}")
def player_detail(player_id: int, season: str | None = None,
                  db: Session = Depends(get_db)):
    season = _season(db, season)
    p = db.get(Player, (season, player_id))
    if p is None:
        raise HTTPException(404, "player not found")
    stats = db.get(PlayerStats, (season, player_id, _latest_gw(db, season)))
    history = db.scalars(
        select(PlayerTeamHistory)
        .where(PlayerTeamHistory.season == season,
               PlayerTeamHistory.player_id == player_id)
        .order_by(PlayerTeamHistory.gw)
    ).all()
    return {
        **_row(p),
        "photo_url": player_photo_url(p.player_code),
        "season_stats": _row(stats) if stats else None,
        "team_history": [_row(h) for h in history],
    }


@api.get("/players/{player_id}/gameweeks")
def player_gameweeks(player_id: int, season: str | None = None,
                     db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(
        select(PlayerGameweekStats)
        .where(PlayerGameweekStats.season == season,
               PlayerGameweekStats.id == player_id)
        .order_by(PlayerGameweekStats.gw)
    ).all()
    return {"season": season, "player_id": player_id,
            "gameweeks": [_row(r) for r in rows]}


@api.get("/players/{player_id}/matches")
def player_matches(player_id: int, season: str | None = None,
                   gw: int | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    q = (
        select(PlayerMatchStats, Match)
        .join(Match, (Match.season == PlayerMatchStats.season)
              & (Match.match_id == PlayerMatchStats.match_id))
        .where(PlayerMatchStats.season == season,
               PlayerMatchStats.player_id == player_id)
        .order_by(PlayerMatchStats.gw)
    )
    if gw is not None:
        q = q.where(PlayerMatchStats.gw == gw)
    rows = db.execute(q).all()
    return {
        "season": season,
        "player_id": player_id,
        "matches": [
            {**_row(pms), "match": _row(m)} for pms, m in rows
        ],
    }


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------


@api.get("/matches")
def matches(
    season: str | None = None,
    gw: int | None = None,
    team_code: int | None = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    season = _season(db, season)
    q = select(Match).where(Match.season == season)
    if gw is not None:
        q = q.where(Match.gameweek == gw)
    if team_code is not None:
        q = q.where((Match.home_team == team_code) | (Match.away_team == team_code))
    q = q.order_by(Match.kickoff_time)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.limit(limit).offset(offset)).all()
    return {"season": season, "total": total, "matches": [_row(m) for m in rows]}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@admin.post("/refresh", status_code=202)
def force_refresh(background: BackgroundTasks):
    background.add_task(refresh, True)
    return {"status": "scheduled"}


@admin.get("/ingestions")
def ingestions(limit: int = Query(20, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(IngestionRun).order_by(IngestionRun.id.desc()).limit(limit)
    ).all()
    return {"ingestions": [_row(r) for r in rows]}
