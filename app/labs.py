"""Python labs: load them from content, run the auto-checker, keep the results.

A lab is listed in content/<course>/weekNN.json under "labs" (see content/README.md).
Each lab has a starter file in labs/<course>/ with TODO functions. The first time
you check a lab, the starter is copied to data/labs/ and you work in that copy, so
the starter in git stays clean.

The checks for each lab live in app/lab_checks/<course>.py. A check calls one of
your functions and compares what it returns with NumPy/SciPy. Each check ends up:

  pass   your answer matches the reference
  fail   it doesn't (the message says how far off it is)
  todo   the function still returns None (not written yet)
  error  your code crashed (the message shows the error)

Run it from the Homebase folder:

    .venv\\Scripts\\python labs\\check.py 4          # ECE 200 lab 4
    .venv\\Scripts\\python labs\\check.py 4 --file C:\\somewhere\\my_lab4.py
"""
import ast
import importlib.util
import inspect
import json
import shutil
import sys
import textwrap
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from app import config

COURSES_WITH_LABS = ("ece200",)


# ---- lab content --------------------------------------------------------------------

def load_labs(code: str) -> list[dict]:
    """Every lab of a course, in week order. Each one gets its "week" filled in."""
    folder = config.CONTENT_DIR / code.lower()
    labs = []
    for week_file in sorted(folder.glob("week[0-9][0-9].json")):
        wk = json.loads(week_file.read_text(encoding="utf-8"))
        for lab in wk.get("labs", []):
            labs.append({**lab, "week": wk["week"], "course": code.upper()})
    return labs


def labs_for_week(code: str, week: int) -> list[dict]:
    return [lab for lab in load_labs(code) if lab["week"] == week]


def find_lab(lab_id_or_number: str) -> dict | None:
    """Find a lab by id ("ece200-lab04") or by number ("4", meaning ECE 200 lab 4)."""
    for code in COURSES_WITH_LABS:
        for lab in load_labs(code):
            if lab["id"] == lab_id_or_number or str(lab["number"]) == str(lab_id_or_number).lstrip("0"):
                return lab
    return None


# ---- where your work and results are kept --------------------------------------------

def lab_dir() -> Path:
    return config.DATA_DIR / "labs"


def work_file(lab: dict) -> Path:
    """Your copy of the starter, e.g. data/labs/lab04_fir.py."""
    return lab_dir() / Path(lab["starter"]).name


def result_file(lab: dict) -> Path:
    return lab_dir() / "results" / f"{lab['id']}.json"


def make_work_copy(lab: dict) -> tuple[Path, bool]:
    """Copy the starter to data/labs/ if you don't have a copy yet. Returns (path, made_new)."""
    target = work_file(lab)
    if target.exists():
        return target, False
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(config.ROOT / lab["starter"], target)
    return target, True


def last_result(lab: dict) -> dict | None:
    path = result_file(lab)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def save_result(lab: dict, results: list["CheckResult"], checked_file: Path) -> dict:
    record = {
        "lab": lab["id"],
        "checked_at": config.now().isoformat(timespec="minutes"),
        "file": str(checked_file),
        "passed": sum(1 for r in results if r.status == "pass"),
        "total": len(results),
        "results": [asdict(r) for r in results],
    }
    path = result_file(lab)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=1), encoding="utf-8")
    return record


# ---- the checker --------------------------------------------------------------------

class Wrong(Exception):
    """Raised by a check when your answer doesn't match the reference."""


class NotWritten(Exception):
    """Raised by a check when your function still returns None."""


@dataclass
class CheckResult:
    name: str
    status: str  # pass | fail | todo | error
    message: str = ""


def ask(module, func_name: str, *args):
    """Call one of your functions. Raises NotWritten if it still returns None."""
    func = getattr(module, func_name, None)
    if func is None:
        raise Wrong(f"your file has no function called {func_name}")
    answer = func(*args)
    if answer is None:
        raise NotWritten(f"{func_name} returned None (still a TODO?)")
    return answer


