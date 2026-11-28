"""Transfer suggestions for a manager's squad, from live FPL data.

A squad player is flagged when they may not play (injured, suspended,
doubtful) or when managers are selling them (FPL predicts a price drop, or
they're well on the way to one), with the likely reason: tough fixtures or
poor form. For each, the suggestions are same-position players that managers
are buying and who are close to a price rise, that fit the budget (selling
price + bank) and the three-per-club rule.

A suggestion's ``priced_out_risk`` is set ("rise", "drop" or "both") when a likely price rise for the
target (or drop for the player going out) at the next update would leave the
transfer unaffordable: make it before the deadline or lose it.
"""

from datetime import datetime
from typing import Any

from .prices import next_price_update

UNAVAILABLE = {"i": "Injured", "s": "Suspended", "n": "Not available", "u": "Not available"}
FIXTURE_WINDOW = 3  # gameweeks of fixtures used for "tough fixtures"
TOUGH_FDR = 3.6  # average FDR at or above this counts as tough
POOR_FORM = 2.0  # FPL form (avg points over the last 30 days) at or below this
SELLING_PROGRESS = -50.0  # halfway to a price drop
BUYING_PROGRESS = 50.0  # halfway to a price rise
LIKELY = 4  # FPL's likelihood score for "likely" (5 = very likely)
MAX_PER_CLUB = 3
MAX_OPTIONS = 3


