"""API tests against a database seeded from the fixture repo."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from app import etl
from app.config import settings
from app.db import Base, engine
from app.main import app


@pytest.fixture(scope="module")
def client(fixture_repo):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with (
        mock.patch.object(etl, "_latest_commit_sha", return_value="testsha123"),
        mock.patch.object(etl, "_download_tarball", lambda dest: dest.write_text("x")),
        mock.patch.object(etl, "_extract", return_value=fixture_repo),
    ):
        etl.refresh(force=True)
    # no lifespan: scheduler and bootstrap ETL stay off
    return TestClient(app, raise_server_exceptions=True)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_seasons(client):
    assert client.get("/api/seasons").json()["seasons"] == ["2098-2099", "2099-2000"]


def test_players_defaults_to_latest_season_sorted(client):
    data = client.get("/api/players").json()
    assert data["season"] == "2099-2000"
    assert data["total"] == 3
    names = [p["web_name"] for p in data["players"]]
    assert names == ["Striker", "Playmaker", "Wall"]  # 99 > 5 > 4 at latest GW
    striker = data["players"][0]
    assert striker["team_name"] == "Alpha FC"
    assert striker["photo_url"].endswith("/p1001.png")
    # NaN at latest GW surfaces as JSON null
    assert striker["stats"]["expected_goals"] is None


def test_players_filters(client):
    data = client.get("/api/players", params={"position": "Midfielder"}).json()
    assert [p["web_name"] for p in data["players"]] == ["Playmaker"]

    data = client.get("/api/players", params={"team_code": 20}).json()
    assert [p["web_name"] for p in data["players"]] == ["Wall"]

    data = client.get("/api/players", params={"search": "strik"}).json()
    assert [p["web_name"] for p in data["players"]] == ["Striker"]

    data = client.get("/api/players", params={"season": "2098-2099"}).json()
    assert [p["web_name"] for p in data["players"]] == ["Legend"]


def test_players_pagination(client):
    page1 = client.get("/api/players", params={"limit": 2, "offset": 0}).json()
    page2 = client.get("/api/players", params={"limit": 2, "offset": 2}).json()
    assert page1["total"] == 3 and len(page1["players"]) == 2
    assert len(page2["players"]) == 1


def test_players_rejects_bad_sort(client):
    assert client.get("/api/players", params={"sort": "web_name"}).status_code == 400


def test_player_detail(client):
    data = client.get("/api/players/1").json()
    assert data["web_name"] == "Striker"
    assert data["season_stats"]["total_points"] == 99
    assert len(data["team_history"]) == 1

    transferred = client.get("/api/players/3").json()
    assert [h["team_code"] for h in transferred["team_history"]] == [20, 10]


def test_player_not_found(client):
    assert client.get("/api/players/999").status_code == 404


def test_player_gameweeks(client):
    data = client.get("/api/players/1/gameweeks").json()
    assert len(data["gameweeks"]) == 2
    assert data["gameweeks"][0]["goals_scored"] == 1


def test_player_matches_joined(client):
    data = client.get("/api/players/1/matches").json()
    assert len(data["matches"]) == 3  # 2 league + 1 midweek UCL
    first = data["matches"][0]
    assert first["goals"] == 2
    assert first["match"]["match_id"] == "99-00-prem-alpha-fc-vs-beta-united"
    assert first["match"]["home_team_elo"] == 1900.5


def test_matches_filters(client):
    data = client.get("/api/matches", params={"season": "2099-2000"}).json()
    assert data["total"] == 4
    assert client.get("/api/matches", params={"season": "2099-2000", "gw": 1}).json()["total"] == 1
    assert (
        client.get("/api/matches", params={"season": "2099-2000", "team_code": 10}).json()["total"]
        == 4
    )
    # legacy integer match id round-trips as a string
    legacy = client.get("/api/matches", params={"season": "2098-2099"}).json()
    assert legacy["matches"][0]["match_id"] == "12345"


def test_matches_finished_filter(client):
    # one dedicated unfinished row (gw3up); the rest are finished
    done = client.get("/api/matches", params={"season": "2099-2000", "finished": "true"}).json()
    assert [m["match_id"] for m in done["matches"]] == [
        "99-00-prem-alpha-fc-vs-beta-united",
        "99-00-prem-beta-united-vs-alpha-fc",
        "99-00-champions-league-alpha-fc-vs-gamma-xi",
    ]
    upcoming = client.get(
        "/api/matches", params={"season": "2099-2000", "finished": "false"}
    ).json()
    assert [m["match_id"] for m in upcoming["matches"]] == [
        "99-00-prem-alpha-fc-vs-beta-united-gw3up"
    ]


def test_match_timeline_happy_path(client):
    data = client.get(
        "/api/matches/99-00-prem-alpha-fc-vs-beta-united/timeline",
        params={"season": "2099-2000"},
    ).json()
    m = data["match"]
    assert m["home_team"] == 10
    assert m["home_team_name"] == "Alpha FC"
    assert m["away_team_name"] == "Beta United"
    assert m["home_score"] == 2
    assert m["gameweek"] == 1

    # shots ordered by minute
    assert [s["shot_index"] for s in data["shots"]] == [1, 2, 3]
    goal = data["shots"][0]
    assert goal["outcome"] == "goal"
    assert goal["is_home"] is True
    assert goal["player_name"] == "Striker"
    assert goal["xg"] == 0.45
    assert data["shots"][2]["player_id"] is None  # empty CSV cell -> null
    # blank player_name resolved from the players table via player_id
    assert data["shots"][1]["player_name"] == "Wall"
    # no id and no name -> stays null
    assert data["shots"][2]["player_name"] is None

    assert [r["minute"] for r in data["momentum"]] == [1.0, 2.0, 3.0]
    assert data["momentum"][1]["value"] == -40

    xg = data["xg_by_minute"]
    assert [r["minute"] for r in xg] == [1.0, 2.0, 3.0]
    assert xg[-1]["home_cumulative_xg"] == 0.48
    assert xg[-1]["away_cumulative_xg"] == 0.15


def test_match_timeline_empty_when_files_missing(client):
    # the GW2 match exists but has no timeline files -> empty arrays, not 404
    data = client.get(
        "/api/matches/99-00-prem-beta-united-vs-alpha-fc/timeline",
        params={"season": "2099-2000"},
    ).json()
    assert data["match"]["match_id"] == "99-00-prem-beta-united-vs-alpha-fc"
    assert data["shots"] == []
    assert data["momentum"] == []
    assert data["xg_by_minute"] == []


def test_match_timeline_unknown_match_404(client):
    r = client.get("/api/matches/no-such-match/timeline", params={"season": "2099-2000"})
    assert r.status_code == 404


def test_teams_have_badge_urls(client):
    data = client.get("/api/teams").json()
    assert data["teams"][0]["badge_url"].endswith(".png")


def test_gameweeks(client):
    data = client.get("/api/gameweeks").json()
    assert len(data["gameweeks"]) == 2
    current = [g for g in data["gameweeks"] if g["is_current"]]
    assert current[0]["id"] == 2


def test_differentials_filters_by_ownership(client):
    data = client.get("/api/differentials", params={"season": "2099-2000"}).json()
    # default ceiling 10%: only Wall (5%) — Striker 26%, Playmaker 11% excluded
    assert [d["web_name"] for d in data["differentials"]] == ["Wall"]


def test_differentials_scoring_order(client):
    data = client.get(
        "/api/differentials", params={"season": "2099-2000", "max_ownership": 30}
    ).json()
    names = [d["web_name"] for d in data["differentials"]]
    assert names == ["Striker", "Playmaker", "Wall"]
    scores = [d["score"] for d in data["differentials"]]
    assert scores == sorted(scores, reverse=True)


def test_differentials_fixture_run(client):
    data = client.get(
        "/api/differentials", params={"season": "2099-2000", "max_ownership": 30}
    ).json()
    striker = next(d for d in data["differentials"] if d["web_name"] == "Striker")
    assert len(striker["next_fixtures"]) == 3
    first = striker["next_fixtures"][0]
    assert first["gw"] == 3
    assert first["home"] is False  # GW3: Striker's team 10 is away at Beta
    assert first["opp_code"] == 20
    assert first["opp_name"] == "Beta United"
    assert first["opp_elo"] == 1750.25
    # the UCL fixture (no 'prem' in slug) is excluded from fixture runs
    assert all(f["opp_name"] is not None for f in striker["next_fixtures"])
    # fixture ease: team 10 plays 1750.25 x3, league avg is 1825.4 -> positive ease
    assert striker["fixture_ease"] > 0


def test_search_matches_web_name(client):
    data = client.get("/api/search/players", params={"q": "strik"}).json()
    assert [r["web_name"] for r in data["results"]] == ["Striker"]
    assert data["results"][0]["team_name"] == "Alpha FC"
    assert data["results"][0]["total_points"] == 99


def test_search_matches_first_and_second_name(client):
    # second name only — web_name ("Playmaker") does not contain it
    data = client.get("/api/search/players", params={"q": "laymak"}).json()
    assert [r["web_name"] for r in data["results"]] == ["Playmaker"]
    # first name
    data = client.get("/api/search/players", params={"q": "bob"}).json()
    assert [r["web_name"] for r in data["results"]] == ["Wall"]


def test_search_minimum_length(client):
    assert client.get("/api/search/players", params={"q": "a"}).json() == {"results": []}
    assert client.get("/api/search/players", params={"q": ""}).json() == {"results": []}


def test_search_orders_by_points(client):
    # "er" matches Striker (99 pts) and Playmaker (5) — highest first
    data = client.get("/api/search/players", params={"q": "er"}).json()
    assert [r["web_name"] for r in data["results"]] == ["Striker", "Playmaker"]


def test_rotation_risk_detects_midweek_match(client):
    data = client.get("/api/rotation-risk", params={"season": "2099-2000"}).json()
    names = [p["web_name"] for p in data["players"]]
    # Alpha FC (Striker, Playmaker) played UCL midweek before the GW3 fixture;
    # Wall's Beta United had no midweek match
    assert set(names) == {"Striker", "Playmaker"}
    striker = data["players"][0]
    assert striker["web_name"] == "Striker"  # highest risk first
    assert striker["midweek"]["competition"] == "UCL"
    assert striker["midweek"]["minutes"] == 90
    assert striker["risk"] == 1.0
    assert striker["risk_label"] == "Medium"
    assert striker["next_fixture"]["gw"] == 3
    assert striker["next_fixture"]["opp_name"] == "Beta United"
    assert striker["next_fixture"]["home"] is False


def test_rotation_risk_history_delta_null_without_samples(client):
    data = client.get("/api/rotation-risk", params={"season": "2099-2000"}).json()
    striker = data["players"][0]
    # no PL match in the fixture data follows a midweek game -> no history
    assert striker["history"]["sample"] == 0
    assert striker["history"]["delta"] is None
    assert striker["history"]["baseline_minutes"] == 89.0  # (90 + 88) / 2


def test_rotation_risk_window_excludes_old_matches(client):
    # days=0 is invalid (ge=1); days=1 covers the UCL match (19h before GW3)
    assert client.get("/api/rotation-risk", params={"days": 0}).status_code == 422
    data = client.get("/api/rotation-risk", params={"season": "2099-2000", "days": 1}).json()
    assert len(data["players"]) == 2


def test_admin_open_when_token_unset(client):
    assert client.get("/api/admin/ingestions").status_code == 200


def test_admin_requires_token_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "secret")
    assert client.get("/api/admin/ingestions").status_code == 401
    assert (
        client.get("/api/admin/ingestions", headers={"X-Admin-Token": "secret"}).status_code == 200
    )


def test_admin_refresh_schedules(client, monkeypatch):
    called = []
    monkeypatch.setattr("app.routers.refresh", lambda *a, **k: called.append(a))
    r = client.post("/api/admin/refresh")
    assert r.status_code == 202
    assert called, "refresh was not scheduled as a background task"
