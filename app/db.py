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

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns(engine)


def _add_missing_columns(engine):
    """Tiny migration: when a later stage adds a column to an existing table,
    add it to your existing database file instead of starting over."""
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            have = {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info("{table.name}")')}
            for col in table.columns:
                if col.name in have:
                    continue
                coltype = col.type.compile(dialect=engine.dialect)
                default = ""
                if col.default is not None and getattr(col.default, "is_scalar", False):
                    value = col.default.arg
                    default = f" DEFAULT {int(value) if isinstance(value, bool) else repr(value)}"
                elif not col.nullable:
                    default = " DEFAULT ''" if "CHAR" in coltype or "TEXT" in coltype else " DEFAULT 0"
                conn.exec_driver_sql(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {coltype}{default}')


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
