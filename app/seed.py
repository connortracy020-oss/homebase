"""Load content/*.json into the database.

    python -m app.seed

Safe to re-run: content rows are updated in place, and your progress (done
marks, study time, notes) is kept. A task that disappears from the content
files is removed; the removal is written to the activity log.
"""
import hashlib
import json
from datetime import date

from sqlmodel import Session, select

from . import config
from .db import get_engine, init_db
from .models import ActivityLog, Course, CourseWeek, PrepWeek, Task

WATCH_SPEED = 1.25  # plan assumes videos at 1.25x
NOTE_MINUTES = 5  # time to jot notes after a video


def _read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_videos(code: str) -> dict[str, dict]:
    path = config.CONTENT_DIR / code.lower() / "videos.json"
    return {v["id"]: v for v in _read(path)} if path.exists() else {}


def video_minutes(video: dict) -> int:
    minutes = video.get("duration_min") or 0
    return round(minutes / WATCH_SPEED) + NOTE_MINUTES


def task_slug(prep_number: int, spec: dict) -> str:
    """A stable key, so editing other tasks never resets this one's done mark."""
    if spec.get("id"):
        return spec["id"]
    what = spec.get("video") or hashlib.sha1(spec["title"].encode()).hexdigest()[:8]
    return f"p{prep_number:02d}-{spec['course'].lower()}-{spec['kind']}-{what}"


def load_series_names() -> dict[str, str]:
    path = config.CONTENT_DIR / "series.json"
    return _read(path) if path.exists() else {}


def resolve_task(spec: dict, videos: dict[str, dict], series: dict[str, str] | None = None) -> dict:
    """Fill in title/url/time for a task that points at a video."""
    out = {"title": spec.get("title", ""), "url": spec.get("url", ""),
           "detail": spec.get("detail", ""), "est_min": spec.get("est_min", 0)}
    if "video" in spec:
        video = videos.get(spec["video"])
        if video is None:
            raise ValueError(f"task points at unknown video {spec['video']!r}")
        out["title"] = out["title"] or video["title"]
        out["url"] = out["url"] or video["url"]
        out["est_min"] = out["est_min"] or video_minutes(video)
        slug = video.get("series", "")
        out["detail"] = out["detail"] or (series or {}).get(slug, slug)
    if not out["title"]:
        raise ValueError(f"task has no title: {spec}")
    return out


def _upsert(session: Session, model, where: dict, values: dict):
    row = session.exec(select(model).filter_by(**where)).first()
    if row is None:
        row = model(**where, **values)
        session.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    return row


def seed(session: Session) -> dict:
    counts = {"courses": 0, "weeks": 0, "prep_weeks": 0, "tasks": 0, "removed": 0}

    courses = {}
    for c in _read(config.CONTENT_DIR / "courses.json"):
        code = c["code"]
        values = {k: v for k, v in c.items() if k != "code"}
        courses[code] = _upsert(session, Course, {"code": code}, values)
        counts["courses"] += 1
    session.flush()

    videos = {code: load_videos(code) for code in courses}
    series = load_series_names()

    for code, course in courses.items():
        path = config.CONTENT_DIR / code.lower() / "weeks.json"
        for w in _read(path):
            _upsert(session, CourseWeek, {"course_id": course.id, "number": w["number"]},
                    {"title": w["title"], "topics": w["topics"], "notes": w.get("notes", "")})
            counts["weeks"] += 1

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
            info = resolve_task(spec, videos[spec["course"]], series)
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
