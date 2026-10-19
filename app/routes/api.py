"""JSON API at /api/...

The same actions as the pages, for scripts and (in stage c) the Claude MCP
server. Changes made with `actor: "claude"` are labelled in the activity log.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from .. import backup, config, services
from ..db import get_session

router = APIRouter()


def _task(t):
    return {"id": t.id, "slug": t.slug, "course_id": t.course_id, "course_week": t.course_week,
            "prep_week_id": t.prep_week_id, "kind": t.kind, "title": t.title, "url": t.url,
            "detail": t.detail, "est_min": t.est_min, "ref_kind": t.ref_kind, "ref": t.ref,
            "done_at": t.done_at.isoformat() if t.done_at else None, "done_by": t.done_by}


@router.get("/overview")
def overview(day: date | None = None, session: Session = Depends(get_session)):
    """Where you are today and what's on the list."""
    day = day or config.today()
    phase = services.phase_for(session, day)
    tasks = services.tasks_for_prep_week(session, phase.prep_week) if phase.prep_week else []
    return {
        "date": day.isoformat(),
        "phase": phase.name,
        "label": phase.label,
        "prep_week": phase.prep_week.number if phase.prep_week else None,
        "term_week": phase.term_week,
        "tasks": [_task(t) for t in tasks],
        "courses": [{"id": c.id, "code": c.code, "name": c.name, "title": c.title}
                    for c in services.courses(session)],
    }


@router.get("/progress")
def progress(session: Session = Depends(get_session)):
    return [{
        "course": p.course.code, "tasks_done": p.tasks_done, "tasks_total": p.tasks_total,
        "pct": p.pct, "minutes": p.minutes, "planned_minutes": p.planned_minutes,
        "minutes_by_prep_week": p.week_minutes,
    } for p in services.progress(session)]


@router.get("/prep-weeks")
def prep_weeks(session: Session = Depends(get_session)):
    return [{
        "number": w.number, "start": w.start.isoformat(), "end": w.end.isoformat(),
        "label": w.label, "focus": w.focus, "planned_hours": w.planned_hours,
        "planned_minutes": w.planned_minutes,
        "tasks": [_task(t) for t in services.tasks_for_prep_week(session, w)],
    } for w in services.prep_weeks(session)]


@router.get("/courses/{code}/weeks/{number}")
def course_week(code: str, number: int, session: Session = Depends(get_session)):
    course = services.course_by_code(session, code)
    if course is None:
        raise HTTPException(404, f"no course {code}")
    weeks = {w.number: w for w in services.course_weeks(session, course)}
    if number not in weeks:
        raise HTTPException(404, f"{code} has no week {number}")
    w = weeks[number]
    return {"course": course.code, "number": w.number, "title": w.title, "topics": w.topics,
            "tasks": [_task(t) for t in services.tasks_for_course_week(session, course, number)]}


class DoneIn(BaseModel):
    done: bool = True
    actor: str = Field("app", pattern="^(app|claude)$")


@router.post("/tasks/{task_id}/done")
def task_done(task_id: int, body: DoneIn, session: Session = Depends(get_session)):
    try:
        return _task(services.set_task_done(session, task_id, body.done, body.actor))
    except LookupError as e:
        raise HTTPException(404, str(e))


class StudyIn(BaseModel):
    course: str
    minutes: int
    source: str = Field("manual", pattern="^(timer|manual|claude)$")
    note: str = ""
    actor: str = Field("app", pattern="^(app|claude)$")


@router.post("/sessions")
def log_session(body: StudyIn, session: Session = Depends(get_session)):
    try:
        row = services.log_study(session, body.course, body.minutes, body.source,
                                 body.note, actor=body.actor)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"id": row.id, "minutes": row.minutes, "started_at": row.started_at.isoformat()}


@router.get("/activity")
def activity(limit: int = 50, session: Session = Depends(get_session)):
    return [{"at": a.at.isoformat(), "actor": a.actor, "action": a.action,
             "summary": a.summary} for a in services.recent_activity(session, limit)]


@router.get("/export")
def export(session: Session = Depends(get_session)):
    path = backup.export_all(session)
    return FileResponse(path, filename=path.name, media_type="application/zip")
