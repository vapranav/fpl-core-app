"""SQLAlchemy models.

Design notes:
- Every table is keyed by `season` + a natural id from the dataset, so a season
  can be rebuilt idempotently (delete by season, bulk insert).
- Numeric stat columns are Float throughout: FPL CSVs contain NaNs, and Float
  coerces cleanly to NULL. Text stays String.
- Wide stat tables (player stats, match stats) are built from column-name lists
  to keep this file readable and easy to extend when the dataset adds columns.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
)

from .db import Base


def _float_cols(names: list[str]) -> dict:
    return {n: Column(Float) for n in names}


def _make_model(name: str, tablename: str, attrs: dict):
    return type(name, (Base,), {"__tablename__": tablename, **attrs})


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------


class Team(Base):
    __tablename__ = "teams"

    season = Column(String(9), primary_key=True)
    code = Column(Integer, primary_key=True)  # FPL team code, used in badge URLs
    id = Column(Integer)  # FPL team id
    name = Column(String(100))
    short_name = Column(String(10))
    elo = Column(Float)
    strength = Column(Float)
    strength_overall_home = Column(Float)
    strength_overall_away = Column(Float)
    strength_attack_home = Column(Float)
    strength_attack_away = Column(Float)
    strength_defence_home = Column(Float)
    strength_defence_away = Column(Float)
    pulse_id = Column(Float)
    fotmob_name = Column(String(100))


class Player(Base):
    __tablename__ = "players"

    season = Column(String(9), primary_key=True)
    player_id = Column(Integer, primary_key=True)
    player_code = Column(Integer)  # used for official CDN headshots
    first_name = Column(String(100))
    second_name = Column(String(100))
    web_name = Column(String(100), index=True)
    team_code = Column(Integer, index=True)
    position = Column(String(20), index=True)

    __table_args__ = (
        ForeignKeyConstraint(["season", "team_code"], ["teams.season", "teams.code"]),
    )


class PlayerTeamHistory(Base):
    """Which club a player belonged to in each gameweek (handles transfers)."""

    __tablename__ = "player_team_history"

    season = Column(String(9), primary_key=True)
    player_id = Column(Integer, primary_key=True)
    gw = Column(Integer, primary_key=True)
    team_code = Column(Integer)


# ---------------------------------------------------------------------------
# Player cumulative stats snapshots (data/{season}/playerstats.csv)
# One row per player per gameweek: cumulative totals as of that GW.
# ---------------------------------------------------------------------------

PLAYER_STATS_FLOATS = [
    "now_cost",
    "selected_by_percent",
    "total_points",
    "event_points",
    "points_per_game",
    "bonus",
    "bps",
    "form",
    "value_form",
    "value_season",
    "dreamteam_count",
    "transfers_in",
    "transfers_in_event",
    "transfers_out",
    "transfers_out_event",
    "ep_next",
    "ep_this",
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "expected_goals_conceded",
    "expected_goals_per_90",
    "expected_assists_per_90",
    "expected_goal_involvements_per_90",
    "expected_goals_conceded_per_90",
    "influence",
    "creativity",
    "threat",
    "ict_index",
    "starts",
    "minutes",
    "goals_scored",
    "assists",
    "clean_sheets",
    "goals_conceded",
    "own_goals",
    "penalties_saved",
    "penalties_missed",
    "yellow_cards",
    "red_cards",
    "saves",
    "defensive_contribution",
    "defensive_contribution_per_90",
    "clearances_blocks_interceptions",
    "recoveries",
    "tackles",
]
PLAYER_STATS_STRINGS = ["status", "news"]

PlayerStats = _make_model(
    "PlayerStats",
    "player_stats",
    {
        "season": Column(String(9), primary_key=True),
        "id": Column("id", Integer, primary_key=True),  # player id
        "gw": Column(Integer, primary_key=True),
        **_float_cols(PLAYER_STATS_FLOATS),
        **{n: Column(Text) for n in PLAYER_STATS_STRINGS},
        "__table_args__": (Index("ix_ps_season_id_gw", "season", "id", "gw"),),
    },
)

# ---------------------------------------------------------------------------
# Per-gameweek player stats (By Gameweek/GW{n}/player_gameweek_stats.csv)
# Same column structure as playerstats, but discrete per-GW values.
# ---------------------------------------------------------------------------

PlayerGameweekStats = _make_model(
    "PlayerGameweekStats",
    "player_gameweek_stats",
    {
        "season": Column(String(9), primary_key=True),
        "gw": Column(Integer, primary_key=True),
        "id": Column("id", Integer, primary_key=True),  # player id
        "first_name": Column(String(100)),
        "second_name": Column(String(100)),
        "web_name": Column(String(100)),
        **_float_cols(PLAYER_STATS_FLOATS),
        **{n: Column(Text) for n in PLAYER_STATS_STRINGS},
        "__table_args__": (Index("ix_pgws_season_id", "season", "id"),),
    },
)

# ---------------------------------------------------------------------------
# Per-match player stats (By Gameweek/GW{n}/playermatchstats.csv)
# ---------------------------------------------------------------------------

PLAYER_MATCH_STATS_FLOATS = [
    "minutes_played",
    "goals",
    "assists",
    "total_shots",
    "xg",
    "xa",
    "shots_on_target",
    "successful_dribbles",
    "successful_dribbles_percent",
    "big_chances_missed",
    "touches_opposition_box",
    "touches",
    "accurate_passes",
    "accurate_passes_percent",
    "chances_created",
    "final_third_passes",
    "accurate_crosses",
    "accurate_crosses_percent",
    "accurate_long_balls",
    "accurate_long_balls_percent",
    "tackles",
    "tackles_won",
    "tackles_won_percent",
    "interceptions",
    "recoveries",
    "blocks",
    "clearances",
    "headed_clearances",
    "dribbled_past",
    "duels_won",
    "duels_lost",
    "ground_duels_won",
    "ground_duels_won_percent",
    "aerial_duels_won",
    "aerial_duels_won_percent",
    "was_fouled",
    "fouls_committed",
    "saves",
    "goals_conceded",
    "xgot",
    "xgot_faced",
    "goals_prevented",
    "sweeper_actions",
    "gk_accurate_passes",
    "gk_accurate_long_balls",
    "dispossessed",
    "high_claim",
    "saves_inside_box",
    "offsides",
    "start_min",
    "finish_min",
]

PlayerMatchStats = _make_model(
    "PlayerMatchStats",
    "player_match_stats",
    {
        "season": Column(String(9), primary_key=True),
        # string slug in current seasons (e.g. "25-26-prem-arsenal-vs-chelsea")
        "match_id": Column(String(150), primary_key=True),
        "player_id": Column(Integer, primary_key=True),
        "gw": Column(Integer, index=True),
        **_float_cols(PLAYER_MATCH_STATS_FLOATS),
        "__table_args__": (Index("ix_pms_season_player", "season", "player_id"),),
    },
)

# ---------------------------------------------------------------------------
# Matches (By Gameweek/GW{n}/matches.csv, cumulative -> we keep the latest)
# ---------------------------------------------------------------------------

_MATCH_METRICS = [
    "possession",
    "expected_goals_xg",
    "total_shots",
    "shots_on_target",
    "big_chances",
    "big_chances_missed",
    "accurate_passes",
    "accurate_passes_pct",
    "fouls_committed",
    "corners",
    "xg_open_play",
    "xg_set_play",
    "non_penalty_xg",
    "xg_on_target_xgot",
    "shots_off_target",
    "blocked_shots",
    "hit_woodwork",
    "shots_inside_box",
    "shots_outside_box",
    "passes",
    "own_half",
    "opposition_half",
    "accurate_long_balls",
    "accurate_long_balls_pct",
]

Match = _make_model(
    "Match",
    "matches",
    {
        "season": Column(String(9), primary_key=True),
        "match_id": Column(String(150), primary_key=True),
        "gameweek": Column(Integer, index=True),  # NULL for cup/Europe fixtures
        "kickoff_time": Column(DateTime),
        "home_team": Column(Integer, index=True),
        "away_team": Column(Integer, index=True),
        "home_team_elo": Column(Float),
        "away_team_elo": Column(Float),
        "home_score": Column(Float),
        "away_score": Column(Float),
        "finished": Column(Boolean),
        "match_url": Column(Text),
        **_float_cols([f"{side}_{m}" for m in _MATCH_METRICS for side in ("home", "away")]),
    },
)


class Fixture(Base):
    """Scheduled fixtures (latest snapshot). Same schema family as matches:
    finished=False rows are upcoming, and team ids arrive as floats."""

    __tablename__ = "fixtures"

    season = Column(String(9), primary_key=True)
    match_id = Column(String(150), primary_key=True)
    gameweek = Column(Integer, index=True)
    kickoff_time = Column(DateTime)
    home_team = Column(Float, index=True)
    away_team = Column(Float, index=True)
    home_team_elo = Column(Float)
    away_team_elo = Column(Float)
    finished = Column(Boolean)


# ---------------------------------------------------------------------------
# Gameweek summaries + ingestion bookkeeping
# ---------------------------------------------------------------------------


class Gameweek(Base):
    __tablename__ = "gameweeks"

    season = Column(String(9), primary_key=True)
    id = Column(Integer, primary_key=True)
    name = Column(String(50))
    deadline_time = Column(DateTime)
    average_entry_score = Column(Float)
    highest_score = Column(Float)
    finished = Column(Boolean)
    is_previous = Column(Boolean)
    is_current = Column(Boolean)
    is_next = Column(Boolean)
    transfers_made = Column(Float)
    most_selected = Column(Float)
    most_transferred_in = Column(Float)
    most_captained = Column(Float)
    most_vice_captained = Column(Float)
    top_element = Column(Float)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    commit_sha = Column(String(40))
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    status = Column(String(20))  # running | success | skipped | failed
    rows_loaded = Column(Integer, default=0)
    seasons = Column(String(200))
    error = Column(Text)
