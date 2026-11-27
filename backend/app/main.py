"""FastAPI application entrypoint."""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine
from .etl import db_is_empty, refresh
from .routers import admin, api
from .scheduler import start as start_scheduler, stop as stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("fpl.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    start_scheduler()
    if settings.etl_on_startup_if_empty and db_is_empty():
        log.info("empty database - running initial ingestion in background")
        threading.Thread(target=refresh, daemon=True).start()
    yield
    stop_scheduler()


app = FastAPI(title="FPL Core API", version="0.1.0", lifespan=lifespan)

# permissive for now; tighten when the frontend origin is known
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(api)
app.include_router(admin)
