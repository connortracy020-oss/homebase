"""Load content/*.json into the database.

    python -m app.seed

Safe to re-run: content rows are updated in place, and your progress (done
marks, study time, notes, watch positions, attempts) is kept. A task that
disappears from the content files is removed; the removal is written to the
activity log.
"""
import hashlib
import json
import re
from datetime import date

from sqlmodel import Session, select

from . import config
from .db import get_engine, init_db
from .generators import generate
from .models import (ActivityLog, Chapter, Course, CourseWeek, Exam, PrepWeek, Problem, ProblemSet,
                     Reading, Resource, Task, Video)

WATCH_SPEED = 1.25  # plan assumes videos at 1.25x
NOTE_MINUTES = 5  # time to jot notes after a video
DEFAULT_PSET_MIN = 45
GRADING_MIN = 20  # time to grade a practice exam against the key


def _read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_videos(code: str) -> dict[str, dict]:
    path = config.CONTENT_DIR / code.lower() / "videos.json"
    return {v["id"]: v for v in _read(path)} if path.exists() else {}


def load_series_names() -> dict[str, str]:
    path = config.CONTENT_DIR / "series.json"
    return _read(path) if path.exists() else {}


def video_minutes(video: dict) -> int:
    minutes = video.get("duration_min") or 0
    return round(minutes / WATCH_SPEED) + NOTE_MINUTES


def _upsert(session: Session, model, where: dict, values: dict):
    row = session.exec(select(model).filter_by(**where)).first()
    if row is None:
        row = model(**where, **values)
        session.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    return row


# ---- problem specs ------------------------------------------------------------

def _fill(template, n: int):
    """Expand {n} and {n+1} in strings, and page expressions like "15+n"."""
    if isinstance(template, str):
        return re.sub(r"\{n([+-]\d+)?\}", lambda m: str(n + int(m.group(1) or 0)), template)
    return template


def _page(expr, n: int):
    if isinstance(expr, int) or expr is None:
        return expr
    if expr.startswith("auto:"):
        return None  # found by searching the PDF when shown
    m = re.fullmatch(r"\s*(\d+)?\s*\+?\s*n\s*", expr)
    if m:
        return int(m.group(1) or 0) + n
    return int(expr)


def expand_region(spec: dict, n: int) -> dict:
    region = {k: _fill(v, n) for k, v in spec.items() if k != "page"}
    region["page"] = _page(spec.get("page"), n)
    return region


def problem_rows(pset_spec: dict) -> list[dict]:
    """Turn one problem-set spec into the list of problems it describes."""
    rows = []
    if pset_spec.get("kind") == "generated":
        for block in pset_spec["generated"]:
            for seed in block["seeds"]:
                made = generate(block["generator"], seed)
                rows.append({
                    "slug": f"{pset_spec['id']}-{block['generator']}-{seed}",
                    "label": f"{block['generator'].replace('_', ' ').capitalize()} #{seed}",
                    "key_type": "computed", "statement": made["statement"], "key": made["key"],
                    "topics": made["topics"], "generator": block["generator"], "seed": seed,
                })
        return rows
    p = pset_spec["problems"]
    if isinstance(p, list):  # problems listed one by one
        for n, item in enumerate(p, 1):
            rows.append({
                "slug": f"{pset_spec['id']}-{item.get('id', n)}",
                "label": item["label"],
                "key_type": item.get("key_type", pset_spec.get("key_type", "none")),
                "statement": {k: v for k, v in item["statement"].items()},
                "key": {k: v for k, v in item.get("key", {}).items()},
                "topics": item.get("topics", []), "generator": "", "seed": None,
            })
        return rows
    for n in range(1, p["count"] + 1):
        rows.append({
            "slug": f"{pset_spec['id']}-{n}",
            "label": _fill(p["label"], n),
            "key_type": p["key_type"],
            "statement": expand_region(p["statement"], n),
            "key": expand_region(p["key"], n),
            "topics": p.get("topics", []), "generator": "", "seed": None,
        })
    return rows


# ---- tasks ------------------------------------------------------------------------

