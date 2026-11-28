"""Tests for the live-FPL endpoints: /api/prices and /api/compare.

The official API is mocked; /api/compare's trend snapshots come from the
fixture repo (players 1-3 in season 2099-2000).
"""

from datetime import UTC, datetime
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app import etl
from app.db import Base, engine
from app.main import app
from app.prices import next_price_update, status_label

FETCHED_AT = datetime(2026, 11, 26, 18, 0, tzinfo=UTC)


def _element(id_, web_name, team, element_type, **extra):
    return {
        "id": id_,
        "web_name": web_name,
        "first_name": web_name,
        "second_name": "Test",
        "team": team,
        "element_type": element_type,
        "status": "a",
        "news": "",
        "now_cost": 50 + id_,
        "selected_by_percent": "10.0",
        "total_points": 10 * id_,
        "form": "5.0",
        "ep_next": "4.5",
        "cost_change_start": 2,
        "price_change_percent": "0.0",
        "price_change_hourly_rate": 0,
        "price_change_projections": [{"offset": 0, "projected_percent": "0.0", "likelihood": 0}],
        "price_change_locked_until": None,
        "price_change_calibrating": False,
        **extra,
    }


def _bootstrap():
    return {
        "teams": [
            {"id": 1, "code": 10, "name": "Alpha FC", "short_name": "ALF"},
            {"id": 2, "code": 20, "name": "Beta United", "short_name": "BET"},
        ],
        "element_types": [
            {"id": 3, "singular_name_short": "MID"},
            {"id": 4, "singular_name_short": "FWD"},
        ],
        "events": [{"id": 1, "is_current": False}, {"id": 2, "is_current": True}],
        "elements": [
            _element(
                1,
                "Striker",
                1,
                4,
                price_change_percent="103.0",
                price_change_hourly_rate=500,
                price_change_projections=[
                    {"offset": 1, "projected_percent": "130.0", "likelihood": 5},
                    {"offset": 0, "projected_percent": "120.0", "likelihood": 5},
                ],
            ),
            _element(
                2,
                "Playmaker",
                1,
                3,
                price_change_percent="-99.0",
                price_change_hourly_rate=-4,
                price_change_projections=[
                    {"offset": 0, "projected_percent": "-99.8", "likelihood": -4}
                ],
            ),
            _element(3, "Wall", 2, 3, price_change_locked_until="2099-01-01T00:00:00Z"),
            _element(4, "Gone", 2, 4, status="u", price_change_percent="150.0"),
        ],
    }


HISTORY = [
    {"element": 1, "changed_at": "2026-08-20T23:00:05Z", "cost_before": 50, "cost_after": 51},
    {"element": 3, "changed_at": "2026-08-21T23:00:05Z", "cost_before": 54, "cost_after": 53},
    {"element": 999, "changed_at": "2026-08-22T23:00:05Z", "cost_before": 40, "cost_after": 39},
]

