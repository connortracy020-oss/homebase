"""Read aloud: sentences and boxes from PDFs, the speech routes (with a fake engine), model links."""
import json
import os
from pathlib import Path

import pytest
from sqlmodel import select

from app import config, readaloud, speech
from app.models import Reading, Resource

ULABY = config.ROOT / "library/ece201/ulaby/ulaby_cad3e.pdf"
HAVE_ULABY = ULABY.exists()


@pytest.mark.skipif(not HAVE_ULABY, reason="Ulaby PDF not in library/")
def test_page_sentences_skip_headers_and_have_boxes(data_dir):
    r = readaloud.page_sentences(ULABY, 19)
    texts = [s["text"] for s in r["sentences"]]
    assert r["pages"] > 700 and len(texts) > 15
    assert not any("CHAPTER 1 CIRCUIT TERMINOLOGY" in t for t in texts)   # running header skipped
    assert any(t.startswith("A dc circuit is one in which") for t in texts)
    for s in r["sentences"]:
        assert s["boxes"] and all(0 <= v <= 1 for b in s["boxes"] for v in b)
    keep = readaloud.page_sentences(ULABY, 19, {"skip_headers": False})
    assert any("CHAPTER 1" in s["text"] for s in keep["sentences"])
    assert readaloud.render_page(ULABY, 19).stat().st_size > 10_000


def test_spoken_text():
    assert readaloud.spoken("R = 3 Ω at 25°") == "R = 3 ohms at 25 degrees"


def test_say_route_with_a_fake_engine(client, data_dir, monkeypatch):
    calls = []

    def fake_speak(text, force=False):
        calls.append((text, force))
        out = speech.speech_root() / "reader-cache" / f"{speech.cache_key(text)}.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"RIFF" + b"\0" * 2000)
        return out

    monkeypatch.setattr(speech.ENGINE, "speak", fake_speak)
    r = client.post("/speech/say", json={"text": "Hello there."}).json()
    assert r["url"].startswith("/speech/audio/") and calls == [("Hello there.", False)]
    assert client.get(r["url"]).status_code == 200
    assert client.get("/speech/audio/../../homebase.db").status_code == 404
    assert client.post("/speech/say", json={"text": " "}).status_code == 422

    def busy(text, force=False):
        raise speech.SpeechBusy("Lecture Desk is using its Chatterbox voice right now.")
    monkeypatch.setattr(speech.ENGINE, "speak", busy)
    r = client.post("/speech/say", json={"text": "Hi."})
    assert r.status_code == 409 and r.json()["busy"] is True and "Lecture Desk" in r.json()["detail"]
    assert client.get("/speech/status").json()["available"] is False  # tests can't see the real voice


def test_reader_page_and_position(client, session):
    r = session.exec(select(Reading).join(Resource, Reading.resource_id == Resource.id)
                     .where(Resource.slug == "ulaby-cad3e")).first()
    page = client.get(f"/reading/{r.slug}").text
    if HAVE_ULABY:
        assert 'data-mode="listen"' in page and "readaloud.js" in page
        assert client.get(f"/speech/doc/{r.resource_id}/page/19.json").json()["page"] == 19
        assert client.get(f"/speech/doc/{r.resource_id}/page/9999.json").status_code == 404
    assert client.post(f"/reading/{r.slug}/position", json={"page": 21, "i": 3}).json()["ok"]
    from app.routes.speech_routes import saved_position
    assert saved_position(session, r.slug) == {"page": 21, "i": 3}
    assert client.post("/reading/nope/position", json={"page": 1}).status_code == 404


def test_model_files_are_hard_links_not_copies(data_dir, monkeypatch, tmp_path):
    src = tmp_path / "LD" / "models"
    (src / "chatterbox-runtime").mkdir(parents=True)
    (src / "chatterbox-runtime" / "ChatterboxReader.exe").write_bytes(b"MZ")
    md = src / speech.MODEL_FOLDER
    md.mkdir()
    for name in speech.MODEL_FILES:
        (md / name).write_bytes(name.encode() * 10)
    (md / speech.MARKER).write_text(json.dumps({"model": "x"}))
    target = speech.link_models(src)
    for name in speech.MODEL_FILES:
        assert os.path.samefile(md / name, target / name)
    assert (target / speech.MARKER).read_text() == json.dumps({"model": "x"})
    before = {n: (md / n).stat().st_mtime_ns for n in speech.MODEL_FILES}
    speech.link_models(src)  # again: nothing changes in the source
    assert before == {n: (md / n).stat().st_mtime_ns for n in speech.MODEL_FILES}


def test_waits_when_lecture_desk_is_reading(monkeypatch, tmp_path):
    eng = speech.Engine()
    monkeypatch.setattr(speech, "lecture_desk_models", lambda: tmp_path)
    monkeypatch.setattr(speech, "other_chatterbox_running", lambda own: True)
    with pytest.raises(speech.SpeechBusy):
        eng.start()
    monkeypatch.setattr(speech, "other_chatterbox_running", lambda own: False)
    monkeypatch.setattr(speech, "free_vram_mb", lambda: 1200)
    with pytest.raises(speech.SpeechBusy, match="GPU is busy"):
        eng.start()


@pytest.mark.skipif(not HAVE_ULABY, reason="Ulaby PDF not in library/")
def test_highlight_boxes_never_overlap_and_hyphens_survive(data_dir):
    for page in (19, 22, 30):
        r = readaloud.page_sentences(ULABY, page)
        for s in r["sentences"]:
            bs = s["boxes"]
            for i, a in enumerate(bs):
                for b in bs[i + 1:]:
                    assert not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]), (page, s["text"])
    texts = " ".join(s["text"] for s in readaloud.page_sentences(ULABY, 19)["sentences"])
    assert "1-1 Historical Timeline" in texts and "all-electronic" in texts  # hyphens aren't "reference markers"


def test_no_overlap_trims_boxes():
    out = readaloud._no_overlap([[0.1, 0.10, 0.9, 0.13], [0.1, 0.12, 0.9, 0.15]])
    assert out[0][3] <= out[1][1]
