"""Timed practice exam pages."""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from .. import exams, feedback, services, uploads
from ..db import get_session
from ..models import Course, Exam, ExamAttempt
from .pages import render
from .study import KEY_LABELS, feedback_mode

router = APIRouter()


def _exam_or_404(session, slug) -> Exam:
    exam = exams.exam_by_slug(session, slug)
    if exam is None:
        raise HTTPException(404, f"No exam {slug}")
    return exam


def _attempt_or_404(session, aid) -> ExamAttempt:
    a = session.get(ExamAttempt, aid)
    if a is None:
        raise HTTPException(404, f"No exam sitting {aid}")
    return a


@router.get("/exams")
def exams_page(request: Request, session: Session = Depends(get_session)):
    groups = []
    for c in services.courses(session):
        rows = []
        for e in exams.exams_for(session, c):
            graded = [a for a in exams.attempts_of(session, e) if a.status == "graded"]
            rows.append((e, graded[0] if graded else None, exams.open_attempt(session, e)))
        groups.append((c, rows))
    return render(request, "exams.html", session, groups=groups)


@router.get("/exam/{slug}")
def exam_page(slug: str, request: Request, session: Session = Depends(get_session)):
    exam = _exam_or_404(session, slug)
    probs = exams.problems_of(session, exam)
    return render(request, "exam.html", session, exam=exam, problems=probs,
                  course=session.get(Course, exam.course_id), attempts=exams.attempts_of(session, exam),
                  open=exams.open_attempt(session, exam), KEY_LABELS=KEY_LABELS)


@router.post("/exam/{slug}/start")
def exam_start(slug: str, session: Session = Depends(get_session)):
    attempt = exams.start(session, _exam_or_404(session, slug))
    return RedirectResponse(f"/attempt/{attempt.id}", status_code=303)


@router.get("/attempt/{aid}")
def attempt_page(aid: int, request: Request, session: Session = Depends(get_session)):
    attempt = _attempt_or_404(session, aid)
    exam = session.get(Exam, attempt.exam_id)
    course = session.get(Course, exam.course_id)
    probs = exams.problems_of(session, exam)
    if attempt.status == "in_progress":
        return render(request, "exam_mode.html", session, exam=exam, attempt=attempt, problems=probs,
                      course=course, seconds_left=exams.seconds_left(attempt))
    sub = exams.submission_of(session, attempt)
    return render(request, "attempt.html", session, exam=exam, attempt=attempt, problems=probs,
                  course=course, sub=sub, api_ok=feedback.api_available(),
                  mode=feedback_mode(session))


@router.post("/attempt/{aid}/finish")
def attempt_finish(aid: int, session: Session = Depends(get_session)):
    exams.finish(session, _attempt_or_404(session, aid))
    return RedirectResponse(f"/attempt/{aid}", status_code=303)


@router.post("/attempt/{aid}/upload")
async def attempt_upload(aid: int, request: Request, background: BackgroundTasks,
                         files: list[UploadFile] = File(...), session: Session = Depends(get_session)):
    attempt = _attempt_or_404(session, aid)
    if attempt.status == "in_progress":
        exams.finish(session, attempt)
    exam = session.get(Exam, attempt.exam_id)
    data = [(f.filename or "upload", await f.read()) for f in files if f.filename]
    try:
        services.create_submission(session, None, session.get(Course, exam.course_id), data,
                                   note=f"Timed exam: {exam.title}", exam_attempt_id=attempt.id)
    except uploads.UploadError as e:
        raise HTTPException(422, str(e))
    if feedback_mode(session) == "api":
        background.add_task(exams.run_api_review_by_id, attempt.id)
    return RedirectResponse(f"/attempt/{aid}#grade", status_code=303)


@router.post("/attempt/{aid}/api-review")
def attempt_api_review(aid: int, background: BackgroundTasks, session: Session = Depends(get_session)):
    _attempt_or_404(session, aid)
    if not feedback.api_available():
        raise HTTPException(422, "No ANTHROPIC_API_KEY in .env, so instant grading is off.")
    background.add_task(exams.run_api_review_by_id, aid)
    return RedirectResponse(f"/attempt/{aid}#grade", status_code=303)


@router.post("/attempt/{aid}/grade")
async def attempt_grade(aid: int, request: Request, session: Session = Depends(get_session)):
    attempt = _attempt_or_404(session, aid)
    if attempt.status == "in_progress":
        raise HTTPException(409, "Finish the exam before grading it.")
    form = await request.form()
    scores, to_mistakes = {}, set()
    for key, value in form.items():
        if key.startswith("p") and key[1:].isdigit():
            try:
                scores[int(key[1:])] = float(str(value) or "nan")
            except ValueError:
                raise HTTPException(422, "Points must be numbers.")
        if key.startswith("m") and key[1:].isdigit() and value == "on":
            to_mistakes.add(int(key[1:]))
    try:
        exams.grade(session, attempt, scores, to_mistakes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return RedirectResponse(f"/attempt/{aid}#result", status_code=303)
