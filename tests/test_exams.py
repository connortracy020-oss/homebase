"""Stage (e): timed practice exams from real past exams."""
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select

from app import config, exams, services
from app.models import Attempt, ExamAttempt, Mistake, StudySession, Submission, Task

HAVE_LIBRARY = (config.ROOT / "library/ece201/ucb-ee40/fa11_mt1.pdf").exists()


def exam(session, slug):
    return exams.exam_by_slug(session, slug)


def test_starter_exams_with_points(session):
    totals = {e.slug: e.total_points for e in exams.exams_for(session)}
    starters = {"ucb40-fa11-mt1": 100, "ucb40-sp12-mt2-ece201": 50, "mit1802sc-exam1": 70,
                "mit1802sc-exam2": 100, "gt2026-sp25-q1": 100, "gt2026-sp25-q2": 100}
    assert {k: totals[k] for k in starters} == starters
    for e in exams.exams_for(session):  # every exam: points add up, every problem has a key
        probs = exams.problems_of(session, e)
        assert probs and abs(sum(p.points for p in probs) - e.total_points) < 1e-9
        assert all(p.key and p.key_type.startswith("official") for p in probs)
        assert "by eye" in e.verified
    e = exam(session, "mit1802sc-exam1")
    assert e.time_min == 35 and "matrices" in e.skipped
    assert all(p.key_type == "official_worked" for p in exams.problems_of(session, e))


def test_exam_problems_stay_off_the_week_pages(session):
    course = services.course_by_code(session, "ECE201")
    assert all(ps.kind != "exam" for ps in services.psets_for_week(session, course, 5))


def test_prep_plan_links_real_exams(session):
    refs = {t.ref for t in session.exec(select(Task).where(Task.ref_kind == "exam"))}
    assert refs >= {"ucb40-fa11-mt1", "ucb40-sp12-mt2-ece201", "mit1802sc-exam1",
                    "mit1802sc-exam2", "gt2026-sp25-q1"}


def test_start_is_idempotent_and_deadline_is_fixed(session):
    e = exam(session, "gt2026-sp25-q1")
    a = exams.start(session, e)
    assert (a.deadline - a.started_at) == timedelta(minutes=50)
    assert exams.start(session, e).id == a.id


def test_finish_logs_time_and_overtime(session):
    e = exam(session, "mit1802sc-exam1")
    a = exams.start(session, e)
    a.started_at -= timedelta(minutes=40)
    a.deadline -= timedelta(minutes=40)  # pretend it began 40 minutes ago (35-minute exam)
    session.commit()
    exams.finish(session, a)
    assert a.status == "finished" and 4 * 60 <= a.overtime_sec <= 6 * 60
    study = session.exec(select(StudySession)).one()
    assert 39 <= study.minutes <= 41 and study.source == "timer"


def test_grading_validates_and_feeds_mistakes(session):
    e = exam(session, "gt2026-sp25-q1")
    a = exams.finish(session, exams.start(session, e))
    probs = exams.problems_of(session, e)
    with pytest.raises(ValueError, match="every problem"):
        exams.grade(session, a, {probs[0].id: 30})
    with pytest.raises(ValueError, match="between 0 and 30"):
        exams.grade(session, a, {probs[0].id: 31, probs[1].id: 0, probs[2].id: 0})
    exams.grade(session, a, {probs[0].id: 30, probs[1].id: 25, probs[2].id: 5}, to_mistakes={probs[2].id})
    assert a.total == 60 and a.status == "graded"
    results = [x.result for x in session.exec(select(Attempt).order_by(Attempt.id))]
    assert results == ["solid", "shaky", "miss"]
    m = session.exec(select(Mistake)).one()
    assert m.problem_id == probs[2].id and m.source == "exam"


def test_suggested_grades_are_clamped(session):
    e = exam(session, "ucb40-fa11-mt1")
    a = exams.finish(session, exams.start(session, e))
    exams.apply_review(session, a, {"problems": [
        {"number": 1, "points_awarded": 99, "comment": "fine", "first_error": "", "cause": "none"},
        {"number": 2, "points_awarded": -3, "comment": "", "first_error": "sign", "cause": "nonsense"},
        {"number": 9, "points_awarded": 5, "comment": "", "first_error": "", "cause": "none"}],
        "feedback": "ok", "legible": False, "confidence": "low"}, reviewer="api")
    pts = [v["points"] for v in a.suggested.values()]
    assert pts == [20.0, 0.0] and list(a.suggested.values())[1]["cause"] == "unclear"
    assert a.feedback.startswith("(Parts of your work were hard to read.)")


