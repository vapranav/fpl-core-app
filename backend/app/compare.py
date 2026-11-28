"""Side-by-side player comparison.

Live season stats, per-GW history and upcoming fixtures come from the official
FPL API (bootstrap-static + element-summary). Week-on-week trends (expected
points, ownership) come from the FPL-Core-Insights cumulative snapshots in our
own DB, since the FPL API only exposes current values.
"""

from typing import Any

UPCOMING_FIXTURES = 5

# bootstrap-static element fields copied through as numbers (FPL sends many as strings)
_FLOAT_FIELDS = [
    "selected_by_percent",
    "form",
    "points_per_game",
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "expected_goals_conceded",
    "ict_index",
    "influence",
    "creativity",
    "threat",
    "value_season",
    "expected_goals_per_90",
    "expected_assists_per_90",
    "expected_goal_involvements_per_90",
    "expected_goals_conceded_per_90",
    "saves_per_90",
    "clean_sheets_per_90",
    "defensive_contribution_per_90",
]
_INT_FIELDS = [
    "now_cost",
    "total_points",
    "event_points",
    "minutes",
    "starts",
    "goals_scored",
    "assists",
    "clean_sheets",
    "goals_conceded",
    "bonus",
    "bps",
    "defensive_contribution",
    "saves",
    "yellow_cards",
    "red_cards",
    "transfers_in_event",
    "transfers_out_event",
    "dreamteam_count",
    "tackles",
    "clearances_blocks_interceptions",
    "recoveries",
]
# nullable: absent before a player has a rank / set-piece role
_OPTIONAL_FIELDS = [
    "chance_of_playing_next_round",
    "penalties_order",
    "corners_and_indirect_freekicks_order",
    "direct_freekicks_order",
    "form_rank",
    "ict_index_rank",
    "selected_rank",
    "points_per_game_rank",
    "now_cost_rank",
]


def _f(v: Any) -> float:
    return float(v or 0)


def _opt_f(v: Any) -> float | None:
    return None if v in (None, "") else float(v)


def build_player(
    raw: dict,
    summary: dict,
    teams: dict[int, dict],
    types: dict[int, dict],
    trend: list[dict],
) -> dict:
    team = teams[raw["team"]]
    history = [
        {
            "event": h["round"],
            "opponent_short": teams[h["opponent_team"]]["short_name"],
            "was_home": h["was_home"],
            "total_points": h["total_points"],
            "minutes": h["minutes"],
            "goals_scored": h["goals_scored"],
            "assists": h["assists"],
            "expected_goals": _f(h.get("expected_goals")),
            "expected_assists": _f(h.get("expected_assists")),
            "defensive_contribution": h.get("defensive_contribution") or 0,
            "value": h["value"],
        }
        for h in summary.get("history", [])
    ]
    fixtures = [
        {
            "event": fx["event"],
            "opponent_short": teams[fx["team_a"] if fx["is_home"] else fx["team_h"]]["short_name"],
            "is_home": fx["is_home"],
            "difficulty": fx["difficulty"],
            "kickoff_time": fx["kickoff_time"],
        }
        for fx in summary.get("fixtures", [])[:UPCOMING_FIXTURES]
    ]
    return {
        "id": raw["id"],
        "web_name": raw["web_name"],
        "full_name": f"{raw['first_name']} {raw['second_name']}",
        "team_code": team["code"],
        "team_short": team["short_name"],
        "team_name": team["name"],
        "position_short": types[raw["element_type"]]["singular_name_short"],
        "status": raw["status"],
        "news": raw.get("news") or "",
        **{k: _f(raw.get(k)) for k in _FLOAT_FIELDS},
        **{k: int(raw.get(k) or 0) for k in _INT_FIELDS},
        **{k: raw.get(k) for k in _OPTIONAL_FIELDS},
        "ep_next": _opt_f(raw.get("ep_next")),
        "ep_this": _opt_f(raw.get("ep_this")),
        "cost_change_start": (raw.get("cost_change_start") or 0) / 10,
        "history": history,
        "fixtures": fixtures,
        "trend": trend,
    }
