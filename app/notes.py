"""Notes: one organized notebook per course.

Every notebook has the same shape, so you (and Claude) always know where a
piece of notes goes:

    Inbox                       things not sorted yet (with a suggested home)
    Unit 1 · <term-week topic>  one unit per term week, plus any you add
        Key ideas · Definitions · Formulas & equations · Worked examples · Pitfalls & tips
    Formula sheet               every formula block, collected (star the exam-sheet ones)

The web pages and the Claude MCP tools both go through this module. Every
change keeps a revision (NoteRevision) so it can be undone, and every block
says who wrote it: "you", "claude" or "local" (the local AI).
"""
import re
import uuid
from datetime import datetime

from sqlmodel import Session, select

from . import config
from .models import Course, CourseWeek, Notebook, NoteBlock, NoteRevision, NoteUnit, Video

PARTS = [("ideas", "Key ideas"), ("definitions", "Definitions"), ("formulas", "Formulas & equations"),
         ("examples", "Worked examples"), ("tips", "Pitfalls & tips")]
PART_NAMES = dict(PARTS)
KINDS = ("text", "formula", "definition", "example", "tip", "image")
DEFAULT_KIND = {"ideas": "text", "definitions": "definition", "formulas": "formula",
                "examples": "example", "tips": "tip"}
ACTORS = ("you", "claude", "local")
ASSET_DIR_NAME = "notes"  # under data/, git-ignored


class NotesError(ValueError):
    pass


# ---- setup -----------------------------------------------------------------------------

def ensure_notebooks(session: Session) -> int:
    """One notebook per course, with an Inbox and one unit per term week.

    Runs on every start (from seed). It only adds what's missing, so units you
    renamed, added or reordered are kept."""
    added = 0
    for course in session.exec(select(Course)).all():
        nb = session.exec(select(Notebook).where(Notebook.course_id == course.id)).first()
        if nb is None:
            nb = Notebook(course_id=course.id, title=f"{course.name} notes")
            session.add(nb)
            session.flush()
        units = session.exec(select(NoteUnit).where(NoteUnit.notebook_id == nb.id)).all()
        if not any(u.kind == "inbox" for u in units):
            session.add(NoteUnit(notebook_id=nb.id, kind="inbox", position=-1, title="Inbox"))
            added += 1
        have_weeks = {u.term_week for u in units if u.term_week}
        for w in session.exec(select(CourseWeek).where(CourseWeek.course_id == course.id)
                              .order_by(CourseWeek.number)).all():
            if w.number not in have_weeks:
                session.add(NoteUnit(notebook_id=nb.id, position=w.number, title=w.title,
                                     topics=list(w.topics or []), term_week=w.number))
                added += 1
    return added


# ---- lookups ---------------------------------------------------------------------------

def notebook_for(session: Session, course: Course) -> Notebook:
    nb = session.exec(select(Notebook).where(Notebook.course_id == course.id)).first()
    if nb is None:
        ensure_notebooks(session)
        session.commit()
        nb = session.exec(select(Notebook).where(Notebook.course_id == course.id)).one()
    return nb


def units(session: Session, nb: Notebook) -> list[NoteUnit]:
    return list(session.exec(select(NoteUnit).where(NoteUnit.notebook_id == nb.id)
                             .order_by(NoteUnit.position, NoteUnit.id)))


def inbox(session: Session, nb: Notebook) -> NoteUnit:
    return next(u for u in units(session, nb) if u.kind == "inbox")


def blocks(session: Session, unit_ids: list[int], include_deleted: bool = False) -> list[NoteBlock]:
    if not unit_ids:
        return []
    q = select(NoteBlock).where(NoteBlock.unit_id.in_(unit_ids))
    if not include_deleted:
        q = q.where(NoteBlock.deleted_at.is_(None))
    return list(session.exec(q.order_by(NoteBlock.position, NoteBlock.id)))


