"""Turn uploaded photos and PDFs into upright, right-sized page images.

Phone photos are rotated upright (using the camera's EXIF tag) and scaled so
the long edge is at most 2000 px, which is what Claude reads best. PDFs are
rendered page by page the same way. Originals are kept next to the pages.
"""
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from . import config

register_heif_opener()  # iPhone HEIC photos

MAX_FILE_MB = 25
MAX_PAGES = 12  # per submission
LONG_EDGE = 2000
SUFFIX = {"jpeg": ".jpg", "png": ".png", "webp": ".webp", "heic": ".heic", "pdf": ".pdf"}


class UploadError(ValueError):
    pass


def sniff(data: bytes) -> str | None:
    """What kind of file is this, judged by its first bytes (not its name)?"""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"):
        return "heic"
    if data[:5] == b"%PDF-":
        return "pdf"
    return None


@dataclass
class Saved:
    name: str
    original: str  # path relative to DATA_DIR
    pages: list[str]


def _rel(path: Path) -> str:
    return path.relative_to(config.DATA_DIR).as_posix()


def _save_page(img: Image.Image, path: Path) -> None:
    img = img.convert("RGB")
    img.thumbnail((LONG_EDGE, LONG_EDGE))
    img.save(path, "JPEG", quality=88, optimize=True)


def save_files(submission_id: int, files: list[tuple[str, bytes]]) -> list[Saved]:
    """Store files for one submission. Raises UploadError for anything unusable."""
    if not files:
        raise UploadError("Choose at least one photo or PDF.")
    folder = config.UPLOAD_DIR / f"{submission_id:05d}"
    folder.mkdir(parents=True, exist_ok=True)
    saved, page_no = [], 0
    for index, (name, data) in enumerate(files, start=1):
        if len(data) > MAX_FILE_MB * 1024 * 1024:
            raise UploadError(f"{name} is over {MAX_FILE_MB} MB.")
        kind = sniff(data)
        if kind is None:
            raise UploadError(f"{name} isn't a photo (JPEG, PNG, WebP, HEIC) or a PDF.")
        original = folder / f"original-{index:02d}{SUFFIX[kind]}"
        original.write_bytes(data)
        pages = []
        if kind == "pdf":
            try:
                pdf = pdfium.PdfDocument(original)
            except Exception as e:  # damaged or password-protected
                raise UploadError(f"Couldn't open {name}: {e}")
            if page_no + len(pdf) > MAX_PAGES:
                raise UploadError(f"That's more than {MAX_PAGES} pages in one submission.")
            for i in range(len(pdf)):
                page = pdf[i]
                w, h = page.get_size()
                scale = LONG_EDGE / max(w, h)
                page_no += 1
                out = folder / f"page-{page_no:02d}.jpg"
                _save_page(page.render(scale=scale).to_pil(), out)
                pages.append(_rel(out))
        else:
            page_no += 1
            if page_no > MAX_PAGES:
                raise UploadError(f"That's more than {MAX_PAGES} pages in one submission.")
            try:
                img = ImageOps.exif_transpose(Image.open(original))
            except Exception as e:
                raise UploadError(f"Couldn't read {name}: {e}")
            out = folder / f"page-{page_no:02d}.jpg"
            _save_page(img, out)
            pages.append(_rel(out))
        saved.append(Saved(name=name, original=_rel(original), pages=pages))
    return saved
