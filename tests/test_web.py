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


def test_backup_copies_db(session, data_dir):
    target = backup.backup_db(session, data_dir / "bk")
    assert target.exists() and target.stat().st_size > 0
    assert backup.get_setting(session, "last_backup")
    assert backup.backup_if_due(session) is None  # just backed up
