import json
import zipfile

from sqlmodel import select

from app import backup
from app.models import Task


def test_pages_render(client):
    for path in ["/", "/plan", "/progress", "/settings", "/course/ECE201", "/course/mth254",
                 "/course/ECE200/week/1", "/course/ECE201/week/10"]:
        r = client.get(path)
        assert r.status_code == 200, path
        assert "Homebase" in r.text


def test_courses_page_and_shell(client):
    r = client.get("/courses")
    assert r.status_code == 200
    for name in ("ECE 201", "MTH 254", "ECE 200"):
        assert name in r.text
    assert "var(--c-ece201)" in r.text  # course colors come from the theme, not hex
    assert 'class="tabbar"' in r.text and "theme-toggle" in r.text
    assert 'href="/courses" aria-current="page"' in r.text
    assert "/static/style.css?v=" in r.text


def test_today_shows_current_prep_week(client):
    r = client.get("/")
    assert "Prep week 3 of 11" in r.text
    assert "Lanterman" in r.text or "ECE2026 L3" in r.text  # ECE 200 starts in week 3


def test_unknown_course_is_404(client):
    assert client.get("/course/CS999").status_code == 404
    assert client.get("/course/ECE201/week/11").status_code == 404


def test_toggle_task_via_fetch(client, session):
    task = session.exec(select(Task)).first()
    r = client.post(f"/tasks/{task.id}/toggle", data={"done": "on"},
                    headers={"x-requested-with": "fetch"})
    assert r.json() == {"id": task.id, "done": True}
    r = client.post(f"/tasks/{task.id}/toggle", data={}, headers={"x-requested-with": "fetch"})
    assert r.json()["done"] is False


def test_api_overview_and_claude_actions(client, session):
    ov = client.get("/api/overview").json()
    assert ov["phase"] == "prep" and ov["prep_week"] == 3
    task_id = ov["tasks"][0]["id"]
    done = client.post(f"/api/tasks/{task_id}/done", json={"done": True, "actor": "claude"}).json()
    assert done["done_by"] == "claude"
    client.post("/api/sessions", json={"course": "ECE201", "minutes": 25, "source": "claude",
                                       "actor": "claude"})
    activity = client.get("/api/activity").json()
    assert [a["actor"] for a in activity[:2]] == ["claude", "claude"]
    assert client.post("/api/sessions", json={"course": "ECE201", "minutes": 0}).status_code == 422


def test_export_zip_has_all_tables(client):
    client.post("/study", data={"course": "ECE201", "minutes": "20"})
    r = client.get("/export")
    assert r.status_code == 200
    import io
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    data = json.loads(zf.read("data.json"))
    assert {"course", "task", "studysession", "activitylog"} <= set(data)
    assert data["studysession"][0]["minutes"] == 20


def test_fix_and_delete_logged_time(client, session):
    from app.models import StudySession
    client.post("/study", data={"course": "ECE201", "minutes": "720", "source": "timer"})
    row = session.exec(select(StudySession)).one()
    assert "/study/%d/edit" % row.id in client.get("/progress").text
    assert client.post(f"/study/{row.id}/edit", data={"hours": "2", "minutes": "0"}).status_code == 200
    session.refresh(row)
    assert row.minutes == 120
    assert client.post(f"/study/{row.id}/edit", data={"hours": "0", "minutes": "0"}).status_code == 422
    client.post(f"/study/{row.id}/delete")
    session.expire_all()
    assert session.exec(select(StudySession)).first() is None


def test_backup_copies_db(session, data_dir):
    target = backup.backup_db(session, data_dir / "bk")
    assert target.exists() and target.stat().st_size > 0
    assert backup.get_setting(session, "last_backup")
    assert backup.backup_if_due(session) is None  # just backed up


def test_stop_only_from_the_laptop(client, monkeypatch):
    import threading
    from app.routes import pages
    assert "Desktop app" in client.get("/settings").text
    assert client.post("/settings/stop").status_code == 403  # the test client isn't 127.0.0.1
    stops = []
    monkeypatch.setattr(pages, "on_this_laptop", lambda request: True)
    monkeypatch.setattr(threading, "Timer", lambda delay, fn, args: type("T", (), {"start": lambda self: stops.append(fn)})())
    r = client.post("/settings/stop")
    assert r.status_code == 200 and "Homebase has stopped" in r.text and stops  # exit scheduled, not run


def test_reading_tasks_open_the_local_pdf(client, session):
    from app import config
    from app.models import Reading, Resource
    r = session.exec(select(Reading).join(Resource, Reading.resource_id == Resource.id)
                     .where(Resource.slug == "ulaby-cad3e")).first()
    res = session.get(Resource, r.resource_id)
    resp = client.get(f"/reading/{r.slug}", follow_redirects=False)
    if (config.ROOT / res.local_path).exists():  # your own copy, inside Homebase
        assert resp.status_code == 200 and 'id="pdf-view" src="/library/ece201/ulaby/ulaby_cad3e.pdf' in resp.text
    else:
        assert resp.headers["location"] == res.url
    assert client.get("/reading/nope").status_code == 404
    page = client.get("/").text + client.get("/plan").text
    assert f'href="/reading/' in page
