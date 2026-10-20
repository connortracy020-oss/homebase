"""Mistake log and spaced-review pages."""
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from .. import config, feedback, review, services
from ..db import get_session
from ..generators import check_answer, generate
from ..models import Course, Mistake, Problem, ProblemSet, ReviewAttempt
from .pages import render
from .study import KEY_LABELS

router = APIRouter()


def _mistake_or_404(session, mid: int) -> Mistake:
    m = session.get(Mistake, mid)
    if m is None:
        raise HTTPException(404, f"No mistake {mid}")
    return m


def _swept_today(session, course: Course) -> set[int]:
    start = config.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = session.exec(select(ReviewAttempt.mistake_id).where(ReviewAttempt.sweep.is_(True),
                                                               ReviewAttempt.at >= start)).all()
    return set(rows)


def _sweep_queue(session, course: Course) -> list[Mistake]:
    done = _swept_today(session, course)
    return [m for m in review.sweep_items(session, course) if m.id not in done]


def _rows(session, mistakes):
    """(mistake, problem, course) for templates."""
    out = []
    for m in mistakes:
        out.append((m, session.get(Problem, m.problem_id), session.get(Course, m.course_id)))
    return out


@router.get("/review")
def review_home(request: Request, session: Session = Depends(get_session)):
    today = config.today()
    queue, more = review.todays_queue(session, today)
    week = session.exec(select(Mistake).where(Mistake.retired_at.is_(None),
                                              Mistake.due > today,
                                              Mistake.due <= today + timedelta(days=7))).all()
    per_course = [(c, review.box_counts(session, c)) for c in services.courses(session)]
    return render(request, "review.html", session, queue=_rows(session, queue), more=more,
                  coming=len(week), per_course=per_course, minutes=review.MINUTES_PER_ITEM,
                  budget=review.DAILY_BUDGET_MIN)


@router.get("/review/next")
def review_next(sweep: str = "", all: int = 0, session: Session = Depends(get_session)):
    if sweep:
        course = services.course_by_code(session, sweep)
        if course is None:
            raise HTTPException(404, f"No course {sweep}")
        items = _sweep_queue(session, course)
        if not items:
            return RedirectResponse(f"/review?swept={course.code}", status_code=303)
        return RedirectResponse(f"/review/{items[0].id}?sweep={course.code}", status_code=303)
    items = review.due_items(session) if all else review.todays_queue(session)[0]
    if not items:
        return RedirectResponse("/review?done=1", status_code=303)
    return RedirectResponse(f"/review/{items[0].id}{'?all=1' if all else ''}", status_code=303)


@router.get("/review/{mid}")
def review_item(mid: int, request: Request, sweep: str = "", all: int = 0, checked: str = "",
                session: Session = Depends(get_session)):
    m = _mistake_or_404(session, mid)
    problem = session.get(Problem, m.problem_id)
    pset = session.get(ProblemSet, problem.set_id)
    seed = review.variant_seed(m, problem)
    variant = generate(problem.generator, seed) if seed is not None else None
    marks = [c == "1" for c in checked] if checked else None
    return render(request, "review_item.html", session, m=m, problem=problem, pset=pset,
                  course=session.get(Course, m.course_id), variant=variant, seed=seed,
                  marks=marks, sweep=sweep, all=all, history=review.history(session, m),
                  intervals=review.INTERVALS, KEY_LABELS=KEY_LABELS)


@router.post("/review/{mid}/check")
async def review_check(mid: int, request: Request, session: Session = Depends(get_session)):
    """Check typed answers to the new-numbers variant of a generated problem."""
    m = _mistake_or_404(session, mid)
    problem = session.get(Problem, m.problem_id)
    form = await request.form()
    seed = int(form.get("seed", 0))
    if seed != review.variant_seed(m, problem):
        raise HTTPException(409, "That variant is out of date; reload the page.")
    made = generate(problem.generator, seed)
    marks = [check_answer(a, str(form.get(f"a{i}", ""))) for i, a in enumerate(made["key"]["answers"])]
    qs = f"checked={''.join('1' if x else '0' for x in marks)}"
    for extra in ("sweep", "all"):
        if form.get(extra):
            qs += f"&{extra}={form.get(extra)}"
    return RedirectResponse(f"/review/{mid}?{qs}#rate", status_code=303)


@router.post("/review/{mid}/rate")
def review_rate(mid: int, outcome: str = Form(...), note: str = Form(""), sweep: str = Form(""),
                all: str = Form(""), seed: str = Form(""), session: Session = Depends(get_session)):
    m = _mistake_or_404(session, mid)
    try:
        review.record_review(session, m, outcome, note, sweep=bool(sweep),
                             seed=int(seed) if seed else None)
    except ValueError as e:
        raise HTTPException(422, str(e))
    target = f"/review/next?sweep={sweep}" if sweep else f"/review/next{'?all=1' if all else ''}"
    return RedirectResponse(target, status_code=303)


@router.get("/mistakes")
def mistakes_page(request: Request, course: str = "", session: Session = Depends(get_session)):
    c = services.course_by_code(session, course) if course else None
    rows = _rows(session, review.all_mistakes(session, c))
    summary = [(co, review.box_counts(session, co), review.cause_counts(session, co))
               for co in services.courses(session)]
    return render(request, "mistakes.html", session, rows=rows, summary=summary, selected=c,
                  intervals=review.INTERVALS)


@router.post("/problem/{slug}/mistake")
def add_mistake_manually(slug: str, cause: str = Form(""), note: str = Form(""),
                         session: Session = Depends(get_session)):
    problem = services.problem_by_slug(session, slug)
    if problem is None:
        raise HTTPException(404, f"No problem {slug}")
    if cause and cause not in feedback.CAUSES:
        raise HTTPException(422, "unknown cause")
    review.add_mistake(session, problem, source="manual", cause=cause, note=note)
    return RedirectResponse(f"/problem/{slug}#history", status_code=303)


@router.post("/mistakes/{mid}/delete")
def delete_mistake(mid: int, session: Session = Depends(get_session)):
    review.delete_mistake(session, _mistake_or_404(session, mid))
    return RedirectResponse("/mistakes", status_code=303)
