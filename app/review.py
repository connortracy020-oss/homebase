"""Mistake log and spaced review (a 5-box Leitner ladder).

The rule, from research/shared/report.md section 3:

  Box 1 = 1 day, box 2 = 3 days, box 3 = 7 days, box 4 = 14 days, box 5 = 28 days.
  A new mistake starts in box 1, so it's due tomorrow.
  Each review is a cold re-solve: no notes, no peeking.
    solid (right, no help)            -> up one box; solid from box 5 retires it
    shaky (right, but hint or slow)   -> same box, same gap again
    miss                              -> back to box 1
  The daily queue is oldest-due first, mixed across courses, capped at about
  20 minutes. Anything left over simply waits; overdue items aren't punished.
  Before an exam, a sweep pulls every open item for that course, and retired
  ones come back once.
"""
from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from . import config
from .models import Course, Mistake, Problem, ProblemSet, ReviewAttempt

INTERVALS = {1: 1, 2: 3, 3: 7, 4: 14, 5: 28}  # days until the next review
OUTCOMES = ("solid", "shaky", "miss")
MINUTES_PER_ITEM = 6
DAILY_BUDGET_MIN = 20


# ---- the ladder (pure functions, easy to test) --------------------------------------

def next_state(box: int, outcome: str, today: date) -> tuple[int, date, bool]:
    """(new box, next due date, retired?) after one review."""
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}")
    if outcome == "miss":
        return 1, today + timedelta(days=INTERVALS[1]), False
    if outcome == "shaky":
        return box, today + timedelta(days=INTERVALS[box]), False
    if box >= 5:
        return 5, today, True
    return box + 1, today + timedelta(days=INTERVALS[box + 1]), False


def interleave(items: list[Mistake]) -> list[Mistake]:
    """Oldest-due first, but alternate courses so one subject never fills the queue."""
    by_course: dict[int, list[Mistake]] = {}
    for m in sorted(items, key=lambda m: (m.due, m.id)):
        by_course.setdefault(m.course_id, []).append(m)
    queues = sorted(by_course.values(), key=lambda q: (q[0].due, q[0].id))
    out = []
    while any(queues):
        for q in queues:
            if q:
                out.append(q.pop(0))
    return out


# ---- reading ---------------------------------------------------------------------------

def open_mistake_for(session: Session, problem: Problem) -> Mistake | None:
    return session.exec(select(Mistake).where(Mistake.problem_id == problem.id,
                                              Mistake.retired_at.is_(None))).first()


def due_items(session: Session, day: date | None = None) -> list[Mistake]:
    day = day or config.today()
    rows = session.exec(select(Mistake).where(Mistake.retired_at.is_(None), Mistake.due <= day)).all()
    return interleave(list(rows))