def _f(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _next_projection(p: dict[str, Any]) -> tuple[float | None, int]:
    proj = sorted(p.get("price_change_projections") or [], key=lambda x: x["offset"])
    if not proj:
        return None, 0
    pct = proj[0].get("projected_percent")
    return (None if pct in (None, "") else float(pct)), proj[0].get("likelihood") or 0


def _locked(p: dict[str, Any], now: datetime) -> bool:
    until = p.get("price_change_locked_until")
    return bool(until and datetime.fromisoformat(until.replace("Z", "+00:00")) > now)


def selling_price(now_cost: int, purchase_price: int | None) -> int:
    """FPL keeps half of any rise (rounded down) and passes on every fall."""
    if purchase_price is None or now_cost <= purchase_price:
        return now_cost
    return purchase_price + (now_cost - purchase_price) // 2


def _fixtures_by_team(
    fixtures: list[dict[str, Any]], teams: dict[int, dict], start: int | None
) -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {t: [] for t in teams}
    if start is None:
        return out
    window = range(start, start + FIXTURE_WINDOW)
    for fx in sorted(fixtures, key=lambda f: (f.get("event") or 0, f.get("kickoff_time") or "")):
        if fx.get("event") not in window:
            continue
        for home in (True, False):
            team, opp = (fx["team_h"], fx["team_a"]) if home else (fx["team_a"], fx["team_h"])
            if team in out and opp in teams:
                out[team].append(
                    {
                        "event": fx["event"],
                        "opponent_short": teams[opp]["short_name"],
                        "is_home": home,
                        "difficulty": fx["team_h_difficulty" if home else "team_a_difficulty"],
                    }
                )
    return out


def _avg_fdr(fxs: list[dict[str, Any]]) -> float | None:
    return sum(f["difficulty"] for f in fxs) / len(fxs) if fxs else None


def build_suggestions(
    boot: dict[str, Any],
    fixtures: list[dict[str, Any]],
    squad: list[dict[str, Any]],
    bank: int,
    now: datetime,
    exact: bool,
) -> dict[str, Any]:
    """``squad``: [{"element", "purchase_price", "selling_price"}], prices in
    tenths or None (unknown without the manager's token); ``bank`` in
    tenths. ``exact`` says whether the purchase prices (so selling prices) and
    bank are the manager's real ones (token) or estimates."""
    players = {p["id"]: p for p in boot["elements"]}
    teams = {t["id"]: t for t in boot["teams"]}
    types = {t["id"]: t for t in boot["element_types"]}
    next_event = next(
        (e["id"] for e in boot["events"] if e.get("is_next")),
        next((e["id"] for e in boot["events"] if not e.get("finished")), None),
    )
    upcoming = _fixtures_by_team(fixtures, teams, next_event)

    owned = {s["element"] for s in squad if s["element"] in players}
    club_count: dict[int, int] = {}
    for el in owned:
        club_count[players[el]["team"]] = club_count.get(players[el]["team"], 0) + 1

    def describe(p: dict[str, Any]) -> dict[str, Any]:
        team = teams[p["team"]]
        pct, likelihood = _next_projection(p)
        fxs = upcoming.get(p["team"], [])
        return {
            "id": p["id"],
            "web_name": p["web_name"],
            "team_code": team["code"],
            "team_short": team["short_name"],
            "position_short": types[p["element_type"]]["singular_name_short"],
            "now_cost": p["now_cost"],
            "form": _f(p.get("form")),
            "status": p["status"],
            "news": p.get("news") or "",
            "chance_of_playing": p.get("chance_of_playing_next_round"),
            "progress": _f(p.get("price_change_percent")),
            "predicted_progress": pct,
            "likelihood": likelihood,
            "transfers_in_event": p.get("transfers_in_event") or 0,
            "transfers_out_event": p.get("transfers_out_event") or 0,
            "fixtures": fxs,
            "avg_fdr": _avg_fdr(fxs),
        }

    def likely_rise(p: dict[str, Any]) -> bool:
        pct, likelihood = _next_projection(p)
        return not _locked(p, now) and (likelihood >= LIKELY or (pct or 0) >= 100)

    def likely_drop(p: dict[str, Any]) -> bool:
        pct, likelihood = _next_projection(p)
        return not _locked(p, now) and (likelihood <= -LIKELY or (pct or 0) <= -100)

    def reasons_for(p: dict[str, Any]) -> list[dict[str, str]]:
        reasons = []
        chance = p.get("chance_of_playing_next_round")
        if p["status"] in UNAVAILABLE:
            reasons.append({"kind": "unavailable", "label": UNAVAILABLE[p["status"]]})
        elif p["status"] == "d" or (chance is not None and chance < 100):
            label = f"Doubtful ({chance}%)" if chance is not None else "Doubtful"
            reasons.append({"kind": "doubtful", "label": label})

        progress = _f(p.get("price_change_percent"))
        selling = likely_drop(p) or (
            not _locked(p, now)
            and progress <= SELLING_PROGRESS
            and (p.get("price_change_hourly_rate") or 0) < 0
        )
        if selling:
            reasons.append(
                {
                    "kind": "selling",
                    "label": "Likely to drop in price" if likely_drop(p) else "Being sold",
                }
            )
            fdr = _avg_fdr(upcoming.get(p["team"], []))
            if fdr is not None and fdr >= TOUGH_FDR:
                reasons.append(
                    {
                        "kind": "fixtures",
                        "label": f"Tough fixtures (FDR {fdr:.1f} next {FIXTURE_WINDOW})",
                    }
                )
            if _f(p.get("form")) <= POOR_FORM:
                reasons.append({"kind": "form", "label": f"Poor form ({_f(p.get('form')):.1f})"})
        return reasons

    def is_target(p: dict[str, Any]) -> bool:
        pct, likelihood = _next_projection(p)
        return (
            p["status"] == "a"
            and p.get("chance_of_playing_next_round") in (None, 100)
            and not _locked(p, now)
            and _f(p.get("form")) > POOR_FORM  # a rise alone isn't a reason to buy
            and (p.get("price_change_hourly_rate") or 0) > 0
            and (
                likelihood >= LIKELY - 1
                or _f(p.get("price_change_percent")) >= BUYING_PROGRESS
                or (pct or 0) >= BUYING_PROGRESS
            )
        )

    targets = [p for p in boot["elements"] if p["id"] not in owned and is_target(p)]

    flagged = []
    for s in squad:
        out = players.get(s["element"])
        if out is None:
            continue
        reasons = reasons_for(out)
        if not reasons:
            continue
        sell = s.get("selling_price") or selling_price(out["now_cost"], s.get("purchase_price"))
        budget = sell + bank
        # what the budget becomes if the player going out drops tonight
        sell_after = selling_price(out["now_cost"] - 1, s.get("purchase_price"))
        out_drops = likely_drop(out)
        budget_after = (sell_after if out_drops else sell) + bank

        options = []
        for t in targets:
            if t["element_type"] != out["element_type"] or t["now_cost"] > budget:
                continue
            if t["team"] != out["team"] and club_count.get(t["team"], 0) >= MAX_PER_CLUB:
                continue
            rises = likely_rise(t)
            if rises and t["now_cost"] + 1 > budget:
                priced_out = "rise"  # the target's rise alone puts it out of reach
            elif out_drops and t["now_cost"] > budget_after:
                priced_out = "drop"  # the outgoing player's drop alone does
            elif t["now_cost"] + (1 if rises else 0) > budget_after:
                priced_out = "both"
            else:
                priced_out = None
            options.append(
                {
                    **describe(t),
                    "bank_after": budget - t["now_cost"],
                    "likely_rise": rises,
                    "priced_out_risk": priced_out,
                }
            )
        # closest to a rise first, then form
        options.sort(
            key=lambda o: (-(o["predicted_progress"] or o["progress"]), -o["form"], o["id"])
        )
        flagged.append(
            {
                "out": {**describe(out), "selling_price": sell, "likely_drop": out_drops},
                "reasons": reasons,
                "budget": budget,
                "options": options[:MAX_OPTIONS],
            }
        )

    # can't-play first, then the rest in squad order
    order = {"unavailable": 0, "doubtful": 1, "selling": 2}
    flagged.sort(key=lambda f: order.get(f["reasons"][0]["kind"], 3))
    return {
        "exact": exact,
        "bank": bank,
        "next_event": next_event,
        "next_price_update": next_price_update(now),
        "suggestions": flagged,
    }