def seed_exam(session: Session, course: Course, ex: dict, order: int) -> Exam:
    """One exam: a hidden problem set (one problem per exam question) plus its Exam row."""
    pset = _upsert(session, ProblemSet, {"slug": f"exam-{ex['id']}"}, {
        "course_id": course.id, "week": ex.get("course_week", 0), "title": ex["title"],
        "source": ex.get("source", ""), "license": ex.get("license", ""), "kind": "exam",
        "notes": ex.get("skipped", ""), "optional": False, "order": 100 + order,
    })
    session.flush()
    total = 0
    for n, p in enumerate(ex["problems"], 1):
        if "pages" in p:
            statement = {"pdf": ex["exam_pdf"], "pages": p["pages"]}
        else:
            statement = {"pdf": ex["exam_pdf"], **p["statement"]}
        if "key_pages" in p:
            key = {"pdf": ex["key_pdf"], "pages": p["key_pages"]}
        else:
            key = {"pdf": ex["key_pdf"], **p["key"]}
        _upsert(session, Problem, {"slug": f"exam-{ex['id']}-{n}"}, {
            "set_id": pset.id, "label": p["label"], "order": n, "topics": p.get("topics", []),
            "key_type": ex.get("key_type", "official_worked"), "statement": statement, "key": key,
            "generator": "", "seed": None, "points": p["points"],
        })
        total += p["points"]
    return _upsert(session, Exam, {"slug": ex["id"]}, {
        "course_id": course.id, "set_id": pset.id, "title": ex["title"],
        "source": ex.get("source", ""), "license": ex.get("license", ""),
        "course_week": ex.get("course_week", 0), "scope": ex.get("scope", ""),
        "time_min": ex["time_min"], "time_note": ex.get("time_note", ""),
        "original_rules": ex.get("original_rules", ""), "practice_rules": ex.get("practice_rules", []),
        "skipped": ex.get("skipped", ""), "verified": ex.get("verified", ""),
        "total_points": total, "order": order,
    })


def task_slug(prep_number: int, spec: dict) -> str:
    """A stable key, so editing other tasks never resets this one's done mark."""
    if spec.get("id"):
        return spec["id"]
    what = (spec.get("video") or spec.get("reading") or spec.get("pset") or spec.get("exam")
            or hashlib.sha1(spec["title"].encode()).hexdigest()[:8])
    return f"p{prep_number:02d}-{spec['course'].lower()}-{spec['kind']}-{what}"


def resolve_task(spec: dict, videos: dict[str, dict], series: dict[str, str] | None = None,
                 readings: dict | None = None, psets: dict | None = None,
                 exams: dict | None = None) -> dict:
    """Fill in title/url/time for a task that points at a video, reading, problem set or exam."""
    out = {"title": spec.get("title", ""), "url": spec.get("url", ""),
           "detail": spec.get("detail", ""), "est_min": spec.get("est_min", 0),
           "ref_kind": "", "ref": ""}
    if "video" in spec:
        video = videos.get(spec["video"])
        if video is None:
            raise ValueError(f"task points at unknown video {spec['video']!r}")
        out["title"] = out["title"] or video["title"]
        out["url"] = out["url"] or video["url"]
        out["est_min"] = out["est_min"] or video_minutes(video)
        slug = video.get("series", "")
        out["detail"] = out["detail"] or (series or {}).get(slug, slug)
        out["ref_kind"], out["ref"] = "video", spec["video"]
    elif "reading" in spec:
        reading, resource = (readings or {}).get(spec["reading"], (None, None))
        if reading is None:
            raise ValueError(f"task points at unknown reading {spec['reading']!r}")
        out["title"] = out["title"] or f"{resource.title.split(',')[0]}: {reading.sections}"
        out["url"] = out["url"] or resource.url
        out["est_min"] = out["est_min"] or reading.est_min
        out["ref_kind"], out["ref"] = "reading", spec["reading"]
    elif "pset" in spec:
        pset = (psets or {}).get(spec["pset"])
        if pset is None:
            raise ValueError(f"task points at unknown problem set {spec['pset']!r}")
        out["title"] = out["title"] or pset.title
        out["est_min"] = out["est_min"] or DEFAULT_PSET_MIN
        out["ref_kind"], out["ref"] = "pset", spec["pset"]
    elif "exam" in spec:
        exam = (exams or {}).get(spec["exam"])
        if exam is None:
            raise ValueError(f"task points at unknown exam {spec['exam']!r}")
        out["title"] = out["title"] or f"Timed: {exam.title} ({exam.time_min} min)"
        out["est_min"] = out["est_min"] or exam.time_min + GRADING_MIN
        out["ref_kind"], out["ref"] = "exam", spec["exam"]
    if not out["title"]:
        raise ValueError(f"task has no title: {spec}")
    return out


# ---- the seed -----------------------------------------------------------------------

