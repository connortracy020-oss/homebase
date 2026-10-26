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
from .routes import api, circuit_routes, exam_routes, local_routes, notes_routes, pages, reviews, speech_routes, study
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
    from . import speech
    speech.ENGINE.stop()  # don't leave the voice holding the GPU
    task.cancel()


def create_app(run_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title="Homebase", lifespan=lifespan if run_lifespan else None)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.middleware("http")
    async def revalidate_bench_modules(request, call_next):
        # the bench is many small ES modules imported by each other, so ?v= cache-busting on the
        # page can't reach them: make browsers check each one (a cheap 304 when unchanged)
        response = await call_next(request)
        if request.url.path.startswith("/static/circuits/"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    app.include_router(pages.router)
    app.include_router(study.router)
    app.include_router(reviews.router)
    app.include_router(exam_routes.router)
    app.include_router(local_routes.router)
    app.include_router(notes_routes.router)
    app.include_router(speech_routes.router)
    app.include_router(circuit_routes.router)
    app.include_router(api.router, prefix="/api")
    return app


app = create_app()
