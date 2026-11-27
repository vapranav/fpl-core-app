"""API routers."""

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .etl import refresh
from .models import (
    Fixture,
    Gameweek,
    IngestionRun,
    Match,
    Player,
    PlayerGameweekStats,
    PlayerMatchStats,
    PlayerStats,
    PlayerTeamHistory,
    Team,
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
    return db.scalar(select(func.max(PlayerStats.gw)).where(PlayerStats.season == season)) or 0


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/seasons")
def seasons(db: Session = Depends(get_db)):
    rows = db.scalars(select(Player.season).distinct().order_by(Player.season)).all()
    return {"seasons": rows}


@api.get("/teams")
def teams(season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(select(Team).where(Team.season == season).order_by(Team.name)).all()
    return {
        "season": season,
        "teams": [{**_row(t), "badge_url": team_badge_url(t.code)} for t in rows],
    }


@api.get("/gameweeks")
def gameweeks(season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(select(Gameweek).where(Gameweek.season == season).order_by(Gameweek.id)).all()
    return {"season": season, "gameweeks": [_row(g) for g in rows]}


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------

_SORTABLE = {
    "total_points",
    "event_points",
    "form",
    "now_cost",
    "selected_by_percent",
    "expected_goals",
    "expected_assists",
    "goals_scored",
    "assists",
    "defensive_contribution",
    "points_per_game",
    "ict_index",
    "minutes",
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
        .join(
            PlayerStats,
            (PlayerStats.season == Player.season)
            & (PlayerStats.id == Player.player_id)
            & (PlayerStats.gw == gw),
        )
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
def player_detail(player_id: int, season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    p = db.get(Player, (season, player_id))
    if p is None:
        raise HTTPException(404, "player not found")
    stats = db.get(PlayerStats, (season, player_id, _latest_gw(db, season)))
    history = db.scalars(
        select(PlayerTeamHistory)
        .where(PlayerTeamHistory.season == season, PlayerTeamHistory.player_id == player_id)
        .order_by(PlayerTeamHistory.gw)
    ).all()
    return {
        **_row(p),
        "photo_url": player_photo_url(p.player_code),
        "season_stats": _row(stats) if stats else None,
        "team_history": [_row(h) for h in history],
    }


@api.get("/players/{player_id}/gameweeks")
def player_gameweeks(player_id: int, season: str | None = None, db: Session = Depends(get_db)):
    season = _season(db, season)
    rows = db.scalars(
        select(PlayerGameweekStats)
        .where(PlayerGameweekStats.season == season, PlayerGameweekStats.id == player_id)
        .order_by(PlayerGameweekStats.gw)
    ).all()
    return {"season": season, "player_id": player_id, "gameweeks": [_row(r) for r in rows]}


@api.get("/players/{player_id}/matches")
def player_matches(
    player_id: int, season: str | None = None, gw: int | None = None, db: Session = Depends(get_db)
):
    season = _season(db, season)
    q = (
        select(PlayerMatchStats, Match)
        .join(
            Match,
            (Match.season == PlayerMatchStats.season)
            & (Match.match_id == PlayerMatchStats.match_id),
        )
        .where(PlayerMatchStats.season == season, PlayerMatchStats.player_id == player_id)
        .order_by(PlayerMatchStats.gw)
    )
    if gw is not None:
        q = q.where(PlayerMatchStats.gw == gw)
    rows = db.execute(q).all()
    return {
        "season": season,
        "player_id": player_id,
        "matches": [{**_row(pms), "match": _row(m)} for pms, m in rows],
    }


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


@api.get("/search/players")
def search_players(
    q: str = Query(""),
    season: str | None = None,
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Lightweight typeahead suggestions. Slim rows only; <2 chars -> empty."""
    q = q.strip()
    if len(q) < 2:
        return {"results": []}
    season = _season(db, season)
    gw = _latest_gw(db, season)
    pattern = f"%{q}%"
    rows = db.execute(
        select(Player, PlayerStats.total_points, Team.name.label("team_name"))
        .join(
            PlayerStats,
            (PlayerStats.season == Player.season)
            & (PlayerStats.id == Player.player_id)
            & (PlayerStats.gw == gw),
        )
        .join(Team, (Team.season == Player.season) & (Team.code == Player.team_code))
        .where(
            Player.season == season,
            Player.web_name.ilike(pattern)
            | Player.first_name.ilike(pattern)
            | Player.second_name.ilike(pattern),
        )
        .order_by(desc(PlayerStats.total_points).nulls_last())
        .limit(limit)
    ).all()
    return {
        "results": [
            {
                "player_id": p.player_id,
                "web_name": p.web_name,
                "team_code": p.team_code,
                "team_name": team_name,
                "position": p.position,
                "photo_url": player_photo_url(p.player_code),
                "total_points": pts,
            }
            for p, pts, team_name in rows
        ]
    }


# ---------------------------------------------------------------------------
# Differentials
# ---------------------------------------------------------------------------


@api.get("/differentials")
def differentials(
    season: str | None = None,
    max_ownership: float = Query(10.0, ge=0, le=100),
    position: str | None = Query(None, pattern="^(Goalkeeper|Defender|Midfielder|Forward)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Low-ownership players in form with soft upcoming PL fixtures.

    Score = form + 2 * (xG+xA per 90) + points_per_game + fixture ease,
    where ease = (league mean Elo - mean Elo of next 3 opponents) / 100.
    Players need >= 270 minutes played (per-90 stats are noise below that).
    """
    season = _season(db, season)
    gw = _latest_gw(db, season)

    # teams.elo and future-fixture elos are often NULL: derive current Elo
    # per team from their most recent finished match instead
    elo_by_team: dict[int, float] = {}
    recent = db.scalars(
        select(Match)
        .where(Match.season == season, Match.finished == True)  # noqa: E712
        .order_by(Match.kickoff_time.desc())
    ).all()
    for m in recent:
        if m.home_team is not None and m.home_team_elo is not None:
            elo_by_team.setdefault(int(m.home_team), m.home_team_elo)
        if m.away_team is not None and m.away_team_elo is not None:
            elo_by_team.setdefault(int(m.away_team), m.away_team_elo)
    avg_elo = sum(elo_by_team.values()) / len(elo_by_team) if elo_by_team else 1800.0

    fixtures = db.scalars(
        select(Fixture)
        .where(
            Fixture.season == season,
            Fixture.finished == False,  # noqa: E712
            Fixture.match_id.like("%prem%"),
        )
        .order_by(Fixture.kickoff_time)
    ).all()
    team_names = dict(db.execute(select(Team.code, Team.name).where(Team.season == season)).all())
    by_team: dict[int, list[Fixture]] = {}
    for f in fixtures:
        for code in (f.home_team, f.away_team):
            if code is not None:
                by_team.setdefault(int(code), []).append(f)

    q = (
        select(Player, PlayerStats)
        .join(
            PlayerStats,
            (PlayerStats.season == Player.season)
            & (PlayerStats.id == Player.player_id)
            & (PlayerStats.gw == gw),
        )
        .where(
            Player.season == season,
            PlayerStats.selected_by_percent <= max_ownership,
            # ~3 full matches: below this, per-90 stats are noise
            func.coalesce(PlayerStats.minutes, 0) >= 270,
        )
    )
    if position:
        q = q.where(Player.position == position)

    rows = []
    for p, st in db.execute(q).all():
        nxt = []
        for f in by_team.get(p.team_code, [])[:3]:
            home = int(f.home_team) == p.team_code if f.home_team is not None else False
            opp_code = f.away_team if home else f.home_team
            # prefer the fixture's own Elo; fall back to the latest-match value
            opp_elo = (f.away_team_elo if home else f.home_team_elo) or (
                elo_by_team.get(int(opp_code)) if opp_code is not None else None
            )
            nxt.append(
                {
                    "gw": f.gameweek,
                    "home": home,
                    "opp_code": int(opp_code) if opp_code is not None else None,
                    "opp_name": team_names.get(int(opp_code)) if opp_code is not None else None,
                    "opp_elo": opp_elo,
                }
            )
        opp_elos = [n["opp_elo"] for n in nxt if n["opp_elo"] is not None]
        ease = (avg_elo - sum(opp_elos) / len(opp_elos)) / 100 if opp_elos else 0.0
        minutes = st.minutes or 0
        xgi90 = (
            ((st.expected_goals or 0) + (st.expected_assists or 0)) / minutes * 90
            if minutes
            else 0.0
        )
        score = (st.form or 0) + 2 * xgi90 + (st.points_per_game or 0) + ease
        rows.append(
            {
                "player_id": p.player_id,
                "web_name": p.web_name,
                "team_code": p.team_code,
                "team_name": team_names.get(p.team_code),
                "position": p.position,
                "photo_url": player_photo_url(p.player_code),
                "ownership": st.selected_by_percent,
                "form": st.form,
                "points_per_game": st.points_per_game,
                "xgi_per_90": round(xgi90, 2),
                "fixture_ease": round(ease, 2),
                "score": round(score, 2),
                "next_fixtures": nxt,
            }
        )

    rows.sort(key=lambda r: r["score"], reverse=True)
    return {
        "season": season,
        "max_ownership": max_ownership,
        "league_avg_elo": round(avg_elo, 1),
        "total": len(rows),
        "differentials": rows[:limit],
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
    rows = db.scalars(select(IngestionRun).order_by(IngestionRun.id.desc()).limit(limit)).all()
    return {"ingestions": [_row(r) for r in rows]}
