"""Circuit Bench pages and saving (app/circuits.py, app/routes/circuit_routes.py)."""
from sqlmodel import select

from app import circuits as cs
from app.models import ActivityLog, Circuit, CircuitAttempt

DOC = {
    "format": "homebase-circuit", "version": 1, "title": "Divider", "course": "ECE201",
    "parts": [{"id": "V1", "type": "V", "x": 0, "y": 2, "rot": 1, "params": {"V": "10"}},
              {"id": "R1", "type": "R", "x": 2, "y": 0, "rot": 0, "params": {"R": "1k"}}],
    "wires": [{"id": "w1", "a": [0, 2], "b": [0, 0]}],
}


def test_new_circuit_and_bench_page(client, session):
    r = client.post("/circuits/new", data={"title": "My divider", "course": "ECE201"}, follow_redirects=False)
    assert r.status_code == 303
    slug = r.headers["location"].rsplit("/", 1)[1]
    page = client.get(f"/circuits/{slug}")
    assert page.status_code == 200
    assert 'id="circuit-data"' in page.text and "/static/circuits/app.js" in page.text
    assert "My divider" in client.get("/circuits").text
    c = session.exec(select(Circuit)).one()
    assert c.doc["format"] == "homebase-circuit" and c.rev == 1


def test_save_bumps_revision_and_refuses_stale_saves(client, session):
    c = cs.create_circuit(session, "Divider", "ECE201")
    r = client.put(f"/api/circuits/{c.slug}", json={"doc": DOC, "rev": 1, "summary": {"ok": True}})
    assert r.status_code == 200 and r.json()["rev"] == 2
    # a save from an editor that still thinks it's at revision 1 is refused, with the newer copy
    r = client.put(f"/api/circuits/{c.slug}", json={"doc": {**DOC, "parts": []}, "rev": 1})
    assert r.status_code == 409
    assert r.json()["current"]["rev"] == 2 and len(r.json()["current"]["doc"]["parts"]) == 2
    got = client.get(f"/api/circuits/{c.slug}").json()
    assert got["title"] == "Divider" and got["doc"]["parts"][1]["id"] == "R1"


def test_bad_documents_are_rejected(client, session):
    c = cs.create_circuit(session, "X", "ECE201")
    assert client.put(f"/api/circuits/{c.slug}", json={"doc": {"format": "other"}, "rev": 1}).status_code == 422
    dup = {**DOC, "parts": DOC["parts"] + [DOC["parts"][1]]}
    assert client.put(f"/api/circuits/{c.slug}", json={"doc": dup, "rev": 1}).status_code == 422
    assert client.get("/api/circuits/nope").status_code == 404


def test_rename_duplicate_archive(client, session):
    c = cs.create_circuit(session, "First", "ECE201", DOC)
    assert client.post(f"/api/circuits/{c.slug}/rename", json={"title": "Renamed"}).json()["title"] == "Renamed"
    r = client.post(f"/circuits/{c.slug}/duplicate", follow_redirects=False)
    assert r.status_code == 303
    assert len(session.exec(select(Circuit)).all()) == 2
    client.post(f"/circuits/{c.slug}/archive", data={"archived": "true"})
    session.expire_all()
    assert session.get(Circuit, c.id).archived
    assert f'href="/circuits/{c.slug}"' not in client.get("/circuits").text
    assert ">Renamed<" in client.get("/circuits?archived=1").text


def test_predictions_are_recorded_and_logged(client, session):
    c = cs.create_circuit(session, "Divider", "ECE201", DOC)
    r = client.post(f"/api/circuits/{c.slug}/attempts", json={
        "kind": "predict", "quantity": "v(Vout)", "guess": -5, "truth": 5, "correct": False, "tags": ["sign"]})
    assert r.status_code == 200
    a = session.exec(select(CircuitAttempt)).one()
    assert a.tags == ["sign"] and not a.correct
    assert session.exec(select(ActivityLog).where(ActivityLog.action == "circuit.predict")).first()
    assert client.post(f"/api/circuits/{c.slug}/attempts", json={
        "kind": "guess", "quantity": "x", "guess": 1, "truth": 1, "correct": True}).status_code == 422


def test_bench_modules_are_revalidated(client):
    r = client.get("/static/circuits/core/doc.js")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-cache"


def _divider_problem(session):
    from app.models import Problem
    return session.exec(select(Problem).where(Problem.generator == "voltage_divider")).first()


def test_open_a_generated_problem_on_the_bench(client, session):
    from app.models import Problem
    p = _divider_problem(session)
    assert p.statement["bench"]["format"] == "homebase-circuit"
    page = client.get(f"/problem/{p.slug}")
    assert f'action="/circuits/from-problem/{p.slug}"' in page.text and "Open on the Circuit Bench" in page.text
    r = client.post(f"/circuits/from-problem/{p.slug}", follow_redirects=False)
    assert r.status_code == 303
    c = cs.get_circuit(session, r.headers["location"].rsplit("/", 1)[1])
    assert c.problem_id == p.id and c.source == "problem" and c.doc["study"]["predict"]
    assert c.doc["parts"] == p.statement["bench"]["parts"] and c.doc["wires"] == p.statement["bench"]["wires"]
    assert c.course_id == session.get(cs.ProblemSet, p.set_id).course_id
    # opening it again goes back to the same copy, so work on it is kept
    again = client.post(f"/circuits/from-problem/{p.slug}", follow_redirects=False)
    assert again.headers["location"] == r.headers["location"]
    assert "Open your bench copy" in client.get(f"/problem/{p.slug}").text
    # a problem with no circuit has no button and can't be opened
    plain = session.exec(select(Problem).where(Problem.generator == "")).first()
    assert "from-problem" not in client.get(f"/problem/{plain.slug}").text
    assert client.post(f"/circuits/from-problem/{plain.slug}").status_code == 404


