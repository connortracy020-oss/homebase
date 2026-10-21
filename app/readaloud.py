"""Turn a PDF page into sentences to read aloud, each with its boxes on the page.

Uses the PDF's own text layer (pypdfium2): every character has a box, so the
reader can highlight exactly the sentence being spoken. Like Lecture Desk, it
can skip page headers and numbers, figure and table captions, and lines that
are mostly math symbols (which a voice can't read sensibly).
"""
import hashlib
import json
import re
from pathlib import Path

import pypdfium2 as pdfium

from . import config

OPTIONS = {"skip_headers": True, "skip_footnotes": True, "skip_captions": True, "skip_refs": True, "skip_math": True}
ABBREVIATIONS = {"e.g", "i.e", "fig", "figs", "eq", "eqs", "etc", "vs", "dr", "mr", "ms", "prof", "no", "sec",
                 "ch", "approx", "ref", "refs", "al", "cf", "st"}
SPOKEN = [("Ω", " ohms"), ("μ", "micro"), ("µ", "micro"), ("°", " degrees"), ("≈", " approximately "),
          ("×", " times "), ("−", "-"), ("–", "-"), ("—", ", "), ("’", "'"), ("“", '"'), ("”", '"'),
          ("≤", " less than or equal to "), ("≥", " greater than or equal to "), ("∞", " infinity"),
          ("π", " pi "), ("Δ", " delta "), ("θ", " theta "), ("ω", " omega "), ("α", " alpha "), ("β", " beta ")]


def _cache_path(pdf: Path, page: int, opts: dict) -> Path:
    st = pdf.stat()
    key = hashlib.sha1(f"{pdf.resolve()}|{st.st_size}|{st.st_mtime_ns}|{page}|{sorted(opts.items())}|v4".encode()).hexdigest()[:20]
    return config.DATA_DIR / "speech" / "text" / f"{key}.json"


def page_count(pdf: Path) -> int:
    return len(pdfium.PdfDocument(str(pdf)))


def spoken(text: str) -> str:
    s = text
    for a, b in SPOKEN:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def _letter_ratio(s: str) -> float:
    core = re.sub(r"\s", "", s)
    return sum(c.isalpha() for c in core) / len(core) if core else 0


def _no_overlap(boxes: list[list[float]]) -> list[list[float]]:
    """Trim line boxes so none overlap (overlaps would draw a darker double highlight)."""
    out = []
    for b in sorted(boxes, key=lambda b: (b[1], b[0])):
        b = list(b)
        for o in out:
            if b[0] < o[2] and o[0] < b[2] and b[1] < o[3] and o[1] < b[3]:  # they intersect
                if b[1] >= o[1]:
                    b[1] = o[3]          # start this line where the one above ends
                else:
                    o[3] = b[1]
        if b[3] - b[1] > 0.002:
            out.append(b)
    return [[round(v, 4) for v in b] for b in out]