def unit_by_ref(session: Session, nb: Notebook, ref) -> NoteUnit:
    """A unit by id, by number ("4" = term week 4 / position 4), by "inbox", or by title text."""
    us = units(session, nb)
    s = str(ref).strip().lower()
    if s in ("inbox", "0"):
        return next(u for u in us if u.kind == "inbox")
    if s.isdigit():  # a unit number is its term week
        hit = next((u for u in us if u.term_week == int(s)), None)
        if hit:
            return hit
    hit = next((u for u in us if s and s in u.title.lower()), None)
    if hit:
        return hit
    raise NotesError(f"No unit {ref!r} in {nb.title}. Units: " +
                     "; ".join(f"{u.term_week or u.id}: {u.title}" for u in us))


def outline(session: Session, nb: Notebook) -> list[dict]:
    """Units with their parts and block counts, for the sidebar and for Claude."""
    us = units(session, nb)
    counts: dict[tuple[int, str], int] = {}
    for b in blocks(session, [u.id for u in us]):
        counts[(b.unit_id, b.part)] = counts.get((b.unit_id, b.part), 0) + 1
    out = []
    for u in us:
        parts = [{"key": k, "name": n, "count": counts.get((u.id, k), 0)} for k, n in PARTS]
        out.append({"unit": u, "parts": parts, "total": sum(p["count"] for p in parts)})
    return out


# ---- revisions -----------------------------------------------------------------------------

def snapshot(b: NoteBlock) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v)
            for k, v in b.model_dump().items() if k not in ("id",)}


def _revise(session: Session, b: NoteBlock, actor: str, action: str) -> None:
    session.add(NoteRevision(block_id=b.id, at=config.now(), actor=actor, action=action, before=snapshot(b)))


def _actor(actor: str) -> str:
    if actor not in ACTORS:
        raise NotesError(f"actor must be one of {ACTORS}")
    return actor


def _log(session, actor, action, summary, **data):
    from .services import log
    log(session, "claude" if actor == "claude" else ("local" if actor == "local" else "app"),
        action, summary, **data)


# ---- changing notes --------------------------------------------------------------------------

def _next_position(session: Session, unit_id: int, part: str) -> float:
    last = session.exec(select(NoteBlock).where(NoteBlock.unit_id == unit_id, NoteBlock.part == part,
                                                NoteBlock.deleted_at.is_(None))
                        .order_by(NoteBlock.position.desc())).first()
    return (last.position + 1) if last else 1


def add_block(session: Session, unit: NoteUnit, part: str, kind: str = "", body: str = "", title: str = "",
              extra: dict | None = None, source: dict | None = None, asset: str = "", starred: bool = False,
              suggested: dict | None = None, actor: str = "you", after_id: int | None = None) -> NoteBlock:
    if part not in PART_NAMES:
        raise NotesError(f"part must be one of {list(PART_NAMES)}")
    kind = kind or DEFAULT_KIND[part]
    if kind not in KINDS:
        raise NotesError(f"kind must be one of {KINDS}")
    now = config.now()
    position = _next_position(session, unit.id, part)
    if after_id:
        prev = session.get(NoteBlock, after_id)
        if prev and prev.unit_id == unit.id and prev.part == part:
            nxt = session.exec(select(NoteBlock).where(NoteBlock.unit_id == unit.id, NoteBlock.part == part,
                                                       NoteBlock.position > prev.position,
                                                       NoteBlock.deleted_at.is_(None))
                               .order_by(NoteBlock.position)).first()
            position = (prev.position + nxt.position) / 2 if nxt else prev.position + 1
    b = NoteBlock(unit_id=unit.id, part=part, kind=kind, position=position, title=title.strip(),
                  body=body.strip(), extra=extra or {}, source=source or {}, asset=asset, starred=starred,
                  suggested=suggested or {}, created_by=_actor(actor), updated_by=actor,
                  created_at=now, updated_at=now)
    session.add(b)
    session.flush()
    _revise(session, b, actor, "add")
    _log(session, actor, "note.add", f"Notes: added a {kind} to {unit.title} · {PART_NAMES[part]}", block=b.id)
    session.commit()
    session.refresh(b)
    return b


EDITABLE = ("title", "body", "extra", "kind", "source", "asset")


