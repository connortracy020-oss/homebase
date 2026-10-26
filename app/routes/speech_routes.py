"""Read aloud: page images and sentences from a reading's PDF, Chatterbox speech, your place."""
import json
import re
import threading

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import backup, config, readaloud, speech
from ..db import get_session
from ..models import Reading, Resource

router = APIRouter()


def _pdf(session: Session, res_id: int):
    res = session.get(Resource, res_id)
    if res is None or not res.local_path or not res.local_path.lower().endswith(".pdf"):
        raise HTTPException(404, "No PDF for that reading")
    path = config.ROOT / res.local_path
    if not path.is_file():
        raise HTTPException(404, "That PDF isn't in your library")
    return path


@router.get("/speech/status")
def speech_status():
    return speech.status()


@router.get("/speech/doc/{res_id}/page/{page}.json")
def page_text(res_id: int, page: int, headers: int = 1, footnotes: int = 1, captions: int = 1, refs: int = 1,
              math: int = 1, session: Session = Depends(get_session)):
    try:
        return readaloud.page_sentences(_pdf(session, res_id), page, {
            "skip_headers": bool(headers), "skip_footnotes": bool(footnotes), "skip_captions": bool(captions),
            "skip_refs": bool(refs), "skip_math": bool(math)})
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/speech/doc/{res_id}/page/{page}.png")
def page_image(res_id: int, page: int, session: Session = Depends(get_session)):
    pdf = _pdf(session, res_id)
    if not 1 <= page <= readaloud.page_count(pdf):
        raise HTTPException(404, "No such page")
    return FileResponse(readaloud.render_page(pdf, page), media_type="image/png",
                        headers={"Cache-Control": "max-age=86400"})


class SayIn(BaseModel):
    text: str
    force: bool = False
    priority: int = speech.NOW      # 0 = needed now, 1 = look-ahead (see app/speech.py)
    epoch: int | None = None        # which place in the reading this belongs to


@router.post("/speech/say")
def say(body: SayIn):
    """Speak one sentence (cached by its text). The first one starts the voice, which takes a while."""
    text = body.text.strip()
    if not text or len(text) > 1800:
        raise HTTPException(422, "Send one sentence of up to 1,800 characters.")
    try:
        path = speech.ENGINE.speak(text, force=body.force, priority=min(max(body.priority, 0), speech.AHEAD),
                                   epoch=body.epoch)
    except speech.SpeechStale as e:
        return JSONResponse({"detail": str(e), "stale": True}, status_code=409)
    except speech.SpeechBusy as e:
        return JSONResponse({"detail": str(e), "busy": True}, status_code=409)
    except speech.SpeechError as e:
        raise HTTPException(503, str(e))
    return {"url": f"/speech/audio/{path.stem}.wav"}


@router.get("/speech/audio/{key}.wav")
def audio(key: str):
    if not re.fullmatch(r"[0-9a-f]{32}", key):
        raise HTTPException(404)
    path = speech.speech_root() / "reader-cache" / f"{key}.wav"
    if not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "max-age=604800"})


@router.post("/speech/stop")
def stop_voice():
    """Stop the voice now (frees the GPU). It also stops on its own after a few idle minutes."""
    PREPARE["stop"] = True  # a background preparation would only start the voice again
    speech.ENGINE.stop()
    return {"stopped": True}


class PositionIn(BaseModel):
    page: int
    i: int = 0


@router.post("/reading/{slug}/position")
def save_position(slug: str, body: PositionIn, session: Session = Depends(get_session)):
    if session.exec(select(Reading).where(Reading.slug == slug)).first() is None:
        raise HTTPException(404, f"No reading {slug}")
    backup.set_setting(session, f"readpos:{slug}", json.dumps({"page": body.page, "i": body.i}))
    return {"ok": True}


def saved_position(session: Session, slug: str) -> dict | None:
    raw = backup.get_setting(session, f"readpos:{slug}", "")
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


# ---- prepare the next pages in the background -----------------------------------------------
# Speech is made a little slower than it plays, so listening without gaps needs it made ahead of
# time. This walks through pages and has every sentence spoken (lowest priority, so it never holds
# up what you're listening to). Replaying later is instant because audio is cached by its text.

PREPARE = {"running": False, "res_id": 0, "first": 0, "last": 0, "page": 0, "total": 0, "done": 0,
           "message": "", "stop": False}


class PrepareIn(BaseModel):
    first_page: int
    pages: int = 10
    opts: dict[str, int] = {}


def _prepare_job(pdf, first: int, last: int, opts: dict, force: bool):
    try:
        for page in range(first, last + 1):
            PREPARE["page"] = page
            sentences = readaloud.page_sentences(pdf, page, opts)["sentences"]
            PREPARE["total"] += len(sentences)
            for s in sentences:
                if PREPARE["stop"]:
                    return
                speech.ENGINE.speak(s["spoken"], force=force, priority=speech.BACKGROUND)
                PREPARE["done"] += 1
    except speech.SpeechError as e:
        PREPARE["message"] = str(e)
    except Exception as e:  # noqa: BLE001 - tell the page instead of dying silently
        PREPARE["message"] = f"Stopped: {e}"
    finally:
        PREPARE["running"] = False


@router.post("/speech/prepare/{res_id}")
def prepare(res_id: int, body: PrepareIn, session: Session = Depends(get_session)):
    pdf = _pdf(session, res_id)
    if PREPARE["running"]:
        raise HTTPException(409, "Already preparing a reading. Stop that first.")
    total_pages = readaloud.page_count(pdf)
    first = max(1, min(body.first_page, total_pages))
    last = min(total_pages, first + max(1, min(body.pages, 40)) - 1)
    keys = {"headers": "skip_headers", "footnotes": "skip_footnotes", "captions": "skip_captions",
            "refs": "skip_refs", "math": "skip_math"}
    opts = {keys[k]: bool(v) for k, v in body.opts.items() if k in keys}
    PREPARE.update(running=True, res_id=res_id, first=first, last=last, page=first, total=0, done=0,
                   message="", stop=False)
    threading.Thread(target=_prepare_job, args=(pdf, first, last, opts, False), daemon=True).start()
    return PREPARE


@router.get("/speech/prepare")
def prepare_status():
    return PREPARE


@router.post("/speech/prepare-stop")
def prepare_stop():
    PREPARE["stop"] = True
    return PREPARE
