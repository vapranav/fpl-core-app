"""Tests for head-to-head history (football-data.co.uk responses are mocked)."""

from datetime import date
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app import h2h
from app.main import app

HEADER = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HS,AS,HST,AST,HR,AR"


def csv_for(rows: list[str]) -> str:
    return "﻿" + "\n".join([HEADER, *rows]) + "\n,,,,,,\n"


# one meeting per season (home side alternating) plus unrelated games
def season_csv(start: int) -> str:
    yy = f"{(start + 1) % 100:02d}"
    home, away = ("Arsenal", "Tottenham") if start % 2 else ("Tottenham", "Arsenal")
    return csv_for(
        [
            f"E0,15/01/20{yy},15:00,{home},{away},{start % 3},1,X,0,0,D,M Dean,10,8,4,3,0,0",
            f"E0,16/01/20{yy},15:00,Chelsea,Arsenal,1,1,D,0,0,D,,5,5,2,2,0,0",
        ]
    )


BOOT = {
    "teams": [
        {"id": 1, "code": 3, "name": "Arsenal", "short_name": "ARS"},
        {"id": 18, "code": 6, "name": "Spurs", "short_name": "TOT"},
        {"id": 7, "code": 8, "name": "Chelsea", "short_name": "CHE"},
    ]
}


def fake_get(url, timeout=None, follow_redirects=None):
    code, div = url.split("/")[-2], url.split("/")[-1].removesuffix(".csv")
    start = 2000 + int(code[:2])
    req = httpx.Request("GET", url)
    if div != "E0" or start > 2026:
        return httpx.Response(404, request=req)
    return httpx.Response(200, content=season_csv(start).encode(), request=req)


@pytest.fixture
def client():
    h2h.clear_cache()
    with (
        mock.patch("app.h2h.httpx.get", side_effect=fake_get),
        mock.patch("app.h2h.current_season_start", return_value=2026),
        mock.patch("app.routers.get_bootstrap", return_value=(None, BOOT)),
    ):
        yield TestClient(app)
    h2h.clear_cache()


def test_fd_name():
    assert h2h.fd_name("Spurs") == "Tottenham"
    assert h2h.fd_name("Man Utd") == "Man United"
    assert h2h.fd_name("Man City") == "Man City"
    assert h2h.fd_name("Coventry City") == "Coventry"
    assert h2h.fd_name("Ipswich Town") == "Ipswich"
    assert h2h.fd_name("Nott'm Forest") == "Nott'm Forest"


def test_current_season_start():
    assert h2h.current_season_start(date(2026, 11, 28)) == 2026
    assert h2h.current_season_start(date(2027, 3, 1)) == 2026


def test_parse_csv_old_and_new_dates():
    rows = h2h.parse_csv(
        "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\nE1,14/08/93,Derby,Stoke,2,1\n,,,,,\n", 1993, "E1"
    )
    assert rows == [
        {
            "date": "1993-08-14",
            "season": "1993-94",
            "competition": "First Division",
            "home": "Derby",
            "away": "Stoke",
            "home_score": 2,
            "away_score": 1,
            "home_ht": None,
            "away_ht": None,
            "home_shots": None,
            "away_shots": None,
            "home_shots_on_target": None,
            "away_shots_on_target": None,
            "home_red": None,
            "away_red": None,
            "referee": None,
        }
    ]


def test_h2h_last_six_from_clicked_side(client):
    r = client.get("/api/h2h?team=18&opponent=1")
    assert r.status_code == 200
    data = r.json()
    assert data["team"]["short_name"] == "TOT" and data["opponent"]["short_name"] == "ARS"
    ms = data["matches"]
    assert len(ms) == 6
    assert [m["season"] for m in ms] == [f"{y}-{(y + 1) % 100:02d}" for y in range(2026, 2020, -1)]
    first = ms[0]  # 2026-27: Tottenham home (even start), 2026 % 3 = 1 -> 1-1
    assert first["team_is_home"] and first["result"] == "D"
    assert first["referee"] == "M Dean" and first["home_shots"] == 10
    s = data["summary"]
    assert s["played"] == 6 and s["wins"] + s["draws"] + s["losses"] == 6
    assert s["goals_for"] == sum(
        m["home_score"] if m["team_is_home"] else m["away_score"] for m in ms
    )


def test_h2h_limit_and_caching(client):
    client.get("/api/h2h?team=1&opponent=18&limit=3")
    with mock.patch("app.h2h.httpx.get", side_effect=AssertionError("refetched")):
        data = client.get("/api/h2h?team=1&opponent=18&limit=3").json()
    assert len(data["matches"]) == 3


def test_h2h_same_team(client):
    assert client.get("/api/h2h?team=1&opponent=1").status_code == 400


def test_h2h_unknown_team(client):
    assert client.get("/api/h2h?team=1&opponent=99").status_code == 404


def test_h2h_source_down(client):
    h2h.clear_cache()
    with mock.patch("app.h2h.httpx.get", side_effect=httpx.ConnectError("down")):
        assert client.get("/api/h2h?team=1&opponent=18").status_code == 502
