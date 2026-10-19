"""Find where numbered problems and answers sit inside a PDF.

    python -I scripts/index_pdf.py library/ece201/kuphaldt/ewp.pdf "Question (\\d+)" "Answer (\\d+)"

Prints {number: page} for each pattern, so content files can point at exact
pages without copying any problem text.
"""
import json
import re
import sys

import pypdfium2 as pdfium


def index(path: str, pattern: str) -> dict[str, int]:
    found = {}
    pdf = pdfium.PdfDocument(path)
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        text = tp.get_text_range(0, tp.count_chars())
        for m in re.finditer(pattern, text):
            found.setdefault(m.group(1), i + 1)
    return found


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    path, *patterns = sys.argv[1:]
    print(json.dumps({p: index(path, p) for p in patterns}, indent=1))
