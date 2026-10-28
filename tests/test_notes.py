"""Notes: notebooks, the editor API, the formula sheet, Claude's tools and the Qwen draft."""
import io
import json

import pytest
from PIL import Image
from sqlmodel import select

from app import local_ai, notes, services
from app.models import Course, LocalJob, NoteBlock, NoteRevision, NoteUnit, Video
from tests.test_local_ai import FakeOllama


def nb(session, code="ECE201"):
    return notes.notebook_for(session, services.course_by_code(session, code))


def unit(session, week, code="ECE201"):
    return notes.unit_by_ref(session, nb(session, code), str(week))


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), "white").save(buf, "PNG")
    return buf.getvalue()


# ---- notebooks ---------------------------------------------------------------------------------

def test_every_course_gets_a_notebook_with_inbox_and_weeks(session):
    for code in ("ECE201", "MTH254", "ECE200"):
        us = notes.units(session, nb(session, code))
        assert us[0].kind == "inbox"
        assert [u.term_week for u in us if u.kind == "unit"] == list(range(1, 11))
    assert unit(session, 1).title.startswith("Circuit basics")


def test_reseeding_keeps_your_units_and_notes(session):
    from app.seed import seed
    u = unit(session, 2)
    notes.rename_unit(session, u, "My KCL unit")
    b = notes.add_block(session, u, "formulas", body="\\sum i = 0", title="KCL")
    seed(session)
    session.expire_all()
    assert session.get(NoteUnit, u.id).title == "My KCL unit"
    assert session.get(NoteBlock, b.id).body == "\\sum i = 0"
    assert len(notes.units(session, nb(session))) == 11  # nothing duplicated


def test_add_edit_move_delete_undo(session):
    u1, u2 = unit(session, 1), unit(session, 2)
    b = notes.add_block(session, u1, "ideas", body="first")
    assert b.kind == "text" and b.created_by == "you"
    notes.update_block(session, b, body="second")
    notes.move_block(session, b, u2, "tips")
    assert (b.unit_id, b.part) == (u2.id, "tips")
    notes.delete_block(session, b)
    assert not notes.blocks(session, [u2.id])
    revs = session.exec(select(NoteRevision).where(NoteRevision.block_id == b.id).order_by(NoteRevision.id)).all()
    assert [r.action for r in revs] == ["add", "edit", "move", "delete"]
    notes.undo(session, revs[3])          # undo the delete
    notes.undo(session, revs[2])          # undo the move
    session.refresh(b)
    assert b.deleted_at is None and (b.unit_id, b.part, b.body) == (u1.id, "ideas", "second")
    notes.undo(session, revs[1])          # undo the edit
    session.refresh(b)
    assert b.body == "first"


def test_positions_keep_order(session):
    u = unit(session, 3)
    a = notes.add_block(session, u, "ideas", body="a")
    c = notes.add_block(session, u, "ideas", body="c")
    notes.add_block(session, u, "ideas", body="b", after_id=a.id)
    assert [x.body for x in notes.blocks(session, [u.id])] == ["a", "b", "c"]
    notes.move_block(session, c, u, "ideas", before_id=a.id)
    assert [x.body for x in notes.blocks(session, [u.id])] == ["c", "a", "b"]


def test_bad_part_or_kind(session):
    with pytest.raises(notes.NotesError):
        notes.add_block(session, unit(session, 1), "random", body="x")
    with pytest.raises(notes.NotesError):
        notes.add_block(session, unit(session, 1), "ideas", kind="poem", body="x")


def test_formula_sheet_search_and_duplicates(session):
    n = nb(session)
    p = notes.add_block(session, unit(session, 1), "formulas", body="p = vi", title="Power", starred=True)
    notes.add_block(session, unit(session, 2), "formulas", body="v = iR", title="Ohm's law")
    sheet = notes.formula_sheet(session, n)
    assert [len(bs) for _, bs in sheet] == [1, 1]
    assert [b.id for _, bs in notes.formula_sheet(session, n, starred_only=True) for b in bs] == [p.id]
    assert notes.similar_formula(session, n, "p=v i").id == p.id   # spacing doesn't matter
    assert [b.title for b in notes.search(session, "ohm", n)] == ["Ohm's law"]
    assert notes.counts_by_week(session, services.course_by_code(session, "ECE201")) == {1: 1, 2: 1}


# ---- pages and the editor API ----------------------------------------------------------------------

