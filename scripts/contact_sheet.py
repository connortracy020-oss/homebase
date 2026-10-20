"""Render every page of a PDF into one image grid, to check exams by eye.

    python -I scripts/contact_sheet.py library/ece201/ucb-ee40/fa11_mt1.pdf OUT.png [cols]

Used to confirm a "blank" exam has no answers written in, and to see which
problem is on which page, before adding the exam to content/<course>/exams.json.
"""
import sys

import pypdfium2 as pdfium
from PIL import Image, ImageDraw

path, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
pdf = pdfium.PdfDocument(path)
thumbs = []
for i in range(len(pdf)):
    page = pdf[i]
    w, h = page.get_size()
    img = page.render(scale=560 / max(w, h)).to_pil().convert("RGB")
    ImageDraw.Draw(img).text((8, 8), f"p{i + 1}", fill=(200, 0, 0))
    thumbs.append(img)
tw = max(t.width for t in thumbs)
th = max(t.height for t in thumbs)
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "white")
for k, t in enumerate(thumbs):
    sheet.paste(t, ((k % cols) * tw, (k // cols) * th))
sheet.save(out)
print(f"{len(thumbs)} pages -> {out} ({sheet.width}x{sheet.height})")
