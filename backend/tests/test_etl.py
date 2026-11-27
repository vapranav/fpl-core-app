"""ETL tests: layout discovery, coercion, dedupe, idempotency."""

from unittest import mock

from sqlalchemy import func, select

from app import etl
from app.db import SessionLocal
from app.models import (
    Match,
    Momentum,
    Player,
    PlayerMatchStats,
    PlayerStats,
    Shot,
    Team,
    XgByMinute,
)


def _count(model, season=None):
    with SessionLocal() as db:
        q = select(func.count()).select_from(model)
        if season:
            q = q.where(model.season == season)
        return db.scalar(q)


def test_refresh_loads_both_layouts(mock_source, clean_db):
    result = etl.refresh(force=True)
    assert result["status"] == "success"
    assert result["seasons"] == ["2098-2099", "2099-2000"]

    # both layouts contributed their master files
    assert _count(Team, "2099-2000") == 2
    assert _count(Team, "2098-2099") == 1
    assert _count(Player, "2099-2000") == 3
    assert _count(Player, "2098-2099") == 1

    # matches: current = concat of per-GW files, legacy = master file
    assert _count(Match, "2099-2000") == 3
    assert _count(Match, "2098-2099") == 1

    # fixtures: only the latest-GW snapshot, only the current layout has them
    from app.models import Fixture

    assert _count(Fixture, "2099-2000") == 5
    assert _count(Fixture, "2098-2099") == 0


def test_timeline_files_loaded(mock_source, clean_db):
    etl.refresh(force=True)
    # GW1 carries timeline files; GW2 has none (skipped gracefully)
    assert _count(Shot, "2099-2000") == 3
    assert _count(Momentum, "2099-2000") == 3
    assert _count(XgByMinute, "2099-2000") == 3
    with SessionLocal() as db:
        shot = db.get(Shot, ("2099-2000", "99-00-prem-alpha-fc-vs-beta-united", 1))
        assert shot.gw == 1
        assert shot.is_home is True
        assert shot.outcome == "goal"
        assert shot.xg == 0.45
        # missing player_id/xgot -> NULL; added_time coerced to float
        empty = db.get(Shot, ("2099-2000", "99-00-prem-alpha-fc-vs-beta-united", 3))
        assert empty.player_id is None
        assert empty.xgot is None
        assert empty.added_time == 2.0


def test_duplicate_pk_keeps_last(mock_source, clean_db):
    etl.refresh(force=True)
    with SessionLocal() as db:
        row = db.get(PlayerStats, ("2099-2000", 1, 2))
        assert row.total_points == 99  # last duplicate row wins
    assert _count(PlayerStats, "2099-2000") == 6  # 7 rows, 1 dup


def test_nan_becomes_null(mock_source, clean_db):
    etl.refresh(force=True)
    with SessionLocal() as db:
        row = db.get(PlayerStats, ("2099-2000", 1, 2))  # empty expected_goals
        assert row.expected_goals is None
        row = db.get(PlayerStats, ("2099-2000", 1, 1))
        assert row.expected_goals == 0.8


def test_gw_assigned_from_folder(mock_source, clean_db):
    etl.refresh(force=True)
    with SessionLocal() as db:
        gws = db.scalars(
            select(PlayerMatchStats.gw).where(PlayerMatchStats.season == "2099-2000")
        ).all()
        assert sorted(gws) == [1, 1, 2, 2]
        # legacy per-GW folder too
        legacy = db.scalars(
            select(PlayerMatchStats.gw).where(PlayerMatchStats.season == "2098-2099")
        ).all()
        assert legacy == [1]


def test_skip_when_commit_unchanged(mock_source, clean_db):
    assert etl.refresh()["status"] == "success"
    assert etl.refresh()["status"] == "skipped"


def test_force_reload_is_idempotent(mock_source, clean_db):
    etl.refresh(force=True)
    before = _count(PlayerStats, "2099-2000")
    result = etl.refresh(force=True)
    assert result["status"] == "success"
    assert _count(PlayerStats, "2099-2000") == before  # no duplicates


def test_gw_of():
    from pathlib import Path

    assert etl._gw_of(Path("/x/By Gameweek/GW12")) == 12
    assert etl._gw_of(Path("/x/By Gameweek/GW3/matches.csv")) == 3
    assert etl._gw_of(Path("/x/data/2099-2000/teams.csv")) is None


def test_coerce_drops_unknown_and_coerces_types():
    import pandas as pd

    df = pd.DataFrame(
        {
            "code": [10],
            "name": ["Alpha"],
            "elo": [1900.5],
            "brand_new_column": ["ignored"],
        }
    )
    out = etl._coerce(df, Team)
    assert "brand_new_column" not in out.columns
    assert out.iloc[0]["name"] == "Alpha"


def test_real_tarball_extracts(tmp_path):
    """_extract works on a genuine tar.gz (catches API drift)."""
    import tarfile

    src = tmp_path / "src" / "repo-abc123"
    (src / "data").mkdir(parents=True)
    (src / "data" / "x.txt").write_text("hi")
    tarball = tmp_path / "r.tar.gz"
    with tarfile.open(tarball, "w:gz") as tar:
        tar.add(src, arcname="repo-abc123")
    dest = tmp_path / "out"
    dest.mkdir()
    root = etl._extract(tarball, dest)
    assert (root / "data" / "x.txt").read_text() == "hi"


def test_refresh_uses_network_functions(mock_source, clean_db, monkeypatch):
    """refresh() fails loudly if the commit fetch raises."""
    monkeypatch.setattr(
        etl,
        "_latest_commit_sha",
        mock.Mock(side_effect=RuntimeError("github down")),
    )
    import pytest

    with pytest.raises(RuntimeError):
        etl.refresh(force=True)
    with SessionLocal() as db:
        from app.models import IngestionRun

        run = db.scalars(select(IngestionRun).order_by(IngestionRun.id.desc())).first()
        assert run.status == "failed"
        assert "github down" in run.error
