"""HTML pages.

Every form here also works without JavaScript; app.js only makes ticking
boxes and the timer smoother.
"""
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session

from .. import backup, config, services
from ..db import get_session

TEMPLATES = Jinja2Templates(directory=config.ROOT / "app" / "templates")
router = APIRouter()

KIND_LABELS = {"watch": "Watch", "read": "Read", "solve": "Solve", "submit": "Submit",
               "review": "Review", "lab": "Lab", "exam": "Timed", }


def fmt_minutes(minutes: int | float | None) -> str:
    minutes = int(round(minutes or 0))
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h} h {m} m"
    return f"{h} h" if h else f"{m} m"


TEMPLATES.env.filters["hm"] = fmt_minutes
TEMPLATES.env.filters["md"] = lambda d: f"{d:%b} {d.day}"  # "Oct 19"
TEMPLATES.env.filters["longdate"] = lambda d: f"{d:%A, %B} {d.day}"  # "Monday, October 19"
TEMPLATES.env.globals["KIND_LABELS"] = KIND_LABELS


def render(request: Request, name: str, session: Session, **ctx):
    ctx.setdefault("courses", services.courses(session))
    ctx.setdefault("today", config.today())
    return TEMPLATES.TemplateResponse(request, name, ctx)


def back(request: Request, default: str = "/"):
    return RedirectResponse(request.headers.get("referer") or default, status_code=303)


def _course_or_404(session: Session, code: str):
    course = services.course_by_code(session, code)
    if course is None:
        raise HTTPException(404, f"No course {code}")
    return course


@router.get("/")
def today_page(request: Request, day: date | None = None,
               session: Session = Depends(get_session)):
    day = day or config.today()
    phase = services.phase_for(session, day)
    by_course = {c.id: c for c in services.courses(session)}
    groups, week_logged = [], {}
    if phase.prep_week:
        tasks = services.tasks_for_prep_week(session, phase.prep_week)
        for course in by_course.values():
            ts = [t for t in tasks if t.course_id == course.id]
            if ts:
                groups.append((course, ts))
            week_logged[course.code] = services.minutes_between(
                session, course.id, phase.prep_week.start, phase.prep_week.end)
    return render(request, "today.html", session, phase=phase, groups=groups, day=day,
                  week_logged=week_logged, recent=services.recent_study(session, 5))


@router.get("/plan")
def plan_page(request: Request, session: Session = Depends(get_session)):
    phase = services.phase_for(session, config.today())
    weeks = []
    for w in services.prep_weeks(session):
        tasks = services.tasks_for_prep_week(session, w)
        weeks.append((w, tasks, sum(1 for t in tasks if t.done_at)))
    return render(request, "plan.html", session, weeks=weeks, phase=phase,
                  course_by_id={c.id: c for c in services.courses(session)})


@router.get("/course/{code}")
def course_page(code: str, request: Request, session: Session = Depends(get_session)):
    course = _course_or_404(session, code)
    weeks = []
    for w in services.course_weeks(session, course):
        tasks = services.tasks_for_course_week(session, course, w.number)
        weeks.append((w, len(tasks), sum(1 for t in tasks if t.done_at)))
    return render(request, "course.html", session, course=course, weeks=weeks)


@router.get("/course/{code}/week/{number}")
def course_week_page(code: str, number: int, request: Request,
                     session: Session = Depends(get_session)):
    course = _course_or_404(session, code)
    weeks = {w.number: w for w in services.course_weeks(session, course)}
    if number not in weeks:
        raise HTTPException(404, f"{course.name} has no week {number}")
    tasks = services.tasks_for_course_week(session, course, number)
    prep_by_id = {w.id: w for w in services.prep_weeks(session)}
    return render(request, "course_week.html", session, course=course, week=weeks[number],
                  tasks=tasks, prep_by_id=prep_by_id,
                  prev_n=number - 1 if number > 1 else None,
                  next_n=number + 1 if number < len(weeks) else None)


@router.get("/progress")
def progress_page(request: Request, session: Session = Depends(get_session)):
    return render(request, "progress.html", session,
                  progress=services.progress(session), prep_weeks=services.prep_weeks(session),
                  recent=services.recent_study(session, 15),
                  activity=services.recent_activity(session, 15),
                  course_by_id={c.id: c for c in services.courses(session)})


@router.get("/settings")
def settings_page(request: Request, session: Session = Depends(get_session)):
    folder = backup.backup_dir(session)
    return render(request, "settings.html", session, backup_dir=folder,
                  last_backup=backup.get_setting(session, "last_backup"),
                  last_error=backup.get_setting(session, "last_backup_error"),
                  data_dir=config.DATA_DIR)


# ---- form posts -----------------------------------------------------------------

@router.post("/tasks/{task_id}/toggle")
def toggle_task(task_id: int, request: Request, done: str = Form(""),
                session: Session = Depends(get_session)):
    try:
        task = services.set_task_done(session, task_id, done == "on")
    except LookupError:
        raise HTTPException(404, "No such task")
    if request.headers.get("x-requested-with") == "fetch":
        return {"id": task.id, "done": task.done_at is not None}
    return back(request)


@router.post("/study")
def add_study(request: Request, course: str = Form(...), minutes: int = Form(...),
              note: str = Form(""), source: str = Form("manual"),
              session: Session = Depends(get_session)):
    if source not in ("manual", "timer"):
        source = "manual"
    try:
        services.log_study(session, course, minutes, source, note)
    except (LookupError, ValueError) as e:
        raise HTTPException(422, str(e))
    if request.headers.get("x-requested-with") == "fetch":
        return {"ok": True}
    return back(request)


@router.post("/study/{study_id}/delete")
def delete_study(study_id: int, request: Request, session: Session = Depends(get_session)):
    try:
        services.delete_study(session, study_id)
    except LookupError:
        raise HTTPException(404, "No such entry")
    return back(request, "/progress")


@router.post("/settings/backup")
def backup_now(request: Request, session: Session = Depends(get_session)):
    try:
        backup.backup_db(session)
        backup.set_setting(session, "last_backup_error", "")
    except Exception as e:
        backup.set_setting(session, "last_backup_error", f"{config.now():%Y-%m-%d %H:%M} {e}")
    return back(request, "/settings")


@router.post("/settings/backup-dir")
def set_backup_dir(request: Request, folder: str = Form(""),
                   session: Session = Depends(get_session)):
    folder = folder.strip()
    if folder and not Path(folder).is_absolute():
        raise HTTPException(422, "Use a full folder path, like C:\\Users\\you\\OneDrive\\Homebase backups")
    backup.set_setting(session, "backup_dir", folder)
    return back(request, "/settings")


@router.get("/export")
def export_page(session: Session = Depends(get_session)):
    path = backup.export_all(session)
    return FileResponse(path, filename=path.name, media_type="application/zip")
