"""Price-change predictions, mirroring fantasy.premierleague.com/price-changes.

bootstrap-static carries FPL's own price-change predictions for every player
(progress towards a change, projections for the next updates with a
likelihood score, and price locks); stats/price-changes/ lists every change
made this season. This builds the two tables FPL's page shows.
"""

import math
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")
# FPL changes prices at midnight UK time.
PRICE_UPDATE_UK = time(0, 0)
# FPL's page leaves out players who are no longer available (left the league, etc.).
HIDDEN_STATUS = "u"

_LIKELIHOOD_LABELS = {
    5: "Very likely to rise",
    4: "Likely to rise",
    -4: "Likely to drop",
    -5: "Very likely to drop",
}


def next_price_update(now: datetime) -> datetime:
    local = now.astimezone(UK)
    candidate = datetime.combine(local.date(), PRICE_UPDATE_UK, tzinfo=UK)
    if candidate <= local:
        candidate = datetime.combine(local.date() + timedelta(days=1), PRICE_UPDATE_UK, tzinfo=UK)
    return candidate.astimezone(UTC)


def _float(v: Any) -> float | None:
    return None if v in (None, "") else float(v)


def _parse_time(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def status_label(
    likelihood: int, locked_until: datetime | None, calibrating: bool, now: datetime
) -> str:
    """The wording FPL's price-changes page uses for each player."""
    if locked_until and locked_until > now:
        days = math.ceil((locked_until - now).total_seconds() / 86400)
        return f"Unlocks in {days} day{'' if days == 1 else 's'}"
    if calibrating:
        return "Calibrating"
    return _LIKELIHOOD_LABELS.get(likelihood, "Unlikely to change")


def build_price_changes(
    fetched_at: datetime, boot: dict[str, Any], history: list[dict[str, Any]]
) -> dict[str, Any]:
    players = {p["id"]: p for p in boot["elements"]}
    teams = {t["id"]: t for t in boot["teams"]}
    types = {t["id"]: t for t in boot["element_types"]}

    def base(p: dict[str, Any]) -> dict[str, Any]:
        team = teams[p["team"]]
        return {
            "id": p["id"],
            "web_name": p["web_name"],
            "team_code": team["code"],
            "team_short": team["short_name"],
            "team_name": team["name"],
            "position_short": types[p["element_type"]]["singular_name_short"],
            "status": p["status"],
            "news": p.get("news") or "",
            "now_cost": p["now_cost"],
            "selected_by_percent": float(p.get("selected_by_percent") or 0),
        }

    predictions = []
    for p in boot["elements"]:
        if p["status"] == HIDDEN_STATUS:
            continue
        projections = [
            {
                "offset": x["offset"],
                "projected_percent": _float(x.get("projected_percent")),
                "likelihood": x["likelihood"],
            }
            for x in sorted(p.get("price_change_projections") or [], key=lambda x: x["offset"])
        ]
        nxt = projections[0] if projections else None
        likelihood = nxt["likelihood"] if nxt else 0
        progress = _float(p.get("price_change_percent")) or 0.0
        rate = p.get("price_change_hourly_rate") or 0
        locked = _parse_time(p.get("price_change_locked_until"))
        calibrating = bool(p.get("price_change_calibrating"))
        is_locked = bool(locked and locked > fetched_at)
        if is_locked or calibrating:
            direction = None
        else:
            direction = "rise" if likelihood >= 4 else "drop" if likelihood <= -4 else None
        # Net transfers flowing in or out right now; with no flow, the side the
        # player is already on.
        if rate:
            trend = "up" if rate > 0 else "down"
        else:
            trend = "down" if str(p.get("price_change_percent", "")).startswith("-") else "up"
        predictions.append(
            {
                **base(p),
                "progress": progress,
                "predicted_progress": nxt["projected_percent"] if nxt else None,
                "likelihood": likelihood,
                "status_label": status_label(likelihood, locked, calibrating, fetched_at),
                "locked": is_locked,
                "direction": direction,
                "trend": trend,
                "hourly_rate": rate,
                "locked_until": locked,
                "calibrating": calibrating,
                "projections": projections,
            }
        )
    # Same order as FPL: furthest towards a change (either way) first, ties by id.
    predictions.sort(key=lambda r: (-abs(r["progress"]), r["id"]))

    recent = [
        {
            **base(players[c["element"]]),
            "event": c.get("event"),
            "changed_at": _parse_time(c["changed_at"]),
            "cost_before": c["cost_before"],
            "cost_after": c["cost_after"],
        }
        for c in history
        if c["element"] in players
    ]
    recent.sort(key=lambda r: r["changed_at"], reverse=True)

    return {
        "fetched_at": fetched_at,
        "next_update_at": next_price_update(fetched_at),
        "current_event": next((e["id"] for e in boot["events"] if e.get("is_current")), None),
        "predictions": predictions,
        "recent_changes": recent,
    }
