"""Export and backup.

- export_all(): one zip with every table as JSON plus your uploads. This is
  your data in a format any program can read.
- backup_db(): a safe copy of the SQLite file into a synced folder (OneDrive
  by default), kept for 14 days. The app runs it at most once a day.
"""
import json
import os
import shutil
import sqlite3
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlmodel import Session, SQLModel

from . import config
from .models import Setting

KEEP_DAYS = 14


def _json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"can't export {type(value)}")


def dump_tables(session: Session) -> dict[str, list[dict]]:
    out = {}
    for table_name, table in SQLModel.metadata.tables.items():
        rows = session.connection().execute(table.select()).mappings().all()
        out[table_name] = [dict(r) for r in rows]
    return out


def export_all(session: Session) -> Path:
    config.EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = config.now().strftime("%Y-%m-%d_%H%M")
    path = config.EXPORT_DIR / f"homebase-export-{stamp}.zip"
    tables = dump_tables(session)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt",
                    "Homebase export. data.json has every table as a list of rows.\n"
                    "uploads/ has your submitted photos and PDFs.\n"
                    "labs/ has your Python lab files and their check results.\n")
        zf.writestr("data.json", json.dumps(tables, indent=2, default=_json_default))
        if config.UPLOAD_DIR.exists():
            for f in config.UPLOAD_DIR.rglob("*"):
                if f.is_file():
                    zf.write(f, Path("uploads") / f.relative_to(config.UPLOAD_DIR))
        lab_dir = config.DATA_DIR / "labs"
        if lab_dir.exists():
            for f in lab_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, Path("labs") / f.relative_to(lab_dir))
    return path


def get_setting(session: Session, key: str, default: str = "") -> str:
    row = session.get(Setting, key)
    return row.value if row else default


def set_setting(session: Session, key: str, value: str) -> None:
    row = session.get(Setting, key) or Setting(key=key)
    row.value = value
    session.add(row)
    session.commit()


def default_backup_dir() -> Path | None:
    onedrive = os.environ.get("OneDrive")
    if onedrive and Path(onedrive).exists():
        return Path(onedrive) / "Homebase backups"
    return None


def backup_dir(session: Session) -> Path | None:
    chosen = get_setting(session, "backup_dir")
    return Path(chosen) if chosen else default_backup_dir()


def backup_db(session: Session, target_dir: Path | None = None) -> Path:
    """Copy the database using SQLite's backup API (safe while the app runs)."""
    target_dir = target_dir or backup_dir(session)
    if target_dir is None:
        raise RuntimeError("No backup folder set (and no OneDrive folder found).")
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = config.now().strftime("%Y-%m-%d_%H%M")
    target = target_dir / f"homebase-{stamp}.db"
    src = sqlite3.connect(config.DB_PATH)
    dst = sqlite3.connect(target)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    if config.UPLOAD_DIR.exists():
        shutil.copytree(config.UPLOAD_DIR, target_dir / "uploads", dirs_exist_ok=True)
    if (config.DATA_DIR / "labs").exists():  # your lab files and check results
        shutil.copytree(config.DATA_DIR / "labs", target_dir / "labs", dirs_exist_ok=True)
    _prune(target_dir)
    set_setting(session, "last_backup", config.now().isoformat(timespec="minutes"))
    return target


def _prune(target_dir: Path) -> None:
    cutoff = config.now() - timedelta(days=KEEP_DAYS)
    for f in target_dir.glob("homebase-*.db"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()


def backup_if_due(session: Session) -> Path | None:
    """Back up if the last backup is over 20 hours old. Never raises.

    Set HOMEBASE_NO_BACKUP=1 to turn this off (used for throwaway test servers).
    """
    if os.environ.get("HOMEBASE_NO_BACKUP"):
        return None
    try:
        last = get_setting(session, "last_backup")
        if last and config.now() - datetime.fromisoformat(last) < timedelta(hours=20):
            return None
        if backup_dir(session) is None:
            return None
        return backup_db(session)
    except Exception as exc:  # a failed backup must never break the app
        set_setting(session, "last_backup_error", f"{config.now():%Y-%m-%d %H:%M} {exc}")
        return None
