"""Paths and settings in one place.

Everything Homebase stores lives in DATA_DIR (default: Homebase/data).
Moving the app to another computer means copying that one folder.
"""
import os
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
LIBRARY_DIR = ROOT / "library"
DATA_DIR = Path(os.environ.get("HOMEBASE_DATA", ROOT / "data"))
DB_PATH = DATA_DIR / "homebase.db"
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"

# OSU is in Corvallis, so all "today" logic uses Pacific time.
TZ = ZoneInfo("America/Los_Angeles")


def now() -> datetime:
    """Current Pacific time, without a tz attached.

    SQLite stores datetimes without a time zone, so every time in the
    database is Pacific local time. Keeping them all "naive" avoids mixing.
    """
    return datetime.now(TZ).replace(tzinfo=None)


def today() -> date:
    """Today's date in Pacific time.

    Set HOMEBASE_TODAY=2026-12-14 to pretend it's another day (handy for testing).
    """
    override = os.environ.get("HOMEBASE_TODAY")
    if override:
        return date.fromisoformat(override)
    return datetime.now(TZ).date()
