"""Tests for transfer suggestions (app.transfers) and their endpoint."""

from datetime import UTC, datetime
from unittest import mock

from fastapi.testclient import TestClient

from app.main import app
from app.transfers import build_suggestions, selling_price

NOW = datetime(2026, 11, 28, 12, 0, tzinfo=UTC)


def _p(id_, team, et, cost, **extra):
    return {
        "id": id_,
        "web_name": f"P{id_}",
        "team": team,
        "element_type": et,
        "now_cost": cost,
        "status": "a",
        "news": "",
        "chance_of_playing_next_round": None,
        "form": "5.0",
        "price_change_percent": "0.0",
        "price_change_hourly_rate": 0,
        "price_change_projections": [{"offset": 0, "projected_percent": "0.0", "likelihood": 0}],
        "price_change_locked_until": None,
        "transfers_in_event": 0,
        "transfers_out_event": 0,
        **extra,
    }


def _rising(pct="110.0", likelihood=5):
    return {
        "price_change_percent": "90.0",
        "price_change_hourly_rate": 300,
        "price_change_projections": [
            {"offset": 0, "projected_percent": pct, "likelihood": likelihood}
        ],
    }


TEAMS = [{"id": i, "code": 10 * i, "short_name": f"T{i}", "name": f"Team {i}"} for i in range(1, 5)]
TYPES = [{"id": 3, "singular_name_short": "MID"}, {"id": 4, "singular_name_short": "FWD"}]
EVENTS = [{"id": 12, "finished": True}, {"id": 13, "is_next": True}, {"id": 14}, {"id": 15}]
# team 1 faces 5s, team 2 faces 2s
FIXTURES = [
    {"event": gw, "team_h": 1, "team_a": 2, "team_h_difficulty": 5, "team_a_difficulty": 2}
    for gw in (13, 14, 15)
]


def _boot(elements):
    return {"elements": elements, "teams": TEAMS, "element_types": TYPES, "events": EVENTS}


def _build(elements, squad, bank, exact=False):
    return build_suggestions(_boot(elements), FIXTURES, squad, bank, NOW, exact)


def test_selling_price_keeps_half_of_a_rise():
    assert selling_price(60, None) == 60
    assert selling_price(63, 60) == 61  # +0.3 -> keep 0.1
    assert selling_price(58, 60) == 58  # falls pass straight on


def test_injured_player_gets_in_budget_rising_same_position_options():
    elements = [
        _p(1, 1, 3, 80, status="i", news="Hamstring"),
        _p(2, 2, 3, 84, **_rising()),  # 8.4 > 8.0 + 0.3 bank: over budget
        _p(3, 2, 3, 82, **_rising()),  # fits
        _p(4, 3, 4, 60, **_rising()),  # wrong position
        _p(5, 3, 3, 70, **_rising(), form="1.0"),  # poor form: not a target
        _p(6, 3, 3, 70),  # not rising
    ]
    body = _build(elements, [{"element": 1, "purchase_price": None}], bank=3)
    [s] = body["suggestions"]
    assert s["reasons"] == [{"kind": "unavailable", "label": "Injured"}]
    assert s["budget"] == 83
    assert [o["id"] for o in s["options"]] == [3]
    assert s["options"][0]["bank_after"] == 1


def test_sold_player_reasons_cover_fixtures_and_form():
    seller = _p(
        1,
        1,
        3,
        70,
        form="1.5",
        price_change_percent="-80.0",
        price_change_hourly_rate=-400,
        price_change_projections=[{"offset": 0, "projected_percent": "-105.0", "likelihood": -5}],
    )
    body = _build([seller, _p(2, 2, 3, 60)], [{"element": 1, "purchase_price": None}], bank=0)
    labels = [r["label"] for r in body["suggestions"][0]["reasons"]]
    assert labels == [
        "Likely to drop in price",
        "Tough fixtures (FDR 5.0 next 3)",
        "Poor form (1.5)",
    ]
    assert body["suggestions"][0]["out"]["likely_drop"] is True