def same(got, want, what="your answer", tol=1e-8):
    """Raise Wrong unless got matches want (numbers or arrays, real or complex)."""
    if got is None:
        raise NotWritten(f"{what} returned None (still a TODO?)")
    got_arr = np.asarray(got)
    want_arr = np.asarray(want)
    if got_arr.shape != want_arr.shape:
        raise Wrong(f"{what} has shape {got_arr.shape}, expected {want_arr.shape}")
    if not np.allclose(got_arr, want_arr, rtol=tol, atol=tol):
        worst = np.max(np.abs(got_arr - want_arr))
        raise Wrong(f"{what} is off by up to {worst:.3g}")


def same_value(got, want, what="your answer"):
    """Raise Wrong unless got == want exactly (for things like True/False or a key name)."""
    if got is None:
        raise NotWritten(f"{what} returned None (still a TODO?)")
    if got != want:
        raise Wrong(f"{what} gave {got!r}, expected {want!r}")


def names_used(func) -> set[str]:
    """Every name and attribute your function's code uses (comments and docstrings don't count)."""
    tree = ast.parse(textwrap.dedent(inspect.getsource(func)))
    used = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            used.add(node.id)
        elif isinstance(node, ast.Attribute):
            used.add(node.attr)
    return used


def by_hand(module, func_name: str, banned: list[str]):
    """Raise Wrong if your function calls a built-in that does the work for you."""
    func = getattr(module, func_name)
    used = names_used(func) & set(banned)
    if used:
        raise Wrong(f"{func_name} uses {', '.join(sorted(used))}; write this one by hand "
                    f"(the checker uses the built-in to check you)")


def run_checks(checks, module) -> list[CheckResult]:
    """checks is a list of (name, function). Each function gets your module."""
    results = []
    for name, check in checks:
        try:
            check(module)
            results.append(CheckResult(name, "pass"))
        except NotWritten as e:
            results.append(CheckResult(name, "todo", str(e)))
        except NotImplementedError:
            results.append(CheckResult(name, "todo", "not written yet"))
        except Wrong as e:
            results.append(CheckResult(name, "fail", str(e)))
        except Exception as e:  # your code crashed: show where
            line = traceback.extract_tb(e.__traceback__)[-1]
            results.append(CheckResult(name, "error", f"{type(e).__name__}: {e} "
                                                      f"(line {line.lineno} of {Path(line.filename).name})"))
    return results


def load_module(path: Path):
    """Import a lab file from any folder."""
    spec = importlib.util.spec_from_file_location(f"lab_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # code under `if __name__ == "__main__":` doesn't run
    return module


def checks_for(lab: dict):
    """The list of checks for one lab, from app/lab_checks/<course>.py."""
    from app.lab_checks import CHECKS
    return CHECKS[lab["course"].lower()][lab["number"]]


def check_lab(lab: dict, path: Path) -> list[CheckResult]:
    try:
        module = load_module(path)
    except Exception as e:  # the file itself doesn't run
        return [CheckResult(f"load {path.name}", "error", f"{type(e).__name__}: {e}")]
    return run_checks(checks_for(lab), module)


# ---- command line -------------------------------------------------------------------

SYMBOLS = {"pass": "PASS ", "fail": "FAIL ", "todo": "TODO ", "error": "ERROR"}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    lab = find_lab(argv[0])
    if lab is None:
        print(f"No lab {argv[0]!r}. Try a number from 1 to 10.")
        return 2
    if "--file" in argv:
        path = Path(argv[argv.index("--file") + 1])
    else:
        path, made_new = make_work_copy(lab)
        if made_new:
            print(f"Made your copy of the starter: {path}")
            print("Open it, fill in the TODOs, then run this command again.\n")
    print(f"{lab['title']}  ({path})\n")
    results = check_lab(lab, path)
    for r in results:
        print(f"  {SYMBOLS[r.status]} {r.name}" + (f"\n         {r.message}" if r.message else ""))
    record = save_result(lab, results, path)
    print(f"\n{record['passed']} of {record['total']} checks pass.")
    if record["passed"] == record["total"]:
        print("All done! Tick the lab in Homebase.")
    return 0 if record["passed"] == record["total"] else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