class FakeClient:
    def __init__(self, reply):
        self.reply, self.calls = reply, []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(stop_reason="end_turn", model=kw["model"],
                               content=[SimpleNamespace(type="text", text=json.dumps(self.reply))])


@pytest.mark.skipif(not HAVE_LIBRARY, reason="exam PDFs not in library/")
def test_api_exam_grading_with_fake_claude(session):
    from tests.test_feedback import jpeg
    e = exam(session, "gt2026-sp25-q1")
    a = exams.finish(session, exams.start(session, e))
    services.create_submission(session, None, services.course_by_code(session, "ECE200"),
                               [("p1.jpg", jpeg())], exam_attempt_id=a.id)
    assert exams.awaiting_review(session) == [a]
    client = FakeClient({"problems": [{"number": n, "points_awarded": 10, "comment": "c",
                                       "first_error": "", "cause": "none"} for n in (1, 2, 3)],
                         "feedback": "- review phasors", "legible": True, "confidence": "high"})
    exams.run_api_review(session, a, client=client)
    assert sum(v["points"] for v in a.suggested.values()) == 30
    images = [b for b in client.calls[0]["messages"][0]["content"] if b["type"] == "image"]
    assert len(images) == 3 * 2 + 1  # each problem and its solution, plus his page
    assert exams.awaiting_review(session) == []


# ---- web ---------------------------------------------------------------------------------

@pytest.mark.skipif(not HAVE_LIBRARY, reason="exam PDFs not in library/")
def test_full_sitting_in_the_browser_flow(client, session):
    from tests.test_feedback import jpeg
    assert "EE 40 Midterm 1, Fall 2011" in client.get("/exams").text
    assert "Start the clock" in client.get("/exam/ucb40-fa11-mt1").text
    r = client.post("/exam/ucb40-fa11-mt1/start", follow_redirects=True)
    assert "Pencils down" in r.text and "exam-clock" in r.text
    assert "Official solution" not in r.text  # no keys during the exam
    a = session.exec(select(ExamAttempt)).one()
    assert client.get(f"/problem/exam-ucb40-fa11-mt1-1/statement.png").status_code == 200
    client.post(f"/attempt/{a.id}/finish")
    r = client.post(f"/attempt/{a.id}/upload", files={"files": ("w.jpg", jpeg(), "image/jpeg")},
                    follow_redirects=True)
    assert "Official solution" in r.text and "Grade my Homebase practice exam" in r.text
    sub = session.exec(select(Submission)).one()
    assert client.get(f"/submission/{sub.id}", follow_redirects=False).headers["location"].startswith(f"/attempt/{a.id}")
    probs = exams.problems_of(session, exam(session, "ucb40-fa11-mt1"))
    form = {f"p{p.id}": str(p.points) for p in probs}
    form[f"p{probs[1].id}"] = "10"
    form[f"m{probs[1].id}"] = "on"
    r = client.post(f"/attempt/{a.id}/grade", data=form, follow_redirects=True)
    assert "85 / 100" in r.text
    assert "85%" in client.get("/progress").text
    assert session.exec(select(Mistake)).one().problem_id == probs[1].id


def test_cannot_grade_while_running(client, session):
    client.post("/exam/gt2026-sp25-q2/start")
    a = session.exec(select(ExamAttempt)).one()
    assert client.post(f"/attempt/{a.id}/grade", data={}).status_code == 409


# ---- MCP -----------------------------------------------------------------------------------

@pytest.mark.skipif(not HAVE_LIBRARY, reason="exam PDFs not in library/")
def test_mcp_exam_grading(session):
    from app import mcp_server as m
    from tests.test_feedback import jpeg
    assert "mit1802sc-exam2" in m.list_exams("MTH254")
    e = exam(session, "mit1802sc-exam1")
    a = exams.finish(session, exams.start(session, e))
    sub = services.create_submission(session, None, services.course_by_code(session, "MTH254"),
                                     [("p.jpg", jpeg())], exam_attempt_id=a.id)
    assert "timed exam" in m.list_pending_submissions()
    packet = m.get_submission(sub.id)
    assert packet[0].startswith("EXAM GRADING INSTRUCTIONS")
    out = m.post_exam_grades(a.id, [{"number": n, "points_awarded": 5, "comment": "", "first_error": "",
                                     "cause": "none"} for n in range(1, 5)], "good start")
    assert "20/70" in out
