r"""Check a Python lab. Run from the Homebase folder:

    .venv\Scripts\python labs\check.py 4

The first run copies the starter to data\labs\ for you to work in.
See app/labs.py for how the checker works.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `app` can be imported

from app.labs import main  # noqa: E402

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
