"""Tests for /api/fdr: FPL's fixture difficulty regrouped per team."""

from datetime import UTC, datetime
from unittest import mock

import httpx
from fastapi.testclient import TestClient

from app.fdr import build_fdr
from app.main import app

BOOT = {
    "teams": [
        {"id": 2, "code": 20, "name": "Beta United", "short_name": "BET"},
        {"id": 1, "code": 10, "name": "Alpha FC", "short_name": "ALF"},
        {"id": 3, "code": 30, "name": "Gamma Town", "short_name": "GAM"},
    ],
    "events": [
        {"id": 1, "name": "Gameweek 1", "deadline_time": "2026-08-15T10:00:00Z", "finished": True},
        {"id": 2, "name": "Gameweek 2", "deadline_time": "2026-08-22T10:00:00Z", "is_next": True},
        {"id": 3, "name": "Gameweek 3", "deadline_time": "2026-08-29T10:00:00Z"},
    ],
}


def _fx(event, h, a, hd, ad, kickoff="2026-08-23T14:00:00Z", finished=False):
    return {
        "event": event,
        "team_h": h,
        "team_a": a,
        "team_h_difficulty": hd,
        "team_a_difficulty": ad,
        "kickoff_time": kickoff,
        "finished": finished,
    }


FIXTURES = [
    _fx(1, 1, 2, 2, 4, "2026-08-16T14:00:00Z", finished=True),
    # GW2: Alpha double (late one listed first), Gamma blank
    _fx(2, 2, 1, 3, 3, "2026-08-25T19:00:00Z"),
    _fx(2, 1, 3, 1, 5, "2026-08-23T14:00:00Z"),
    _fx(None, 2, 3, 2, 2, None),  # postponed
]


def test_build_fdr_groups_by_team():
    body = build_fdr(BOOT, FIXTURES)
    assert body["next_event"] == 2
    assert [t["short_name"] for t in body["teams"]] == ["ALF", "BET", "GAM"]

    alpha = body["teams"][0]["fixtures"]
    assert [(f["event"], f["opponent_short"], f["is_home"], f["difficulty"]) for f in alpha] == [
        (1, "BET", True, 2),
        (2, "GAM", True, 1),  # sorted by kickoff within a gameweek
        (2, "BET", False, 3),
    ]
    assert alpha[0]["finished"] is True

    gamma = body["teams"][2]["fixtures"]
    assert [(f["event"], f["opponent_short"], f["difficulty"]) for f in gamma] == [(2, "ALF", 5)]
    # the postponed fixture is left out
    beta = body["teams"][1]["fixtures"]
    assert all(f["event"] is not None for f in beta) and len(beta) == 2


def test_next_event_falls_back_to_first_unfinished():
    boot = {**BOOT, "events": [{**e, "is_next": False} for e in BOOT["events"]]}
    assert build_fdr(boot, [])["next_event"] == 2


def test_fdr_endpoint():
    with (
        mock.patch("app.routers.get_bootstrap", return_value=(datetime.now(UTC), BOOT)),
        mock.patch("app.routers.get_fixtures", return_value=FIXTURES),
    ):
        r = TestClient(app).get("/api/fdr")
    assert r.status_code == 200
    assert len(r.json()["teams"]) == 3


def test_fdr_upstream_failure_is_502():
    with (
        mock.patch("app.routers.get_bootstrap", return_value=(datetime.now(UTC), BOOT)),
        mock.patch("app.routers.get_fixtures", side_effect=httpx.ConnectError("down")),
    ):
        r = TestClient(app).get("/api/fdr")
    assert r.status_code == 502
