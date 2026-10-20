"""Pages and JSON for the local AI (see app/local_ai.py).

The problem page posts a question or a typed answer, gets a job id back, and
polls /local/jobs/<id> until the reply is done.
"""
from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session, func, select

from .. import backup, local_ai
from ..db import get_session
from ..models import LocalJob, Problem, Submission

router = APIRouter()


def _problem(session: Session, slug: str) -> Problem:
    problem = session.exec(select(Problem).where(Problem.slug == slug)).first()
    if problem is None:
        raise HTTPException(404, f"No problem {slug}")
    return problem


def _job(session: Session, job_id: int) -> LocalJob:
    job = session.get(LocalJob, job_id)
    if job is None:
        raise HTTPException(404, f"No job {job_id}")
    return job


def _view(session: Session, job: LocalJob) -> dict:
    view = local_ai.job_view(job)
    if job.status in ("queued", "waiting"):
        view["position"] = int(session.exec(
            select(func.count()).select_from(LocalJob)
            .where(LocalJob.status.in_(["queued", "waiting"]), LocalJob.id < job.id)).one()) + 1
    return view


@router.post("/problem/{slug}/ask")
def ask(slug: str, question: str = Form(""), mode: str = Form("hint"),
        session: Session = Depends(get_session)):
    problem = _problem(session, slug)
    question = question.strip()[:2000]
    if mode not in local_ai.ASK_MODES:
        raise HTTPException(422, f"mode must be one of {local_ai.ASK_MODES}")
    job = local_ai.enqueue(session, "ask", problem_id=problem.id,
                           input={"question": question or "Give me a hint.", "mode": mode})
    return _view(session, job)


@router.post("/problem/{slug}/answer-check")
def answer_check(slug: str, answer: str = Form(...), session: Session = Depends(get_session)):
    problem = _problem(session, slug)
    if problem.key_type == "none":
        raise HTTPException(422, "No official key exists for this problem, so there's nothing to check against.")
    answer = answer.strip()[:1000]
    if not answer:
        raise HTTPException(422, "Type your final answer first.")
    job = local_ai.enqueue(session, "answer", problem_id=problem.id, input={"answer": answer})
    return _view(session, job)


@router.post("/problem/{slug}/ask/clear")
def ask_clear(slug: str, session: Session = Depends(get_session)):
    problem = _problem(session, slug)
    for job in local_ai.history(session, problem.id, limit=500):
        if job.status in ("done", "error", "cancelled"):
            session.delete(job)
    session.commit()
    return {"ok": True}


@router.get("/local/jobs/{job_id}")
def job_status(job_id: int, session: Session = Depends(get_session)):
    return _view(session, _job(session, job_id))


@router.post("/local/jobs/{job_id}/run-anyway")
def run_anyway(job_id: int, session: Session = Depends(get_session)):
    job = _job(session, job_id)
    if job.status in ("queued", "waiting"):
        job.run_anyway = True
        session.commit()
        local_ai._wake.set()
    return _view(session, job)


@router.post("/local/jobs/{job_id}/cancel")
def cancel(job_id: int, session: Session = Depends(get_session)):
    job = _job(session, job_id)
    if job.status in ("queued", "waiting"):
        job.status = "cancelled"
        if job.submission_id:
            sub = session.get(Submission, job.submission_id)
            if sub is not None:
                sub.local_status = ""
                if sub.status == "local":
                    sub.status = "pending"  # no local check, so Claude's queue gets it
        session.commit()
    return _view(session, job)


@router.get("/local/status")
def local_status(session: Session = Depends(get_session)):
    st = local_ai.status(session)
    return {"running": st.running, "version": st.version, "error": st.error, "model": st.model,
            "vision_models": st.vision_models, "loaded": st.loaded,
            "busy_with": local_ai.blocker(st.loaded, st.model) if st.running else None}


@router.post("/local/test")
def local_test(session: Session = Depends(get_session)):
    job = local_ai.enqueue(session, "test", input={"question": "Say hello to a student in under 10 words."})
    return _view(session, job)


# ---- submissions ---------------------------------------------------------------------

def _sub(session: Session, sub_id: int) -> Submission:
    sub = session.get(Submission, sub_id)
    if sub is None:
        raise HTTPException(404, f"No submission {sub_id}")
    return sub


def local_job_for(session: Session, sub: Submission) -> LocalJob | None:
    return session.exec(select(LocalJob).where(LocalJob.submission_id == sub.id)
                        .order_by(LocalJob.id.desc())).first()


def queue_local_review(session: Session, sub: Submission) -> LocalJob:
    sub.local_status, sub.local_error = "queued", ""
    session.commit()
    return local_ai.enqueue(session, "review", problem_id=sub.problem_id, submission_id=sub.id)


@router.post("/submission/{sub_id}/local-check")
def submission_local_check(sub_id: int, session: Session = Depends(get_session)):
    sub = _sub(session, sub_id)
    if sub.exam_attempt_id:
        raise HTTPException(422, "Timed exams are graded by Claude and you, not the local model.")
    if sub.local_status in ("queued", "waiting", "running"):
        return RedirectResponse(f"/submission/{sub_id}", status_code=303)
    queue_local_review(session, sub)
    return RedirectResponse(f"/submission/{sub_id}", status_code=303)


@router.post("/submission/{sub_id}/to-claude")
def submission_to_claude(sub_id: int, session: Session = Depends(get_session)):
    sub = _sub(session, sub_id)
    if sub.status == "local":
        sub.status = "pending"
        session.commit()
    return RedirectResponse(f"/submission/{sub_id}", status_code=303)


@router.get("/submission/{sub_id}/local.json")
def submission_local(sub_id: int, session: Session = Depends(get_session)):
    sub = _sub(session, sub_id)
    job = local_job_for(session, sub)
    return {"local_status": sub.local_status, "error": sub.local_error,
            "job": _view(session, job) if job else None}


# ---- settings ------------------------------------------------------------------------

@router.post("/settings/local")
def settings_local(model: str = Form(""), check_submissions: str = Form(""), polite: str = Form(""),
                   session: Session = Depends(get_session)):
    st = local_ai.status(session)
    if model and st.running and model not in st.vision_models:
        raise HTTPException(422, f"{model} isn't a vision model in your Ollama.")
    backup.set_setting(session, "local_model", model)
    backup.set_setting(session, "local_check_submissions", "1" if check_submissions else "0")
    backup.set_setting(session, "local_polite", "1" if polite else "0")
    return RedirectResponse("/settings#local-ai", status_code=303)
