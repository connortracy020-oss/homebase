"""Stage (b): videos, notes, readings, problem sets."""
import sqlite3

import pytest
from sqlmodel import Session, select

from app import config, db, pdfpages, services
from app.models import Problem, Task

HAVE_ULABY = (config.ROOT / "library/ece201/ulaby/exercise_sol.pdf").exists()


def test_week1_content_is_seeded(session):
    course = services.course_by_code(session, "ECE201")
    sets = {p.slug: p for p in services.psets_for_week(session, course, 1)}
    assert {"ulaby-ex-ch1", "ulaby-cq-ch1", "gen-ece201-w1-power", "kuphaldt-ewp"} <= set(sets)
    ex = services.problems(session, sets["ulaby-ex-ch1"])
    assert len(ex) == 10
    assert ex[0].statement["page"] == 16 and ex[9].statement["page"] == 25
    assert all(p.key_type == "official_worked" for p in ex)
    gen = services.problems(session, sets["gen-ece201-w1-power"])
    assert len(gen) == 13 and all(p.key_type == "computed" and p.key["answers"] for p in gen)
    readings = services.readings_for_week(session, course, 1)
    assert readings[0][1].slug == "ulaby-cad3e"
    videos = services.videos_for_week(session, course, 1)
    assert videos[0].priority == "core"
    l01 = services.video_by_slug(session, "mit6002-L01")
    assert l01.youtube_id and len(services.chapters(session, l01)) >= 5


def test_reseed_keeps_notes_attempts_and_position(session):
    from app.seed import seed
    video = services.video_by_slug(session, "mit6002-L01")
    course = services.course_by_code(session, "ECE201")
    services.add_note(session, course, "lumped matter discipline", video=video, t_sec=95)
    services.save_position(session, video, 600)
    problem = session.exec(select(Problem).where(Problem.slug == "ulaby-ex-ch1-3")).one()
    services.rate_problem(session, problem, "shaky")
    seed(session)
    video = services.video_by_slug(session, "mit6002-L01")
    assert video.last_pos_sec == 600
    assert [n.t_sec for n in services.notes_for(session, video=video)] == [95]
    assert len(services.attempts(session, problem)) == 1


def test_watching_ticks_the_watch_task(session):
    video = services.video_by_slug(session, "mit6002-L01")
    services.set_watched(session, video, True)
    task = session.exec(select(Task).where(Task.ref == "mit6002-L01")).one()
    assert task.done_at is not None


def test_ticking_the_watch_task_marks_video_watched(session):
    task = session.exec(select(Task).where(Task.ref == "yt-C_EDm61hwLw")).one()
    services.set_task_done(session, task.id, True)
    assert services.video_by_slug(session, "yt-C_EDm61hwLw").watched_at is not None


def test_pages(client):
    for path in ["/course/ECE201/week/1", "/video/mit6002-L01", "/pset/ulaby-ex-ch1",
                 "/pset/gen-ece201-w1-power", "/problem/ulaby-ex-ch1-1",
                 "/problem/gen-ece201-w1-power-loop_power-1", "/problem/kuphaldt-ewp-3"]:
        assert client.get(path).status_code == 200, path
    hub = client.get("/course/ECE201/week/1").text
    for heading in ("Watch", "Read", "Solve", "Prep-plan checklist"):
        assert f"<h2>{heading}</h2>" in hub
    have_book = (config.ROOT / "library/ece201/ulaby/ulaby_cad3e.pdf").exists()
    assert ("not downloaded yet" in hub) != have_book  # the badge shows only while the book is missing


def test_video_notes_api(client):
    r = client.post("/api/videos/mit6002-L01/notes", json={"body": "KCL = charge conservation", "t_sec": 312})
    note = r.json()
    assert note["t_sec"] == 312
    assert client.put(f"/api/notes/{note['id']}", json={"body": "edited"}).json()["body"] == "edited"
    assert client.post("/api/videos/mit6002-L01/notes", json={"body": "  "}).status_code == 422
    assert client.delete(f"/api/notes/{note['id']}").status_code == 200
    assert client.post("/api/videos/mit6002-L01/position", json={"seconds": 77}).status_code == 200


def test_generated_problem_check(client, session):
    p = session.exec(select(Problem).where(Problem.slug == "gen-ece201-w1-power-element_power-1")).one()
    right = str(p.key["answers"][0]["value"])
    r = client.post(f"/problem/{p.slug}/check", data={"a0": right}, follow_redirects=True)
    assert "All correct." in r.text
    r = client.post(f"/problem/{p.slug}/check", data={"a0": "123456"}, follow_redirects=True)
    assert "Not quite." in r.text


def test_rating_a_pdf_problem(client):
    r = client.post("/problem/ulaby-ex-ch1-2/rate", data={"result": "miss", "note": "prefix mixup"},
                    follow_redirects=True)
    assert "prefix mixup" in r.text
    assert client.post("/problem/ulaby-ex-ch1-2/rate", data={"result": "great"}).status_code == 422


def test_library_cannot_escape(client):
    assert client.get("/library/../app/config.py").status_code == 404
    assert client.get("/library/%2e%2e/app/config.py").status_code == 404


@pytest.mark.skipif(not HAVE_ULABY, reason="Ulaby solutions PDF not in library/")
def test_pdf_crop_shows_exercise_not_solution(client):
    r = client.get("/problem/ulaby-ex-ch1-1/statement.png")
    assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    from io import BytesIO
    from PIL import Image
    statement = Image.open(BytesIO(r.content))
    key = Image.open(BytesIO(client.get("/problem/ulaby-ex-ch1-1/key.png").content))
    assert statement.height < 200 < key.height  # the exercise is a short strip; the solution is long


def test_old_database_gets_new_columns(data_dir):
    """A database from stage (a) gains the new Task columns instead of breaking."""
    db.reset_engine()
    path = config.DB_PATH
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE task (id INTEGER PRIMARY KEY, slug VARCHAR, course_id INTEGER, "
                "course_week INTEGER, prep_week_id INTEGER, kind VARCHAR, title VARCHAR, detail VARCHAR, "
                "url VARCHAR, est_min INTEGER, \"order\" INTEGER, done_at DATETIME, done_by VARCHAR)")
    con.commit()
    con.close()
    db.init_db()
    cols = {row[1] for row in sqlite3.connect(path).execute("PRAGMA table_info(task)")}
    assert {"ref_kind", "ref"} <= cols


@pytest.mark.skipif(not (config.ROOT / "library/ece200/dspfirst-db/ch02/p012s1.png").exists(),
                    reason="DSP First database not in library/")
def test_image_file_keys_render(client):
    """DSP First solutions are PNG scans, not PDFs; the key route must still serve them."""
    r = client.get("/problem/dspdb-w1-sinusoids-c2-p012/key.png")
    assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    page = client.get("/problem/dspdb-w1-sinusoids-c2-p012").text
    assert "Show the official solution" in page
