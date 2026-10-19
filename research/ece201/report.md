# ECE 201 (DC and Transient Circuits): OSU-side and textbook research

Generated 2026-10-19 for Connor's Oct 19 – Jan 3 self-study. The W27 term runs Jan 4 – Mar 12, 2027. Videos are covered in `videos-report.md`.

## Key findings

1. **The OSU ENGR 201 W22 site has only HTML pages left. Every PDF is gone.** The index, outline, homework and announcements pages load. All 37 linked PDFs return HTTP 404: the syllabus, Lec1–18, HW1–9 and SOL1–9. The Wayback Machine has no captures of `/data/`. The lecture schedule, homework due dates and exam dates survive. Confidence: high (each URL checked).
2. **ECE 201 is a new 4-credit course that replaces the 3-credit ENGR 201.** It adds a weekly 2-hour lab, more emphasis on first-order transients, and "fundamental semiconductor devices and device fabrication." Confidence: high (catalog and class schedule).
3. **W27 Corvallis section:** Tingwei Zhang (Instructor I, OSU PhD 2024) teaches lecture 001 TR 8:30–9:50am in KEC 1001. The 2-hour labs are W 4–5:50pm (DEAR 203), R 12–1:50pm, or F 12–1:50pm, with a $65 fee. Ecampus section 400 is Matthew Boeding and uses online proctored tests. Fall 2026 was taught by Nadia Najim and Boeding. **None of the three has a public course site.** The EECS class list shows no link, and Ecampus says the syllabus is Canvas-only.
4. **Textbook:** Ulaby, Maharbiz & Furse, *Circuit Analysis and Design*, 3rd ed., Michigan Publishing, July 2025, 780 pp. It is open access through the Free ECE Textbook Initiative on Fulcrum (DOI 10.3998/mpub.13162125). **The PDF needs a Google Form** (course number and university; name optional), so it was not downloaded. Connor should submit the form himself. W22 used the 2018 (2nd) edition of the same book. OSU ENGR 203 (F26) also uses the 3rd edition.
5. **The best free practice with official solutions** is the book's companion site. It has a 203-page worked-solutions PDF for every in-chapter exercise, concept-question answers, and interactive "Test Your Understanding" quizzes (150 numeric questions for ch1–5).
6. **No old OSU ENGR 201 or ECE 201 exams with solutions exist on any official OSU page.** Studocu and Course Hero have student uploads; they were skipped (login required, unofficial).

## Schedule template (ENGR 201, Winter 2022, Prof. Tejasvi Anand)

Lectures were TR 10:00–10:50 in LINC 128. Lecture videos were on Canvas only.

| Wk | Tue | Thu | Due / assessed |
|---|---|---|---|
| 1 | 1/4 Introduction | 1/6 Current, voltage, power, energy | |
| 2 | 1/11 Ohm's law, power, energy | 1/13 Dependent sources, KCL | |
| 3 | 1/18 KVL, series, parallel | 1/20 Voltage and current division | HW1 due 1/18; **Quiz 1 Thu 1/20** |
| 4 | 1/25 Y-Delta, nodal analysis | 1/27 Nodal analysis | HW2 due 1/25 |
| 5 | 2/1 Mesh analysis | 2/3 **Midterm 1 (Test 1)** | HW3 due 2/1 |
| 6 | 2/8 Supermesh, superposition | 2/10 Superposition, Thevenin | HW4 due 2/8 |
| 7 | 2/15 Thevenin, Norton | 2/17 Max power transfer, op-amps | HW5 due 2/15; **Quiz 2 Thu 2/17** |
| 8 | 2/22 Op-amps 1 | 2/24 Op-amps 2 | HW6 due 2/22 |
| 9 | 3/1 Capacitors | 3/3 **Midterm 2 (Test 2)** | HW7 due 3/1 |
| 10 | 3/8 Inductors, RC, RL | 3/10 RC and RL circuits | HW8 due 3/8 |
| Finals | | 3/17 **Final, 6:00pm, LINC 128** | HW9 due 3/15 |

Not known, because the syllabus PDF is gone: grading weights, calculator and notes-sheet rules, and exam lengths. W22 had no lab.

**How ECE 201 W27 is likely to differ (inferred):** meetings are 80 minutes instead of 50, there is a weekly lab, and the catalog adds first-order behaviour plus semiconductor devices and fabrication. Expect more RC/RL depth and a short devices/fabrication unit that W22 did not have. Where that unit falls in the term is unknown.

## Homework inventory (W22)

| HW | Due | Problem PDF | Solution PDF | Likely topics (inferred from lectures) |
|---|---|---|---|---|
| 1 | 1/18 | 404 | 404 | V, I, power, Ohm, dependent sources, KCL |
| 2 | 1/25 | 404 | 404 | KVL, series/parallel, division |
| 3 | 2/1 | 404 | 404 | Y-delta, nodal |
| 4 | 2/8 | 404 | 404 | mesh |
| 5 | 2/15 | 404 | 404 | supermesh, superposition, Thevenin |
| 6 | 2/22 | 404 | 404 | Thevenin/Norton, max power |
| 7 | 3/1 | 404 | 404 | op-amps |
| 8 | 3/8 | 404 | 404 | capacitors |
| 9 | 3/15 | 404 | 404 | inductors, RC/RL |

Problem counts and solution quality cannot be determined. The JSON keeps the original URLs (marked `verified: false`) so the app can show the structure. Replacement practice comes from the Ulaby sets below.

## Exams / quizzes inventory