def todays_queue(session: Session, day: date | None = None,
                 budget_min: int = DAILY_BUDGET_MIN) -> tuple[list[Mistake], int]:
    """(items that fit today's time budget, how many more are due)."""
    due = due_items(session, day)
    fit = max(1, budget_min // MINUTES_PER_ITEM)
    return due[:fit], max(0, len(due) - fit)


def sweep_items(session: Session, course: Course) -> list[Mistake]:
    """Everything for one course, retired included: the pre-exam sweep."""
    rows = session.exec(select(Mistake).where(Mistake.course_id == course.id)).all()
    return sorted(rows, key=lambda m: (m.retired_at is not None, m.box, m.due))


def all_mistakes(session: Session, course: Course | None = None) -> list[Mistake]:
    q = select(Mistake)
    if course is not None:
        q = q.where(Mistake.course_id == course.id)
    return list(session.exec(q.order_by(Mistake.retired_at.is_not(None), Mistake.due)))


def box_counts(session: Session, course: Course) -> dict[str, int]:
    counts = {str(b): 0 for b in INTERVALS} | {"retired": 0}
    for m in session.exec(select(Mistake).where(Mistake.course_id == course.id)):
        counts["retired" if m.retired_at else str(m.box)] += 1
    return counts


def cause_counts(session: Session, course: Course) -> dict[str, int]:
    out: dict[str, int] = {}
    for m in session.exec(select(Mistake).where(Mistake.course_id == course.id)):
        key = m.cause or "untagged"
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def history(session: Session, mistake: Mistake) -> list[ReviewAttempt]:
    return list(session.exec(select(ReviewAttempt).where(ReviewAttempt.mistake_id == mistake.id)
                             .order_by(ReviewAttempt.at.desc())))


def variant_seed(mistake: Mistake, problem: Problem) -> int | None:
    """Generated problems are re-solved with new numbers each time."""
    if not problem.generator or problem.seed is None:
        return None
    return 100_000 + problem.seed * 100 + mistake.reviews + 1


# ---- writing ---------------------------------------------------------------------------

def add_mistake(session: Session, problem: Problem, source: str, cause: str = "", note: str = "",
                submission_id: int | None = None, actor: str = "app",
                today: date | None = None) -> Mistake:
    """Log a mistake. If this problem already has an open one, it lapses back to box 1."""
    from .services import log

    today = today or config.today()
    existing = open_mistake_for(session, problem)
    if existing:
        if existing.box > 1:
            existing.lapses += 1
        existing.box, existing.due = 1, today + timedelta(days=INTERVALS[1])
        existing.cause = cause or existing.cause
        existing.note = note or existing.note
        log(session, actor, "mistake.lapse", f"{problem.label} missed again: back to box 1",
            mistake=existing.id)
        session.commit()
        return existing
    pset = session.get(ProblemSet, problem.set_id)
    m = Mistake(problem_id=problem.id, course_id=pset.course_id, created_at=config.now(),
                source=source, cause=cause, note=note.strip(), submission_id=submission_id,
                box=1, due=today + timedelta(days=INTERVALS[1]))
    session.add(m)
    log(session, actor, "mistake.add", f"Added to mistake log: {problem.label}", problem=problem.slug)
    session.commit()
    session.refresh(m)
    return m


def record_review(session: Session, mistake: Mistake, outcome: str, note: str = "",
                  sweep: bool = False, seed: int | None = None, actor: str = "app",
                  today: date | None = None) -> ReviewAttempt:
    from .services import log

    today = today or config.today()
    before = mistake.box
    if mistake.retired_at is not None:  # a retired item came back in a sweep
        if outcome == "miss":
            mistake.retired_at = None
            mistake.box, mistake.due = 1, today + timedelta(days=INTERVALS[1])
            mistake.lapses += 1
        after = mistake.box
    else:
        box, due, retired = next_state(mistake.box, outcome, today)
        if outcome == "miss" and mistake.box > 1:
            mistake.lapses += 1
        mistake.box, mistake.due = box, due
        if retired:
            mistake.retired_at = config.now()
        after = box
    mistake.reviews += 1
    mistake.last_reviewed = config.now()
    attempt = ReviewAttempt(mistake_id=mistake.id, at=config.now(), outcome=outcome,
                            box_before=before, box_after=after, sweep=sweep,
                            variant_seed=seed, note=note.strip(), actor=actor)
    session.add(attempt)
    problem = session.get(Problem, mistake.problem_id)
    status = "retired" if mistake.retired_at else f"box {mistake.box}, due {mistake.due:%b %d}"
    log(session, actor, "review.record", f"Review of {problem.label}: {outcome} → {status}",
        mistake=mistake.id)
    session.commit()
    session.refresh(attempt)
    return attempt


def delete_mistake(session: Session, mistake: Mistake, actor: str = "app") -> None:
    from .services import log

    for a in history(session, mistake):
        session.delete(a)
    log(session, actor, "mistake.delete", f"Removed mistake #{mistake.id} from the log", mistake=mistake.id)
    session.delete(mistake)
    session.commit()
