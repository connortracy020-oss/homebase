"""Stage (c): uploads, review packets, API feedback (with a fake Claude), MCP tools."""
import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlmodel import select

from app import config, feedback, services, uploads
from app.models import ActivityLog, Attempt, Problem, Submission, Task

HAVE_ULABY = (config.ROOT / "library/ece201/ulaby/exercise_sol.pdf").exists()


def jpeg(w=1200, h=900, orientation=None) -> bytes:
    img = Image.new("RGB", (w, h), "white")
    buf = io.BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        img.save(buf, "JPEG", exif=exif)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


def pdf(pages=2) -> bytes:
    imgs = [Image.new("RGB", (850, 1100), "white") for _ in range(pages)]
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:])
    return buf.getvalue()


def problem(session, slug):
    return session.exec(select(Problem).where(Problem.slug == slug)).one()


def make_sub(session, slug="ulaby-ex-ch1-1", files=None):
    p = problem(session, slug)
    course = services.course_by_code(session, "ECE201")
    return services.create_submission(session, p, course, files or [("work.jpg", jpeg())], note="units?")


GOOD_REVIEW = {"transcription": "P = vi = 12 W", "legible": True,
               "answers": [{"label": "P", "student": "12 W", "key": "-12 W", "match": "no"}],
               "verdict": "incorrect", "first_error": "Used p = vi although i enters the − terminal",
               "cause": "setup", "feedback": "- Check where the current enters.\n- Then use \\(p=-vi\\).",
               "confidence": "high"}


# ---- uploads ---------------------------------------------------------------------------

def test_photo_is_rotated_upright_and_resized(data_dir):
    saved = uploads.save_files(1, [("sideways.jpg", jpeg(4000, 3000, orientation=6))])
    page = Image.open(config.DATA_DIR / saved[0].pages[0])
    assert page.size == (1500, 2000)  # rotated to portrait, long edge 2000


def test_pdf_becomes_page_images(data_dir):
    saved = uploads.save_files(2, [("scan.pdf", pdf(3))])
    assert len(saved[0].pages) == 3
    assert max(Image.open(config.DATA_DIR / saved[0].pages[0]).size) == 2000


@pytest.mark.parametrize("data, msg", [(b"hello there", "isn't a photo"), (b"", "isn't a photo")])
def test_bad_files_are_refused(data_dir, data, msg):
    with pytest.raises(uploads.UploadError, match=msg):
        uploads.save_files(3, [("x.txt", data)])


def test_too_many_pages(data_dir):
    with pytest.raises(uploads.UploadError, match="more than"):
        uploads.save_files(4, [("big.pdf", pdf(uploads.MAX_PAGES + 1))])


def test_failed_upload_saves_nothing(session):
    course = services.course_by_code(session, "ECE201")
    with pytest.raises(uploads.UploadError):
        services.create_submission(session, problem(session, "ulaby-ex-ch1-1"), course, [("x", b"nope")])
    assert session.exec(select(Submission)).all() == []


# ---- packets and reviews ---------------------------------------------------------------------

def test_generated_problem_packet_has_computed_key_and_pages(session):
    sub = make_sub(session, "gen-ece201-w1-power-loop_power-1")
    packet = feedback.build_packet(session, sub)
    texts = "\n".join(p.text for p in packet.parts)
    assert "computed by code" in texts and "Power absorbed by A" in texts
    assert "Note from the student: units?" in texts
    assert packet.parts[-1].jpeg and packet.key_type == "computed"
    content = feedback.packet_to_api_content(packet)
    assert content[-2]["type"] == "image" and content[-2]["source"]["media_type"] == "image/jpeg"


@pytest.mark.skipif(not HAVE_ULABY, reason="Ulaby PDF not in library/")
def test_pdf_problem_packet_includes_key_image(session):
    packet = feedback.build_packet(session, make_sub(session))
    assert packet.parts[0].png and packet.parts[1].png  # statement and official solution


class FakeClient:
    """Stands in for anthropic.Anthropic() so tests never call the real API."""
    def __init__(self, reply=None, fail=None):
        self.calls = []
        self.reply, self.fail = reply, fail
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise self.fail
        return SimpleNamespace(stop_reason="end_turn", model=kwargs["model"],
                               content=[SimpleNamespace(type="text", text=json.dumps(self.reply))],
                               usage=SimpleNamespace(input_tokens=9000, output_tokens=700))


def test_api_review_is_stored(session):
    sub = make_sub(session)
    client = FakeClient(GOOD_REVIEW)
    feedback.run_api_review(session, sub, client=client)
    assert sub.status == "reviewed" and sub.verdict == "incorrect" and sub.cause == "setup"
    assert sub.reviewer == "api" and sub.tokens_in == 9000
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["system"][0]["text"] == feedback.SYSTEM_PROMPT  # stable, so it caches


