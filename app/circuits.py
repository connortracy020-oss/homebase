"""Circuit Bench: the circuits you draw (design/CIRCUITS-PLAN.md).

The bench itself runs in the browser (app/static/circuits); this module stores circuits and
the predictions you check on them, and logs every change like the rest of Homebase.
"""
import json
import secrets
from datetime import timedelta

from sqlmodel import Session, select

from . import config
from .models import Circuit, CircuitAttempt, Course, Problem, ProblemSet
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
    if not correct and circuit.problem_id:
        _log_miss(session, circuit, a, actor)
    verdict = "right" if correct else "off"
    log(session, actor, f"circuit.{kind}", f"{'Predicted' if kind == 'predict' else 'Checked'} {quantity} on {circuit.title}: {verdict}",
        circuit=circuit.slug, correct=correct, tags=a.tags)
    session.commit()
    session.refresh(a)
    return a


def _log_miss(session: Session, circuit: Circuit, a: CircuitAttempt, actor: str) -> None:
    """A wrong prediction or hand check on a problem's circuit goes into the mistake log, like a
    wrong answer check: once a day per problem, however many values were off."""
    from . import review
    problem = session.get(Problem, circuit.problem_id)
    if problem is None:
        return
    logged = review.open_mistake_for(session, problem)
    if logged and logged.box == 1 and logged.due == config.today() + timedelta(days=review.INTERVALS[1]):
        return  # already logged (or sent back to box 1) today
    cause = ("algebra-sign" if "sign" in a.tags else "units" if "units" in a.tags
             else "setup" if a.kind == "check" else "concept")
    did = "predicted" if a.kind == "predict" else "worked out"
    review.add_mistake(session, problem, source="bench", cause=cause, actor=actor,
                       note=f"Circuit Bench: {did} {a.quantity} = {a.guess:.4g}, but the circuit gives {a.truth:.4g}.")


def attempts(session: Session, circuit: Circuit, limit: int = 50) -> list[CircuitAttempt]:
    q = select(CircuitAttempt).where(CircuitAttempt.circuit_id == circuit.id).order_by(CircuitAttempt.at.desc()).limit(limit)
    return list(session.exec(q).all())


def circuit_for_problem(session: Session, problem) -> Circuit | None:
    q = select(Circuit).where(Circuit.problem_id == problem.id, Circuit.archived == False)  # noqa: E712
    return session.exec(q.order_by(Circuit.updated_at.desc())).first()


BOOK_PATH = config.CONTENT_DIR / "ece201" / "bench.json"
_book: dict | None = None


def book_circuits() -> dict:
    """Book exercises drawn on the bench: {pdf, circuits: {label: {note, doc}}}. Written by
    scripts/export_bench_book.mjs from app/static/circuits/selftest/book.js."""
    global _book
    if _book is None:
        _book = json.loads(BOOK_PATH.read_text(encoding="utf-8")) if BOOK_PATH.exists() else {"circuits": {}}
    return _book


def bench_for(problem) -> dict | None:
    """What "Open on the Circuit Bench" opens for a problem, as {doc, note, book}: a generated
    problem's own circuit, or the bench's drawing of a book exercise's figure. None if neither."""
    st = problem.statement or {}
    if st.get("bench"):
        return {"doc": st["bench"], "note": "", "book": False}
    book = book_circuits()
    entry = book["circuits"].get(problem.label) if st.get("pdf") and st.get("pdf") == book.get("pdf") else None
    return {"doc": entry["doc"], "note": entry.get("note", ""), "book": True} if entry else None


def open_for_problem(session: Session, problem, actor: str = "app") -> Circuit:
    """The bench copy of a problem's circuit (made the first time, kept after that, so your
    work on it isn't thrown away)."""
    existing = circuit_for_problem(session, problem)
    if existing:
        return existing
    bench = bench_for(problem)
    if not bench:
        raise ValueError("this problem has no circuit to open")
    pset = session.get(ProblemSet, problem.set_id)
    course = session.get(Course, pset.course_id)
    title = f"{problem.label} (week {pset.week})" if pset.week else problem.label
    doc = {**bench["doc"], "title": title, "course": course.code if course else ""}
    return create_circuit(session, title, course.code if course else "", doc, source="problem",
                          week=pset.week, problem_id=problem.id, actor=actor)


def _notebook(session: Session, circuit: Circuit):
    from . import notes
    course = session.get(Course, circuit.course_id) if circuit.course_id else None
    return notes.notebook_for(session, course) if course else None


def note_targets(session: Session, circuit: Circuit) -> dict | None:
    """Where "Add to notes" can put a picture: the course notebook's units, and the one it
    suggests (the circuit's week, else the Inbox)."""
    from . import notes
    nb = _notebook(session, circuit)
    if nb is None:
        return None
    units = notes.units(session, nb)
    pick = next((u for u in units if circuit.week and u.term_week == circuit.week), None) or notes.inbox(session, nb)
    return {"units": [{"id": u.id, "title": u.title} for u in units], "default": pick.id,
            "parts": [[k, v] for k, v in notes.PARTS]}


def snapshot_to_notes(session: Session, circuit: Circuit, image: bytes, caption: str = "",
                      unit_id: int | None = None, part: str = "ideas", actor: str = "app"):
    """Save a picture of the circuit in its course's notes, linked back to the circuit."""
    from . import notes
    from .models import NoteUnit
    nb = _notebook(session, circuit)
    if nb is None:
        raise ValueError("Give the circuit a course first: notes are kept per course.")
    unit = session.get(NoteUnit, unit_id or note_targets(session, circuit)["default"])
    if unit is None or unit.notebook_id != nb.id:
        raise ValueError("That unit isn't in this course's notes.")
    try:
        asset = notes.save_asset(image, "circuit.png")
        block = notes.add_block(session, unit, part, "image", body=caption.strip() or circuit.title, asset=asset,
                                source={"label": f"Circuit Bench · {circuit.title}", "url": f"/circuits/{circuit.slug}"},
                                actor="claude" if actor == "claude" else "you")
    except notes.NotesError as e:
        raise ValueError(str(e))
    return block, unit


def to_json(session: Session, circuit: Circuit) -> dict:
    course = session.get(Course, circuit.course_id) if circuit.course_id else None
    return {"slug": circuit.slug, "title": circuit.title, "course": course.code if course else "",
            "week": circuit.week, "source": circuit.source, "rev": circuit.rev, "doc": circuit.doc,
            "updated_at": circuit.updated_at.isoformat(timespec="seconds"), "updated_by": circuit.updated_by,
            "archived": circuit.archived}
