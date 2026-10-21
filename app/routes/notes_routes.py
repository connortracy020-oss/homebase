"""Notes pages and the small JSON API the notes editor uses (see app/notes.py)."""
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from markupsafe import Markup, escape
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import config, notes, services
from ..db import get_session
from ..models import Notebook, NoteBlock, NoteRevision, NoteUnit, Video
from .pages import TEMPLATES, render

router = APIRouter()


# ---- Markdown for notes: paragraphs, lists, headings, **bold**, *italic*, `code`, math kept intact ----

_MATH = re.compile(r"(\$\$.+?\$\$|\\\(.+?\\\)|\\\[.+?\\\])", re.S)


def notemd(text: str) -> Markup:
    from ..local_ai import tex
    text = tex(text or "")
    keep: list[str] = []

    def stash(m):
        keep.append(str(escape(m.group(0))))
        return f"\x00{len(keep) - 1}\x00"

    text = _MATH.sub(stash, text)
    out = []
    for block in re.split(r"\n\s*\n", str(escape(text)).strip()):
        lines = block.splitlines()
        if lines and all(re.match(r"\s*[-*] ", l) for l in lines):
            out.append("<ul>" + "".join(f"<li>{re.sub(r'^\s*[-*] ', '', l)}</li>" for l in lines) + "</ul>")
        elif lines and all(re.match(r"\s*\d+[.)] ", l) for l in lines):
            out.append("<ol>" + "".join(f"<li>{re.sub(r'^\s*\d+[.)] ', '', l)}</li>" for l in lines) + "</ol>")
        elif lines and re.match(r"#{1,4} ", lines[0]) and len(lines) == 1:
            out.append(f"<h4>{lines[0].lstrip('#').strip()}</h4>")
        else:
            out.append("<p>" + "<br>".join(lines) + "</p>")
    html = "".join(out)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])", r"<em>\1</em>", html)
    html = re.sub(r"`([^`]+)`", r"<code>\1</code>", html)
    html = re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], html)
    return Markup(html)


TEMPLATES.env.filters["notemd"] = notemd
from .. import widgets  # noqa: E402
TEMPLATES.env.filters["widget"] = lambda body, title="": widgets.frame(body, title or "Interactive illustration")


def _source_label(session):
    return lambda src: notes.source_label(session, src)


# ---- helpers ----------------------------------------------------------------------------------

def _nb(session: Session, code: str) -> Notebook:
    course = services.course_by_code(session, code)
    if course is None:
        raise HTTPException(404, f"No course {code}")
    return notes.notebook_for(session, course)


def _block(session: Session, bid: int) -> NoteBlock:
    b = session.get(NoteBlock, bid)
    if b is None:
        raise HTTPException(404, f"No note block {bid}")
    return b


def _unit(session: Session, uid: int) -> NoteUnit:
    u = session.get(NoteUnit, uid)
    if u is None:
        raise HTTPException(404, f"No unit {uid}")
    return u


def block_html(session: Session, b: NoteBlock) -> str:
    macro = TEMPLATES.env.get_template("_notes.html").module.note_block
    return str(macro(b, _source_label(session), unit_title=lambda uid: (session.get(NoteUnit, uid).title
                                                                          if uid and session.get(NoteUnit, uid) else "")))


def block_json(session: Session, b: NoteBlock) -> dict:
    return {"id": b.id, "unit_id": b.unit_id, "part": b.part, "kind": b.kind, "title": b.title, "body": b.body,
            "extra": b.extra, "starred": b.starred, "source": b.source, "asset": b.asset,
            "created_by": b.created_by, "deleted": b.deleted_at is not None, "html": block_html(session, b)}


def _err(e: Exception):
    raise HTTPException(422, str(e))


# ---- pages ------------------------------------------------------------------------------------

@router.get("/notes")
def notes_home(session: Session = Depends(get_session)):
    first = services.courses(session)[0]
    return RedirectResponse(f"/notes/{first.code}", status_code=303)


