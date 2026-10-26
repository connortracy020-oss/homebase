"""Circuit Bench: the circuits you draw (design/CIRCUITS-PLAN.md).

The bench itself runs in the browser (app/static/circuits); this module stores circuits and
the predictions you check on them, and logs every change like the rest of Homebase.
"""
import json
import secrets

from sqlmodel import Session, select

from . import config
from .models import Circuit, CircuitAttempt, Course
from .services import course_by_code, log

FORMAT = "homebase-circuit"
MAX_BYTES = 2_000_000


class Conflict(Exception):
    """The circuit changed since you loaded it (another tab, or Claude)."""
    def __init__(self, circuit: Circuit):
        super().__init__(f"{circuit.title} was changed (now revision {circuit.rev})")
        self.circuit = circuit


def empty_doc(title: str, course: str = "ECE201") -> dict:
    return {"format": FORMAT, "version": 1, "title": title, "course": course,
            "parts": [], "wires": [], "view": {}, "study": {}}


def check_doc(doc) -> dict:
    """Light checks on a document from the browser or from Claude (the bench does the rest)."""
    if not isinstance(doc, dict) or doc.get("format", FORMAT) != FORMAT:
        raise ValueError("not a Homebase circuit")
    if not isinstance(doc.get("parts", []), list) or not isinstance(doc.get("wires", []), list):
        raise ValueError("parts and wires must be lists")
    if len(json.dumps(doc)) > MAX_BYTES:
        raise ValueError("that circuit is too big to save")
    for p in doc.get("parts", []):
        if not isinstance(p, dict) or not p.get("id") or not p.get("type"):
            raise ValueError("every part needs an id and a type")
    ids = [p["id"] for p in doc.get("parts", [])]
    if len(ids) != len(set(ids)):
        raise ValueError("two parts have the same name")
    return {**doc, "format": FORMAT, "version": doc.get("version", 1)}


def _slug(session: Session) -> str:
    while True:
        s = secrets.token_urlsafe(6).replace("-", "x").replace("_", "y")
        if not session.exec(select(Circuit).where(Circuit.slug == s)).first():
            return s


def list_circuits(session: Session, archived: bool = False) -> list[Circuit]:
    q = select(Circuit).where(Circuit.archived == archived).order_by(Circuit.updated_at.desc())
    return list(session.exec(q).all())


def get_circuit(session: Session, slug: str) -> Circuit | None:
    return session.exec(select(Circuit).where(Circuit.slug == slug)).first()


def create_circuit(session: Session, title: str = "Untitled circuit", course: str = "ECE201",
                   doc: dict | None = None, source: str = "you", week: int | None = None,
                   problem_id: int | None = None, actor: str = "app") -> Circuit:
    c = course_by_code(session, course) if course else None
    title = (title or "Untitled circuit").strip()[:120]
    doc = check_doc(doc or empty_doc(title, course))
    doc["title"] = title
    now = config.now()
    circuit = Circuit(slug=_slug(session), title=title, course_id=c.id if c else None, week=week,
                      source=source, problem_id=problem_id, doc=doc, created_at=now, updated_at=now,
                      updated_by="claude" if actor == "claude" else "you")
    session.add(circuit)
    session.flush()
    log(session, actor, "circuit.new", f"New circuit: {title}", circuit=circuit.slug)
    session.commit()
    session.refresh(circuit)
    return circuit


def save_circuit(session: Session, circuit: Circuit, doc: dict, base_rev: int | None,
                 summary: dict | None = None, actor: str = "app") -> Circuit:
    """Save a new version. base_rev is the revision the editor started from; if someone else
    saved in between, raise Conflict instead of overwriting their change."""
    if base_rev is not None and base_rev != circuit.rev:
        raise Conflict(circuit)
    doc = check_doc(doc)
    title = str(doc.get("title") or circuit.title).strip()[:120] or circuit.title
    circuit.doc, circuit.title = doc, title
    if summary is not None:
        circuit.summary = summary
    circuit.rev += 1
    circuit.updated_at = config.now()
    circuit.updated_by = "claude" if actor == "claude" else "you"
    # one log line per editing session is enough; saves happen every second or so
    if actor == "claude" or circuit.rev % 25 == 2:
        log(session, actor, "circuit.save", f"Edited circuit: {title}", circuit=circuit.slug, rev=circuit.rev)
    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit


def rename_circuit(session: Session, circuit: Circuit, title: str, actor: str = "app") -> Circuit:
    title = title.strip()[:120]
    if not title:
        raise ValueError("a circuit needs a name")
    circuit.title = title
    circuit.doc = {**circuit.doc, "title": title}
    circuit.rev += 1
    circuit.updated_at = config.now()
    log(session, actor, "circuit.rename", f"Renamed circuit: {title}", circuit=circuit.slug)
    session.add(circuit)
    session.commit()
    return circuit


def duplicate_circuit(session: Session, circuit: Circuit, actor: str = "app") -> Circuit:
    course = session.get(Course, circuit.course_id).code if circuit.course_id else ""
    return create_circuit(session, f"{circuit.title} (copy)", course, dict(circuit.doc),
                          source="you", week=circuit.week, actor=actor)


def set_archived(session: Session, circuit: Circuit, archived: bool, actor: str = "app") -> Circuit:
    circuit.archived = archived
    log(session, actor, "circuit.archive" if archived else "circuit.restore",
        f"{'Archived' if archived else 'Restored'} circuit: {circuit.title}", circuit=circuit.slug)
    session.add(circuit)
    session.commit()
    return circuit


def record_attempt(session: Session, circuit: Circuit, kind: str, quantity: str, guess: float,
                   truth: float, correct: bool, tags: list[str] | None = None, note: str = "",
                   actor: str = "app") -> CircuitAttempt:
    if kind not in ("predict", "check"):
        raise ValueError("kind must be predict or check")
    a = CircuitAttempt(circuit_id=circuit.id, at=config.now(), kind=kind, quantity=quantity[:80],
                       guess=float(guess), truth=float(truth), correct=bool(correct),
                       tags=[t for t in (tags or []) if isinstance(t, str)][:6], note=note[:500])
    session.add(a)
    verdict = "right" if correct else "off"
    log(session, actor, f"circuit.{kind}", f"{'Predicted' if kind == 'predict' else 'Checked'} {quantity} on {circuit.title}: {verdict}",
        circuit=circuit.slug, correct=correct, tags=a.tags)
    session.commit()
    session.refresh(a)
    return a


def attempts(session: Session, circuit: Circuit, limit: int = 50) -> list[CircuitAttempt]:
    q = select(CircuitAttempt).where(CircuitAttempt.circuit_id == circuit.id).order_by(CircuitAttempt.at.desc()).limit(limit)
    return list(session.exec(q).all())


def to_json(session: Session, circuit: Circuit) -> dict:
    course = session.get(Course, circuit.course_id) if circuit.course_id else None
    return {"slug": circuit.slug, "title": circuit.title, "course": course.code if course else "",
            "week": circuit.week, "source": circuit.source, "rev": circuit.rev, "doc": circuit.doc,
            "updated_at": circuit.updated_at.isoformat(timespec="seconds"), "updated_by": circuit.updated_by,
            "archived": circuit.archived}
