"""Show one problem (or one solution) cut out of a PDF page.

A region is described by where it starts and ends, using text on the page:
    {"pdf": "library/...pdf", "page": 16, "start": "Exercise 1-1", "end": "Solution:"}

  start       crop from the top of this text (default: top of the page)
  end         crop to just above this text; "A|B" means whichever comes first;
              "paragraph" means the end of the first paragraph after start
  end_after   crop to just below the line containing this text
  page        1-based page; None means "the first page where start appears"

Rendered images are cached in data/cache/pdf/. Nothing is copied into git.
"""
import hashlib
import io
import json
import re
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageOps

from . import config

SCALE = 3  # render resolution (216 dpi): sharp on a phone, and small figures survive zooming
PAD = 14


class RegionError(Exception):
    pass


def _pattern(marker: str) -> re.Pattern:
    # "Question 1" must not match "Question 12"
    tail = r"(?!\d)" if marker[-1:].isdigit() else ""
    return re.compile(re.escape(marker).replace(r"\ ", r"\s*") + tail)


def _page_text(page) -> tuple[object, str]:
    tp = page.get_textpage()
    return tp, tp.get_text_range(0, tp.count_chars())


def find_page(pdf, marker: str) -> int | None:
    pat = _pattern(marker)
    for i in range(len(pdf)):
        _, text = _page_text(pdf[i])
        if pat.search(text):
            return i + 1
    return None


def _char_top(tp, index: int) -> float:
    return tp.get_charbox(index)[3]


def _char_bottom(tp, index: int) -> float:
    return tp.get_charbox(index)[1]


def _paragraph_end(tp, text: str, start_index: int) -> float | None:
    """Bottom y of the first paragraph that begins at start_index."""
    last_bottom, line_h = None, None
    for i in range(start_index, len(text)):
        if text[i].isspace():
            continue
        left, bottom, right, top = tp.get_charbox(i)
        if last_bottom is None:
            last_bottom, line_h = bottom, max(top - bottom, 6)
            continue
        if bottom < last_bottom - 0.5 * line_h:  # moved to a new line
            # Ordinary line spacing leaves a gap of about one letter height;
            # a blank line between paragraphs leaves well over 1.6x that.
            if last_bottom - top > 1.6 * line_h:
                return last_bottom - 2
            last_bottom = bottom
            line_h = max(line_h, top - bottom)
    return last_bottom


def locate(region: dict) -> tuple[Path, int, float | None, float | None]:
    """Return (pdf path, page, top_y, bottom_y) in PDF points (None = page edge)."""
    path = config.ROOT / region["pdf"]
    if not path.exists():
        raise RegionError(f"{region['pdf']} is not in the library yet")
    pdf = pdfium.PdfDocument(path)
    page_no = region.get("page") or (find_page(pdf, region["start"]) if region.get("start") else 1)
    if not page_no or page_no > len(pdf):
        raise RegionError(f"couldn't find {region.get('start')!r} in {region['pdf']}")
    tp, text = _page_text(pdf[page_no - 1])

    top_y, bottom_y, after = None, None, 0
    if region.get("start"):
        m = _pattern(region["start"]).search(text)
        if not m:
            raise RegionError(f"{region['start']!r} not found on page {page_no}")
        top_y, after = _char_top(tp, m.start()), m.end()
    end = region.get("end")
    if end == "paragraph":
        bottom_y = _paragraph_end(tp, text, m.start() if region.get("start") else 0)
    elif end:
        hits = [h for h in (_pattern(e).search(text, after) for e in end.split("|")) if h]
        if hits:
            first = min(hits, key=lambda h: h.start())
            bottom_y = _char_top(tp, first.start()) + 2
    elif region.get("end_after"):
        h = _pattern(region["end_after"]).search(text, after)
        if h:
            bottom_y = _char_bottom(tp, h.end() - 1) - 4
    return path, page_no, top_y, bottom_y


def _trim(img: Image.Image) -> Image.Image:
    box = ImageOps.invert(img.convert("L")).point(lambda p: 255 if p > 24 else 0).getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - PAD), max(0, t - PAD), min(img.width, r + PAD), min(img.height, b + PAD)))


def _render_pages(region: dict) -> Image.Image:
    """Whole pages, trimmed and stacked top to bottom (for exam problems)."""
    path = config.ROOT / region["pdf"]
    if not path.exists():
        raise RegionError(f"{region['pdf']} is not in the library yet")
    pdf = pdfium.PdfDocument(path)
    imgs = []
    for n in region["pages"]:
        if not 1 <= n <= len(pdf):
            raise RegionError(f"{region['pdf']} has no page {n}")
        imgs.append(_trim(pdf[n - 1].render(scale=SCALE).to_pil().convert("RGB")))
    width = max(i.width for i in imgs)
    out = Image.new("RGB", (width, sum(i.height for i in imgs) + 24 * (len(imgs) - 1)), "white")
    y = 0
    for i in imgs:
        out.paste(i, (0, y))
        y += i.height + 24
    return out


def _render_images(region: dict) -> Image.Image:
    """Image files (e.g. scanned solution PNGs), trimmed and stacked."""
    imgs = []
    for rel in region["images"]:
        path = config.ROOT / rel
        if not path.exists():
            raise RegionError(f"{rel} is not in the library yet")
        imgs.append(_trim(Image.open(path).convert("RGB")))
    width = max(i.width for i in imgs)
    out = Image.new("RGB", (width, sum(i.height for i in imgs) + 24 * (len(imgs) - 1)), "white")
    y = 0
    for i in imgs:
        out.paste(i, (0, y))
        y += i.height + 24
    return out


def render(region: dict) -> bytes:
    """A region may be {"pdf", "page", "start"/"end"...}, {"pdf", "pages": [...]},
    or {"images": ["library/...png", ...]}."""
    key = hashlib.sha1(json.dumps({**region, "_scale": SCALE}, sort_keys=True).encode()).hexdigest()[:16]
    cache = config.DATA_DIR / "cache" / "pdf" / f"{key}.png"
    if cache.exists():
        return cache.read_bytes()
    if region.get("pages") or region.get("images"):
        buf = io.BytesIO()
        (_render_images(region) if region.get("images") else _render_pages(region)).save(buf, "PNG", optimize=True)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(buf.getvalue())
        return buf.getvalue()

    path, page_no, top_y, bottom_y = locate(region)
    page = pdfium.PdfDocument(path)[page_no - 1]
    _, height = page.get_size()
    img = page.render(scale=SCALE).to_pil().convert("RGB")
    top_px = 0 if top_y is None else max(0, int((height - top_y) * SCALE) - PAD)
    bot_px = img.height if bottom_y is None else min(img.height, int((height - bottom_y) * SCALE) + 2)
    if bot_px - top_px < 10:
        raise RegionError("the region came out empty")
    img = _trim(img.crop((0, top_px, img.width, bot_px)))  # and trim the white margins
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(buf.getvalue())
    return buf.getvalue()


def page_of(region: dict) -> int | None:
    """The page number a region is on (for 'open the whole page' links)."""
    if region.get("pages"):
        return region["pages"][0]
    if region.get("images"):
        return None
    try:
        return locate(region)[1]
    except RegionError:
        return None