def test_healthy_squad_has_no_suggestions():
    body = _build([_p(1, 1, 3, 70)], [{"element": 1, "purchase_price": None}], bank=0)
    assert body["suggestions"] == []


def test_priced_out_risk_flags():
    out = _p(1, 1, 3, 80, status="d", chance_of_playing_next_round=50)
    exact_fit = _p(2, 2, 3, 80, **_rising())  # rises to 8.1 > 8.0: rise
    room = _p(3, 3, 3, 78, **_rising())  # 7.9 after the rise: fine
    body = _build([out, exact_fit, room], [{"element": 1, "purchase_price": None}], bank=0)
    opts = {o["id"]: o for o in body["suggestions"][0]["options"]}
    assert opts[2]["priced_out_risk"] == "rise"
    assert opts[3]["priced_out_risk"] is None


def test_priced_out_by_own_players_drop():
    out = _p(
        1,
        1,
        3,
        80,
        status="d",
        chance_of_playing_next_round=25,
        price_change_projections=[{"offset": 0, "projected_percent": "-120.0", "likelihood": -5}],
    )
    target = _p(2, 2, 3, 80, **_rising("60.0", 3))  # not rising tonight
    body = _build([out, target], [{"element": 1, "purchase_price": None}], bank=0)
    assert body["suggestions"][0]["options"][0]["priced_out_risk"] == "drop"


def test_three_per_club_rule():
    squad_ids = [1, 2, 3, 4]
    elements = [
        _p(1, 1, 3, 60, status="i"),
        _p(2, 2, 4, 60),
        _p(3, 2, 4, 60),
        _p(4, 2, 4, 60),
        _p(5, 2, 3, 55, **_rising()),  # would be a 4th from team 2
        _p(6, 3, 3, 55, **_rising()),
    ]
    body = _build(elements, [{"element": i, "purchase_price": None} for i in squad_ids], bank=0)
    assert [o["id"] for o in body["suggestions"][0]["options"]] == [6]


def test_endpoint_uses_public_picks_without_token():
    elements = [_p(1, 1, 3, 80, status="i"), _p(2, 2, 3, 75, **_rising())]
    with (
        mock.patch("app.routers.get_entry", return_value={"id": 7, "current_event": 12}),
        mock.patch(
            "app.routers.get_picks",
            return_value={"picks": [{"element": 1}], "entry_history": {"bank": 5}},
        ),
        mock.patch("app.routers.get_bootstrap", return_value=(NOW, _boot(elements))),
        mock.patch("app.routers.get_fixtures", return_value=FIXTURES),
    ):
        r = TestClient(app).get("/api/manager/7/transfer-suggestions")
    body = r.json()
    assert r.status_code == 200
    assert body["exact"] is False and body["bank"] == 5
    assert body["suggestions"][0]["options"][0]["id"] == 2


def test_endpoint_uses_selling_prices_with_token():
    elements = [_p(1, 1, 3, 84, status="i"), _p(2, 2, 3, 83, **_rising("60.0", 3))]
    my_team = {
        "picks": [{"element": 1, "purchase_price": 80, "selling_price": 82}],
        "transfers": {"bank": 0},
    }
    with (
        mock.patch("app.routers.get_my_team", return_value=my_team) as gm,
        mock.patch("app.routers.get_bootstrap", return_value=(NOW, _boot(elements))),
        mock.patch("app.routers.get_fixtures", return_value=FIXTURES),
    ):
        r = TestClient(app).get(
            "/api/manager/7/transfer-suggestions", headers={"X-FPL-Token": "Bearer abc"}
        )
    gm.assert_called_once_with(7, "abc")
    body = r.json()
    assert body["exact"] is True
    # selling price 8.2, not the 8.4 now_cost, so the 8.3 target doesn't fit
    assert body["suggestions"][0]["budget"] == 82
    assert body["suggestions"][0]["options"] == []
