"""Local AI (app/local_ai.py), against a fake Ollama. Tests never touch your real
Ollama: it's shared with Lecture Desk and OpenClaw."""
import json

import pytest
from sqlmodel import select

from app import feedback, local_ai, services
from app.models import LocalJob, Mistake, Submission
from tests.test_feedback import GOOD_REVIEW, jpeg, make_sub, problem

GEN = "gen-ece201-w1-power-loop_power-1"  # a generated problem: exact answers known
PDF = "ulaby-ex-ch1-1"                     # a book problem: key is a PDF crop

ALLOWED = {"version", "models", "capabilities", "loaded", "chat"}


class FakeOllama:
    """Records every call. Replies come from self.replies (one string per chat)."""

    def __init__(self, loaded=(), replies=(), models=("qwen3.5:9b", "qwen3-embedding:0.6b", "other:27b")):
        self.calls, self.chats = [], []
        self._loaded, self.replies, self._models = list(loaded), list(replies), list(models)

    def version(self):
        self.calls.append("version"); return "0.40.6"

    def models(self):
        self.calls.append("models"); return self._models

    def capabilities(self, name):
        self.calls.append("capabilities")
        return ["completion", "embedding"] if "embed" in name else ["completion", "vision"]

    def loaded(self):
        self.calls.append("loaded"); return self._loaded

    giveaway = False  # what the "does this hint give the answer away?" check says

    def chat(self, payload):
        self.calls.append("chat"); self.chats.append(payload)
        if payload.get("format") == local_ai.GIVEAWAY_SCHEMA:
            yield {"message": {"content": json.dumps({"gives_answer": self.giveaway})}}
            return
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        for piece in (reply[: len(reply) // 2], reply[len(reply) // 2:]):
            yield {"message": {"role": "assistant", "content": piece}}
        yield {"done": True}


@pytest.fixture
def fake(session):
    f = FakeOllama()
    local_ai.set_client(f)
    yield f


def run(fake_client=None):
    return local_ai.run_next()


# ---- rules for sharing Ollama -----------------------------------------------------------

def test_status_picks_the_plain_vision_model(session, fake):
    st = local_ai.status(session)
    assert st.ready and st.model == "qwen3.5:9b"
    assert "qwen3-embedding:0.6b" not in st.vision_models


def test_ollama_down_is_reported(session):
    st = local_ai.status(session)  # conftest's client: Ollama off
    assert not st.running and not st.ready and "off in tests" in st.error


def test_blocker_rules():
    assert local_ai.blocker([], "qwen3.5:9b") is None
    assert local_ai.blocker(["qwen3.5:9b"], "qwen3.5:9b") is None  # same model: shared, fine
    assert local_ai.blocker(["qwen3-embedding:0.6b"], "qwen3.5:9b") is None  # tiny, fits beside
    assert local_ai.blocker(["other:27b"], "qwen3.5:9b") == "other:27b"


def test_waits_for_another_apps_model(session, fake):
    fake._loaded = ["other:27b"]
    fake.replies = ["Look at the + terminal."]
    job = local_ai.enqueue(session, "ask", problem_id=problem(session, PDF).id, input={"question": "hint?", "mode": "hint"})
    assert run() is False
    session.refresh(job)
    assert job.status == "waiting" and "other:27b" in job.wait_note
    assert "chat" not in fake.calls  # it never asked the model, so nothing was pushed out
    job.run_anyway = True
    session.commit()
    assert run() is True
    session.refresh(job)
    assert job.status == "done" and job.output == "Look at the + terminal."


def test_polite_mode_can_be_turned_off(session, fake):
    from app.backup import set_setting
    set_setting(session, "local_polite", "0")
    fake._loaded, fake.replies = ["other:27b"], ["ok"]
    job = local_ai.enqueue(session, "test", input={"question": "hi"})
    assert run() is True
    session.refresh(job)
    assert job.status == "done"


def test_only_reads_and_chats(session, fake):
    """Homebase never pulls, deletes, copies, creates or configures models."""
    fake.replies = ["hint", json.dumps({"parts": [], "verdict": "correct", "nudge": "Nice.", "confidence": "high"})]
    p = problem(session, PDF)
    local_ai.enqueue(session, "ask", problem_id=p.id, input={"question": "?", "mode": "hint"})
    local_ai.enqueue(session, "answer", problem_id=p.id, input={"answer": "5.2e-2 V"})
    assert run() and run()
    assert set(fake.calls) <= ALLOWED
    for payload in fake.chats:
        assert payload["model"] == "qwen3.5:9b"
        assert "num_ctx" in payload["options"] and payload["options"]["num_ctx"] <= 16384  # small context
        assert "keep_alive" in payload  # gives the GPU back soon


def test_ollama_error_marks_the_job(session, fake):
    fake.replies = [local_ai.OllamaError("model crashed")]
    job = local_ai.enqueue(session, "test", input={"question": "hi"})
    assert run()
    session.refresh(job)
    assert job.status == "error" and "model crashed" in job.error


# ---- Ask --------------------------------------------------------------------------------

def test_ask_via_the_page(client, session, fake):
    fake.replies = ["Which terminal is marked **+**?"]
    r = client.post(f"/problem/{PDF}/ask", data={"question": "Where do I start?", "mode": "hint"})
    job_id = r.json()["id"]
    assert r.json()["status"] == "queued" and r.json()["position"] == 1
    run()
    j = client.get(f"/local/jobs/{job_id}").json()
    assert j["status"] == "done" and "terminal" in j["text"]
    page = client.get(f"/problem/{PDF}").text
    assert "Where do I start?" in page and "<strong>+</strong>" in page  # history is kept and rendered
    system = fake.chats[0]["messages"][0]["content"]
    assert "Never state the final answer" in system
    assert fake.chats[0]["think"] is False
    client.post(f"/problem/{PDF}/ask/clear")
    assert "Where do I start?" not in client.get(f"/problem/{PDF}").text


def test_hints_never_leak_a_known_answer(session, fake):
    p = problem(session, GEN)
    value, _unit = local_ai.answer_values(p)[0]
    # first draft leaks, the redo leaks too -> held back; explain (after reveal) may say it
    fake.replies = [f"Easy: P = {value:.4g} W.", f"Fine, P = {value:.4g} W.", f"It comes out to {value:.4g} W."]
    hint = local_ai.enqueue(session, "ask", problem_id=p.id, input={"question": "answer?", "mode": "hint"})
    explain = local_ai.enqueue(session, "ask", problem_id=p.id, input={"question": "walk me through", "mode": "explain"})
    run(); run()
    session.refresh(hint); session.refresh(explain)
    assert hint.output == local_ai.HINT_WITHHELD
    assert f"{value:.4g}" in explain.output


def test_hint_that_gives_the_answer_is_redone(session, fake):
    """For book problems Homebase doesn't know the numbers, so the model checks its own hint."""
    p = problem(session, PDF)
    fake.giveaway = True
    fake.replies = ["It's 3 x 10^5 V.", "Still 3 x 10^5 V."]
    job = local_ai.enqueue(session, "ask", problem_id=p.id, input={"question": "just tell me", "mode": "hint"})
    run()
    session.refresh(job)
    assert job.output == local_ai.HINT_WITHHELD
    retry = fake.chats[2]["messages"]  # draft, check, redo, check
    assert "gave the answer away" in retry[-1]["content"]


def test_tip_that_quotes_the_key_is_flagged(session, fake):
    fake.replies = [json.dumps({"parts": [{"label": "(b)", "student": "0.3x10^6 V", "key": "3 × 10⁵ V", "match": "no"}],
                                "verdict": "partial", "nudge": "Convert it to $3 \\times 10^5$.", "confidence": "high"})]
    job = local_ai.enqueue(session, "answer", problem_id=problem(session, PDF).id, input={"answer": "0.3x10^6 V"})
    run()
    session.refresh(job)
    assert job.result["nudge_shows_key"] is True
    assert "\\(3 \\times 10^5\\)" in job.result["nudge"]  # $..$ turned into \( \) for KaTeX


def test_math_conversion():
    assert local_ai.tex("so $x^2$ and $$y$$") == "so \\(x^2\\) and $$y$$"
    assert local_ai.tex("costs $5") == "costs $5"


def test_leak_check():
    assert local_ai.leaks("so i = 2.40 mA", [2.4])
    assert local_ai.leaks("about -12.0 W", [12.0])
    assert local_ai.leaks("so P = 6", [(6.0, "W")]) and local_ai.leaks("P is 6 W", [(6.0, "W")])
    assert not local_ai.leaks("there are 6 resistors", [(6.0, "W")])
    assert not local_ai.leaks("use KVL around 2 loops", [2.0])  # small whole numbers are everywhere
    assert not local_ai.leaks("start with Ohm's law", [2.4])


def test_ask_rejects_bad_mode(client, fake):
    assert client.post(f"/problem/{PDF}/ask", data={"question": "x", "mode": "answer"}).status_code == 422


def test_ask_panel_says_when_ollama_is_off(client):
    page = client.get(f"/problem/{PDF}").text
    assert "The local AI is off" in page and "ask-panel" in page


# ---- Check my final answer ------------------------------------------------------------------

def test_typed_answer_check(client, session, fake):
    fake.replies = [json.dumps({"parts": [{"label": "52 mV", "student": "5.2e-2 V", "key": "5.2 × 10^-2 V", "match": "yes"}],
                                "verdict": "correct", "nudge": "All four match.", "confidence": "high"})]
    assert 'id="answer-check"' in client.get(f"/problem/{PDF}").text
    r = client.post(f"/problem/{PDF}/answer-check", data={"answer": "5.2e-2 V"})
    run()
    j = client.get(f"/local/jobs/{r.json()['id']}").json()
    assert j["status"] == "done" and j["result"]["verdict"] == "correct"
    assert j["result"]["parts"][0]["match"] == "yes"
    assert "typed final answer:\n5.2e-2 V" in fake.chats[0]["messages"][1]["content"]
    assert fake.chats[0]["format"]["required"] == ["parts", "verdict", "nudge", "confidence"]


def test_answer_check_needs_an_answer_and_a_key(client, session, fake):
    assert client.post(f"/problem/{PDF}/answer-check", data={"answer": "  "}).status_code == 422


# ---- submissions --------------------------------------------------------------------------

def test_snap_my_work_goes_to_the_local_check(client, session, fake):
    page = client.get(f"/problem/{PDF}").text
    assert 'capture="environment"' in page and "Snap my work" in page
    r = client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")}, follow_redirects=True)
    assert "Quick check" in r.text and "local-progress" in r.text
    sub = session.exec(select(Submission)).one()
    assert sub.status == "local" and sub.local_status == "queued"
    assert services.pending_count(session) == 0  # not in Claude's queue

    fake.replies = [json.dumps(GOOD_REVIEW)]
    assert run()
    session.refresh(sub)
    assert sub.local_status == "done" and sub.local_review["verdict"] == "incorrect"
    assert sub.local_model == "qwen3.5:9b" and sub.verdict == ""  # Claude's fields untouched
    images = fake.chats[0]["messages"][1]["images"]
    assert len(images) >= 1 and fake.chats[0]["think"] is True
    r = client.get(f"/submission/{sub.id}")
    assert "Qwen · local" in r.text and "First error:" in r.text and "Ask Claude to review too" in r.text

    client.post(f"/submission/{sub.id}/to-claude")
    session.refresh(sub)
    assert sub.status == "pending" and services.pending_count(session) == 1
    feedback.apply_review(session, sub, {**GOOD_REVIEW, "verdict": "partial"}, reviewer="claude_session")
    r = client.get(f"/submission/{sub.id}")
    assert "What the quick local check said" in r.text  # the local review is kept


def test_confirming_a_local_review_logs_the_mistake(client, session, fake):
    fake.replies = [json.dumps(GOOD_REVIEW)]
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    run()
    sub = session.exec(select(Submission)).one()
    client.post(f"/submission/{sub.id}/confirm", data={"verdict": "incorrect"})
    m = session.exec(select(Mistake)).one()
    assert m.cause == "setup" and "terminal" in m.note


def test_failed_local_check_sends_it_to_claude(client, session, fake):
    fake.replies = [local_ai.OllamaError("out of memory")]
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    run()
    sub = session.exec(select(Submission)).one()
    assert sub.status == "pending" and sub.local_status == "error" and "out of memory" in sub.local_error


def test_without_ollama_submissions_go_to_claude(client, session):
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    sub = session.exec(select(Submission)).one()
    assert sub.status == "pending" and sub.local_status == ""


def test_local_check_can_be_turned_off(client, session, fake):
    from app.backup import set_setting
    set_setting(session, "local_check_submissions", "0")
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    sub = session.exec(select(Submission)).one()
    assert sub.status == "pending" and not session.exec(select(LocalJob)).all()


def test_cancel_while_waiting(client, session, fake):
    fake._loaded = ["other:27b"]
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    run()
    sub = session.exec(select(Submission)).one()
    job = session.exec(select(LocalJob)).one()
    assert job.status == "waiting" and client.get(f"/submission/{sub.id}/local.json").json()["local_status"] == "waiting"
    client.post(f"/local/jobs/{job.id}/cancel")
    session.refresh(sub)
    assert sub.status == "pending" and sub.local_status == ""


def test_deleting_a_submission_removes_its_jobs(client, session, fake):
    client.post(f"/problem/{PDF}/submit", files={"files": ("w.jpg", jpeg(), "image/jpeg")})
    sub = session.exec(select(Submission)).one()
    client.post(f"/submission/{sub.id}/delete")
    assert not session.exec(select(LocalJob)).all()


# ---- settings -------------------------------------------------------------------------------

def test_settings_card(client, session, fake):
    fake._loaded = ["other:27b"]
    page = client.get("/settings").text
    assert "Ollama 0.40.6 is running" in page and "other:27b loaded right now" in page
    assert client.post("/settings/local", data={"model": "not-a-model"}).status_code == 422
    client.post("/settings/local", data={"model": "other:27b", "polite": "on"})
    assert local_ai.status(session).model == "other:27b"
    assert local_ai.setting(session, "local_check_submissions") == "0"
