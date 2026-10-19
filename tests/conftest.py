"""Test setup: each test gets a fresh database in a temp folder.

Your real data in Homebase/data is never touched by tests.
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import config, db
from app.seed import seed


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "homebase.db")
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(config, "EXPORT_DIR", tmp_path / "exports")
    monkeypatch.setenv("HOMEBASE_TODAY", "2026-11-03")  # prep week 3
    db.reset_engine()
    db.init_db()
    yield tmp_path
    db.reset_engine()


@pytest.fixture
def session(data_dir):
    with Session(db.get_engine()) as s:
        seed(s)
        yield s


@pytest.fixture
def client(session):
    from app.main import create_app

    app = create_app(run_lifespan=False)  # seeding already done; no backup loop in tests
    with TestClient(app) as c:
        yield c
