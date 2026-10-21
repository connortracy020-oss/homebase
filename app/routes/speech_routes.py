"""Read aloud: page images and sentences from a reading's PDF, Chatterbox speech, your place."""
import json
import re

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


@router.post("/speech/say")
def say(body: SayIn):
    """Speak one sentence (cached by its text). The first one starts the voice, which takes a while."""
    text = body.text.strip()
    if not text or len(text) > 1800:
        raise HTTPException(422, "Send one sentence of up to 1,800 characters.")
    try:
        path = speech.ENGINE.speak(text, force=body.force)
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