def test_notebook_page_and_editor_api(client, session):
    u = unit(session, 1)
    assert client.get("/notes", follow_redirects=False).headers["location"] == "/notes/ECE201"
    page = client.get(f"/notes/ECE201?u={u.id}").text
    assert "Circuit basics" in page and "Start this unit:" in page and "Formula sheet" in page
    r = client.post("/notes/blocks", json={"unit_id": u.id, "part": "formulas", "title": "Power", "body": "p = vi"})
    b = r.json()
    assert b["kind"] == "formula" and "$$p = vi$$" in b["html"]
    r = client.put(f"/notes/blocks/{b['id']}", json={"extra": {"where": "p in W"}})
    assert "p in W" in r.json()["html"]
    client.post(f"/notes/blocks/{b['id']}/star", data={"starred": "true"})
    assert "starred" in client.get("/notes/ECE201/formulas?starred=1").text
    assert client.post(f"/notes/blocks/{b['id']}/move", json={"unit_id": unit(session, 2).id, "part": "tips"}).status_code == 200
    assert client.post(f"/notes/blocks/{b['id']}/delete").json()["deleted"] is True
    assert client.post(f"/notes/blocks/{b['id']}/restore").json()["deleted"] is False
    assert "Undo" in client.get("/notes/ECE201/history").text
    assert client.get("/notes-search?q=power&course=ECE201").json()[0]["url"].endswith(f"#b{b['id']}")
    assert client.post("/notes/blocks", json={"unit_id": u.id, "part": "nope"}).status_code == 422
    assert client.get("/notes/ECE201/formulas?print=1").status_code == 200


def test_week_hub_links_to_its_notes(client, session):
    notes.add_block(session, unit(session, 1), "ideas", body="x")
    page = client.get("/course/ECE201/week/1").text
    assert "/notes/ECE201?week=1" in page and "1 note for this week" in page
    assert "Circuit basics" in client.get("/notes/ECE201?week=1").text


def test_notes_markdown_keeps_math_and_escapes_html(client):
    from app.routes.notes_routes import notemd
    html = str(notemd("**bold** *it* `code` \\(a*b*c\\) <script>x</script>\n\n- one\n- two"))
    assert "<strong>bold</strong>" in html and "<em>it</em>" in html and "<code>code</code>" in html
    assert "\\(a*b*c\\)" in html and "<script>" not in html and "<ul><li>one</li>" in html
    assert "\\(x^2\\)" in str(notemd("so $x^2$"))


def test_screenshot_upload_and_from_video_note(client, session):
    u = unit(session, 1)
    r = client.post("/notes/assets", data={"unit_id": u.id, "part": "ideas", "caption": "slide"},
                    files={"file": ("s.png", png(), "image/png")})
    b = r.json()
    assert b["kind"] == "image" and b["asset"].startswith("notes/")
    assert client.get("/notes-assets/" + b["asset"].split("/")[1]).status_code == 200
    assert client.get("/notes-assets/../homebase.db").status_code == 404
    assert client.post("/notes/assets", data={"unit_id": u.id}, files={"file": ("x.png", b"nope", "image/png")}).status_code == 422
    v = session.exec(select(Video).where(Video.osu_week == 2)).first()
    note = services.add_note(session, session.get(Course, v.course_id), "KCL: what goes in comes out", video=v, t_sec=125)
    out = client.post(f"/notes/from-video-note/{note.id}").json()
    blk = session.exec(select(NoteBlock).where(NoteBlock.body == "KCL: what goes in comes out")).one()
    assert blk.source == {"video_slug": v.slug, "t": 125}
    assert session.get(NoteUnit, blk.unit_id).term_week == 2 and out["unit"]
    assert "2:05" in client.get(out["url"].split("#")[0]).text


# ---- Claude's tools -------------------------------------------------------------------------------

def test_claude_places_notes_and_avoids_duplicates(session):
    from app import mcp_server as m
    out = m.notes_outline("ECE201")
    assert "unit 1: Circuit basics" in out and "unit inbox" in out and "formulas" in out
    v = session.exec(select(Video).where(Video.osu_week == 1)).first()
    r = m.notes_add("ECE201", "1", "formulas", "p = vi", title="Power absorbed", where="p in W", star=True,
                    video_slug=v.slug, t_sec=610)[0]
    bid = int(r.split()[2])
    b = session.get(NoteBlock, bid)
    assert b.created_by == "claude" and b.kind == "formula" and b.starred and b.source["t"] == 610
    dup = m.notes_add("ECE201", "1", "formulas", "p=v i")[0]
    assert dup.startswith("Not added") and f"block {bid}" in dup
    assert "Updated" in m.notes_update(bid, when="i into the + terminal")[0]
    session.expire_all()
    assert session.get(NoteBlock, bid).extra["when"] == "i into the + terminal"
    r = m.notes_add("ECE201", "inbox", "ideas", "Something about RC circuits", suggested_unit="10", suggested_part="ideas")[0]
    inbox_id = int(r.split()[2])
    sb = session.get(NoteBlock, inbox_id)
    assert sb.suggested["unit_id"] == unit(session, 10).id
    assert "Moved" in m.notes_move(inbox_id, "10", "ideas")
    assert "Power absorbed" in m.notes_search("power", "ECE201")
    with pytest.raises(ValueError):
        m.notes_add("ECE201", "99", "ideas", "x")
    assert "Added unit" in m.notes_add_unit("ECE201", "Extra: dependent sources drill", after_unit="2")


# ---- the local AI draft -------------------------------------------------------------------------------

