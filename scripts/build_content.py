"""Turn the research JSON into the app's content files.

    python -I scripts/build_content.py

Writes, for each course:
  content/<code>/weeks.json   the 10 term weeks (short title + topics)
  content/<code>/videos.json  core + optional videos, with MIT chapter timestamps

Run it again after the research changes. Hand edits belong in the
TITLES table below (or later, directly in content/ once research is frozen).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / "research"
CONTENT = ROOT / "content"

SOURCES = {
    "ECE201": ("ece201", ["resources.json", "videos.json"], "chapters.json"),
    "ECE200": ("ece200", ["resources.json"], None),
    "MTH254": ("mth254", ["resources.json"], "chapters.json"),
}

# Short week titles for the checklist headers (topics come from research).
TITLES = {
    "ECE201": [
        "Circuit basics: charge, V, I, power",
        "Ohm's law, dependent sources, KCL",
        "KVL, series/parallel, dividers",
        "Y-Delta and nodal analysis",
        "Mesh analysis + Midterm 1",
        "Supermesh, superposition, Thevenin",
        "Thevenin/Norton, max power, op-amps",
        "Op-amp circuits",
        "Capacitors + Midterm 2",
        "Inductors, RC/RL transients, devices",
    ],
    "ECE200": [
        "Complex numbers, sinusoids, phasors",
        "Spectrum and Fourier series",
        "Sampling and aliasing",
        "DT systems and FIR filters",
        "LTI systems and convolution",
        "FIR frequency response",
        "Averaging filters, filtering sampled signals",
        "The DTFT",
        "Ideal filters, DT Fourier series",
        "The DFT and review",
    ],
    "MTH254": [
        "Vectors, dot and cross products",
        "Lines, curves, motion in space",
        "Arc length, surfaces, level curves",
        "Group Exam 1; limits and continuity",
        "Partials, chain rule, gradient",
        "Tangent planes, max/min",
        "Group Exam 2; double integrals",
        "Double integrals in polar",
        "Triple integrals, cylindrical, spherical",
        "Triple integrals continued; final review",
    ],
}

YOUTUBE_ID = re.compile(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})")


def youtube_id(video: dict) -> str | None:
    if video.get("youtube_id"):
        return video["youtube_id"]
    for url in [video.get("url", "")] + list(video.get("alt_urls") or []):
        m = YOUTUBE_ID.search(url or "")
        if m:
            return m.group(1)
    return None


def load(folder: str, name: str) -> dict:
    return json.loads((RESEARCH / folder / name).read_text(encoding="utf-8"))


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    for code, (folder, files, chapters_file) in SOURCES.items():
        week_map = load(folder, "resources.json")["week_map"]
        weeks = [
            {"number": w["week"], "title": TITLES[code][w["week"] - 1], "topics": w["topics"],
             "notes": w.get("notes", "")}
            for w in sorted(week_map, key=lambda w: w["week"])
        ]
        write(CONTENT / code.lower() / "weeks.json", weeks)

        chapters = {}
        if chapters_file:
            for v in load(folder, chapters_file)["videos"]:
                chapters[v["video_id"]] = v

        videos = []
        for name in files:
            for v in load(folder, name).get("videos", []):
                if v.get("priority") not in ("core", "optional"):
                    continue
                ch = chapters.get(v["id"], {})
                videos.append({
                    "id": v["id"],
                    "series": v.get("series", ""),
                    "title": v["title"],
                    "url": v["url"],
                    "youtube_id": youtube_id(v),
                    "duration_min": v.get("duration_min"),
                    "osu_week": v.get("osu_week"),
                    "priority": v["priority"],
                    "topics": v.get("topics", []),
                    "verified": v.get("verified", True),
                    "summary": ch.get("summary", ""),
                    "chapters": ch.get("chapters", []),
                })
        videos.sort(key=lambda v: (v["osu_week"] or 99, v["priority"] != "core", v["id"]))
        write(CONTENT / code.lower() / "videos.json", videos)
        print(f"{code}: {len(weeks)} weeks, {len(videos)} videos "
              f"({sum(1 for v in videos if v['chapters'])} with chapters, "
              f"{sum(1 for v in videos if not v['youtube_id'])} without a YouTube id)")


if __name__ == "__main__":
    main()
