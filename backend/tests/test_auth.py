"""Tests for the token-protected endpoints (/api/me, /api/manager/{id}/my-team)."""

from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app import etl, fpl_client
from app.db import Base, engine
from app.fpl_client import FplAuthError
from app.main import app

GOOD = "good-token"

ME = {"player": {"entry": 123456, "first_name": "Test", "last_name": "Manager"}}

MY_TEAM = {
    "picks": [
        {
            "element": 2,
            "position": 2,
            "selling_price": 55,
            "purchase_price": 54,
            "multiplier": 1,
            "is_captain": False,
            "is_vice_captain": True,
        },
        {
            "element": 1,
            "position": 1,
            "selling_price": 101,
            "purchase_price": 100,
            "multiplier": 2,
            "is_captain": True,
            "is_vice_captain": False,
        },
        {
            "element": 999,
            "position": 12,
            "selling_price": 40,
            "purchase_price": 40,
            "multiplier": 0,
            "is_captain": False,
            "is_vice_captain": False,
        },
    ],
    "chips": [
        {
            "name": "wildcard",
            "status_for_entry": "played",
            "played_by_entry": [4],
            "start_event": 2,
            "stop_event": 19,
            "is_pending": False,
        },
        {
            "name": "bboost",
            "status_for_entry": "available",
            "played_by_entry": [],
            "start_event": 1,
            "stop_event": 19,
        },
    ],
    "transfers": {"cost": 4, "status": "cost", "limit": 2, "made": 0, "bank": 15, "value": 1003},
}


def _fake_me(token):
    if token != GOOD:
        raise FplAuthError(401)
    return ME


def _fake_my_team(entry_id, token):
    if token != GOOD:
        raise FplAuthError(401)
    return MY_TEAM if entry_id == 123456 else None


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
        mock.patch("app.routers.get_me", side_effect=_fake_me),
        mock.patch("app.routers.get_my_team", side_effect=_fake_my_team),
    ):
        yield TestClient(app, raise_server_exceptions=True)


def test_me(client):
    r = client.get("/api/me", headers={"X-FPL-Token": GOOD})
    assert r.status_code == 200
    assert r.json() == {"entry_id": 123456, "manager_name": "Test Manager"}


def test_me_accepts_bearer_prefix(client):
    assert client.get("/api/me", headers={"X-FPL-Token": f"Bearer {GOOD}"}).status_code == 200


def test_me_requires_token(client):
    assert client.get("/api/me").status_code == 401


def test_me_rejected_token(client):
    r = client.get("/api/me", headers={"X-FPL-Token": "expired"})
    assert r.status_code == 401
    assert "expired" in r.json()["detail"]


def test_my_team(client):
    r = client.get("/api/manager/123456/my-team", headers={"X-FPL-Token": GOOD})
    assert r.status_code == 200
    data = r.json()
    assert [p["squad_position"] for p in data["picks"]] == [1, 2, 12]
    first = data["picks"][0]
    assert first["is_captain"] and first["selling_price"] == 10.1
    assert first["purchase_price"] == 10.0
    assert data["picks"][2]["web_name"] == "#999"  # unknown to our DB
    assert data["transfers"] == {
        "free": 2,
        "made": 0,
        "cost": 4,
        "status": "cost",
        "bank": 1.5,
        "value": 100.3,
    }
    assert data["chips"][0] == {
        "name": "wildcard",
        "status": "played",
        "played_events": [4],
        "start_event": 2,
        "stop_event": 19,
        "is_pending": False,
    }


def test_my_team_rejected_token(client):
    r = client.get("/api/manager/123456/my-team", headers={"X-FPL-Token": "nope"})
    assert r.status_code == 401


def test_my_team_not_found(client):
    r = client.get("/api/manager/1/my-team", headers={"X-FPL-Token": GOOD})
    assert r.status_code == 404


def test_client_sends_token_and_never_caches():
    fpl_client.clear_cache()
    seen = []

    def fake_get(url, headers=None, timeout=None):
        seen.append(headers)
        return httpx.Response(200, json=ME, request=httpx.Request("GET", url))

    with mock.patch("app.fpl_client.httpx.get", side_effect=fake_get):
        assert fpl_client.get_me("abc") == ME
        fpl_client.get_me("abc")
    assert seen == [{"X-Api-Authorization": "Bearer abc"}] * 2
    assert fpl_client._cache == {}


def test_client_maps_auth_failure():
    resp = httpx.Response(401, request=httpx.Request("GET", "https://x"))
    with mock.patch("app.fpl_client.httpx.get", return_value=resp):
        with pytest.raises(FplAuthError):
            fpl_client.get_my_team(1, "bad")
