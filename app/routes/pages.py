"""HTML pages.

Every form here also works without JavaScript; app.js only makes ticking
boxes and the timer smoother.
"""
import re
from datetime import date
from pathlib import Path

from markupsafe import Markup, escape

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from .. import backup, config, labs, local_ai, services
from ..db import get_session
from ..models import Task

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


def mdlite(text: str) -> Markup:
    """Tiny, safe markdown: paragraphs, "- " bullets and **bold**. Math is left for KaTeX."""
    out = []
    for block in re.split(r"\n\s*\n", escape(text or "").strip()):
        lines = block.splitlines()
        if lines and all(l.lstrip().startswith(("- ", "* ")) for l in lines):
            out.append("<ul>" + "".join(f"<li>{l.lstrip()[2:]}</li>" for l in lines) + "</ul>")
        else:
            out.append("<p>" + "<br>".join(lines) + "</p>")
    html = "".join(out)
    return Markup(re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html))


TEMPLATES.env.filters["mdlite"] = mdlite
TEMPLATES.env.filters["num"] = lambda x: "" if x is None else f"{float(x):g}"  # 85.0 -> "85", 12.5 -> "12.5"
TEMPLATES.env.filters["hm"] = fmt_minutes
TEMPLATES.env.filters["md"] = lambda d: f"{d:%b} {d.day}"  # "Oct 19"
TEMPLATES.env.filters["ts"] = lambda s: (f"{int(s) // 3600}:{int(s) % 3600 // 60:02d}:{int(s) % 60:02d}"
                                         if s and s >= 3600 else f"{int(s or 0) // 60}:{int(s or 0) % 60:02d}")
TEMPLATES.env.filters["longdate"] = lambda d: f"{d:%A, %B} {d.day}"  # "Monday, October 19"
TEMPLATES.env.globals["KIND_LABELS"] = KIND_LABELS
# Course colors live in style.css (--c-ece201 ...) so they can change with the dark theme.
# "?v=..." on /static links, so browsers (and the phone) fetch a fresh copy after an edit.
TEMPLATES.env.globals["static_v"] = lambda name: int((config.ROOT / "app" / "static" / name).stat().st_mtime)
TEMPLATES.env.filters["tex"] = local_ai.tex  # $x$ -> \(x\) for KaTeX
TEMPLATES.env.filters["ccolor"] = lambda c: f"var(--c-{c.code.lower()})"


def render(request: Request, name: str, session: Session, **ctx):
    ctx.setdefault("courses", services.courses(session))
    ctx.setdefault("today", config.today())
    ctx.setdefault("pending_reviews", services.pending_count(session))
    from .. import review
    ctx.setdefault("due_reviews", len(review.due_items(session)))
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


@router.get("/courses")
def courses_page(request: Request, session: Session = Depends(get_session)):
    return render(request, "courses.html", session, progress=services.progress(session))


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
    videos = services.videos_for_week(session, course, number)
    psets = services.psets_for_week(session, course, number)
    pset_stats = {}
    for ps in psets:
        probs = services.problems(session, ps)
        results = services.last_results(session, [p.id for p in probs])
        pset_stats[ps.id] = (len(probs), len(results),
                             sum(1 for r in results.values() if r in ("solid", "correct")))
    readings = [(r, res, services.local_file_exists(res))
                for r, res in services.readings_for_week(session, course, number)]
    week_labs = [(lab, labs.last_result(lab)) for lab in labs.labs_for_week(course.code, number)]
    return render(request, "course_week.html", session, course=course, week=weeks[number],
                  tasks=tasks, prep_by_id=prep_by_id, videos=videos,
                  chapter_counts=services.chapter_counts(session, videos),
                  readings=readings, psets=psets, pset_stats=pset_stats, labs=week_labs,
                  week_list=[weeks[n] for n in sorted(weeks)],
                  prev_n=number - 1 if number > 1 else None,
                  next_n=number + 1 if number < len(weeks) else None)