def page_sentences(pdf: Path, page: int, opts: dict | None = None) -> dict:
    """{"page", "pages", "sentences": [{"i", "text", "spoken", "boxes": [[x0, y0, x1, y1], ...]}], "skipped"}.
    Boxes are fractions of the page width and height, measured from the top left."""
    opts = {**OPTIONS, **(opts or {})}
    cache = _cache_path(pdf, page, opts)
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    doc = pdfium.PdfDocument(str(pdf))
    if not 1 <= page <= len(doc):
        raise ValueError(f"Page {page} is outside this PDF (1-{len(doc)}).")
    pg = doc[page - 1]
    w, h = pg.get_size()
    tp = pg.get_textpage()
    n = tp.count_chars()
    text = tp.get_text_range(0, n) if n else ""
    boxes = [tp.get_charbox(i) for i in range(n)] if len(text) == n else []

    # 1. lines, as runs of character indices
    lines, cur = [], []
    for i, ch in enumerate(text):
        if ch in "\r\n":
            if cur:
                lines.append(cur)
                cur = []
            continue
        cur.append(i)
    if cur:
        lines.append(cur)

    heights = sorted(boxes[i][3] - boxes[i][1] for ln in lines for i in ln if boxes and text[i].isalpha())
    body_h = heights[len(heights) // 2] if heights else 0
    skipped = 0
    kept = []
    for ln in lines:
        s = "".join(text[i] for i in ln).strip()
        if not s:
            continue
        if boxes and opts["skip_headers"]:
            top = max(boxes[i][3] for i in ln)
            bottom = min(boxes[i][1] for i in ln)
            in_margin = top > h * 0.905 or bottom < h * 0.07  # running headers sit in the top ~9%
            looks_like_header = bool(re.match(r"\d{1,4}\s", s) or re.search(r"\s\d{1,4}$", s)
                                     or re.search(r"chapter|•|\||access for free|openstax\.org", s, re.I))
            if (in_margin and looks_like_header) or re.fullmatch(r"\d{1,4}", s):
                skipped += 1
                continue
        kept.append(ln)

    def line_height(ln):
        hs = sorted(boxes[i][3] - boxes[i][1] for i in ln if text[i].isalpha())
        return hs[len(hs) // 2] if hs else body_h

    if boxes and opts["skip_footnotes"] and body_h:
        # footnotes: small lines below all of the page's normal-size text (sidebars beside
        # the body text, like a timeline box, are not footnotes and are kept)
        body_lines = [ln for ln in kept if line_height(ln) >= body_h * 0.86]
        lowest_body = min((min(boxes[i][1] for i in ln) for ln in body_lines), default=0)
        notes = [ln for ln in kept if line_height(ln) < body_h * 0.86
                 and max(boxes[i][3] for i in ln) <= lowest_body + 0.5 and max(boxes[i][3] for i in ln) < h * 0.3]
        # ... and the block starts with a footnote marker (*, †, ‡ or a small number)
        first = "".join(text[i] for i in notes[0]).strip() if notes else ""
        if notes and not re.match(r"(\*|†|‡|\d{1,2})\s?[A-Z(]", first):
            notes = []
        if notes:
            skipped += len(notes)
            kept = [ln for ln in kept if ln not in notes]

    # small raised citation numbers ("...as shown³" or "[12]") are left out of the spoken text
    def is_ref(i):
        if not (boxes and body_h and opts["skip_refs"]):
            return False
        ch = text[i]
        if not (ch.isdigit() or ch in "*†‡"):
            return False
        l, b, r, t = boxes[i]
        return (t - b) < body_h * 0.75 and b > line_base[i] + body_h * 0.25

    line_of: dict[int, int] = {}
    line_base: dict[int, float] = {}
    for k, ln in enumerate(kept):
        bs = sorted(boxes[i][1] for i in ln if boxes and text[i].isalpha()) if boxes else []
        base = bs[len(bs) // 2] if bs else 0
        for i in ln:
            line_of[i] = k
            line_base[i] = base

    # 2. one stream of characters (with their indices), lines joined, hyphenation undone
    stream: list[tuple[str, int | None]] = []
    for k, ln in enumerate(kept):
        chars = [(text[i], i) for i in ln if not is_ref(i)]
        while chars and chars[-1][0] == " ":
            chars.pop()
        nxt = kept[k + 1] if k + 1 < len(kept) else None
        if chars and chars[-1][0] in "-­" and nxt and text[nxt[0]].islower():
            stream += chars[:-1]
        else:
            stream += chars + [(" ", None)]

    # 3. sentences
    raw_sents, cur = [], []
    for j, (ch, idx) in enumerate(stream):
        cur.append((ch, idx))
        if ch in ".?!" and (j + 1 == len(stream) or stream[j + 1][0] == " "):
            word = "".join(c for c, _ in cur).rstrip(".?!").split()[-1:] or [""]
            w0 = word[0].lower().strip("([")
            following = next((c for c, _ in stream[j + 2:j + 3]), "")
            if ch == "." and (w0 in ABBREVIATIONS or (len(w0) == 1 and w0.isalpha()) or following.islower()):
                continue
            raw_sents.append(cur)
            cur = []
        elif len(cur) > 420 and ch in ",;:" :
            raw_sents.append(cur)  # keep long sentences speakable
            cur = []
    if cur:
        raw_sents.append(cur)

    sentences = []
    for chars in raw_sents:
        s = re.sub(r"\s+", " ", "".join(c for c, _ in chars)).strip()
        if not s or not re.search(r"[A-Za-z]", s):
            continue
        if opts["skip_captions"] and re.match(r"(Figure|Fig\.|Table|Exhibit)\s+\d", s):
            skipped += 1
            continue
        if opts["skip_math"] and (_letter_ratio(s) < 0.55 or len(re.findall(r"[A-Za-z]{2,}", s)) < 2):
            skipped += 1
            continue
        rects: dict[int, list[float]] = {}
        if boxes:
            # one rectangle per printed line, as page fractions from the top left
            for _, idx in chars:
                if idx is None or text[idx] == " ":
                    continue
                l, b, r, t = boxes[idx]
                box = rects.setdefault(line_of[idx], [l, b, r, t])
                box[0], box[1], box[2], box[3] = min(box[0], l), min(box[1], b), max(box[2], r), max(box[3], t)
        out_boxes = _no_overlap([[b[0] / w, 1 - b[3] / h, b[2] / w, 1 - b[1] / h] for b in rects.values()])
        sentences.append({"i": len(sentences), "text": s, "spoken": spoken(s), "boxes": out_boxes})

    result = {"page": page, "pages": len(doc), "width": w, "height": h, "sentences": sentences, "skipped": skipped}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result), encoding="utf-8")
    return result


def render_page(pdf: Path, page: int, width_px: int = 1400) -> Path:
    """A page image for the read-aloud view (cached)."""
    st = pdf.stat()
    key = hashlib.sha1(f"{pdf.resolve()}|{st.st_size}|{st.st_mtime_ns}|{page}|{width_px}".encode()).hexdigest()[:20]
    out = config.DATA_DIR / "speech" / "pages" / f"{key}.png"
    if out.is_file():
        return out
    doc = pdfium.PdfDocument(str(pdf))
    pg = doc[page - 1]
    scale = width_px / pg.get_size()[0]
    out.parent.mkdir(parents=True, exist_ok=True)
    pg.render(scale=scale).to_pil().save(out, optimize=True)
    return out
