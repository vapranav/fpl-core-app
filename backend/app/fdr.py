"""Fixture difficulty ratings, mirroring fantasy.premierleague.com/fixtures/fdr.

FPL rates every fixture 1 (easiest) to 5 (hardest) for each side; /fixtures/
carries both ratings. This regroups them per team, one entry per fixture, so
the frontend can lay out a team x gameweek grid (blank and double gameweeks
included).
"""

from typing import Any


def build_fdr(boot: dict[str, Any], fixtures: list[dict[str, Any]]) -> dict[str, Any]:
    teams = {t["id"]: t for t in boot["teams"]}
    rows: dict[int, list[dict[str, Any]]] = {tid: [] for tid in teams}
    for fx in fixtures:
        if fx.get("event") is None:  # postponed, not yet rescheduled
            continue
        for home in (True, False):
            team, opp = (fx["team_h"], fx["team_a"]) if home else (fx["team_a"], fx["team_h"])
            if team not in rows or opp not in teams:
                continue
            rows[team].append(
                {
                    "event": fx["event"],
                    "opponent_id": opp,
                    "opponent_short": teams[opp]["short_name"],
                    "opponent_code": teams[opp]["code"],
                    "is_home": home,
                    "difficulty": fx["team_h_difficulty" if home else "team_a_difficulty"],
                    "kickoff_time": fx.get("kickoff_time"),
                    "finished": bool(fx.get("finished")),
                }
            )
    for fxs in rows.values():
        fxs.sort(key=lambda f: (f["event"], f["kickoff_time"] or ""))

    events = boot["events"]
    upcoming = next(
        (e["id"] for e in events if e.get("is_next")),
        next((e["id"] for e in events if not e.get("finished")), None),
    )
    return {
        "events": [
            {
                "id": e["id"],
                "name": e["name"],
                "deadline_time": e.get("deadline_time"),
                "finished": bool(e.get("finished")),
            }
            for e in events
        ],
        "next_event": upcoming,
        "teams": [
            {
                "id": t["id"],
                "code": t["code"],
                "name": t["name"],
                "short_name": t["short_name"],
                "fixtures": rows[t["id"]],
            }
            for t in sorted(teams.values(), key=lambda t: t["name"])
        ],
    }
