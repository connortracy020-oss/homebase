"""Database connection.

SQLite is one file (data/homebase.db). `get_session` hands each web request its
own session; `init_db` creates any missing tables.
"""
from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from . import config

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{config.DB_PATH}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")  # safer if the laptop sleeps mid-write
            cur.close()

    return _engine


def reset_engine():
    """Forget the current engine (tests use this to point at a temp folder)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def init_db():
    from . import models  # noqa: F401  (registers the tables)

    SQLModel.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
