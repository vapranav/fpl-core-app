"""APScheduler wiring: refresh the DB twice daily, after the repo's updates."""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .etl import refresh

log = logging.getLogger("fpl.scheduler")

_scheduler: BackgroundScheduler | None = None


def _job():
    try:
        refresh()
    except Exception:
        log.exception("scheduled refresh failed")


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _job,
        CronTrigger(hour=settings.refresh_hour, minute=settings.refresh_minute),
        id="dataset-refresh",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    log.info(
        "scheduler started: refresh at %s:%02d UTC",
        settings.refresh_hour,
        settings.refresh_minute,
    )
    return _scheduler


def stop() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
