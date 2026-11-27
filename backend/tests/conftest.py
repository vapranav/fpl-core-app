"""Test fixtures.

Environment is set BEFORE importing app modules: the Settings singleton and
the SQLAlchemy engine are created at import time.

The fixture repo is a miniature copy of the dataset covering both layouts:
- 2099-2000: current layout (season-level masters + By Gameweek/GW{n}/)
- 2098-2099: legacy layout ({players,teams,playerstats}/x.csv, matches/,
  playermatchstats/GW{n}/)
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="fpl-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["SEASONS"] = "2098-2099,2099-2000"
os.environ["ETL_ON_STARTUP_IF_EMPTY"] = "false"
os.environ["ADMIN_TOKEN"] = ""

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402

FILES = {
    # ---- current layout -------------------------------------------------
    "data/2099-2000/teams.csv": (
        "code,id,name,short_name,elo\n10,1,Alpha FC,ALF,1900.5\n20,2,Beta United,BET,1750.25\n"
    ),
    "data/2099-2000/players.csv": (
        "player_code,player_id,first_name,second_name,web_name,team_code,position\n"
        "1001,1,John,Striker,Striker,10,Forward\n"
        "1002,2,Jane,Playmaker,Playmaker,10,Midfielder\n"
        "1003,3,Bob,Wall,Wall,20,Defender\n"
    ),
    # cumulative snapshot history; last row duplicates (id=1, gw=2) - the
    # loader must keep the last occurrence (total_points 99)
    "data/2099-2000/playerstats.csv": (
        "id,gw,total_points,event_points,now_cost,form,expected_goals,expected_assists,minutes,points_per_game,selected_by_percent\n"
        "1,1,6,6,9.5,6.0,0.8,0.1,90,6.0,25.0\n"
        "1,2,12,6,9.5,6.0,,0.2,990,5.5,26.0\n"
        "2,1,2,2,6.0,2.0,0.1,0.05,90,2.0,10.0\n"
        "2,2,5,3,6.0,3.5,0.2,0.1,990,2.5,11.0\n"
        "3,1,4,4,4.5,4.0,0.0,0.02,90,4.0,5.0\n"
        "3,2,4,0,4.5,2.0,0.0,0.03,990,2.0,5.0\n"
        "1,2,99,6,9.5,6.0,,0.2,990,5.5,26.0\n"
    ),
    "data/2099-2000/gameweek_summaries.csv": (
        "id,name,deadline_time,finished,is_current,highest_score\n"
        "1,Gameweek 1,2099-08-01T10:00:00Z,True,False,120\n"
        "2,Gameweek 2,2099-08-08T10:00:00Z,False,True,95\n"
    ),
    "data/2099-2000/team_history.csv": ("player_id,gw,team_code\n1,1,10\n2,1,10\n3,1,20\n3,2,10\n"),
    "data/2099-2000/By Gameweek/GW1/matches.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,home_score,away_score,"
        "away_team,away_team_elo,finished,match_id,match_url,"
        "home_expected_goals_xg,away_expected_goals_xg\n"
        "1,2099-08-01T15:00:00Z,10,1900.5,2,1,20,1750.25,True,"
        "99-00-prem-alpha-fc-vs-beta-united,/m/1,1.8,0.9\n"
    ),
    "data/2099-2000/By Gameweek/GW2/matches.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,home_score,away_score,"
        "away_team,away_team_elo,finished,match_id,match_url,"
        "home_expected_goals_xg,away_expected_goals_xg\n"
        "2,2099-08-08T15:00:00Z,20,1750.25,0,0,10,1900.5,True,"
        "99-00-prem-beta-united-vs-alpha-fc,/m/2,0.4,1.1\n"
    ),
    "data/2099-2000/By Gameweek/GW1/playermatchstats.csv": (
        "player_id,match_id,minutes_played,goals,xg\n"
        "1,99-00-prem-alpha-fc-vs-beta-united,90,2,1.7\n"
        "2,99-00-prem-alpha-fc-vs-beta-united,90,0,0.1\n"
    ),
    "data/2099-2000/By Gameweek/GW2/playermatchstats.csv": (
        "player_id,match_id,minutes_played,goals,xg\n"
        "1,99-00-prem-beta-united-vs-alpha-fc,88,0,0.3\n"
    ),
    "data/2099-2000/By Gameweek/GW1/player_gameweek_stats.csv": (
        "id,first_name,second_name,web_name,event_points,total_points,goals_scored,minutes\n"
        "1,John,Striker,Striker,6,6,1,90\n"
        "2,Jane,Playmaker,Playmaker,2,2,0,90\n"
        "3,Bob,Wall,Wall,4,4,0,90\n"
    ),
    "data/2099-2000/By Gameweek/GW2/player_gameweek_stats.csv": (
        "id,first_name,second_name,web_name,event_points,total_points,goals_scored,minutes\n"
        "1,John,Striker,Striker,6,12,0,88\n"
        "2,Jane,Playmaker,Playmaker,3,5,0,90\n"
        "3,Bob,Wall,Wall,0,4,0,90\n"
    ),
    # match timeline files exist only for GW1; the GW2 match has none, which
    # exercises the empty-timeline path
    "data/2099-2000/By Gameweek/GW1/shots.csv": (
        "match_id,shot_index,minute,added_time,is_home,player_id,player_name,"
        "outcome,situation,body_part,xg,xgot,start_x,start_y,"
        "goal_mouth_y,goal_mouth_z,goal_mouth_location\n"
        "99-00-prem-alpha-fc-vs-beta-united,1,12,,True,1,Striker,goal,regular,right-foot,"
        "0.45,0.6,8.0,50.0,52.0,0.5,low-centre\n"
        "99-00-prem-alpha-fc-vs-beta-united,2,34,,False,3,Wall,save,corner,head,"
        "0.12,0.2,5.0,40.0,48.0,1.0,low-centre\n"
        "99-00-prem-alpha-fc-vs-beta-united,3,45,2,True,,,miss,set-piece,left-foot,"
        "0.08,,12.0,55.0,,,\n"
    ),
    "data/2099-2000/By Gameweek/GW1/momentum.csv": (
        "match_id,minute,value\n"
        "99-00-prem-alpha-fc-vs-beta-united,1.0,25\n"
        "99-00-prem-alpha-fc-vs-beta-united,2.0,-40\n"
        "99-00-prem-alpha-fc-vs-beta-united,3.0,10\n"
    ),
    "data/2099-2000/By Gameweek/GW1/xg_by_minute.csv": (
        "match_id,minute,home_xg,away_xg,home_cumulative_xg,away_cumulative_xg\n"
        "99-00-prem-alpha-fc-vs-beta-united,1,0.02,0.0,0.02,0.0\n"
        "99-00-prem-alpha-fc-vs-beta-united,2,0.01,0.15,0.03,0.15\n"
        "99-00-prem-alpha-fc-vs-beta-united,3,0.45,0.0,0.48,0.15\n"
    ),
    # full-season PL schedule lives under By Tournament (primary fixture
    # source); the UCL row tests that non-prem fixtures are excluded
    "data/2099-2000/By Tournament/Premier League/GW2/fixtures.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,away_team,away_team_elo,finished,match_id\n"
        "2,2099-08-08T15:00:00Z,10,1900.5,20,1750.25,True,99-00-prem-alpha-fc-vs-beta-united\n"
        "3,2099-08-16T20:00:00Z,10,1900.5,,,False,99-00-champions-league-alpha-fc-vs-gamma-xi\n"
    ),
    "data/2099-2000/By Tournament/Premier League/GW3/fixtures.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,away_team,away_team_elo,finished,match_id\n"
        "3,2099-08-15T15:00:00Z,20,1750.25,10,1900.5,False,99-00-prem-beta-united-vs-alpha-fc\n"
    ),
    "data/2099-2000/By Tournament/Premier League/GW4/fixtures.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,away_team,away_team_elo,finished,match_id\n"
        "4,2099-08-22T15:00:00Z,10,1900.5,20,1750.25,False,99-00-prem-alpha-fc-vs-beta-united-gw4\n"
    ),
    "data/2099-2000/By Tournament/Premier League/GW5/fixtures.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,away_team,away_team_elo,finished,match_id\n"
        "5,2099-08-29T15:00:00Z,20,1750.25,10,1900.5,False,99-00-prem-beta-united-vs-alpha-fc-gw5\n"
    ),
    # ---- legacy layout --------------------------------------------------
    "data/2098-2099/teams/teams.csv": ("code,id,name,short_name,elo\n30,3,Gamma Town,GAM,1600.0\n"),
    "data/2098-2099/players/players.csv": (
        "player_code,player_id,first_name,second_name,web_name,team_code,position\n"
        "1009,9,Old,Legend,Legend,30,Forward\n"
    ),
    "data/2098-2099/playerstats/playerstats.csv": (
        "id,gw,total_points,event_points,now_cost\n9,38,50,2,7.5\n"
    ),
    # legacy master matches file uses integer match ids
    "data/2098-2099/matches/matches.csv": (
        "gameweek,kickoff_time,home_team,home_team_elo,home_score,away_score,"
        "away_team,away_team_elo,finished,match_id,match_url\n"
        "38,2099-05-20T15:00:00Z,30,1600.0,3,0,31,1500.0,True,12345,/m/9\n"
    ),
    "data/2098-2099/playermatchstats/GW1/playermatchstats.csv": (
        "player_id,match_id,minutes_played,goals,xg\n9,12345,90,3,2.4\n"
    ),
}


@pytest.fixture(scope="session")
def fixture_repo(tmp_path_factory) -> Path:
    root = tmp_path_factory.mktemp("repo")
    for rel, content in FILES.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return root


@pytest.fixture()
def mock_source(fixture_repo, monkeypatch):
    """Patch out all network access in the ETL; serve the fixture repo."""
    from app import etl

    monkeypatch.setattr(etl, "_latest_commit_sha", lambda: "testsha123")
    monkeypatch.setattr(etl, "_download_tarball", lambda dest: dest.write_text("x"))
    monkeypatch.setattr(etl, "_extract", lambda tarball, dest: fixture_repo)
    return etl


@pytest.fixture()
def clean_db():
    from app.db import Base, engine

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