def update_block(session: Session, b: NoteBlock, actor: str = "you", **changes) -> NoteBlock:
    changes = {k: v for k, v in changes.items() if k in EDITABLE and v is not None}
    if "kind" in changes and changes["kind"] not in KINDS:
        raise NotesError(f"kind must be one of {KINDS}")
    if not changes:
        return b
    _revise(session, b, actor, "edit")
    for k, v in changes.items():
        setattr(b, k, v.strip() if isinstance(v, str) else v)
    b.updated_at, b.updated_by = config.now(), _actor(actor)
    if actor == "claude":
        _log(session, actor, "note.edit", f"Notes: edited block #{b.id}", block=b.id)
    session.commit()
    session.refresh(b)
    return b


def move_block(session: Session, b: NoteBlock, unit: NoteUnit, part: str, actor: str = "you",
               before_id: int | None = None) -> NoteBlock:
    if part not in PART_NAMES:
        raise NotesError(f"part must be one of {list(PART_NAMES)}")
    _revise(session, b, actor, "move")
    b.unit_id, b.part = unit.id, part
    if before_id:
        nxt = session.get(NoteBlock, before_id)
        if nxt and nxt.unit_id == unit.id and nxt.part == part and nxt.id != b.id:
            prev = session.exec(select(NoteBlock).where(NoteBlock.unit_id == unit.id, NoteBlock.part == part,
                                                        NoteBlock.position < nxt.position, NoteBlock.id != b.id,
                                                        NoteBlock.deleted_at.is_(None))
                                .order_by(NoteBlock.position.desc())).first()
            b.position = ((prev.position if prev else nxt.position - 1) + nxt.position) / 2
        else:
            b.position = _next_position(session, unit.id, part)
    else:
        b.position = _next_position(session, unit.id, part)
    b.suggested = {} if unit.kind != "inbox" else b.suggested
    b.updated_at, b.updated_by = config.now(), _actor(actor)
    if actor == "claude":
        _log(session, actor, "note.move", f"Notes: moved block #{b.id} to {unit.title} · {PART_NAMES[part]}", block=b.id)
    session.commit()
    session.refresh(b)
    return b


def delete_block(session: Session, b: NoteBlock, actor: str = "you") -> NoteBlock:
    _revise(session, b, actor, "delete")
    b.deleted_at, b.updated_by = config.now(), _actor(actor)
    session.commit()
    return b


def restore_block(session: Session, b: NoteBlock, actor: str = "you") -> NoteBlock:
    _revise(session, b, actor, "restore")
    b.deleted_at, b.updated_by = None, _actor(actor)
    session.commit()
    return b


def set_star(session: Session, b: NoteBlock, starred: bool, actor: str = "you") -> NoteBlock:
    _revise(session, b, actor, "star")
    b.starred = bool(starred)
    session.commit()
    return b


def undo(session: Session, rev: NoteRevision, actor: str = "you") -> NoteBlock:
    """Put a block back the way it was before this revision."""
    b = session.get(NoteBlock, rev.block_id)
    if rev.action == "add":  # undoing an add = delete it
        return delete_block(session, b, actor)
    _revise(session, b, actor, "edit")
    for k in ("unit_id", "part", "kind", "position", "title", "body", "extra", "starred", "source", "asset", "suggested"):
        if k in rev.before:
            setattr(b, k, rev.before[k])
    b.deleted_at = None if not rev.before.get("deleted_at") else b.deleted_at
    b.updated_at, b.updated_by = config.now(), actor
    session.commit()
    session.refresh(b)
    return b


def history(session: Session, nb: Notebook, limit: int = 60) -> list[tuple[NoteRevision, NoteBlock]]:
    unit_ids = [u.id for u in units(session, nb)]
    rows = session.exec(select(NoteRevision, NoteBlock).join(NoteBlock, NoteBlock.id == NoteRevision.block_id)
                        .where(NoteBlock.unit_id.in_(unit_ids)).order_by(NoteRevision.id.desc()).limit(limit)).all()
    return list(rows)


def add_unit(session: Session, nb: Notebook, title: str, after: NoteUnit | None = None,
             topics: list | None = None, actor: str = "you") -> NoteUnit:
    title = title.strip()
    if not title:
        raise NotesError("A unit needs a title.")
    us = [u for u in units(session, nb) if u.kind == "unit"]
    if after is not None:
        later = [u.position for u in us if u.position > after.position]
        position = (after.position + min(later)) / 2 if later else after.position + 1
    else:
        position = (max(u.position for u in us) + 1) if us else 1
    u = NoteUnit(notebook_id=nb.id, position=position, title=title, topics=topics or [])
    session.add(u)
    _log(session, actor, "note.unit", f"Notes: new unit {title!r} in {nb.title}")
    session.commit()
    session.refresh(u)
    return u