@router.get("/notes/{code}")
def notebook_page(code: str, request: Request, u: int | None = None, week: int | None = None,
                  session: Session = Depends(get_session)):
    nb = _nb(session, code)
    course = services.course_by_code(session, code)
    outline = notes.outline(session, nb)
    unit = None
    if u:
        unit = _unit(session, u)
        if unit.notebook_id != nb.id:
            raise HTTPException(404, "That unit is in another notebook")
    elif week:
        unit = next((o["unit"] for o in outline if o["unit"].term_week == week), None)
    if unit is None:  # the first unit with notes, else unit 1
        unit = next((o["unit"] for o in outline if o["total"] and o["unit"].kind == "unit"), None) or \
            next(o["unit"] for o in outline if o["unit"].kind == "unit")
    bl = notes.blocks(session, [unit.id])
    by_part = {k: [b for b in bl if b.part == k] for k, _ in notes.PARTS}
    move_targets = [{"id": o["unit"].id, "title": ("Inbox" if o["unit"].kind == "inbox" else
                                                    f"{o['unit'].term_week or '·'} · {o['unit'].title}")}
                    for o in outline]
    return render(request, "notes.html", session, nb=nb, course=course, outline=outline, unit=unit,
                  by_part=by_part, PARTS=notes.PARTS, DEFAULT_KIND=notes.DEFAULT_KIND,
                  source_label=_source_label(session), move_targets=move_targets,
                  unit_title=lambda uid: session.get(NoteUnit, uid).title if uid and session.get(NoteUnit, uid) else "",
                  all_notebooks=[(c, notes.notebook_for(session, c)) for c in services.courses(session)])


@router.get("/notes/{code}/formulas")
def formula_sheet_page(code: str, request: Request, print: int = 0, starred: int = 0,
                       session: Session = Depends(get_session)):
    nb = _nb(session, code)
    course = services.course_by_code(session, code)
    sheet = notes.formula_sheet(session, nb, starred_only=bool(print or starred))
    return render(request, "notes_formulas.html", session, nb=nb, course=course, sheet=sheet,
                  printing=bool(print), starred_only=bool(starred), source_label=_source_label(session),
                  n_starred=sum(1 for _, bs in notes.formula_sheet(session, nb) for b in bs if b.starred))


@router.get("/notes/{code}/history")
def history_page(code: str, request: Request, session: Session = Depends(get_session)):
    nb = _nb(session, code)
    return render(request, "notes_history.html", session, nb=nb, course=services.course_by_code(session, code),
                  rows=notes.history(session, nb), unit_title=lambda uid: (session.get(NoteUnit, uid).title
                                                                            if session.get(NoteUnit, uid) else "?"),
                  PART_NAMES=notes.PART_NAMES)


@router.post("/notes/{code}/units")
def new_unit(code: str, title: str = Form(...), after: int | None = Form(None),
             session: Session = Depends(get_session)):
    nb = _nb(session, code)
    try:
        u = notes.add_unit(session, nb, title, after=_unit(session, after) if after else None)
    except notes.NotesError as e:
        _err(e)
    return RedirectResponse(f"/notes/{code}?u={u.id}", status_code=303)


@router.post("/notes/units/{uid}/rename")
def rename(uid: int, title: str = Form(...), session: Session = Depends(get_session)):
    try:
        u = notes.rename_unit(session, _unit(session, uid), title)
    except notes.NotesError as e:
        _err(e)
    return {"id": u.id, "title": u.title}


# ---- the editor's JSON API --------------------------------------------------------------------------

class BlockIn(BaseModel):
    unit_id: int
    part: str
    kind: str = ""
    title: str = ""
    body: str = ""
    extra: dict = {}
    after_id: int | None = None
    actor: str = "you"  # "local" when you approve a Qwen draft


class BlockEdit(BaseModel):
    title: str | None = None
    body: str | None = None
    extra: dict | None = None
    kind: str | None = None


class MoveIn(BaseModel):
    unit_id: int
    part: str
    before_id: int | None = None


@router.post("/notes/blocks")
def create_block(body: BlockIn, session: Session = Depends(get_session)):
    try:
        b = notes.add_block(session, _unit(session, body.unit_id), body.part, body.kind, body.body, body.title,
                            extra=body.extra, after_id=body.after_id,
                            actor=body.actor if body.actor in ("you", "local") else "you")
    except notes.NotesError as e:
        _err(e)
    return block_json(session, b)


@router.put("/notes/blocks/{bid}")
def edit_block(bid: int, body: BlockEdit, session: Session = Depends(get_session)):
    try:
        b = notes.update_block(session, _block(session, bid), **body.model_dump())
    except notes.NotesError as e:
        _err(e)
    return block_json(session, b)


