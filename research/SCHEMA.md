# Research output format

Each course's research lives in `research/<course>/` (course = `ece201`, `ece200`, `mth254`, `shared`).
Downloaded files live in `library/<course>/<source>/` (git-ignored, personal study only, never committed).

Every course folder contains:

- `report.md`: readable findings, decisions, confidence ratings, and an **Unverified / open questions** section.
- `resources.json`: machine-readable data the app will seed from (shape below).

## Rules

- Every URL in `resources.json` was fetched or opened during research. If it could not be, set `"verified": false` and say why in `notes`.
- Never invent solutions, answers, dates, durations or grades. Unknown means `null` plus a note.
- Record the license of every resource (`"CC BY-NC-SA 4.0"`, `"All rights reserved, publicly posted"`, `"unknown"`...).
- `local_path` is relative to the Homebase root, e.g. `library/ece201/engr201w22/hw1_sol.pdf`. Keep file names short (Windows MAX_PATH).

## resources.json shape

```json
{
  "course": "ECE201",
  "generated": "2026-10-19",
  "resources": [
    {
      "id": "ulaby-cad",
      "title": "Circuit Analysis and Design (Ulaby, Maharbiz, Furse)",
      "kind": "textbook | video_series | slides | notes | syllabus | schedule | problem_set | solutions | exam | exam_solutions | lab | tool | other",
      "url": "https://...",
      "license": "CC BY-NC 4.0",
      "license_url": "https://...",
      "verified": true,
      "verified_how": "fetched page 2026-10-19, license stated on copyright page",
      "local_path": null,
      "topics": ["KCL", "KVL"],
      "notes": ""
    }
  ],
  "videos": [
    {
      "id": "mit6002-L01",
      "series": "mit-6002-s07",
      "number": 1,
      "title": "Introduction and lumped abstraction",
      "url": "https://...",
      "alt_urls": ["https://youtube..."],
      "duration_min": 50,
      "topics": ["lumped matter discipline"],
      "osu_week": 1,
      "priority": "core | optional | skip",
      "transcript_url": "https://... or null",
      "notes": "why core/skip"
    }
  ],
  "problem_sets": [
    {
      "id": "engr201w22-hw1",
      "source": "OSU ENGR 201 W22",
      "title": "Homework 1",
      "url": "https://...",
      "solutions_url": "https://... or null",
      "local_path": "library/...",
      "solutions_local_path": "library/... or null",
      "topics": [],
      "osu_week": 1,
      "solution_quality": "full worked | answers only | none",
      "problem_count": 6,
      "notes": ""
    }
  ],
  "exams": [
    {
      "id": "",
      "source": "",
      "title": "Midterm 1 (Fall 2019)",
      "url": "",
      "solutions_url": null,
      "local_path": null,
      "solutions_local_path": null,
      "topics": [],
      "time_limit_min": null,
      "rules": "closed book, no calculator (as stated on exam) / unknown",
      "notes": ""
    }
  ],
  "week_map": [
    {
      "week": 1,
      "topics": [],
      "readings": [{"resource_id": "ulaby-cad", "sections": "1.1-1.6"}],
      "videos": ["mit6002-L01"],
      "problem_sets": ["engr201w22-hw1"],
      "notes": ""
    }
  ],
  "unverified": ["plain-language list of anything not confirmed"]
}
```