def seed(session: Session) -> dict:
    counts = {"courses": 0, "weeks": 0, "videos": 0, "readings": 0, "problems": 0, "exams": 0,
              "prep_weeks": 0, "tasks": 0, "removed": 0}

    courses = {}
    for c in _read(config.CONTENT_DIR / "courses.json"):
        code = c["code"]
        values = {k: v for k, v in c.items() if k != "code"}
        courses[code] = _upsert(session, Course, {"code": code}, values)
        counts["courses"] += 1
    session.flush()

    videos = {code: load_videos(code) for code in courses}
    series = load_series_names()
    readings: dict[str, tuple[Reading, Resource]] = {}
    psets: dict[str, ProblemSet] = {}
    exams: dict[str, Exam] = {}

    for code, course in courses.items():
        folder = config.CONTENT_DIR / code.lower()
        for w in _read(folder / "weeks.json"):
            _upsert(session, CourseWeek, {"course_id": course.id, "number": w["number"]},
                    {"title": w["title"], "topics": w["topics"], "notes": w.get("notes", "")})
            counts["weeks"] += 1

        for v in videos[code].values():
            row = _upsert(session, Video, {"slug": v["id"]}, {
                "course_id": course.id, "series": series.get(v.get("series", ""), v.get("series", "")),
                "title": v["title"], "url": v["url"], "youtube_id": v.get("youtube_id"),
                "duration_min": v.get("duration_min"), "osu_week": v.get("osu_week"),
                "priority": v.get("priority", "core"), "summary": v.get("summary", ""),
                "verified": v.get("verified", True),
            })
            session.flush()
            for old in session.exec(select(Chapter).where(Chapter.video_id == row.id)).all():
                session.delete(old)
            for ch in v.get("chapters", []):
                session.add(Chapter(video_id=row.id, t=int(ch["t"]), title=ch["title"],
                                    kind=ch.get("kind", "concept")))
            counts["videos"] += 1

        resources = {}
        res_path = folder / "resources.json"
        for r in (_read(res_path) if res_path.exists() else []):
            resources[r["id"]] = _upsert(session, Resource, {"slug": r["id"]}, {
                "course_id": course.id, "kind": r.get("kind", "textbook"), "title": r["title"],
                "url": r.get("url", ""), "local_path": r.get("local_path", ""),
                "license": r.get("license", ""), "verified": r.get("verified", True),
                "notes": r.get("notes", ""),
            })
        session.flush()

        for week_file in sorted(folder.glob("week[0-9][0-9].json")):  # week01.json ... week10.json
            wk = _read(week_file)
            for order, rd in enumerate(wk.get("readings", [])):
                resource = resources[rd["resource"]]
                row = _upsert(session, Reading, {"slug": rd["id"]}, {
                    "course_id": course.id, "week": wk["week"], "resource_id": resource.id,
                    "sections": rd.get("sections", ""), "page": rd.get("page"),
                    "est_min": rd.get("est_min", 0), "optional": rd.get("optional", False),
                    "note": rd.get("note", ""), "order": order,
                })
                readings[rd["id"]] = (row, resource)
                counts["readings"] += 1
            for order, ps in enumerate(wk.get("problem_sets", [])):
                resource = resources.get(ps.get("resource", ""))
                pset = _upsert(session, ProblemSet, {"slug": ps["id"]}, {
                    "course_id": course.id, "week": wk["week"], "title": ps["title"],
                    "source": ps.get("source", ""), "license": resource.license if resource else "",
                    "kind": ps.get("kind", "pdf"), "notes": ps.get("notes", ""),
                    "optional": ps.get("optional", False), "order": order,
                })
                session.flush()
                psets[ps["id"]] = pset
                for i, pr in enumerate(problem_rows(ps)):
                    slug = pr.pop("slug")
                    _upsert(session, Problem, {"slug": slug}, {"set_id": pset.id, "order": i, **pr})
                    counts["problems"] += 1

        exams_path = folder / "exams.json"
        for order, ex in enumerate(_read(exams_path) if exams_path.exists() else []):
            exams[ex["id"]] = seed_exam(session, course, ex, order)
            counts["exams"] += 1
    session.flush()

    schedule = _read(config.CONTENT_DIR / "prep_schedule.json")
    seen_slugs = set()
    for pw in schedule["weeks"]:
        prep = _upsert(session, PrepWeek, {"number": pw["number"]}, {
            "start": date.fromisoformat(pw["start"]),
            "end": date.fromisoformat(pw["end"]),
            "label": pw.get("label", ""),
            "focus": pw.get("focus", ""),
        })
        session.flush()
        planned: dict[str, int] = {}
        for order, spec in enumerate(pw["tasks"]):
            course = courses[spec["course"]]
            info = resolve_task(spec, videos[spec["course"]], series, readings, psets, exams)
            slug = task_slug(pw["number"], spec)
            if slug in seen_slugs:
                raise ValueError(f"duplicate task {slug}")
            seen_slugs.add(slug)
            _upsert(session, Task, {"slug": slug}, {
                "course_id": course.id, "course_week": spec["week"],
                "prep_week_id": prep.id, "kind": spec["kind"], "order": order, **info,
            })
            planned[spec["course"]] = planned.get(spec["course"], 0) + info["est_min"]
            counts["tasks"] += 1
        prep.planned_minutes = planned
        prep.planned_hours = round(sum(planned.values()) / 60, 1)
        counts["prep_weeks"] += 1

    for task in session.exec(select(Task)).all():
        if task.slug not in seen_slugs:
            session.add(ActivityLog(at=config.now(), actor="app", action="task.removed",
                                    summary=f"Removed by re-seed: {task.title}",
                                    data={"slug": task.slug, "was_done": task.done_at is not None}))
            session.delete(task)
            counts["removed"] += 1

    session.commit()
    return counts


def main():
    init_db()
    with Session(get_engine()) as session:
        counts = seed(session)
    print("Seeded:", ", ".join(f"{v} {k}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