def rename_unit(session: Session, u: NoteUnit, title: str) -> NoteUnit:
    if not title.strip():
        raise NotesError("A unit needs a title.")
    u.title = title.strip()
    session.commit()
    return u


# ---- images ---------------------------------------------------------------------------------

def save_asset(data: bytes, filename: str = "") -> str:
    """Store a screenshot or photo for notes; returns its path relative to data/."""
    from PIL import Image
    import io

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:  # noqa: BLE001
        raise NotesError("That file isn't an image Homebase can read.") from e
    folder = config.DATA_DIR / ASSET_DIR_NAME
    folder.mkdir(parents=True, exist_ok=True)
    img = img.convert("RGB")
    img.thumbnail((2000, 2000))
    name = f"{uuid.uuid4().hex[:12]}.jpg"
    img.save(folder / name, "JPEG", quality=88)
    return f"{ASSET_DIR_NAME}/{name}"


# ---- search and the formula sheet -----------------------------------------------------------

def _squash(s: str) -> str:
    """Loose form for spotting the same formula written twice."""
    s = s.lower()
    s = re.sub(r"\\(left|right|,|;|!|quad|displaystyle|mathrm|text)", "", s)
    s = re.sub(r"[\s{}$]|\\\(|\\\)", "", s)
    return s


def search(session: Session, query: str, nb: Notebook | None = None, limit: int = 30) -> list[NoteBlock]:
    q = query.strip().lower()
    if not q:
        return []
    stmt = select(NoteBlock).where(NoteBlock.deleted_at.is_(None))
    if nb is not None:
        stmt = stmt.where(NoteBlock.unit_id.in_([u.id for u in units(session, nb)]))
    sq = _squash(q)
    out = []
    for b in session.exec(stmt):
        hay = f"{b.title}\n{b.body}\n{' '.join(str(v) for v in (b.extra or {}).values())}".lower()
        if q in hay or (len(sq) >= 3 and sq in _squash(hay)):
            out.append(b)
    return out[:limit]


def similar_formula(session: Session, nb: Notebook, body: str) -> NoteBlock | None:
    """An existing formula block with the same equation (ignoring spacing and braces)."""
    target = _squash(body)
    if len(target) < 3:
        return None
    for b in blocks(session, [u.id for u in units(session, nb)]):
        if b.kind == "formula" and _squash(b.body) == target:
            return b
    return None


def formula_sheet(session: Session, nb: Notebook, starred_only: bool = False) -> list[tuple[NoteUnit, list[NoteBlock]]]:
    us = [u for u in units(session, nb) if u.kind == "unit"]
    by_unit = {u.id: [] for u in us}
    for b in blocks(session, list(by_unit)):
        if b.kind == "formula" and (b.starred or not starred_only):
            by_unit[b.unit_id].append(b)
    return [(u, by_unit[u.id]) for u in us if by_unit[u.id]]


def counts_by_week(session: Session, course: Course) -> dict[int, int]:
    nb = notebook_for(session, course)
    us = units(session, nb)
    week_of = {u.id: u.term_week for u in us if u.term_week}
    out: dict[int, int] = {}
    for b in blocks(session, list(week_of)):
        w = week_of[b.unit_id]
        out[w] = out.get(w, 0) + 1
    return out


def source_label(session: Session, src: dict) -> str:
    """'MIT 6.002 (2007) · Lecture 3 · 14:05' for a video source, else the label given."""
    if not src:
        return ""
    if src.get("video_slug"):
        v = session.exec(select(Video).where(Video.slug == src["video_slug"])).first()
        t = src.get("t")
        ts = ""
        if t is not None:
            t = int(t)
            ts = f" · {t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}" if t >= 3600 else f" · {t // 60}:{t % 60:02d}"
        return (f"{v.series} · {v.title}" if v else src["video_slug"]) + ts
    return src.get("label") or src.get("url") or ""
