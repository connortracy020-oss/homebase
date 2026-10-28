"""A picture of a circuit for Claude's circuit tools (app/mcp_server.py), so Claude can see what
it drew next to the figure it copied.

app/static/circuits/io/picture.js lays the drawing out as plain shapes, with the bench's own
symbols, labels and node names; this draws them as a PNG on a white page, with the grid's
coordinates along the top and left edges so Claude can say where things go.
"""
import math
from functools import cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SS = 3  # drawn this many times larger, then scaled down: Pillow doesn't smooth its lines
FONT_DIR = Path(r"C:\Windows\Fonts")
GRID, GRID_TEXT = "#d9d3cb", "#9b9186"


@cache
def _font(px: int, bold: bool = False, symbol: bool = False):
    name = "seguisym.ttf" if symbol else "seguisb.ttf" if bold else "segoeui.ttf"
    try:
        return ImageFont.truetype(str(FONT_DIR / name), px)
    except OSError:
        return ImageFont.load_default(px)


@cache
def _has(font, ch: str) -> bool:
    """Whether a font draws ch, rather than its empty box (Segoe UI has no ∠)."""
    def mask(s):
        im = Image.new("L", (font.size * 2, font.size * 2))
        ImageDraw.Draw(im).text((2, 2), s, font=font, fill=255)
        return im.tobytes()
    return mask(ch) != mask("\U000F0000")


def _runs(s: str, px: int, bold: bool):
    """The text in runs of one font each: Segoe UI, with Segoe UI Symbol for what it lacks."""
    main, alt = _font(px, bold), _font(px, symbol=True)
    out = []
    for ch in s:
        f = main if ch.isascii() or _has(main, ch) else alt
        if out and out[-1][1] is f:
            out[-1][0] += ch
        else:
            out.append([ch, f])
    return out


def _text(d: ImageDraw.ImageDraw, x: float, y: float, s: str, px: int, color: str, bold=False, anchor="start"):
    runs = _runs(s, px, bold)
    width = sum(f.getlength(t) for t, f in runs)
    x -= width / 2 if anchor == "middle" else width if anchor == "end" else 0
    for t, f in runs:
        d.text((x, y), t, font=f, fill=color, anchor="ls")
        x += f.getlength(t)


def png(picture: dict, max_width: int = 1100, max_height: int = 900) -> bytes:
    """The PNG of a picture from io/picture.js: {bounds: [x0, y0, x1, y1], items: [...]}."""
    bx0, by0, bx1, by1 = picture["bounds"]
    left, top, pad = 1.6, 1.3, 0.8  # grid units: room for the coordinates, and a margin
    ox, oy = bx0 - pad - left, by0 - pad - top
    wu, hu = bx1 - ox + pad, by1 - oy + pad
    scale = max(14.0, min(40.0, max_width / wu, max_height / hu))
    W, H = int(wu * scale), int(hu * scale)
    k = scale * SS
    img = Image.new("RGB", (W * SS, H * SS), "white")
    d = ImageDraw.Draw(img)

    def P(x, y):
        return ((x - ox) * k, (y - oy) * k)

    # the grid: a dot at every point, and coordinates every 1, 2 or 5 units along the edges
    step = 1 if max(bx1 - bx0, by1 - by0) <= 12 else 2 if max(bx1 - bx0, by1 - by0) <= 30 else 5
    gx0, gx1 = math.ceil(ox + left), math.floor(ox + wu - 0.3)
    gy0, gy1 = math.ceil(oy + top), math.floor(oy + hu - 0.3)
    r = 0.045 * k
    for gx in range(gx0, gx1 + 1):
        for gy in range(gy0, gy1 + 1):
            cx, cy = P(gx, gy)
            if cx > left * k and cy > top * k:
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GRID)
    px = round(0.42 * k)
    for gx in range(gx0, gx1 + 1):
        if gx % step == 0 and P(gx, 0)[0] > left * k:
            _text(d, P(gx, 0)[0], (top - 0.45) * k, str(gx), px, GRID_TEXT, anchor="middle")
    for gy in range(gy0, gy1 + 1):
        if gy % step == 0 and P(0, gy)[1] > top * k:
            _text(d, (left - 0.4) * k, P(0, gy)[1] + 0.15 * k, str(gy), px, GRID_TEXT, anchor="end")

    for it in picture["items"]:
        kind = it["k"]
        if kind == "poly":
            pts = [P(*p) for p in it["pts"]]
            if it.get("fill") and it.get("closed") and len(pts) > 2:
                d.polygon(pts, fill=it["fill"])
            if it.get("c"):
                w = max(1, round((it.get("w") or 0.08) * k))
                line = pts + [pts[0]] if it.get("closed") else pts
                d.line(line, fill=it["c"], width=w, joint="curve")
                if not it.get("closed"):
                    for x, y in (line[0], line[-1]):  # round ends, like the 2D view's
                        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=it["c"])
        elif kind == "circle":
            (cx, cy), rr = P(*it["at"]), it["r"] * k
            w = max(1, round((it.get("w") or 0.06) * k)) if it.get("c") else 0
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=it.get("fill"), outline=it.get("c"), width=w)
        elif kind == "text":
            x, y = P(*it["at"])
            _text(d, x, y, it["s"], round(it["size"] * k), it["c"], bold=it.get("bold", False), anchor=it.get("anchor", "start"))
        elif kind == "pill":
            (x, y), w, h = P(*it["at"]), it["w"] * k, it["h"] * k
            d.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=it["fill"])
            _text(d, x + w / 2, y + h / 2 + 0.17 * k, it["s"], round(it["size"] * k), it["c"], bold=True, anchor="middle")

    out = BytesIO()
    img.resize((W, H), Image.LANCZOS).save(out, "PNG", optimize=True)
    return out.getvalue()
