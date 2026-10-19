"""Summarize and sanity-check the research JSON files.

Run from the Homebase folder:  python -I scripts/research_stats.py
Checks that every local_path exists and counts what each course has.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    "ece201": ["resources.json", "videos.json", "practice.json", "chapters.json"],
    "ece200": ["resources.json"],
    "mth254": ["resources.json", "chapters.json"],
}


def local_paths(item):
    for key in ("local_path", "solutions_local_path"):
        if item.get(key):
            yield item[key]


for course, names in FILES.items():
    videos, core_min, psets, exams, exams_sol, missing, chapters = 0, 0.0, 0, 0, 0, [], 0
    for name in names:
        data = json.loads((ROOT / "research" / course / name).read_text(encoding="utf-8"))
        if name == "chapters.json":
            chapters += sum(len(v["chapters"]) for v in data["videos"])
            continue
        for v in data.get("videos", []):
            videos += 1
            if v.get("priority") == "core":
                core_min += v.get("duration_min") or 0
        for p in data.get("problem_sets", []):
            psets += 1
        for e in data.get("exams", []):
            exams += 1
            if e.get("solutions_url") or e.get("solutions_local_path"):
                exams_sol += 1
        for section in ("resources", "problem_sets", "exams"):
            for item in data.get(section, []):
                for p in local_paths(item):
                    if not (ROOT / p).exists():
                        missing.append(p)
    print(f"{course}: {videos} videos ({core_min/60:.1f} h core), {chapters} chapters, "
          f"{psets} problem sets, {exams} exams ({exams_sol} with solutions listed), "
          f"{len(missing)} missing local files")
    for p in missing[:10]:
        print("   missing:", p)
