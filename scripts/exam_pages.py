"""Show what is on each page of an exam PDF, to write content/<course>/exams.json.

    python -I scripts/exam_pages.py library/ece201/ucb-ee40/fa07_mt1.pdf [more.pdf ...]

Prints the page count, the first words of each page, and any "Problem N" /
"N." headings with their page, so problem-to-page maps can be checked by eye.
Pages with almost no text are flagged as scans.
"""
import re
import sys

import pypdfium2 as pdfium

HEAD = re.compile(r"(?im)^\s*(?:problem|question|prob\.?|part)\s*#?\s*(\d+)|^\s*(\d{1,2})[.)]\s+(?=[A-Z(])")


def show(path: str) -> None:
    pdf = pdfium.PdfDocument(path)
    print(f"=== {path}: {len(pdf)} pages")
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        text = tp.get_text_range(0, tp.count_chars())
        flat = " ".join(text.split())
        heads = sorted({int(a or b) for a, b in HEAD.findall(text) if (a or b) and int(a or b) < 30})
        scan = " [SCAN?]" if len(flat) < 40 else ""
        sol = " [SOLUTION?]" if re.search(r"(?i)solution", flat) else ""
        print(f"p{i + 1:>2}{scan}{sol} heads={heads} | {flat[:150]}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for p in sys.argv[1:]:
        show(p)
