"""Audit exam PDFs: is the "blank" exam really blank, and where do solutions start?

    python -I scripts/exam_audit.py > research/exam_audit.txt

For each exam in the research JSON with a local copy:
  - blank vs solution text overlap (a "blank" that matches its solution file
    is really a solved copy, so it can't be used for timed practice)
  - for single files holding exam + solutions, the first page that looks
    like the start of the solutions (a repeated cover page or "SOLUTION")
"""
import json
import re
import sys
from pathlib import Path

import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [("ece201", "practice.json"), ("ece200", "resources.json"), ("mth254", "resources.json")]


def page_texts(path: Path) -> list[str]:
    pdf = pdfium.PdfDocument(path)
    out = []
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        out.append(" ".join(tp.get_text_range(0, tp.count_chars()).split()))
    return out


def words(texts):
    return set(re.findall(r"[a-z]{4,}", " ".join(texts).lower()))


def solution_start(texts: list[str]) -> int | None:
    """1-based page where a combined file switches from exam to solutions."""
    if not texts:
        return None
    cover = texts[0][:80]
    for i, t in enumerate(texts[1:], start=2):
        if cover and t[:80] == cover:  # the cover page appears again
            return i
        if re.search(r"(?i)\bsolutions?\b", t[:300]) and not re.search(r"(?i)\bsolutions?\b", texts[0][:300]):
            return i
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    for folder, name in SOURCES:
        data = json.loads((ROOT / "research" / folder / name).read_text(encoding="utf-8"))
        for e in data.get("exams", []):
            blank, sol = e.get("local_path"), e.get("solutions_local_path")
            if not blank or not (ROOT / blank).exists():
                print(f"{folder} {e['id']}: no blank copy (solutions only: {bool(sol)})")
                continue
            b = page_texts(ROOT / blank)
            scanned = sum(1 for t in b if len(t) < 40)
            if sol and sol != blank and (ROOT / sol).exists():
                s = page_texts(ROOT / sol)
                bw, sw = words(b), words(s)
                extra = len(sw - bw) / max(1, len(sw))  # share of solution words absent from the blank
                verdict = "BLANK OK" if extra > 0.15 else "SOLVED COPY?"
                print(f"{folder} {e['id']}: {verdict} (blank {len(b)}p, sol {len(s)}p, "
                      f"{extra:.0%} of solution words not in blank, {scanned} scan pages)")
            elif sol == blank:
                start = solution_start(b)
                print(f"{folder} {e['id']}: COMBINED {len(b)}p, solutions start p{start} "
                      f"({scanned} scan pages)")
            else:
                print(f"{folder} {e['id']}: blank only, no solutions ({len(b)}p)")


if __name__ == "__main__":
    main()
