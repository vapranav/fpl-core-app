"""API routers."""

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .etl import refresh
from .fpl_client import get_entry, get_league_standings, get_picks
from .models import (
    Fixture,
    Gameweek,
    IngestionRun,
    Match,
    Momentum,
    Player,
    PlayerGameweekStats,
    PlayerMatchStats,
    PlayerStats,
    PlayerTeamHistory,
    Shot,
    Team,
    XgByMinute,
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
# Rotation risk
# ---------------------------------------------------------------------------

_COMPETITIONS = {
    "prem": "PL",
    "champions-league": "UCL",
    "europa-league": "UEL",
    "conference-league": "UECL",
    "fa-cup": "FA Cup",
    "league-cup": "EFL Cup",
    "efl-cup": "EFL Cup",
    "community-shield": "Shield",
    "uefa-super-cup": "Super Cup",
    "pre-season": "Friendly",
}


def _competition_of(match_id: str) -> str:
    slug = match_id.split("-", 2)[-1] if "-" in match_id else match_id
    for key, label in _COMPETITIONS.items():
        if slug.startswith(key):
            return label
    return "Cup"


@api.get("/rotation-risk")
def rotation_risk(
    season: str | None = None,
    days: int = Query(3, ge=1, le=7),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Players whose club played a non-league match within `days` before their
    next PL fixture — with their historical minutes drop in that situation.

    risk = midweek minutes / 90 + max(0, -minutes delta) / 45.
    """
    from datetime import timedelta

    season = _season(db, season)
    gw = _latest_gw(db, season)
    window = timedelta(days=days)

    # next PL fixture per team
    next_by_team: dict[int, Fixture] = {}
    for f in db.scalars(
        select(Fixture)
        .where(
            Fixture.season == season,
            Fixture.finished == False,  # noqa: E712
            Fixture.match_id.like("%prem%"),
        )
        .order_by(Fixture.kickoff_time)
    ).all():
        for code in (f.home_team, f.away_team):
            if code is not None:
                next_by_team.setdefault(int(code), f)

    # finished non-league matches per team (midweek candidates)
    midweek_by_team: dict[int, list[Match]] = {}
    for m in db.scalars(
        select(Match).where(Match.season == season, Match.finished == True)  # noqa: E712
    ).all():
        if "prem" in m.match_id:
            continue
        for code in (m.home_team, m.away_team):
            if code is not None:
                midweek_by_team.setdefault(int(code), []).append(m)

    team_names = dict(db.execute(select(Team.code, Team.name).where(Team.season == season)).all())

    players = db.scalars(
        select(Player)
        .join(
            PlayerStats,
            (PlayerStats.season == Player.season)
            & (PlayerStats.id == Player.player_id)
            & (PlayerStats.gw == gw),
        )
        .where(Player.season == season, func.coalesce(PlayerStats.minutes, 0) >= 270)
    ).all()

    def in_window(earlier, later):
        return (
            earlier is not None and later is not None and timedelta(0) <= later - earlier <= window
        )

    rows = []
    for p in players:
        nxt = next_by_team.get(p.team_code)
        if nxt is None or nxt.kickoff_time is None:
            continue
        mid = [
            m
            for m in midweek_by_team.get(p.team_code, [])
            if in_window(m.kickoff_time, nxt.kickoff_time)
        ]
        if not mid:
            continue
        mid_match = max(mid, key=lambda m: m.kickoff_time)

        pms_mid = db.get(PlayerMatchStats, (season, mid_match.match_id, p.player_id))
        mid_minutes = (pms_mid.minutes_played or 0) if pms_mid else 0

        # historical minutes delta: PL matches preceded by a midweek match
        pl_rows = db.execute(
            select(PlayerMatchStats, Match)
            .join(
                Match,
                (Match.season == PlayerMatchStats.season)
                & (Match.match_id == PlayerMatchStats.match_id),
            )
            .where(
                PlayerMatchStats.season == season,
                PlayerMatchStats.player_id == p.player_id,
                Match.match_id.like("%prem%"),
                Match.finished,
            )
        ).all()
        minutes_all = [r.PlayerMatchStats.minutes_played or 0 for r in pl_rows]
        minutes_after = [
            r.PlayerMatchStats.minutes_played or 0
            for r in pl_rows
            if any(
                in_window(m.kickoff_time, r.Match.kickoff_time)
                for m in midweek_by_team.get(p.team_code, [])
            )
        ]
        baseline = sum(minutes_all) / len(minutes_all) if minutes_all else None
        avg_after = sum(minutes_after) / len(minutes_after) if minutes_after else None
        delta = (
            round(avg_after - baseline, 1)
            if avg_after is not None and baseline is not None
            else None
        )

        risk = round(mid_minutes / 90 + (max(0, -delta) / 45 if delta is not None else 0), 2)
        home = int(nxt.home_team) == p.team_code if nxt.home_team is not None else False
        opp_code = nxt.away_team if home else nxt.home_team
        rows.append(
            {
                "player_id": p.player_id,
                "web_name": p.web_name,
                "team_code": p.team_code,
                "team_name": team_names.get(p.team_code),
                "position": p.position,
                "photo_url": player_photo_url(p.player_code),
                "next_fixture": {
                    "gw": nxt.gameweek,
                    "kickoff_time": nxt.kickoff_time,
                    "home": home,
                    "opp_code": int(opp_code) if opp_code is not None else None,
                    "opp_name": team_names.get(int(opp_code)) if opp_code is not None else None,
                },
                "midweek": {
                    "match_id": mid_match.match_id,
                    "competition": _competition_of(mid_match.match_id),
                    "kickoff_time": mid_match.kickoff_time,
                    "minutes": mid_minutes,
                },
                "history": {
                    "sample": len(minutes_after),
                    "avg_minutes_after": round(avg_after, 1) if avg_after is not None else None,
                    "baseline_minutes": round(baseline, 1) if baseline is not None else None,
                    "delta": delta,
                },
                "risk": risk,
                "risk_label": "High" if risk >= 1.2 else "Medium" if risk >= 0.6 else "Low",
            }
        )

    rows.sort(key=lambda r: r["risk"], reverse=True)
    return {"season": season, "days": days, "total": len(rows), "players": rows[:limit]}


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
# Defensive contributions (CBIT)
# ---------------------------------------------------------------------------


@api.get("/defcon")
def defcon(
    season: str | None = None,
    position: str | None = Query(None, pattern="^(Goalkeeper|Defender|Midfielder|Forward)$"),
    min_minutes: int = Query(270, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Defensive-contribution scout, aggregated over PL matches.

    CBIT = clearances + blocks + interceptions + tackles_won per match (FPL's
    defensive contribution metric; tackles_won counts won tackles only, while
    raw tackles include attempts). threshold_rate = share of played matches
    with CBIT >= 10 (FPL awards the bonus at 10+; the 12+ bar for forwards is
    not modeled). Same 270-minute floor as differentials.
    """
    season = _season(db, season)
    team_names = dict(db.execute(select(Team.code, Team.name).where(Team.season == season)).all())

    per_player: dict[int, dict] = {}
    for pms, m in db.execute(
        select(PlayerMatchStats, Match)
        .join(
            Match,
            (Match.season == PlayerMatchStats.season)
            & (Match.match_id == PlayerMatchStats.match_id),
        )
        .where(
            PlayerMatchStats.season == season,
            PlayerMatchStats.match_id.like("%prem%"),
        )
    ).all():
        a = per_player.setdefault(
            pms.player_id,
            {
                "cbit": 0.0,
                "minutes": 0.0,
                "played": 0,
                "hits": 0,
                "clearances": 0.0,
                "blocks": 0.0,
                "interceptions": 0.0,
                "tackles_won": 0.0,
                "matches": [],
            },
        )
        clearances = pms.clearances or 0
        blocks = pms.blocks or 0
        interceptions = pms.interceptions or 0
        tackles_won = pms.tackles_won or 0
        cbit = clearances + blocks + interceptions + tackles_won
        a["cbit"] += cbit
        a["minutes"] += pms.minutes_played or 0
        a["clearances"] += clearances
        a["blocks"] += blocks
        a["interceptions"] += interceptions
        a["tackles_won"] += tackles_won
        if (pms.minutes_played or 0) > 0:
            a["played"] += 1
            a["hits"] += 1 if cbit >= 10 else 0
            a["matches"].append(m)

    q = select(Player).where(Player.season == season)
    if position:
        q = q.where(Player.position == position)

    def per90(value: float, minutes: float) -> float:
        return round(value / minutes * 90, 2)

    rows = []
    for p in db.scalars(q).all():
        a = per_player.get(p.player_id)
        if a is None or a["played"] == 0 or a["minutes"] < min_minutes:
            continue
        minutes = a["minutes"]
        opp_elos = []
        for m in a["matches"]:
            if m.home_team is not None and int(m.home_team) == p.team_code:
                elo = m.away_team_elo
            elif m.away_team is not None and int(m.away_team) == p.team_code:
                elo = m.home_team_elo
            else:
                elo = None
            if elo is not None:
                opp_elos.append(elo)
        rows.append(
            {
                "player_id": p.player_id,
                "web_name": p.web_name,
                "team_code": p.team_code,
                "team_name": team_names.get(p.team_code),
                "position": p.position,
                "photo_url": player_photo_url(p.player_code),
                "cbit_total": int(a["cbit"]),
                "matches_played": a["played"],
                "minutes_total": int(minutes),
                "cbit_per_90": per90(a["cbit"], minutes),
                "cbit_per_match": round(a["cbit"] / a["played"], 2),
                "threshold_rate": round(a["hits"] / a["played"], 2),
                "clearances_per_90": per90(a["clearances"], minutes),
                "blocks_per_90": per90(a["blocks"], minutes),
                "interceptions_per_90": per90(a["interceptions"], minutes),
                "tackles_won_per_90": per90(a["tackles_won"], minutes),
                "avg_opp_elo": round(sum(opp_elos) / len(opp_elos), 1) if opp_elos else None,
            }
        )

    rows.sort(key=lambda r: r["cbit_per_90"], reverse=True)
    return {"season": season, "total": len(rows), "players": rows[:limit]}


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------


@api.get("/matches")
def matches(
    season: str | None = None,
    gw: int | None = None,
    team_code: int | None = None,
    finished: bool | None = None,
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
    if finished is not None:
        q = q.where(Match.finished == finished)
    q = q.order_by(Match.kickoff_time)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.limit(limit).offset(offset)).all()
    return {"season": season, "total": total, "matches": [_row(m) for m in rows]}


@api.get("/matches/{match_id}/timeline")
def match_timeline(match_id: str, season: str | None = None, db: Session = Depends(get_db)):
    """One match plus its timeline data (shots, momentum, xG by minute).

    Timeline files exist only for some GWs/matches -> empty arrays when absent.
    """
    season = _season(db, season)
    m = db.get(Match, (season, match_id))
    if m is None:
        raise HTTPException(404, "match not found")
    team_names = dict(db.execute(select(Team.code, Team.name).where(Team.season == season)).all())
    shots = db.scalars(
        select(Shot)
        .where(Shot.season == season, Shot.match_id == match_id)
        .order_by(Shot.minute, Shot.shot_index)
    ).all()
    # shots.csv often ships empty player_name; resolve from the players table
    player_ids = {int(s.player_id) for s in shots if s.player_id is not None}
    player_names = (
        dict(
            db.execute(
                select(Player.player_id, Player.web_name).where(
                    Player.season == season, Player.player_id.in_(player_ids)
                )
            ).all()
        )
        if player_ids
        else {}
    )
    momentum = db.scalars(
        select(Momentum)
        .where(Momentum.season == season, Momentum.match_id == match_id)
        .order_by(Momentum.minute)
    ).all()
    xg = db.scalars(
        select(XgByMinute)
        .where(XgByMinute.season == season, XgByMinute.match_id == match_id)
        .order_by(XgByMinute.minute)
    ).all()
    return {
        "season": season,
        "match": {
            **_row(m),
            "home_team_name": team_names.get(m.home_team),
            "away_team_name": team_names.get(m.away_team),
        },
        "shots": [
            {
                **_row(s),
                "player_name": s.player_name
                or (player_names.get(int(s.player_id)) if s.player_id is not None else None),
            }
            for s in shots
        ],
        "momentum": [_row(r) for r in momentum],
        "xg_by_minute": [_row(r) for r in xg],
    }


# ---------------------------------------------------------------------------
# FPL managers (official public FPL API, proxied + enriched)
# ---------------------------------------------------------------------------


@api.get("/manager/{entry_id}")
def manager_profile(entry_id: int, db: Session = Depends(get_db)):
    """Manager profile + classic leagues, from the official public FPL API."""
    entry = get_entry(entry_id)
    if entry is None or "id" not in entry:
        raise HTTPException(404, "manager not found")
    leagues = entry.get("leagues", {}).get("classic", [])
    return {
        "entry_id": entry["id"],
        "manager_name": entry.get("player_name"),
        "team_name": entry.get("name"),
        "overall_points": entry.get("summary_overall_points"),
        "overall_rank": entry.get("summary_overall_rank"),
        "current_event": entry.get("current_event"),
        "started_event": entry.get("started_event"),
        "leagues": [
            {
                "id": lg["id"],
                "name": lg["name"],
                "entry_rank": lg.get("entry_rank"),
                "entry_last_rank": lg.get("entry_last_rank"),
            }
            for lg in leagues
        ],
    }


@api.get("/manager/{entry_id}/team")
def manager_team(entry_id: int, gw: int | None = None, db: Session = Depends(get_db)):
    """A manager's picks for a GW, enriched with our player data."""
    entry = get_entry(entry_id)
    if entry is None or "id" not in entry:
        raise HTTPException(404, "manager not found")
    gw = gw or entry.get("current_event")
    if gw is None:
        raise HTTPException(400, "no gameweek given and manager has none active")
    picks_data = get_picks(entry_id, gw)
    if picks_data is None:
        raise HTTPException(404, f"no picks found for GW{gw}")

    season = _latest_season(db)
    stats_gw = _latest_gw(db, season)
    element_ids = [p["element"] for p in picks_data.get("picks", [])]
    rows = db.execute(
        select(Player, PlayerStats, Team.name.label("team_name"))
        .join(
            PlayerStats,
            (PlayerStats.season == Player.season)
            & (PlayerStats.id == Player.player_id)
            & (PlayerStats.gw == stats_gw),
        )
        .join(Team, (Team.season == Player.season) & (Team.code == Player.team_code))
        .where(Player.season == season, Player.player_id.in_(element_ids))
    ).all()
    by_id = {p.player_id: (p, st, tn) for p, st, tn in rows}

    picks = []
    for pick in picks_data.get("picks", []):
        p, st, team_name = by_id.get(pick["element"], (None, None, None))
        picks.append(
            {
                "element": pick["element"],
                "squad_position": pick["position"],  # 1-11 starters, 12-15 bench
                "is_captain": pick["is_captain"],
                "is_vice_captain": pick["is_vice_captain"],
                "multiplier": pick["multiplier"],
                "web_name": p.web_name if p else f"#{pick['element']}",
                "team_code": p.team_code if p else None,
                "team_name": team_name,
                "position": p.position if p else None,
                "photo_url": player_photo_url(p.player_code) if p else None,
                "now_cost": st.now_cost if st else None,
                "total_points": st.total_points if st else None,
                "form": st.form if st else None,
            }
        )
    picks.sort(key=lambda p: p["squad_position"])

    picks_entry = picks_data.get("entry_history", {})
    return {
        "entry_id": entry_id,
        "team_name": entry.get("name"),
        "manager_name": entry.get("player_name"),
        "gw": gw,
        "gw_points": picks_entry.get("points"),
        "event_transfers": picks_entry.get("event_transfers"),
        "event_transfers_cost": picks_entry.get("event_transfers_cost"),
        "bank": (picks_entry.get("bank") or 0) / 10,
        "squad_value": (picks_entry.get("value") or 0) / 10,
        "overall_rank": picks_entry.get("overall_rank"),
        "picks": picks,
    }


@api.get("/leagues/{league_id}/standings")
def league_standings(league_id: int, page: int = Query(1, ge=1)):
    """Classic league standings, proxied from the official public FPL API."""
    data = get_league_standings(league_id, page)
    if data is None or "standings" not in data:
        raise HTTPException(404, "league not found")
    st = data["standings"]
    return {
        "league_id": league_id,
        "league_name": data.get("league", {}).get("name"),
        "page": page,
        "has_next": st.get("has_next", False),
        "standings": [
            {
                "rank": r["rank"],
                "last_rank": r["last_rank"],
                "entry": r["entry"],
                "entry_name": r["entry_name"],
                "player_name": r["player_name"],
                "event_total": r["event_total"],
                "total": r["total"],
            }
            for r in st.get("results", [])
        ],
    }


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
