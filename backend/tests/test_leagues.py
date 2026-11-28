"""Tests for the mini-league endpoints: standings values, history, overlap.

The official API is mocked; player names come from the fixture repo
(1 Striker/ALF, 2 Playmaker/ALF, 3 Wall/BET in season 2099-2000).
"""

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from app import etl
from app.db import Base, engine
from app.main import app

STANDINGS = {
    "league": {"name": "Test League"},
    "standings": {
        "has_next": False,
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
            {
                "rank": 3,
                "last_rank": 3,
                "entry": 333,
                "entry_name": "Gamma",
                "player_name": "Cy",
                "event_total": 40,
                "total": 580,
            },
        ],
    },
}

ENTRIES = {
    111: {
        "id": 111,
        "name": "Alpha FC",
        "player_name": "Ann",
        "current_event": 2,
        "last_deadline_value": 1012,
        "last_deadline_bank": 5,
    },
    222: {
        "id": 222,
        "name": "Beta XI",
        "player_name": "Bob",
        "current_event": 2,
        "last_deadline_value": 998,
        "last_deadline_bank": 21,
    },
    # 333 is missing: its requests fail and it is left out / valueless
    444: {
        "id": 444,
        "name": "Delta",
        "player_first_name": "Di",
        "player_last_name": "Ng",
        "current_event": 2,
    },
}


def _history(base):
    return {
        "current": [
            {
                "event": 1,
                "points": base,
                "total_points": base,
                "overall_rank": 1000,
                "value": 1000,
                "bank": 0,
            },
            {
                "event": 2,
                "points": base + 5,
                "total_points": 2 * base + 5,
                "overall_rank": 900,
                "value": 1005,
                "bank": 5,
            },
        ]
    }


def _picks(elements, captain, chip=None):
    return {
        "active_chip": chip,
        "picks": [
            {"element": el, "position": i + 1, "is_captain": el == captain}
            for i, el in enumerate(elements)
        ],
    }


PICKS = {
    111: _picks([1, 2, 3], captain=1),  # me
    222: _picks([1, 2, 99], captain=1, chip="3xc"),  # shares 2, same captain
    333: _picks([3, 98, 97], captain=3),  # entry/history fail, picks don't
}


def _entry(eid):
    if eid == 333:
        raise RuntimeError("FPL timed out")
    return ENTRIES.get(eid)


def _get_history(eid):
    if eid == 333:
        raise RuntimeError("FPL timed out")
    return _history(eid // 10) if eid in ENTRIES else None


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
    with (
        mock.patch(
            "app.routers.get_league_standings",
            side_effect=lambda lid, page: STANDINGS if lid == 42 else None,
        ),
        mock.patch("app.routers.get_entry", side_effect=_entry),
        mock.patch("app.routers.get_entry_history", side_effect=_get_history),
        mock.patch("app.routers.get_picks", side_effect=lambda eid, gw: PICKS.get(eid)),
    ):
        yield TestClient(app, raise_server_exceptions=True)


def test_standings_without_values_skips_entry_requests(client):
    rows = client.get("/api/leagues/42/standings").json()["standings"]
    assert rows[0]["team_value"] is None and rows[0]["bank"] is None


def test_standings_with_values(client):
    rows = client.get("/api/leagues/42/standings?values=true").json()["standings"]
    assert (rows[0]["team_value"], rows[0]["bank"]) == (101.2, 0.5)
    assert (rows[1]["team_value"], rows[1]["bank"]) == (99.8, 2.1)
    # a failed entry request degrades to no value instead of failing the page
    assert rows[2]["team_value"] is None


def test_history_top_members_plus_include(client):
    data = client.get("/api/leagues/42/history?limit=3&include=444&include=111").json()
    # 333's history request fails, so it's dropped; 111 isn't duplicated
    assert [m["entry"] for m in data["members"]] == [111, 222, 444]
    delta = data["members"][2]
    assert delta["player_name"] == "Di Ng"
    assert [g["total_points"] for g in delta["series"]] == [44, 93]
    assert delta["series"][1]["overall_rank"] == 900


def test_history_limit(client):
    data = client.get("/api/leagues/42/history?limit=1").json()
    assert [m["entry"] for m in data["members"]] == [111]


def test_overlap(client):
    data = client.get("/api/leagues/42/overlap?entry=111").json()
    assert data["gw"] == 2  # defaults to the manager's current GW
    assert data["squad_size"] == 3
    # rivals are league members other than me; most shared first
    assert data["total_members"] == 2
    bob, cy = data["members"]
    assert bob["entry"] == 222 and len(bob["shared"]) == 2
    assert bob["same_captain"] is True and bob["active_chip"] == "3xc"
    assert [p["web_name"] for p in bob["mine_only"]] == ["Wall"]
    assert [p["web_name"] for p in bob["theirs_only"]] == ["#99"]  # unknown to our DB
    assert cy["player_name"] == "Cy"
    assert cy["captain"]["web_name"] == "Wall" and cy["same_captain"] is False
    owned = {p["web_name"]: p["owned_by"] for p in data["my_squad"]}
    assert owned == {"Striker": 1, "Playmaker": 1, "Wall": 1}  # each owned by one rival
    striker = data["my_squad"][0]
    assert (striker["team_short"], striker["position"], striker["is_captain"]) == (
        "ALF",
        "Forward",
        True,
    )


def test_overlap_errors(client):
    assert client.get("/api/leagues/999/overlap?entry=111&gw=2").status_code == 404
    assert client.get("/api/leagues/42/overlap?entry=555&gw=2").status_code == 404  # no picks
    assert client.get("/api/leagues/42/overlap").status_code == 422


def test_manager_name_falls_back_to_first_and_last(client):
    # the real FPL entry payload has no player_name field
    assert client.get("/api/manager/444").json()["manager_name"] == "Di Ng"