def test_misses_on_a_problems_circuit_go_to_the_mistake_log(client, session):
    from app.models import Mistake
    c = cs.open_for_problem(session, _divider_problem(session))
    miss = {"kind": "predict", "quantity": "v(n2)", "guess": 6, "truth": -6, "correct": False, "tags": ["sign"]}
    assert client.post(f"/api/circuits/{c.slug}/attempts", json=miss).status_code == 200
    m = session.exec(select(Mistake)).one()
    assert (m.source, m.cause, m.problem_id) == ("bench", "algebra-sign", c.problem_id)
    assert "v(n2) = 6" in m.note
    # several wrong values in one sitting are one entry, not one per value
    client.post(f"/api/circuits/{c.slug}/attempts", json={**miss, "kind": "check", "tags": ["kcl"]})
    assert len(session.exec(select(Mistake)).all()) == 1
    assert not session.exec(select(ActivityLog).where(ActivityLog.action == "mistake.lapse")).first()
    # right answers, and circuits that aren't a problem's, never add to the log
    client.post(f"/api/circuits/{c.slug}/attempts", json={**miss, "guess": -6, "correct": True, "tags": []})
    own = cs.create_circuit(session, "Sandbox", "ECE201", DOC)
    client.post(f"/api/circuits/{own.slug}/attempts", json=miss)
    assert len(session.exec(select(Mistake)).all()) == 1


def test_mcp_circuit_tools(session):
    import shutil

    import pytest

    from app import mcp_server as mcp
    p = _divider_problem(session)
    out = mcp.circuits_save(p.statement["bench"], title="Divider for Connor", problem_slug=p.slug)
    slug = out.split()[2].rstrip(":")
    session.expire_all()
    c = cs.get_circuit(session, slug)
    assert (c.source, c.updated_by, c.problem_id, c.title) == ("claude", "claude", p.id, "Divider for Connor")
    assert session.exec(select(ActivityLog).where(ActivityLog.action == "circuit.new", ActivityLog.actor == "claude")).first()
    if shutil.which("node"):  # the check uses the bench's own solver
        assert "The bench solves it" in out and "SPICE netlist" in out
        for part in p.statement["bench"]["parts"]:
            if part["type"] not in ("GND", "LBL"):
                assert f"{part['id']}.a" in out
        assert c.summary["ok"] and c.summary["nodes"]
    got = mcp.circuits_get(slug)
    assert "base_rev for circuits_save: 1" in got and '"format":"homebase-circuit"' in got
    assert slug in mcp.circuits_list("ECE201") and f"from problem {p.slug}" in mcp.circuits_list()
    # changing it needs the revision it was read at, so a newer change of his is never overwritten
    with pytest.raises(ValueError, match="base_rev"):
        mcp.circuits_save(DOC, circuit_slug=slug)
    assert "now rev 2" in mcp.circuits_save(DOC, circuit_slug=slug, base_rev=1)
    with pytest.raises(ValueError, match="circuits_get"):
        mcp.circuits_save(DOC, circuit_slug=slug, base_rev=1)
    with pytest.raises(ValueError):
        mcp.circuits_save({"format": "other"})
    assert mcp.circuits_attempts() == "No predictions yet."
    session.expire_all()
    cs.record_attempt(session, cs.get_circuit(session, slug), "predict", "v(n1)", 5, 5, True)
    assert "1 of 1 right" in mcp.circuits_attempts() and "1 of 1 right" in mcp.circuits_attempts(slug)


def test_add_a_picture_of_the_circuit_to_notes(client, session):
    import io
    import json
    import re

    from PIL import Image

    from app.models import NoteBlock, NoteUnit
    c = cs.create_circuit(session, "Bridge", "ECE201", DOC, week=7)
    page = client.get(f"/circuits/{c.slug}").text
    data = json.loads(re.search(r'id="circuit-data">(.*?)</script>', page, re.S).group(1))
    unit = session.get(NoteUnit, data["notes"]["default"])
    assert unit.term_week == 7 and ["examples", "Worked examples"] in data["notes"]["parts"]
    png = io.BytesIO()
    Image.new("RGB", (40, 20), (28, 27, 24)).save(png, "PNG")
    r = client.post(f"/api/circuits/{c.slug}/snapshot", data={"caption": "Balanced bridge", "part": "examples"},
                    files={"file": ("circuit.png", png.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    b = session.get(NoteBlock, r.json()["block"])
    assert (b.kind, b.part, b.unit_id, b.body) == ("image", "examples", unit.id, "Balanced bridge")
    assert b.source == {"label": "Circuit Bench · Bridge", "url": f"/circuits/{c.slug}"}
    assert r.json()["url"].startswith("/notes/ECE201?u=")
    notes_page = client.get(r.json()["url"].split("#")[0]).text
    assert f'<a href="/circuits/{c.slug}">Circuit Bench · Bridge →</a>' in notes_page  # opens in the same tab
    # not an image, or a unit from another course's notes, is refused
    bad = client.post(f"/api/circuits/{c.slug}/snapshot", data={"part": "ideas"},
                      files={"file": ("x.png", b"not a picture", "image/png")})
    assert bad.status_code == 422
    other = session.exec(select(NoteUnit).where(NoteUnit.notebook_id != unit.notebook_id)).first()
    png.seek(0)
    wrong = client.post(f"/api/circuits/{c.slug}/snapshot", data={"unit_id": other.id},
                        files={"file": ("c.png", png.getvalue(), "image/png")})
    assert wrong.status_code == 422
