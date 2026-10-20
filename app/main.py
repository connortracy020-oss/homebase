"""The web app.

    .venv\\Scripts\\python -m uvicorn app.main:app --host 0.0.0.0 --port 8254

Then open http://localhost:8254 (or your laptop's Tailscale name on the phone).
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from . import backup, config, local_ai
from .db import get_engine, init_db
from .routes import api, exam_routes, local_routes, pages, reviews, study
from .seed import seed

STATIC_DIR = config.ROOT / "app" / "static"


async def _daily_backup_loop():
    while True:
        with Session(get_engine()) as session:
            backup.backup_if_due(session)
        await asyncio.sleep(60 * 60)  # check once an hour


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with Session(get_engine()) as session:
        seed(session)  # pick up any content changes; progress is kept
    task = asyncio.create_task(_daily_backup_loop())
    local_ai.start_worker()  # runs local-AI jobs one at a time, politely
    yield
    local_ai.stop_worker()
    task.cancel()


def create_app(run_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title="Homebase", lifespan=lifespan if run_lifespan else None)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(pages.router)
    app.include_router(study.router)
    app.include_router(reviews.router)
    app.include_router(exam_routes.router)
    app.include_router(local_routes.router)
    app.include_router(api.router, prefix="/api")
    return app


app = create_app()
