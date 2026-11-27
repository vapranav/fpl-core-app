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
    assert len(data["matches"]) == 2
    first = data["matches"][0]
    assert first["goals"] == 2
    assert first["match"]["match_id"] == "99-00-prem-alpha-fc-vs-beta-united"
    assert first["match"]["home_team_elo"] == 1900.5


def test_matches_filters(client):
    data = client.get("/api/matches", params={"season": "2099-2000"}).json()
    assert data["total"] == 2
    assert client.get("/api/matches", params={"season": "2099-2000", "gw": 1}).json()["total"] == 1
    assert client.get("/api/matches", params={"season": "2099-2000", "team_code": 10}).json()["total"] == 2
    # legacy integer match id round-trips as a string
    legacy = client.get("/api/matches", params={"season": "2098-2099"}).json()
    assert legacy["matches"][0]["match_id"] == "12345"


def test_teams_have_badge_urls(client):
    data = client.get("/api/teams").json()
    assert data["teams"][0]["badge_url"].endswith(".png")


def test_gameweeks(client):
    data = client.get("/api/gameweeks").json()
    assert len(data["gameweeks"]) == 2
    current = [g for g in data["gameweeks"] if g["is_current"]]
    assert current[0]["id"] == 2


def test_admin_open_when_token_unset(client):
    assert client.get("/api/admin/ingestions").status_code == 200


def test_admin_requires_token_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "secret")
    assert client.get("/api/admin/ingestions").status_code == 401
    assert (
        client.get("/api/admin/ingestions", headers={"X-Admin-Token": "secret"}).status_code
        == 200
    )


def test_admin_refresh_schedules(client, monkeypatch):
    called = []
    monkeypatch.setattr("app.routers.refresh", lambda *a, **k: called.append(a))
    r = client.post("/api/admin/refresh")
    assert r.status_code == 202
    assert called, "refresh was not scheduled as a background task"
