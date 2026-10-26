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