def test_api_failure_keeps_the_submission(session):
    sub = make_sub(session)
    feedback.run_api_review(session, sub, client=FakeClient(fail=RuntimeError("network down")))
    assert sub.status == "error" and "network down" in sub.error


def test_no_key_means_never_correct(session):
    sub = make_sub(session)
    p = session.get(Problem, sub.problem_id)
    p.key_type = "none"
    session.commit()
    feedback.apply_review(session, sub, {**GOOD_REVIEW, "verdict": "correct"}, reviewer="api")
    assert sub.verdict == "unclear"


def test_review_needs_feedback_text(session):
    with pytest.raises(ValueError):
        feedback.apply_review(session, make_sub(session), {**GOOD_REVIEW, "feedback": " "}, reviewer="api")


def test_confirming_records_an_attempt(session):
    sub = make_sub(session)
    feedback.apply_review(session, sub, GOOD_REVIEW, reviewer="api")
    feedback.confirm(session, sub, "partial")
    attempt = session.exec(select(Attempt).where(Attempt.problem_id == sub.problem_id)).one()
    assert attempt.result == "shaky" and sub.user_verdict == "partial"


# ---- web --------------------------------------------------------------------------------------

def test_submit_and_view(client, session):
    r = client.post("/problem/ulaby-ex-ch1-1/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")},
                    data={"note": ""}, follow_redirects=True)
    assert r.status_code == 200 and "Waiting for review" in r.text
    assert "Instant feedback is off" in r.text  # no API key in tests
    sub = session.exec(select(Submission)).one()
    page = sub.files[0]["pages"][0]
    assert client.get(f"/{page}").status_code == 200
    assert "1</span>" in client.get("/").text  # pending count in the nav
    feedback.apply_review(session, sub, GOOD_REVIEW, reviewer="api")
    r = client.get(f"/submission/{sub.id}")
    assert "First error:" in r.text and "<li>Check where the current enters.</li>" in r.text
    r = client.post(f"/submission/{sub.id}/confirm", data={"verdict": "incorrect"}, follow_redirects=True)
    assert "You settled on" in r.text


def test_bad_upload_shows_message(client):
    r = client.post("/problem/ulaby-ex-ch1-1/submit", files={"files": ("w.txt", b"text", "text/plain")})
    assert "didn't work" in r.text


def test_api_mode_needs_a_key(client, session):
    client.post("/settings/feedback-mode", data={"mode": "api"})
    sub = make_sub(session)
    assert client.post(f"/submission/{sub.id}/api-review").status_code == 422
    assert "In a Claude session" in client.get("/submissions").text


def test_uploads_cannot_escape(client):
    assert client.get("/uploads/../homebase.db").status_code == 404


def test_feedback_text_is_escaped(client, session):
    sub = make_sub(session)
    feedback.apply_review(session, sub, {**GOOD_REVIEW, "feedback": "<script>alert(1)</script>"}, reviewer="api")
    assert "<script>alert" not in client.get(f"/submission/{sub.id}").text


# ---- MCP tools ------------------------------------------------------------------------------

def test_mcp_review_flow(session):
    from mcp.server.mcpserver import Image as McpImage

    from app import mcp_server as m
    sub = make_sub(session, "gen-ece201-w1-power-element_power-2")
    assert f"submission {sub.id}" in m.list_pending_submissions()
    packet = m.get_submission(sub.id)
    assert packet[0].startswith("REVIEW INSTRUCTIONS")
    assert any(isinstance(x, McpImage) for x in packet)
    out = m.post_feedback(sub.id, "work", "correct", "Nice: you used the passive sign convention.",
                          cause="none", confidence="high")
    assert "correct" in out
    session.expire_all()
    assert session.get(Submission, sub.id).reviewer == "claude_session"
    assert m.list_pending_submissions() == "Nothing is waiting for review."
    last = session.exec(select(ActivityLog).order_by(ActivityLog.id.desc())).first()
    assert last.actor == "claude"


def test_mcp_logging_tools(session):
    from app import mcp_server as m
    task = session.exec(select(Task).where(Task.ref == "mit6002-L01")).one()
    assert "done" in m.mark_task_done(task.id)
    assert "Logged 30 min" in m.log_study_session("ECE 201", 30, "nodal practice in chat")
    assert "Recorded miss" in m.record_problem_result("ulaby-ex-ch1-4", "miss", "unit prefix")
    assert "Saved note" in m.add_note("ECE201", "Remember: mA x V = mW", problem_slug="ulaby-ex-ch1-4")
    with pytest.raises(ValueError):
        m.add_note("ECE201", "x", video_slug="nope")
    with pytest.raises(ValueError):
        m.get_week("CS999", 1)
    assert "Prep week" in m.get_overview("2026-11-03")
    assert "ulaby-ex-ch1-1" in m.list_problems("ECE201", 1)
    assert "[claude]" in m.recent_activity()
