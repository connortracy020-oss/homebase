"""Homebase as a desktop app.

The Start menu / desktop shortcut runs this with pythonw (no console window):
  1. If Homebase isn't already running on port 8254, start it in the
     background (hidden), with the same Python the firewall already allows,
     so your phone can still reach it over Tailscale.
  2. Open Homebase in its own app window (Edge or Chrome "app mode": no tabs,
     no address bar, its own taskbar icon).

Closing the window leaves the server running for your phone. To stop it,
use Settings > Desktop app > Stop Homebase.

Server output goes to data/logs/server.log.
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("HOMEBASE_PORT", "8254"))
URL = f"http://localhost:{PORT}"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"  # not pythonw: keep the firewall rule that already allows it
DATA = Path(os.environ.get("HOMEBASE_DATA", ROOT / "data"))
BROWSERS = [
    Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
    Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
]
CREATE_NO_WINDOW = 0x08000000
CREATE_NEW_PROCESS_GROUP = 0x00000200


def message(text: str, title: str = "Homebase") -> None:
    ctypes.windll.user32.MessageBoxW(None, text, title, 0x40)


def running() -> str:
    """'homebase' if Homebase answers on the port, 'other' if something else does, '' if nothing."""
    try:
        with urllib.request.urlopen(f"{URL}/static/manifest.webmanifest", timeout=1.5) as r:
            return "homebase" if json.loads(r.read()).get("name") == "Homebase" else "other"
    except Exception as e:  # noqa: BLE001
        return "other" if getattr(e, "code", None) else ""


def start_server() -> None:
    logs = DATA / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    log = open(logs / "server.log", "a", encoding="utf-8")
    log.write(f"\n---- started by the desktop app {time.strftime('%Y-%m-%d %H:%M:%S')} ----\n")
    log.flush()
    subprocess.Popen([str(PYTHON), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(PORT)],
                     cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                     creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP, close_fds=True)


def open_window() -> None:
    browser = next((b for b in BROWSERS if b.exists()), None)
    if browser is None:
        import webbrowser
        webbrowser.open(URL)
        return
    profile = DATA / "desktop" / browser.stem  # its own profile: own window size, own taskbar icon
    profile.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([str(browser), f"--app={URL}/", f"--user-data-dir={profile}", "--window-size=1240,880",
                      "--no-first-run", "--no-default-browser-check"], creationflags=CREATE_NO_WINDOW)


def main() -> int:
    state = running()
    if state == "other":
        message(f"Something else is using port {PORT}, so Homebase can't start there.\n\n"
                "Close that program, then open Homebase again.")
        return 1
    if state == "":
        if not PYTHON.exists():
            message("Homebase's Python environment (.venv) is missing.\n\nRun run.ps1 once to set it up.")
            return 1
        start_server()
        for _ in range(60):  # first start seeds the database; give it up to 30 s
            time.sleep(0.5)
            if running() == "homebase":
                break
        else:
            message(f"Homebase didn't start.\n\nSee {DATA / 'logs' / 'server.log'} for what went wrong.")
            return 1
    open_window()
    return 0


if __name__ == "__main__":
    sys.exit(main())