SUMMARY = {
    "history": [
        {
            "round": 1,
            "opponent_team": 2,
            "was_home": True,
            "total_points": 6,
            "minutes": 90,
            "goals_scored": 1,
            "assists": 0,
            "expected_goals": "0.80",
            "expected_assists": "0.10",
            "defensive_contribution": 3,
            "value": 50,
        }
    ],
    "fixtures": [
        {
            "event": 3 + i,
            "team_h": 1,
            "team_a": 2,
            "is_home": True,
            "difficulty": 2,
            "kickoff_time": None,
        }
        for i in range(7)
    ],
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
    with (
        mock.patch("app.routers.get_bootstrap", side_effect=lambda: (FETCHED_AT, _bootstrap())),
        mock.patch("app.routers.get_price_change_history", return_value=HISTORY),
        mock.patch("app.routers.get_element_summary", return_value=SUMMARY),
    ):
        yield TestClient(app, raise_server_exceptions=True)


def test_prices_mirror_fpl(client):
    body = client.get("/api/prices").json()
    rows = body["predictions"]
    # unavailable players are dropped; furthest from zero progress first
    assert [r["id"] for r in rows] == [1, 2, 3]
    top, drop, locked = rows
    assert (top["status_label"], top["direction"], top["trend"]) == (
        "Very likely to rise",
        "rise",
        "up",
    )
    # projections are sorted by offset, so "next update" is offset 0
    assert top["predicted_progress"] == 120.0
    assert top["team_code"] == 10
    assert (drop["status_label"], drop["direction"], drop["trend"]) == (
        "Likely to drop",
        "drop",
        "down",
    )
    assert locked["locked"] is True and locked["direction"] is None
    assert locked["status_label"].startswith("Unlocks in")
    # newest change first; changes for players no longer in the game are dropped
    assert [(c["id"], c["cost_after"]) for c in body["recent_changes"]] == [(3, 53), (1, 51)]
    assert body["current_event"] == 2
    assert body["next_update_at"].startswith("2026-11-27T00:00:00")


def test_compare_players(client):
    body = client.get("/api/compare?ids=2&ids=1&ids=2").json()
    assert body["season"] == "2099-2000"
    players = body["players"]
    assert [p["id"] for p in players] == [2, 1]  # request order, de-duplicated
    striker = players[1]
    assert striker["team_short"] == "ALF" and striker["position_short"] == "FWD"
    assert striker["form"] == 5.0 and striker["ep_next"] == 4.5
    assert striker["cost_change_start"] == 0.2
    assert striker["penalties_order"] is None
    assert striker["history"][0]["opponent_short"] == "BET"
    assert striker["history"][0]["expected_goals"] == 0.8
    assert len(striker["fixtures"]) == 5
    assert striker["fixtures"][0]["opponent_short"] == "BET"
    # trend snapshots from the dataset, one per GW (duplicate GW2 row collapsed)
    assert [t["gw"] for t in striker["trend"]] == [1, 2]
    assert striker["trend"][-1]["selected_by_percent"] == 26.0


def test_compare_unknown_player(client):
    r = client.get("/api/compare?ids=1&ids=999")
    assert r.status_code == 404
    assert "999" in r.json()["detail"]


def test_compare_validates_ids(client):
    assert client.get("/api/compare").status_code == 422
    assert (
        client.get("/api/compare?" + "&".join(f"ids={i}" for i in range(1, 7))).status_code == 422
    )
    assert client.get("/api/compare?ids=0").status_code == 422


def test_upstream_failure_is_502(client):
    with mock.patch("app.routers.get_bootstrap", side_effect=httpx.ConnectError("down")):
        r = client.get("/api/prices")
    assert r.status_code == 502


def test_status_labels():
    now = datetime(2026, 11, 26, 18, 0, tzinfo=UTC)
    assert status_label(5, None, False, now) == "Very likely to rise"
    assert status_label(4, None, False, now) == "Likely to rise"
    assert status_label(3, None, False, now) == "Unlikely to change"
    assert status_label(-4, None, False, now) == "Likely to drop"
    assert status_label(-5, None, False, now) == "Very likely to drop"
    assert status_label(0, None, True, now) == "Calibrating"
    # 3.1 days left reads "Unlocks in 4 days", like FPL
    assert (
        status_label(5, datetime(2026, 11, 29, 21, 0, tzinfo=UTC), False, now)
        == "Unlocks in 4 days"
    )
    assert (
        status_label(0, datetime(2026, 11, 27, 9, 0, tzinfo=UTC), False, now) == "Unlocks in 1 day"
    )
    # an expired lock no longer counts
    assert (
        status_label(0, datetime(2026, 11, 26, 9, 0, tzinfo=UTC), False, now)
        == "Unlikely to change"
    )


def test_next_price_update_is_midnight_uk():
    # GMT in November: midnight UK is 00:00 UTC
    assert next_price_update(datetime(2026, 11, 26, 18, 0, tzinfo=UTC)) == datetime(
        2026, 11, 27, 0, 0, tzinfo=UTC
    )
    # BST in summer: midnight UK is 23:00 UTC the evening before
    assert next_price_update(datetime(2026, 8, 1, 12, 0, tzinfo=UTC)) == datetime(
        2026, 8, 1, 23, 0, tzinfo=UTC
    )
