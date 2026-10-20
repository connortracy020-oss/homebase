"""Pages for studying: videos with notes, problem sets, single problems, submissions."""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import backup, config, feedback, pdfpages, review, services, uploads
from ..db import get_session
from ..models import Course, Problem, ProblemSet, Submission
from .pages import render

router = APIRouter()

KEY_LABELS = {
    "official_worked": "Official worked solution",
    "official_answer": "Official answer only",
    "computed": "Answer computed and checked by code",
    "none": "No key: feedback on reasoning only",
}


def _video_or_404(session, slug):
    video = services.video_by_slug(session, slug)
    if video is None:
        raise HTTPException(404, f"No video {slug}")
    return video


def _problem_or_404(session, slug):
    problem = services.problem_by_slug(session, slug)
    if problem is None:
        raise HTTPException(404, f"No problem {slug}")
    return problem


def note_json(n):
    return {"id": n.id, "t_sec": n.t_sec, "body": n.body, "actor": n.actor,
            "created_at": n.created_at.isoformat(timespec="minutes")}


# ---- library files ------------------------------------------------------------------

@router.get("/library/{path:path}")
def library_file(path: str):
    """Serve a file from library/ (only from there)."""
    target = (config.LIBRARY_DIR / path).resolve()
    if not target.is_relative_to(config.LIBRARY_DIR.resolve()) or not target.is_file():
        raise HTTPException(404, "Not in the library")
    return FileResponse(target)


# ---- videos -------------------------------------------------------------------------

@router.get("/video/{slug}")
def video_page(slug: str, request: Request, session: Session = Depends(get_session)):
    video = _video_or_404(session, slug)
    course = session.get(Course, video.course_id)
    return render(request, "video.html", session, video=video, course=course,
                  chapters=services.chapters(session, video),
                  notes=[note_json(n) for n in services.notes_for(session, video=video)])


@router.post("/video/{slug}/watched")
def video_watched(slug: str, request: Request, watched: str = Form(""),
                  session: Session = Depends(get_session)):
    video = services.set_watched(session, _video_or_404(session, slug), watched == "on")
    if request.headers.get("x-requested-with") == "fetch":
        return {"watched": video.watched_at is not None}
    return RedirectResponse(f"/video/{slug}", status_code=303)


class PositionIn(BaseModel):
    seconds: int


@router.post("/api/videos/{slug}/position")
def video_position(slug: str, body: PositionIn, session: Session = Depends(get_session)):
    services.save_position(session, _video_or_404(session, slug), body.seconds)
    return {"ok": True}


class NoteIn(BaseModel):
    body: str
    t_sec: int | None = None


@router.post("/api/videos/{slug}/notes")
def add_video_note(slug: str, body: NoteIn, session: Session = Depends(get_session)):
    video = _video_or_404(session, slug)
    try:
        note = services.add_note(session, session.get(Course, video.course_id), body.body,
                                 video=video, t_sec=body.t_sec)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return note_json(note)


class NoteEdit(BaseModel):
    body: str


@router.put("/api/notes/{note_id}")
def edit_note(note_id: int, body: NoteEdit, session: Session = Depends(get_session)):
    try:
        return note_json(services.update_note(session, note_id, body.body))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.delete("/api/notes/{note_id}")