@router.get("/lab/{lab_id}")
def lab_page(lab_id: str, request: Request, session: Session = Depends(get_session)):
    lab = labs.find_lab(lab_id)
    if lab is None:
        raise HTTPException(404, f"No lab {lab_id}")
    course = _course_or_404(session, lab["course"])
    result = labs.last_result(lab)
    status_by_name = {r["name"]: r for r in (result or {}).get("results", [])}
    checks = [(name, status_by_name.get(name)) for name, _ in labs.checks_for(lab)]
    tasks = session.exec(select(Task).where(Task.ref_kind == "lab", Task.ref == lab["id"])).all()
    prep_by_id = {w.id: w for w in services.prep_weeks(session)}
    work_file = labs.work_file(lab)
    if work_file.is_relative_to(config.ROOT):  # show data\labs\... rather than the full path
        work_file = work_file.relative_to(config.ROOT)
    return render(request, "lab.html", session, lab=lab, course=course, result=result, checks=checks,
                  have_handout=(config.ROOT / lab["handout"]["pdf"]).exists(),
                  work_file=work_file, tasks=tasks, prep_by_id=prep_by_id)


@router.get("/lab/{lab_id}/starter")
def lab_starter(lab_id: str):
    """The starter file as plain text (handy on the phone)."""
    lab = labs.find_lab(lab_id)
    if lab is None:
        raise HTTPException(404, f"No lab {lab_id}")
    return PlainTextResponse((config.ROOT / lab["starter"]).read_text(encoding="utf-8"))


@router.get("/progress")
def progress_page(request: Request, session: Session = Depends(get_session)):
    from .. import exams
    sittings = []
    for e in exams.exams_for(session):
        for a in exams.attempts_of(session, e):
            if a.status == "graded":
                sittings.append((e, a))
    sittings.sort(key=lambda ea: ea[1].started_at, reverse=True)
    return render(request, "progress.html", session, sittings=sittings, days=services.study_days(session),
                  phase=services.phase_for(session, config.today()),
                  progress=services.progress(session), prep_weeks=services.prep_weeks(session),
                  recent=services.recent_study(session, 15),
                  activity=services.recent_activity(session, 15),
                  course_by_id={c.id: c for c in services.courses(session)})


@router.get("/settings")
def settings_page(request: Request, session: Session = Depends(get_session)):
    folder = backup.backup_dir(session)
    local = local_ai.status(session)
    busy = local_ai.blocker(local.loaded, local.model) if local.running else None
    return render(request, "settings.html", session, backup_dir=folder,
                  last_backup=backup.get_setting(session, "last_backup"),
                  last_error=backup.get_setting(session, "last_backup_error"),
                  data_dir=config.DATA_DIR, local=local,
                  local_settings={k: local_ai.setting(session, k) for k in local_ai.SETTINGS},
                  local_busy=local_ai.short_name(busy) if busy else None,
                  on_laptop=on_this_laptop(request), started_at=STARTED_AT,
                  shortcut=desktop_shortcut().exists())


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


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
STARTED_AT = config.now()  # when this server process started


def on_this_laptop(request: Request) -> bool:
    return bool(request.client) and request.client.host in LOCAL_HOSTS


def desktop_shortcut() -> Path:
    import os
    return Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs/Homebase.lnk"


@router.post("/settings/stop")
def stop_server(request: Request, session: Session = Depends(get_session)):
    """Stop Homebase (the desktop app's server). Only from the laptop itself, so a tap
    on the phone can't switch it off. Everything is already saved: each change is
    committed to SQLite the moment you make it."""
    import os
    import threading

    if not on_this_laptop(request):
        raise HTTPException(403, "Stop Homebase from the laptop, not over the network.")
    services.log(session, "app", "server.stop", "Stopped Homebase from Settings")
    session.commit()
    local_ai.stop_worker()
    threading.Timer(0.8, os._exit, (0,)).start()
    return TEMPLATES.TemplateResponse(request, "stopped.html", {})


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
