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
from .scheduler import start as start_scheduler
from .scheduler import stop as stop_scheduler

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fpl-core-app.vercel.app",
        "http://localhost:3000",
    ],
    # Vercel PR preview deployments: fpl-core-app-<hash>-<user>.vercel.app
    allow_origin_regex=r"https://fpl-core-app-[a-z0-9-]+\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(api)
app.include_router(admin)
