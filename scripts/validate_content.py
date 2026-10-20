"""Check every content file before it reaches the app.

    python scripts/validate_content.py            # all courses
    python scripts/validate_content.py ece201     # one course
    python scripts/validate_content.py --render   # also render every PDF region (slow)

Checks:
  - JSON parses; week01..week10 files exist for each course (warns if missing)
  - every reading points at a resource in resources.json; local files exist
  - every PDF problem's statement/key file exists; key_type is one of the four
  - official keys have a key region; "none" keys have none
  - generated problem sets name generators that exist and run for their seeds
  - exams: files exist, pages are in range, every problem has points and a key,
    and the exam has a "verified" note saying it was checked by eye
  - labs: ids unique, fields present, handout PDF and starter file exist, the
    lab has checks, and running the checker on the blank starter gives only
    "todo" (so the starter and the checks agree on every function)
  - prep_schedule.json tasks resolve (video / reading / pset / exam / lab)
  - with --render: every statement and key region actually renders
Exit code 1 if anything is an ERROR.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("HOMEBASE_DATA", tempfile.mkdtemp(prefix="hb-validate-"))
os.environ["HOMEBASE_NO_BACKUP"] = "1"

import pypdfium2 as pdfium  # noqa: E402

from app import pdfpages  # noqa: E402
from app.generators import GENERATORS, generate  # noqa: E402
from app import labs  # noqa: E402
from app.lab_checks import CHECKS as LAB_CHECKS  # noqa: E402
from app.seed import expand_region, problem_rows  # noqa: E402

KEY_TYPES = {"official_worked", "official_answer", "computed", "none"}
CONTENT = ROOT / "content"
errors, warnings = [], []
_pages: dict[str, int] = {}


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def page_count(rel: str) -> int | None:
    if rel not in _pages:
        path = ROOT / rel
        _pages[rel] = len(pdfium.PdfDocument(path)) if path.exists() else None
    return _pages[rel]


def read(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f"{path.relative_to(ROOT)}: bad JSON: {e}")
        return None


def check_region(where: str, region: dict, render: bool):
    if region.get("images"):
        for rel in region["images"]:
            if not (ROOT / rel).exists():
                err(f"{where}: {rel} is not in the library")
        if render:
            try:
                pdfpages.render(region)
            except Exception as e:
                err(f"{where}: doesn't render: {e}")
        return
    pdf = region.get("pdf")
    if not pdf:
        err(f"{where}: region has no pdf")
        return
    n = page_count(pdf)
    if n is None:
        err(f"{where}: {pdf} is not in the library")
        return
    pages = region.get("pages") or ([region["page"]] if region.get("page") else [])
    for p in pages:
        if not isinstance(p, int) or not 1 <= p <= n:
            err(f"{where}: page {p} out of range (file has {n})")
    if render:
        try:
            pdfpages.render(region)
        except Exception as e:
            err(f"{where}: doesn't render: {e}")


def check_course(code: str, render: bool):
    folder = CONTENT / code
    resources = {r["id"]: r for r in (read(folder / "resources.json") or [])} if (folder / "resources.json").exists() else {}
    for rid, r in resources.items():
        if r.get("local_path") and not (ROOT / r["local_path"]).exists():
            warn(f"{code} resource {rid}: {r['local_path']} not in library (download needed?)")
        if not r.get("license"):
            err(f"{code} resource {rid}: no license recorded")
    for n in range(1, 11):
        path = folder / f"week{n:02d}.json"
        if not path.exists():
            warn(f"{code}: no week{n:02d}.json yet")
            continue
        wk = read(path)
        if wk is None:
            continue
        if wk.get("week") != n:
            err(f"{path.name}: 'week' is {wk.get('week')}, expected {n}")
        for rd in wk.get("readings", []):
            if rd.get("resource") not in resources:
                err(f"{path.name} reading {rd.get('id')}: unknown resource {rd.get('resource')!r}")
        for ps in wk.get("problem_sets", []):
            where = f"{path.name} {ps.get('id')}"
            if ps.get("resource") and ps["resource"] not in resources:
                err(f"{where}: unknown resource {ps['resource']!r}")
            if ps.get("kind") == "generated":
                for block in ps.get("generated", []):
                    g = block.get("generator")
                    if g not in GENERATORS:
                        err(f"{where}: generator {g!r} doesn't exist")
                        continue
                    for seed in block.get("seeds", []):
                        try:
                            generate(g, seed)
                        except Exception as e:
                            err(f"{where}: {g}({seed}) failed: {e}")
                continue
            try:
                rows = problem_rows(ps)
            except Exception as e:
                err(f"{where}: can't expand problems: {e}")
                continue
            if not rows:
                err(f"{where}: no problems")
            for r in rows:
                w = f"{where} {r['label']}"
                if r["key_type"] not in KEY_TYPES:
                    err(f"{w}: key_type {r['key_type']!r}")
                check_region(w + " statement", r["statement"], render)
                if r["key_type"] in ("official_worked", "official_answer"):
                    if not r["key"]:
                        err(f"{w}: official key but no key region")
                    else:
                        check_region(w + " key", r["key"], render)
    check_labs(code, resources)
    exams_path = folder / "exams.json"
    for ex in (read(exams_path) or []) if exams_path.exists() else []:
        where = f"{code} exam {ex.get('id')}"
        for field in ("title", "source", "license", "time_min", "exam_pdf", "key_pdf", "practice_rules", "verified"):
            if not ex.get(field):
                err(f"{where}: missing {field}")
        if "by eye" not in ex.get("verified", ""):
            err(f"{where}: 'verified' must say the exam was checked by eye")
        for i, p in enumerate(ex.get("problems", []), 1):
            w = f"{where} problem {i}"
            if not p.get("points"):
                err(f"{w}: no points")
            st = {"pdf": ex.get("exam_pdf"), "pages": p["pages"]} if "pages" in p else {"pdf": ex.get("exam_pdf"), **p.get("statement", {})}
            ky = {"pdf": ex.get("key_pdf"), "pages": p["key_pages"]} if "key_pages" in p else {"pdf": ex.get("key_pdf"), **p.get("key", {})}
            check_region(w + " statement", st, render)
            check_region(w + " key", ky, render)


LAB_FIELDS = ("id", "number", "title", "goal", "handout", "starter", "est_min")


def check_labs(code: str, resources: dict):
    seen = set()
    for lab in labs.load_labs(code):
        where = f"{code} week {lab['week']} lab {lab.get('id')}"
        missing = [f for f in LAB_FIELDS if not lab.get(f)]
        if missing:
            err(f"{where}: missing {', '.join(missing)}")
            continue
        if lab["id"] in seen:
            err(f"{where}: duplicate lab id")
        seen.add(lab["id"])
        handout = lab["handout"]
        if handout.get("resource") not in resources:
            err(f"{where}: handout resource {handout.get('resource')!r} not in resources.json")
        if not handout.get("pdf") or not (ROOT / handout["pdf"]).exists():
            err(f"{where}: handout {handout.get('pdf')} is not in the library")
        starter = ROOT / lab["starter"]
        if not starter.exists():
            err(f"{where}: starter {lab['starter']} doesn't exist")
            continue
        if lab["number"] not in LAB_CHECKS.get(code, {}):
            err(f"{where}: no checks for lab {lab['number']} in app/lab_checks/{code}.py")
            continue
        for r in labs.check_lab(lab, starter):
            if r.status != "todo":
                err(f"{where}: on the blank starter, check '{r.name}' gave {r.status}: {r.message}")


def check_schedule():
    from app.seed import load_videos
    sched = read(CONTENT / "prep_schedule.json") or {"weeks": []}
    ids = {}
    for code in ("ece201", "ece200", "mth254"):
        f = CONTENT / code
        ids[code.upper()] = {
            "video": set(load_videos(code.upper())),
            "reading": {rd["id"] for w in f.glob("week[0-9][0-9].json") for rd in (read(w) or {}).get("readings", [])},
            "pset": {ps["id"] for w in f.glob("week[0-9][0-9].json") for ps in (read(w) or {}).get("problem_sets", [])},
            "exam": {e["id"] for e in (read(f / "exams.json") or [])} if (f / "exams.json").exists() else set(),
            "lab": {lab["id"] for lab in labs.load_labs(code)},
        }
    for w in sched["weeks"]:
        for t in w["tasks"]:
            for kind in ("video", "reading", "pset", "exam", "lab"):
                if kind in t and t[kind] not in ids[t["course"]][kind]:
                    err(f"prep week {w['number']}: {t['course']} {kind} {t[kind]!r} not found")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    render = "--render" in sys.argv
    for code in args or ["ece201", "ece200", "mth254"]:
        check_course(code, render)
    check_schedule()
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
