"""Mini-league insights: season history per member and squad overlap.

Everything comes from the official public FPL API, one request per league
member. The client is synchronous, so member requests fan out over a small
thread pool; a member whose request fails is left out rather than failing the
whole response.
"""

import logging
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

log = logging.getLogger("fpl.leagues")

FANOUT = 8
DEFAULT_HISTORY_MEMBERS = 20
MAX_MEMBERS = 50


def fan_out[T, R](fn: Callable[[T], R], items: Iterable[T]) -> list[R | None]:
    """fn over items concurrently, in order; None where a call failed."""

    def safe(item: T) -> R | None:
        try:
            return fn(item)
        except Exception as e:  # one member's failure shouldn't sink the page
            log.warning("FPL request failed for %s: %s", item, e)
            return None

    items = list(items)
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=min(FANOUT, len(items))) as pool:
        return list(pool.map(safe, items))


def member_series(history: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "event": g["event"],
            "points": g["points"],
            "total_points": g["total_points"],
            "overall_rank": g.get("overall_rank"),
            "value": g.get("value"),
            "bank": g.get("bank"),
            "points_on_bench": g.get("points_on_bench"),
            "event_transfers_cost": g.get("event_transfers_cost"),
        }
        for g in history.get("current", [])
    ]


def chips_used(history: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    """Chips played this season, in gameweek order: [{name, event}]."""
    if history is None:
        return None
    return sorted(
        ({"name": c["name"], "event": c["event"]} for c in history.get("chips", [])),
        key=lambda c: c["event"],
    )


def build_overlap(
    my_picks: list[dict],
    rivals: list[tuple[dict, dict]],
    players: dict[int, dict],
) -> dict[str, Any]:
    """Compare the manager's squad with each rival's.

    rivals: (standings row, picks payload) pairs. players: element id ->
    {web_name, team_short, position} (unknown ids fall back to "#id").
    """

    def info(pick: dict) -> dict:
        p = players.get(pick["element"], {})
        return {
            "element": pick["element"],
            "web_name": p.get("web_name") or f"#{pick['element']}",
            "team_short": p.get("team_short"),
            "position": p.get("position"),
            "squad_position": pick["position"],  # 12-15 = bench
        }

    mine = sorted(my_picks, key=lambda p: p["position"])
    my_ids = {p["element"] for p in mine}
    my_captain = next((p["element"] for p in mine if p["is_captain"]), None)
    owned_by = dict.fromkeys(my_ids, 0)

    members = []
    for row, picks in rivals:
        theirs = sorted(picks["picks"], key=lambda p: p["position"])
        their_ids = {p["element"] for p in theirs}
        captain = next((p for p in theirs if p["is_captain"]), None)
        shared = [p for p in mine if p["element"] in their_ids]
        for p in shared:
            owned_by[p["element"]] += 1
        members.append(
            {
                "entry": row["entry"],
                "entry_name": row["entry_name"],
                "player_name": row["player_name"],
                "rank": row["rank"],
                "active_chip": picks.get("active_chip"),
                "captain": info(captain) if captain else None,
                "same_captain": captain is not None and captain["element"] == my_captain,
                "shared": [info(p) for p in shared],
                "mine_only": [info(p) for p in mine if p["element"] not in their_ids],
                "theirs_only": [info(p) for p in theirs if p["element"] not in my_ids],
            }
        )
    # most similar squads first
    members.sort(key=lambda m: (-len(m["shared"]), m["rank"]))

    return {
        "squad_size": len(mine),
        "total_members": len(members),
        "my_squad": [
            {**info(p), "is_captain": p["is_captain"], "owned_by": owned_by[p["element"]]}
            for p in mine
        ],
        "members": members,
    }