def test_qwen_drafts_notes_from_a_screenshot(client, session):
    fake = FakeOllama()
    local_ai.set_client(fake)
    u = unit(session, 1)
    img = client.post("/notes/assets", data={"unit_id": u.id}, files={"file": ("s.png", png(), "image/png")}).json()
    fake.replies = [json.dumps({"blocks": [
        {"unit": 1, "part": "formulas", "kind": "formula", "title": "Power", "body": "p = vi", "where": "W"},
        {"unit": 2, "part": "definitions", "kind": "definition", "title": "Node", "body": "where elements meet"},
        {"unit": 1, "part": "bogus", "kind": "text", "title": "", "body": "dropped"}]})]
    job = client.post(f"/notes/blocks/{img['id']}/draft").json()
    local_ai.run_next()
    j = client.get(f"/local/jobs/{job['id']}").json()
    drafts = j["result"]["blocks"]
    assert [d["part"] for d in drafts] == ["formulas", "definitions"]
    assert drafts[1]["unit_id"] == unit(session, 2).id
    assert fake.chats[0]["messages"][1]["images"]
    assert not session.exec(select(NoteBlock).where(NoteBlock.kind == "formula")).all()  # nothing added yet
    r = client.post("/notes/blocks", json={**{k: drafts[0][k] for k in ("unit_id", "part", "kind", "title", "body", "extra")},
                                           "actor": "local"}).json()
    assert r["created_by"] == "local" and "by Qwen" in r["html"]


def test_draft_needs_the_local_ai(client, session):
    u = unit(session, 1)
    img = client.post("/notes/assets", data={"unit_id": u.id}, files={"file": ("s.png", png(), "image/png")}).json()
    r = client.post(f"/notes/blocks/{img['id']}/draft")
    assert r.status_code == 422 and "local AI is off" in r.json()["detail"]


def test_bare_latex_from_qwen_gets_delimiters():
    w = local_ai.wrap_bare_math
    assert w(r"Find \mathbf{u} = \langle 3, 5 \rangle and more.") == r"Find \(\mathbf{u} = \langle 3, 5 \rangle\) and more."
    assert w("plain words only") == "plain words only"
    assert w(r"already \(x\) here") == r"already \(x\) here"


# ---- interactive illustrations ---------------------------------------------------------------

WIDGET = "<div id='x'></div><script>document.getElementById('x').textContent = 'hi';</script>"


def test_interactive_block_runs_in_a_locked_sandbox(client, session):
    from app import mcp_server as m, widgets
    with pytest.raises(ValueError):
        m.notes_add("MTH254", "1", "ideas", WIDGET, kind="interactive", title="Demo")  # needs a description
    r = m.notes_add("MTH254", "1", "ideas", WIDGET, kind="interactive", title="Demo",
                    description="Shows **hi**. Try nothing.")[0]
    bid = int(r.split()[2])
    page = client.get(f"/notes/MTH254?u={unit(session, 1, 'MTH254').id}").text
    frame = page[page.index('<iframe class="nb-widget"'):]
    frame = frame[:frame.index("</iframe>")]
    assert 'sandbox="allow-scripts"' in frame and "allow-same-origin" not in frame
    assert "Content-Security-Policy" in frame and "connect-src &#39;none&#39;" in frame
    assert "<strong>hi</strong>" in page                      # the description, above the frame
    assert "&lt;script&gt;" in frame and "<script>document" not in page  # code only inside srcdoc
    doc = widgets.document(WIDGET)
    assert doc.startswith("<!doctype html>") and "window.HB" in doc and "cdn.jsdelivr.net" in doc
    prev = client.post("/notes/widget-preview", data={"code": WIDGET, "title": "Demo"}).text
    assert prev.startswith('<iframe class="nb-widget" sandbox="allow-scripts"')
    assert "Updated" in m.notes_update(bid, description="New text")[0]
    session.expire_all()
    assert session.get(NoteBlock, bid).extra["description"] == "New text"


def test_garbled_draft_is_retried_then_reported(client, session):
    fake = FakeOllama()
    local_ai.set_client(fake)
    u = unit(session, 1)
    img = client.post("/notes/assets", data={"unit_id": u.id}, files={"file": ("s.png", png(), "image/png")}).json()
    good = json.dumps({"blocks": [{"unit": 1, "part": "tips", "kind": "tip", "title": "Arrow", "body": "Draw it first."}]})
    fake.replies = ['{\n "blocks": [\n  {\n   unit: 1, oops', good]
    job = client.post(f"/notes/blocks/{img['id']}/draft").json()
    local_ai.run_next()
    j = client.get(f"/local/jobs/{job['id']}").json()
    assert j["status"] == "done" and j["result"]["blocks"][0]["title"] == "Arrow"
    assert fake.chats[0]["think"] is False and fake.chats[1]["options"]["temperature"] == 0
    fake.replies = ["not json", "still not json"]
    job = client.post(f"/notes/blocks/{img['id']}/draft").json()
    local_ai.run_next()
    j = client.get(f"/local/jobs/{job['id']}").json()
    assert j["status"] == "error" and j["error"].startswith("The local AI's reply came back garbled twice")
    assert "still not json" in session.get(LocalJob, job["id"]).output


def test_json_repair():
    assert local_ai._json_reply('{"a": [1, 2,], }') == {"a": [1, 2]}
    assert local_ai._json_reply('Here you go: {"a": 1} thanks') == {"a": 1}