- **W22:** Quiz 1 (1/20), Test 1 (2/3), Quiz 2 (2/17), Test 2 (3/3), Final (3/17, 6pm). None was ever posted.
- **Practice exams:** none found for OSU ENGR 201 or ECE 201 on official pages.
- **Closest OSU data point:** Prof. Un-Ku Moon's ENGR 203 (F26) syllabus. Exams are closed book and closed notes with no calculator. The instructor provides a reference sheet, posted in advance. Homework is graded on effort and solutions are posted. That course covers Laplace and signals, not ECE 201 content, and its rules are not confirmed for ECE 201.
- **Ecampus section:** uses online proctored tests.

## Exam style (what's known)

ECE 201 W27 rules, duration and weights are all unknown, since the syllabus is Canvas-only. Suggested practice style: timed, closed book, a one-page formula sheet, and problems that don't need a calculator. That matches the only OSU circuits-sequence evidence (ENGR 203). Confidence: low.

## Textbook and mapping

**Chapters (verified on Fulcrum):**
1. Circuit Terminology
2. Resistive Circuits
3. Analysis Techniques
4. Operational Amplifiers
5. RC and RL First-Order Circuits
6. RLC Circuits
7. ac Analysis
8. ac Power
9. Frequency Response
10. Three-Phase Circuits
11. Magnetically Coupled Circuits
12. Laplace
13. Fourier

Appendix G has "Answers to Selected Problems." The full solutions manual and slides are instructor-only (by email request to the author).

The section numbers below come from U-Michigan EECS 215 (Fred Terry, FA20), which taught from this book. That schedule uses 2nd-edition numbering, so treat it as medium confidence for the 3rd edition.

| OSU topic (W22 week) | Ulaby sections |
|---|---|
| Terminology, charge/current, voltage/power, dependent sources (1–2) | 1-1 to 1-6 |
| Ohm, KCL/KVL, series/parallel, source transformation, division (2–3) | 2-1 to 2-3 |
| Y-delta, Wheatstone bridge (4) | 2-4 to 2-5 |
| Nodal, supernode (4) | 3-1, 3-2 |
| Mesh, supermesh (5–6) | 3-3/3-4 (not in the UMich list, unverified) |
| Superposition, Thevenin/Norton (6–7) | 3-5 to 3-6 |
| Thevenin methods, max power transfer (7) | 3-7 to 3-8 |
| Op-amps: ideal model, inverting/noninverting (7–8) | 4-1 to 4-4 |
| Summing, difference, follower, instrumentation (8) | 4-5 to 4-9 |
| ECE 201 semiconductors: diodes, BJT, MOSFET, IC fabrication | 2-6 (diodes), 3-9 (BJT), 4-11 (MOSFET), Tech Brief 7 (IC fabrication) |
| Waveforms, capacitors, inductors (9–10) | 5-1 to 5-3 |
| RC/RL response, RC op-amp circuits (10) | 5-4 to 5-6 |

**Physics background (optional):** OpenStax University Physics Vol. 2 (CC BY-NC-SA 4.0), since Connor has no physics. Useful chapters are 7 (electric potential), 8 (capacitance), 9 (current and resistance), 10 (DC circuits), and 14.2 and 14.4 (inductors, RL). Each chapter has an answer-key page.

## Downloaded files

All are in `library/ece201/ulaby/`, start with `%PDF`, and open in pypdf.

- **`exercise_sol.pdf`** (3,404,365 B, 203 pp): worked solutions to every in-chapter exercise, ch1–13. Ch1 has 10 exercises, ch2 14, ch3 16, ch4 13, ch5 19. A leading newline the server added was removed.
- **`cq_ch1.pdf` to `cq_ch5.pdf`** (80 KB, 458 KB, 282 KB, 596 KB, 814 KB): concept-question answers (8, 19, 18, 25 and 27 questions), merged from 97 single-question PDFs.
- **`tb07_ic_fab.pdf`** (4,641,773 B): Tech Brief 7 on IC fabrication, for the new fabrication topic.
- **`equations.pdf`** (182,353 B): formula list from the 2013 "Circuits" edition; ch1–5 content matches.
- **`errata.pdf`** (24,474 B, header fixed): belongs to an older NTS "Circuits, 3rd ed." and probably does not apply.

## Other sources considered

- **Used:**
  - The CAD companion site, cad3e.eecs.umich.edu.
  - The UMich EECS 215 FA20 reading schedule. Its recorded lectures and slides may interest the video agent.
  - Berkeley video modules listed on the companion site. Module 16 "Simple MOSFET" and Module 17 "Intro to Semiconductor Fabrication" are the only free lectures found that match the new topic; passed to the video agent.
- **Skipped:**
  - Studocu and Course Hero student uploads (login required, not official).
  - Linn-Benton CC ENGR 201 syllabi (not OSU, no solutions).
  - Moon's ENGR 203 materials (different content).

## Unverified / open questions

- **W22 files:** the homework, solutions, slides and syllabus are gone, so there are no problem counts, grading weights or exam rules. Asking Prof. Anand (anandt@eecs.oregonstate.edu) for the old PDFs is optional.
- **ECE 201 W27:** the syllabus, exam format, lab topics and timing of the semiconductor/fabrication unit stay unknown until Canvas opens around Jan 4. Recheck https://classes.engr.oregonstate.edu/eecs/ in late December for a course link from Zhang.
- **Section numbers:** not checked against the 3rd edition. Confirm from the PDF bookmarks after the form download.
- **License:** the book is listed as "Open Access"; no Creative Commons license was seen on any fetched page.
- **Course mapping:** treating ENGR 201 as a template for ECE 201 is an assumption; ECE 201 may reorder topics.
