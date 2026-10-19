# Homebase research index (2026-10-19)

Everything the app will seed from. Reports are for reading; the `.json` files are what the build loads.
Local copies live in `library/` (git-ignored, personal study only, about 570 MB).

| Course | Read | Seed data | Core video | Practice with real solutions |
|---|---|---|---|---|
| ECE 201 | [report](ece201/report.md), [videos](ece201/videos-report.md), [practice](ece201/practice-report.md) | `resources.json`, `videos.json`, `practice.json`, `chapters.json` | 10.8 h (6 MIT 6.002 lectures + gap-fill videos) | Ulaby exercise solutions (203 pp); Berkeley EE 40/42 exams; PSU, GT, ASU homework solutions |
| ECE 200 | [report](ece200/report.md) | `resources.json`, `dspfirst_problems.json` | 5.8 h (Lanterman GT ECE2026) + MIT 6.007 L10–11 | GT ECE 2026 quiz/final archive (2004–2026); DSP First problem DB (~800 solved); Hasler HW solutions |
| MTH 254 | [report](mth254/report.md) | `resources.json`, `chapters.json` | 14.3 h (13 MIT 18.02 lectures + 20 recitations) | MIT 18.02/18.02SC exams + practice exams; 18.02SC psets; CLP-3 problem book |
| Shared | [report](shared/report.md) | `resources.json` (calendar) | — | — |

`python -I scripts/research_stats.py` re-checks that every `local_path` exists (last run: 0 missing).

## What changed from the original brief

- **OSU ENGR 201 W22 homework and solutions are gone.** All 37 PDFs return 404 and there is no archive copy; only the schedule survives. Replaced with Ulaby's official exercise solutions and Berkeley EE 40 exams (Maharbiz, a Ulaby co-author, taught several).
- **Ulaby is now a 3rd edition (2025), still free**, but the PDF is behind a short Google Form you fill in yourself.
- **Briggs & Cochran is not free.** OpenStax Calculus Vol 3 and UBC CLP-3 (both CC BY-NC-SA) replace it as readings, with a section mapping to Briggs.
- **The OSU MTH 254 Spring 2015 study guide link is dead.** The 2010/2011 versions were used.
- **ECE 200:** in the catalog since 2024 and offered on Ecampus since Fall 2025. The Fall 2026 Corvallis sections were cancelled (checked in OSU class search), so **Winter 2027 with Jinsub Kim appears to be the first on-campus run**. Expect a course that is still settling.
- **MIT 6.002 is a weak spine for ECE 201** (only 6 of 25 lectures map). It's paired with short targeted videos, and Hajimiri's Caltech circuit lectures are an optional full track.
- **No public syllabus exists for any of the three W27 courses** (all Canvas-only). Exam rules come from older OSU offerings (MTH 254: closed book, no calculator, 3x5 card) or are unknown (ECE 200, ECE 201).

## Known gaps

- Y-Delta and supermesh problems with solutions are thin, so generated problems with code-checked answers should fill these.
- There are no OSU-written ECE 201 or ECE 200 exams anywhere public.
- Old OSU MTH 254 exams exist but have no solutions. Their answers would have to be computed and checked with SymPy before use.
- Lanterman (ECE 200) and the other YouTube videos have no chapter timestamps yet. Only the MIT lectures do (499 chapters, built from MIT's caption files).
- Barry's DSP First draft chapters (ECE 200) are copyrighted drafts posted on a GT course server. They're kept locally, and you may prefer to delete them.