@router.post("/notes/blocks/{bid}/move")
def move(bid: int, body: MoveIn, session: Session = Depends(get_session)):
    try:
        b = notes.move_block(session, _block(session, bid), _unit(session, body.unit_id), body.part,
                             before_id=body.before_id)
    except notes.NotesError as e:
        _err(e)
    return block_json(session, b)


@router.post("/notes/blocks/{bid}/delete")
def delete(bid: int, session: Session = Depends(get_session)):
    return block_json(session, notes.delete_block(session, _block(session, bid)))


@router.post("/notes/blocks/{bid}/restore")
def restore(bid: int, session: Session = Depends(get_session)):
    return block_json(session, notes.restore_block(session, _block(session, bid)))


@router.post("/notes/blocks/{bid}/star")
def star(bid: int, starred: bool = Form(True), session: Session = Depends(get_session)):
    return block_json(session, notes.set_star(session, _block(session, bid), starred))


@router.post("/notes/revisions/{rid}/undo")
def undo(rid: int, session: Session = Depends(get_session)):
    rev = session.get(NoteRevision, rid)
    if rev is None:
        raise HTTPException(404, f"No revision {rid}")
    return block_json(session, notes.undo(session, rev))


@router.post("/notes/render")
def render_preview(text: str = Form(""), kind: str = Form("text")):
    """Live preview while editing: the same Markdown as the saved block."""
    return HTMLResponse(str(notemd(text)))


@router.get("/notes-search")
def search(q: str = "", course: str = "", session: Session = Depends(get_session)):
    nb = _nb(session, course) if course else None
    out = []
    for b in notes.search(session, q, nb):
        u = session.get(NoteUnit, b.unit_id)
        nbk = session.get(Notebook, u.notebook_id)
        c = services.courses(session)
        code = next(x.code for x in c if x.id == nbk.course_id)
        out.append({"id": b.id, "kind": b.kind, "title": b.title or b.body[:60], "unit": u.title,
                    "part": notes.PART_NAMES[b.part], "url": f"/notes/{code}?u={u.id}#b{b.id}"})
    return out


@router.post("/notes/assets")
async def upload_asset(unit_id: int = Form(...), part: str = Form("ideas"), caption: str = Form(""),
                       file: UploadFile = File(...), session: Session = Depends(get_session)):
    try:
        path = notes.save_asset(await file.read(), file.filename or "")
        b = notes.add_block(session, _unit(session, unit_id), part, "image", body=caption, asset=path)
    except notes.NotesError as e:
        _err(e)
    return block_json(session, b)


@router.get("/notes-assets/{name}")
def asset_file(name: str):
    if not re.fullmatch(r"[0-9a-f]{12}\.jpg", name):
        raise HTTPException(404)
    path = config.DATA_DIR / notes.ASSET_DIR_NAME / name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)


@router.post("/notes/from-video-note/{note_id}")
def from_video_note(note_id: int, session: Session = Depends(get_session)):
    """Video page: copy a timestamped note into the notebook unit for that video's week."""
    from ..models import Note
    n = session.get(Note, note_id)
    if n is None or not n.video_id:
        raise HTTPException(404, "No such video note")
    from ..models import Course
    v = session.get(Video, n.video_id)
    course = session.get(Course, v.course_id)
    nb = notes.notebook_for(session, course)
    unit = next((u for u in notes.units(session, nb) if u.term_week == v.osu_week), None) or notes.inbox(session, nb)
    b = notes.add_block(session, unit, "ideas", "text", n.body, source={"video_slug": v.slug, "t": n.t_sec})
    return {"unit": unit.title, "url": f"/notes/{course.code}?u={unit.id}#b{b.id}"}


@router.post("/notes/blocks/{bid}/draft")
def draft_from_image(bid: int, session: Session = Depends(get_session)):
    """Ask the local AI to draft note blocks from a screenshot block (you approve each one)."""
    from .. import local_ai
    from .local_routes import _view
    b = _block(session, bid)
    if b.kind != "image" or not b.asset:
        raise HTTPException(422, "Only a screenshot can be turned into notes.")
    if not local_ai.status(session).ready:
        raise HTTPException(422, "The local AI is off. Open the Ollama app, or ask Claude to add it instead.")
    job = local_ai.enqueue(session, "note_draft", input={"block_id": b.id})
    return _view(session, job)


@router.post("/notes/widget-preview")
def widget_preview(code: str = Form(""), title: str = Form("")):
    """The editor's live preview of an interactive block: the same sandboxed frame."""
    return HTMLResponse(str(widgets.frame(code, title)))
