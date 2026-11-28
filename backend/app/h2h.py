"""Head-to-head history between two clubs, from football-data.co.uk.

Our dataset only reaches back a couple of seasons and FPL's API only has the
current one, so past meetings come from football-data.co.uk's free per-season
results CSVs: Premier League (E0) and the second tier (E1), back to 1993-94,
with full- and half-time scores and, from 2000-01, shots/cards/corners.

Season files are cached in-process: past seasons never change, the current one
is refreshed every few hours. A lookup walks back season by season (a few in
parallel) until it has enough meetings.
"""

import csv
import io
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from typing import Any

import httpx

log = logging.getLogger("fpl.h2h")

BASE = "https://football-data.co.uk/mmz4281"
TIMEOUT = 15.0
FIRST_SEASON = 1993  # earliest season with E0/E1 files
MAX_SEASONS = 34  # how far back a lookup may walk
CHUNK = 6  # seasons fetched in parallel per step
CURRENT_TTL = 6 * 3600

DIVISIONS = ("E0", "E1")

# FPL team name -> football-data.co.uk name, where stripping " City"/" Town"
# isn't enough
ALIASES = {
    "man utd": "Man United",
    "spurs": "Tottenham",
    "sheffield utd": "Sheffield United",
    "sheffield wednesday": "Sheffield Weds",
    "wolverhampton": "Wolves",
    "nottingham forest": "Nott'm Forest",
    "west bromwich albion": "West Brom",
    "queens park rangers": "QPR",
    "peterborough": "Peterboro",
    "brighton & hove albion": "Brighton",
    "afc bournemouth": "Bournemouth",
}

# (start year, division) -> (monotonic fetch time, rows)
_cache: dict[tuple[int, str], tuple[float, list[dict[str, Any]]]] = {}
_lock = threading.Lock()


def current_season_start(today: date | None = None) -> int:
    today = today or datetime.now(UTC).date()
    return today.year if today.month >= 7 else today.year - 1


def season_label(start: int) -> str:
    return f"{start}-{(start + 1) % 100:02d}"


def competition(div: str, start: int) -> str:
    if div == "E0":
        return "Premier League"
    return "Championship" if start >= 2004 else "First Division"


def fd_name(fpl_name: str) -> str:
    """football-data.co.uk's spelling of an FPL team name."""
    key = fpl_name.strip().lower()
    if key in ALIASES:
        return ALIASES[key]
    stripped = re.sub(r"\s+(City|Town|United|Utd|FC|AFC)$", "", fpl_name.strip())
    # "Man City" / "Man Utd" keep their suffix; "West Ham United" -> "West Ham"
    if fpl_name.strip().startswith("Man "):
        return fpl_name.strip()
    return stripped if stripped and stripped != "Sheffield" else fpl_name.strip()


def _num(v: str | None) -> int | None:
    try:
        return int(float(v)) if v not in (None, "") else None
    except ValueError:
        return None


def _date(v: str) -> date | None:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(v.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_csv(text: str, start: int, div: str) -> list[dict[str, Any]]:
    rows = []
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        d = _date(r.get("Date") or "")
        hg, ag = _num(r.get("FTHG")), _num(r.get("FTAG"))
        if d is None or hg is None or ag is None or not r.get("HomeTeam"):
            continue  # blank trailing lines, unplayed rows
        rows.append(
            {
                "date": d.isoformat(),
                "season": season_label(start),
                "competition": competition(div, start),
                "home": r["HomeTeam"].strip(),
                "away": (r.get("AwayTeam") or "").strip(),
                "home_score": hg,
                "away_score": ag,
                "home_ht": _num(r.get("HTHG")),
                "away_ht": _num(r.get("HTAG")),
                "home_shots": _num(r.get("HS")),
                "away_shots": _num(r.get("AS")),
                "home_shots_on_target": _num(r.get("HST")),
                "away_shots_on_target": _num(r.get("AST")),
                "home_red": _num(r.get("HR")),
                "away_red": _num(r.get("AR")),
                "referee": (r.get("Referee") or "").strip() or None,
            }
        )
    return rows


def _season_rows(start: int, div: str, current: int) -> list[dict[str, Any]]:
    key = (start, div)
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
    if hit and (start != current or now - hit[0] < CURRENT_TTL):
        return hit[1]
    code = f"{start % 100:02d}{(start + 1) % 100:02d}"
    r = httpx.get(f"{BASE}/{code}/{div}.csv", timeout=TIMEOUT, follow_redirects=True)
    if r.status_code == 404:
        rows: list[dict[str, Any]] = []  # e.g. the new season isn't published yet
    else:
        r.raise_for_status()
        # older files are Windows-1252; current ones UTF-8 with a BOM
        try:
            text = r.content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = r.content.decode("cp1252", errors="replace")
        rows = parse_csv(text, start, div)
    with _lock:
        _cache[key] = (now, rows)
    return rows


def meetings(team: str, opponent: str, limit: int = 6) -> list[dict[str, Any]]:
    """The last `limit` league meetings of two clubs (football-data names),
    newest first. Raises httpx errors if the source is unreachable."""
    current = current_season_start()
    pair = {team, opponent}
    found: list[dict[str, Any]] = []
    seasons = [s for s in range(current, current - MAX_SEASONS, -1) if s >= FIRST_SEASON]
    with ThreadPoolExecutor(max_workers=CHUNK * len(DIVISIONS)) as pool:
        for i in range(0, len(seasons), CHUNK):
            jobs = [(s, d) for s in seasons[i : i + CHUNK] for d in DIVISIONS]
            for rows in pool.map(lambda j: _season_rows(j[0], j[1], current), jobs):
                found.extend(m for m in rows if {m["home"], m["away"]} == pair)
            if len(found) >= limit:
                break
    found.sort(key=lambda m: m["date"], reverse=True)
    return found[:limit]


def known_names() -> set[str]:
    """Every club name in the seasons fetched so far."""
    with _lock:
        return {m[k] for _, rows in _cache.values() for m in rows for k in ("home", "away")}


def clear_cache() -> None:
    with _lock:
        _cache.clear()
