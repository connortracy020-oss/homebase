"""Circuit Bench pages and the JSON the bench saves through."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlmodel import Session

from .. import circuits as cs
from .. import services
from ..db import get_session
from .pages import render

router = APIRouter()


def _circuit_or_404(session: Session, slug: str):
    c = cs.get_circuit(session, slug)
    if c is None:
        raise HTTPException(404, "No such circuit")
    return c


@router.get("/circuits")
def circuits_page(request: Request, archived: bool = False, session: Session = Depends(get_session)):
    items = cs.list_circuits(session, archived=archived)
    by_id = {c.id: c for c in services.courses(session)}
    return render(request, "circuits_list.html", session, items=items, archived=archived, course_by_id=by_id)


@router.get("/circuits/selftest")
def selftest_page(request: Request, session: Session = Depends(get_session)):
    """The bench's solver against published answers, run by whatever browser opens it."""
    return render(request, "circuits_selftest.html", session)


@router.post("/circuits/new")
def new_circuit(title: str = Form("Untitled circuit"), course: str = Form("ECE201"),
                session: Session = Depends(get_session)):
    c = cs.create_circuit(session, title, course)
    return RedirectResponse(f"/circuits/{c.slug}", status_code=303)


@router.post("/circuits/from-problem/{slug}")
def from_problem(slug: str, session: Session = Depends(get_session)):
    problem = services.problem_by_slug(session, slug)
    if problem is None:
        raise HTTPException(404, "No such problem")
    try:
        c = cs.open_for_problem(session, problem)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return RedirectResponse(f"/circuits/{c.slug}", status_code=303)


@router.get("/circuits/{slug}")
def bench_page(request: Request, slug: str, session: Session = Depends(get_session)):
    c = _circuit_or_404(session, slug)
    data = {**cs.to_json(session, c), "notes": cs.note_targets(session, c)}
    return render(request, "circuit.html", session, circuit=c, data=data, attempts=cs.attempts(session, c, 20))


@router.post("/circuits/{slug}/duplicate")
def duplicate(slug: str, session: Session = Depends(get_session)):
    c = cs.duplicate_circuit(session, _circuit_or_404(session, slug))
    return RedirectResponse(f"/circuits/{c.slug}", status_code=303)


@router.post("/circuits/{slug}/archive")
def archive(slug: str, archived: bool = Form(True), session: Session = Depends(get_session)):
    cs.set_archived(session, _circuit_or_404(session, slug), archived)
    return RedirectResponse("/circuits", status_code=303)


# ---- JSON for the bench ----

class SaveIn(BaseModel):
    doc: dict
    rev: int | None = None
    summary: dict | None = None


@router.get("/api/circuits/{slug}")
def get_json(slug: str, session: Session = Depends(get_session)):
    return cs.to_json(session, _circuit_or_404(session, slug))


@router.put("/api/circuits/{slug}")
def save_json(slug: str, body: SaveIn, session: Session = Depends(get_session)):
    c = _circuit_or_404(session, slug)
    try:
        c = cs.save_circuit(session, c, body.doc, body.rev, body.summary)
    except cs.Conflict as e:
        return JSONResponse({"detail": str(e), "current": cs.to_json(session, e.circuit)}, status_code=409)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"rev": c.rev, "title": c.title, "updated_at": c.updated_at.isoformat(timespec="seconds")}


class RenameIn(BaseModel):
    title: str


@router.post("/api/circuits/{slug}/rename")
def rename_json(slug: str, body: RenameIn, session: Session = Depends(get_session)):
    try:
        c = cs.rename_circuit(session, _circuit_or_404(session, slug), body.title)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"rev": c.rev, "title": c.title}


@router.post("/api/circuits/{slug}/snapshot")
async def snapshot_json(slug: str, file: UploadFile = File(...), caption: str = Form(""), unit_id: int | None = Form(None),
                        part: str = Form("ideas"), session: Session = Depends(get_session)):
    """Add to notes: a picture of the circuit, in a unit of its course's notebook."""
    from .. import notes
    c = _circuit_or_404(session, slug)
    try:
        block, unit = cs.snapshot_to_notes(session, c, await file.read(), caption, unit_id, part)
    except ValueError as e:
        raise HTTPException(422, str(e))
    code = session.get(cs.Course, c.course_id).code
    return {"block": block.id, "unit": unit.title, "part": notes.PART_NAMES[part],
            "url": f"/notes/{code}?u={unit.id}#b{block.id}"}


class AttemptIn(BaseModel):
    kind: str = "predict"
    quantity: str
    guess: float
    truth: float
    correct: bool
    tags: list[str] = []
    note: str = ""


@router.post("/api/circuits/{slug}/attempts")
def attempt_json(slug: str, body: AttemptIn, session: Session = Depends(get_session)):
    c = _circuit_or_404(session, slug)
    try:
        a = cs.record_attempt(session, c, body.kind, body.quantity, body.guess, body.truth, body.correct, body.tags, body.note)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"id": a.id}
