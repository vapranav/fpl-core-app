"""Tests for the FPL manager endpoints (official API responses are mocked)."""

from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app import etl
from app.db import Base, engine
from app.main import app

ENTRY = {
    "id": 123456,
    "player_name": "Test Manager",
    "name": "Test FC",
    "summary_overall_points": 512,
    "summary_overall_rank": 12345,
    "current_event": 3,
    "started_event": 1,
    "leagues": {
        "classic": [
            {"id": 42, "name": "Test League", "entry_rank": 3, "entry_last_rank": 5},
            {"id": 43, "name": "Other League", "entry_rank": 10, "entry_last_rank": 9},
        ]
    },
}

PICKS = {
    "picks": [
        {
            "element": 1,
            "position": 1,
            "is_captain": True,
            "is_vice_captain": False,
            "multiplier": 2,
        },
        {
            "element": 2,
            "position": 5,
            "is_captain": False,
            "is_vice_captain": True,
            "multiplier": 1,
        },
        {
            "element": 3,
            "position": 12,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 0,
        },
        {
            "element": 999,
            "position": 13,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 0,
        },  # unknown to our DB
    ],
    "active_chip": "bboost",
    "automatic_subs": [{"element_in": 3, "element_out": 2, "event": 3}],
    "entry_history": {
        "points_on_bench": 4,
        "points": 34,
        "event_transfers": 1,
        "event_transfers_cost": 0,
        "bank": 25,
        "value": 1005,
        "overall_rank": 12345,
    },
}

LIVE = {
    "elements": [
        {"id": 1, "stats": {"total_points": 9, "minutes": 90}},
        {"id": 2, "stats": {"total_points": 0, "minutes": 0}},
        {"id": 3, "stats": {"total_points": 4, "minutes": 90}},
    ]
}

STANDINGS = {
    "league": {"name": "Test League"},
    "standings": {
        "has_next": True,
        "results": [
            {
                "rank": 1,
                "last_rank": 2,
                "entry": 111,
                "entry_name": "Alpha FC",
                "player_name": "Ann",
                "event_total": 50,
                "total": 600,
            },
            {
                "rank": 2,
                "last_rank": 1,
                "entry": 222,
                "entry_name": "Beta XI",
                "player_name": "Bob",
                "event_total": 45,
                "total": 590,
            },
        ],
    },
}


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
    patches = (
        mock.patch(
            "app.routers.get_entry", side_effect=lambda eid: ENTRY if eid == 123456 else None
        ),
        mock.patch(
            "app.routers.get_picks", side_effect=lambda eid, gw: PICKS if eid == 123456 else None
        ),
        mock.patch(
            "app.routers.get_league_standings",
            side_effect=lambda lid, page: STANDINGS if lid == 42 else None,
        ),
        mock.patch("app.routers.get_event_live", side_effect=lambda gw: LIVE if gw == 3 else None),
    )
    with patches[0], patches[1], patches[2], patches[3]:
        yield TestClient(app, raise_server_exceptions=True)


def test_manager_profile(client):
    data = client.get("/api/manager/123456").json()
    assert data["manager_name"] == "Test Manager"
    assert data["team_name"] == "Test FC"
    assert data["overall_rank"] == 12345
    assert data["leagues"] == [
        {"id": 42, "name": "Test League", "entry_rank": 3, "entry_last_rank": 5},
        {"id": 43, "name": "Other League", "entry_rank": 10, "entry_last_rank": 9},
    ]


def test_manager_not_found(client):
    assert client.get("/api/manager/999").status_code == 404


def test_manager_team_enriched(client):
    data = client.get("/api/manager/123456/team").json()
    assert data["gw"] == 3  # from entry.current_event
    assert data["gw_points"] == 34
    assert data["bank"] == 2.5  # tenths converted
    assert data["squad_value"] == 100.5

    picks = data["picks"]
    assert [p["element"] for p in picks] == [1, 2, 3, 999]  # squad_position order
    striker = picks[0]
    assert striker["web_name"] == "Striker"
    assert striker["is_captain"] is True
    assert striker["team_name"] == "Alpha FC"
    assert striker["photo_url"].endswith("/p1001.png")
    assert striker["total_points"] == 99
    assert picks[2]["web_name"] == "Wall"
    # unknown element degrades gracefully
    assert picks[3]["web_name"] == "#999"
    assert picks[3]["photo_url"] is None


def test_manager_team_live_points_for_pitch(client):
    data = client.get("/api/manager/123456/team").json()
    striker, playmaker, wall, unknown = data["picks"]
    assert (striker["gw_points"], striker["minutes"], striker["team_short"]) == (9, 90, "ALF")
    assert playmaker["gw_points"] == 0 and playmaker["minutes"] == 0
    assert wall["team_short"] == "BET"
    # not in the live feed or our DB
    assert unknown["gw_points"] is None and unknown["team_short"] is None
    assert data["active_chip"] == "bboost"
    assert data["points_on_bench"] == 4
    assert data["automatic_subs"] == [{"element_in": 3, "element_out": 2}]


def test_manager_team_without_live_feed(client):
    with mock.patch("app.routers.get_event_live", side_effect=httpx.ConnectError("down")):
        data = client.get("/api/manager/123456/team").json()
    assert data["picks"][0]["gw_points"] is None  # degrades, doesn't fail


def test_league_standings(client):
    data = client.get("/api/leagues/42/standings").json()
    assert data["league_name"] == "Test League"
    assert data["has_next"] is True
    assert len(data["standings"]) == 2
    assert data["standings"][0]["entry_name"] == "Alpha FC"
    assert data["standings"][1]["total"] == 590


def test_league_not_found(client):
    assert client.get("/api/leagues/999/standings").status_code == 404