def remove_note(note_id: int, session: Session = Depends(get_session)):
    try:
        services.delete_note(session, note_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


# ---- problem sets and problems ---------------------------------------------------------

@router.get("/pset/{slug}")
def pset_page(slug: str, request: Request, session: Session = Depends(get_session)):
    pset = services.pset_by_slug(session, slug)
    if pset is None:
        raise HTTPException(404, f"No problem set {slug}")
    probs = services.problems(session, pset)
    return render(request, "pset.html", session, pset=pset, problems=probs,
                  course=session.get(Course, pset.course_id), KEY_LABELS=KEY_LABELS,
                  results=services.last_results(session, [p.id for p in probs]))


@router.get("/problem/{slug}")
def problem_page(slug: str, request: Request, session: Session = Depends(get_session),
                 checked: int | None = None):
    problem = _problem_or_404(session, slug)
    pset = session.get(ProblemSet, problem.set_id)
    siblings = services.problems(session, pset)
    i = next(k for k, p in enumerate(siblings) if p.id == problem.id)
    history = services.attempts(session, problem)
    last_check = next((a for a in history if a.id == checked), None) if checked else None
    st, key = problem.statement, problem.key
    return render(
        request, "problem.html", session, problem=problem, pset=pset,
        subs=services.submissions(session, problem=problem, limit=5),
        course=session.get(Course, pset.course_id), KEY_LABELS=KEY_LABELS,
        prev=siblings[i - 1] if i > 0 else None,
        next=siblings[i + 1] if i + 1 < len(siblings) else None,
        position=(i + 1, len(siblings)), history=history, last_check=last_check,
        notes=services.notes_for(session, problem=problem),
        statement_page=pdfpages.page_of(st) if "pdf" in st else None,
        key_page=pdfpages.page_of(key) if "pdf" in key else None,
        statement_missing="pdf" in st and not (config.ROOT / st["pdf"]).exists(),
        mistake=review.open_mistake_for(session, problem), CAUSES=feedback.CAUSES,
    )


@router.get("/problem/{slug}/{part}.png")
def problem_image(slug: str, part: str, session: Session = Depends(get_session)):
    problem = _problem_or_404(session, slug)
    region = {"statement": problem.statement, "key": problem.key}.get(part)
    if not region or "pdf" not in region:
        raise HTTPException(404, "No image for this part")
    try:
        png = pdfpages.render(region)
    except pdfpages.RegionError as e:
        raise HTTPException(404, str(e))
    return Response(png, media_type="image/png", headers={"Cache-Control": "max-age=86400"})


@router.post("/problem/{slug}/check")
async def problem_check(slug: str, request: Request, session: Session = Depends(get_session)):
    problem = _problem_or_404(session, slug)
    form = await request.form()
    given = [str(form.get(f"a{i}", "")) for i in range(len(problem.key.get("answers", [])))]
    try:
        attempt, _ = services.check_problem(session, problem, given)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return RedirectResponse(f"/problem/{slug}?checked={attempt.id}#result", status_code=303)


@router.post("/problem/{slug}/rate")
def problem_rate(slug: str, result: str = Form(...), note: str = Form(""),
                 log: str = Form(""), cause: str = Form(""),
                 session: Session = Depends(get_session)):
    """The rating form's "add to mistake log" box (on by default) decides for shaky and miss."""
    problem = _problem_or_404(session, slug)
    try:
        services.rate_problem(session, problem, result, note,
                              add_to_log=(log == "on" and result != "solid"), cause=cause)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return RedirectResponse(f"/problem/{slug}#history", status_code=303)


@router.post("/problem/{slug}/notes")
def problem_note(slug: str, body: str = Form(...), session: Session = Depends(get_session)):
    problem = _problem_or_404(session, slug)
    pset = session.get(ProblemSet, problem.set_id)
    try:
        services.add_note(session, session.get(Course, pset.course_id), body, problem=problem)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return RedirectResponse(f"/problem/{slug}#notes", status_code=303)


# ---- submissions and feedback ---------------------------------------------------------

def feedback_mode(session: Session) -> str:
    """"session" (default): wait for a Claude session. "api": review right away."""
    mode = backup.get_setting(session, "feedback_mode", "session")
    return "api" if mode == "api" and feedback.api_available() else "session"


def _sub_or_404(session, sub_id: int) -> Submission:
    sub = session.get(Submission, sub_id)
    if sub is None:
        raise HTTPException(404, f"No submission {sub_id}")
    return sub


@router.post("/problem/{slug}/submit")
async def submit_work(slug: str, request: Request, background: BackgroundTasks,
                      files: list[UploadFile] = File(...), note: str = Form(""),
                      session: Session = Depends(get_session)):
    problem = _problem_or_404(session, slug)
    pset = session.get(ProblemSet, problem.set_id)
    data = [(f.filename or "upload", await f.read()) for f in files if f.filename]
    try:
        sub = services.create_submission(session, problem, session.get(Course, pset.course_id),
                                         data, note)
    except uploads.UploadError as e:
        return render(request, "upload_error.html", session, problem=problem, message=str(e))
    if feedback_mode(session) == "api":
        sub.status = "reviewing"
        session.commit()
        background.add_task(feedback.run_api_review_by_id, sub.id)
    return RedirectResponse(f"/submission/{sub.id}", status_code=303)


@router.get("/submission/{sub_id}")
def submission_page(sub_id: int, request: Request, session: Session = Depends(get_session)):
    sub = _sub_or_404(session, sub_id)
    if sub.exam_attempt_id:  # exam work is graded on the exam sitting's page
        return RedirectResponse(f"/attempt/{sub.exam_attempt_id}#grade", status_code=303)
    problem = session.get(Problem, sub.problem_id) if sub.problem_id else None
    pset = session.get(ProblemSet, problem.set_id) if problem else None
    return render(request, "submission.html", session, sub=sub, problem=problem, pset=pset,
                  course=session.get(Course, sub.course_id), api_ok=feedback.api_available(),
                  KEY_LABELS=KEY_LABELS)


@router.post("/submission/{sub_id}/api-review")
def submission_api_review(sub_id: int, background: BackgroundTasks,
                          session: Session = Depends(get_session)):
    sub = _sub_or_404(session, sub_id)
    if not feedback.api_available():
        raise HTTPException(422, "No ANTHROPIC_API_KEY in .env, so instant feedback is off.")
    sub.status = "reviewing"
    session.commit()
    background.add_task(feedback.run_api_review_by_id, sub.id)
    return RedirectResponse(f"/submission/{sub_id}", status_code=303)


@router.post("/submission/{sub_id}/confirm")
def submission_confirm(sub_id: int, verdict: str = Form(...), session: Session = Depends(get_session)):
    try:
        feedback.confirm(session, _sub_or_404(session, sub_id), verdict)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return RedirectResponse(f"/submission/{sub_id}#confirm", status_code=303)


@router.post("/submission/{sub_id}/delete")
def submission_delete(sub_id: int, session: Session = Depends(get_session)):
    sub = _sub_or_404(session, sub_id)
    problem = session.get(Problem, sub.problem_id) if sub.problem_id else None
    services.delete_submission(session, sub)
    return RedirectResponse(f"/problem/{problem.slug}" if problem else "/submissions", status_code=303)


@router.get("/submissions")
def submissions_page(request: Request, session: Session = Depends(get_session)):
    rows = services.submissions(session, limit=100)
    ids = [s.problem_id for s in rows if s.problem_id]
    probs = {p.id: p for p in session.exec(select(Problem).where(Problem.id.in_(ids)))}
    return render(request, "submissions.html", session, rows=rows, probs=probs,
                  mode=feedback_mode(session), api_ok=feedback.api_available())


@router.post("/settings/feedback-mode")
def set_feedback_mode(mode: str = Form(...), session: Session = Depends(get_session)):
    if mode not in ("session", "api"):
        raise HTTPException(422, "mode must be session or api")
    backup.set_setting(session, "feedback_mode", mode)
    return RedirectResponse("/submissions", status_code=303)


@router.get("/uploads/{path:path}")
def upload_file(path: str):
    target = (config.UPLOAD_DIR / path).resolve()
    if not target.is_relative_to(config.UPLOAD_DIR.resolve()) or not target.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(target)
