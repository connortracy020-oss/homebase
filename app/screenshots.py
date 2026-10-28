"""Finding the screenshot Connor means, for Claude's notes tools (app/mcp_server.py).

An image pasted into a chat with Claude lives in Claude's own sandbox (/mnt/user-data/...),
which Homebase can't reach. The same picture is usually still on this laptop, though:
Win+Shift+S puts it on the clipboard, and Snipping Tool saves a copy in the Screenshots folder.
Claude looks at those (screenshots_recent) and picks the one that matches what he shared.
"""
import ctypes
import hashlib
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageGrab
from pillow_heif import register_heif_opener

register_heif_opener()  # iPhone HEIC photos

IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".heic", ".heif"}
SCREENSHOTS_ID = "b7bede81-df94-4682-a7d8-57a52620b86f"  # Windows' known folder for screenshots


class ScreenshotError(ValueError):
    pass


@dataclass
class Shot:
    name: str  # "clipboard:<8 hex>" or the file's name
    image: Image.Image
    taken: datetime | None  # the file's time; None for the clipboard
    path: Path | None


def _known_folder(guid: str) -> Path | None:
    """Where Windows keeps a known folder (Screenshots follows OneDrive when it backs up Pictures)."""
    try:
        class GUID(ctypes.Structure):
            _fields_ = [("a", ctypes.c_uint32), ("b", ctypes.c_uint16), ("c", ctypes.c_uint16), ("d", ctypes.c_ubyte * 8)]
        g, out = GUID(), ctypes.c_wchar_p()
        ctypes.memmove(ctypes.byref(g), uuid.UUID(guid).bytes_le, 16)
        if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(out)) != 0:
            return None
        path = Path(out.value)
        ctypes.windll.ole32.CoTaskMemFree(out)
        return path
    except (AttributeError, OSError):  # not Windows
        return None


def folders() -> list[Path]:
    """The folders screenshots are saved in. HOMEBASE_SCREENSHOTS (paths separated by ;) overrides."""
    override = os.environ.get("HOMEBASE_SCREENSHOTS")
    if override:
        candidates = [Path(p) for p in override.split(os.pathsep) if p]
    else:
        home = Path.home()
        candidates = [_known_folder(SCREENSHOTS_ID), home / "Pictures" / "Screenshots", home / "OneDrive" / "Pictures" / "Screenshots"]
    out: list[Path] = []
    for p in candidates:
        if p and p.is_dir() and all(p.resolve() != o.resolve() for o in out):
            out.append(p)
    return out


def open_image(path: Path) -> Image.Image:
    img = Image.open(path)
    img.load()
    return img


def digest(img: Image.Image) -> str:
    return hashlib.sha1(img.convert("RGB").tobytes()).hexdigest()[:8]


def clipboard() -> Shot | None:
    """The image on the clipboard, if there is one (HOMEBASE_NO_CLIPBOARD=1 skips it, for tests)."""
    if os.environ.get("HOMEBASE_NO_CLIPBOARD"):
        return None
    try:
        got = ImageGrab.grabclipboard()
    except Exception:  # noqa: BLE001  (no clipboard, or another app holds it)
        return None
    if isinstance(got, list):  # files copied in File Explorer
        path = next((Path(p) for p in got if Path(p).suffix.lower() in IMAGE_TYPES), None)
        if path is None:
            return None
        try:
            got = open_image(path)
        except OSError:
            return None
    if not isinstance(got, Image.Image):
        return None
    got.load()
    return Shot(f"clipboard:{digest(got)}", got, None, None)


def recent(limit: int = 3, hours: float = 6) -> list[Shot]:
    """The clipboard's image and the newest screenshots from the last few hours, newest first.
    A screenshot that's also on the clipboard is listed once, by its file name."""
    clip = clipboard()
    cutoff = datetime.now() - timedelta(hours=hours)
    files = sorted((p for f in folders() for p in f.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_TYPES),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    shots: list[Shot] = []
    for p in files:
        taken = datetime.fromtimestamp(p.stat().st_mtime)
        if taken < cutoff or len(shots) >= limit:
            break
        try:
            img = open_image(p)
        except OSError:
            continue
        shots.append(Shot(p.name, img, taken, p))
        if clip and digest(img) == clip.name.partition(":")[2]:
            clip = None
    return ([clip] if clip else []) + shots


def find(name: str) -> Shot:
    """A screenshot by the name screenshots_recent gave it."""
    name = (name or "").strip()
    if name.startswith("clipboard"):
        clip = clipboard()
        if clip is None:
            raise ScreenshotError("There's no image on the clipboard now. Call screenshots_recent again.")
        want = name.partition(":")[2]
        if want and clip.name != f"clipboard:{want}":
            raise ScreenshotError("The clipboard holds a different image now. Call screenshots_recent again and pick from what it shows.")
        return clip
    base = Path(name).name
    for f in folders():
        p = f / base
        if p.is_file() and p.suffix.lower() in IMAGE_TYPES:
            return Shot(base, open_image(p), datetime.fromtimestamp(p.stat().st_mtime), p)
    where = ", ".join(str(f) for f in folders()) or "his Screenshots folder"
    raise ScreenshotError(f"No screenshot called {base!r} in {where}. Call screenshots_recent to see what's there.")


def crop(img: Image.Image, box) -> Image.Image:
    """Keep part of an image: box = [left, top, right, bottom], each a fraction from 0 to 1."""
    if not box:
        return img
    try:
        left, top, right, bottom = (float(v) for v in box)
    except (TypeError, ValueError):
        raise ScreenshotError("crop is [left, top, right, bottom], each a fraction of the image from 0 to 1.") from None
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        raise ScreenshotError("crop is [left, top, right, bottom], each a fraction of the image from 0 to 1, with left < right and top < bottom.")
    w, h = img.size
    px = (round(left * w), round(top * h), round(right * w), round(bottom * h))
    if px[2] - px[0] < 16 or px[3] - px[1] < 16:
        raise ScreenshotError("That crop is too small to keep.")
    return img.crop(px)


def to_bytes(img: Image.Image) -> bytes:
    out = BytesIO()
    img.convert("RGB").save(out, "PNG")
    return out.getvalue()


def preview(img: Image.Image, longest: int = 1000) -> bytes:
    """A JPEG small enough to show Claude."""
    small = img.convert("RGB")
    small.thumbnail((longest, longest))
    out = BytesIO()
    small.save(out, "JPEG", quality=82)
    return out.getvalue()
