# ECE 201 replacement practice: problem sets and past exams with solutions

Generated 2026-10-19. Data: `research/ece201/practice.json` (11 resources, 58 problem sets, 73 exams, unverified). Files: 228 PDFs in `library/ece201/` (all start with `%PDF`; the largest is 59.4 MB). This replaces OSU's lost ENGR 201 W22 homework and solutions.

Fields added beyond SCHEMA.md: `osu_week`, `scope`, `solution_quality`, `license`, `verified`. Each exam's `osu_week` is the template week by which all its in-scope topics have been taught. Solution quality comes from extracted text or a viewed page; scans that couldn't be checked are marked as such. No problem text is reproduced.

**Key finding:** the only official source of past exams with solutions is Berkeley's EE 40 family (EE 40, EE 42/100, EECS 16A). Purdue, UMich EECS 215 and Georgia Tech have no official exams with posted solutions. EE 40 was taught by Maharbiz, a co-author of the Ulaby textbook.

## Coverage table

Problem counts are rough. A set's problem count is split evenly across its topics, and the Dorf, Georgia Tech and ASU homework counts aren't broken down by topic.

| Topic (OSU wk) | Best sources | Problems with answers or solutions (sets) | Exams with solutions |
|---|---|---|---|
| Charge, V, I, power, Ohm (1–2) | Fiore ch 2, Kuphaldt eir/ohm_law/ewp, PSU HW1, ASU HW1.1 | ~70 | 4 |
| Dependent sources, KCL (2) | PSU HW1/HW3, Fiore ch 7, Kuphaldt kvl | ~70 | 9–18 |
| KVL, series/parallel, dividers (3) | Fiore ch 3–5, Kuphaldt dc_s/dc_p/dc_sp/e_divide/i_divide, PSU HW2, GT ch 3 (20) | ~250 | 6–11 |
| Y-Delta (4) | Fiore 6.7 (answers only), PSU x_fund1 (no solutions) | ~6 | **0 (gap)** |
| Nodal, supernode (4) | Fiore ch 7, PSU HW3 plus nodal/mesh extras, GT ch 4, EE 40 Midterm 1s | ~35 | 22 |
| Mesh (5) | Fiore ch 7, PSU HW3, EE 40 Fa11/Fa12/Sp12 Midterm 1 | ~37 | 10 |
| Supermesh (6) | PSU HW3, ASU Test 1 | few | 2 (thin) |
| Superposition, Thevenin, Norton, max power (6–7) | Fiore ch 6, Kuphaldt super/thev, PSU HW4, GT ch 5 (13), ASU HW2–3 | ~100 | 26 (Thevenin), 11 (superposition), 6 (max power) |
| Op-amps (7–8) | Kuphaldt opamp1/3/5/6, Fiore Op Amps ch 3–4, GT ch 6 (10) | ~115 | 14 |
| Capacitors (9) | Fiore ch 8, Kuphaldt caps, PSU HW5, GT ch 7 | ~28 | 24 |
| Inductors, RC/RL (10) | Kuphaldt time1/time2/inds, Fiore ch 8–9, PSU HW6, GT ch 8 (13), ASU Test 3 | ~130 | 27 |
| Diodes / MOSFET / IC fabrication | Fiore Semiconductor Devices ch 2/3/12, Kuphaldt diode1/igfet, EE 40 Fa03 Final, Fa99 Midterm 2, Sp04 Midterm 2 | ~58 | 13 / 10 / 6 |

Gaps (Y-Delta, supermesh) are good candidates for **generated problems with code-computed answers**.

## Exam inventory (highlights; all 73 are in the JSON)

The rule wording below is what each exam states.

**Midterm 1 scope**
- **EE 40 Fa07 Midterm 1 (Chang-Hasnain):** 50 min, closed book, one single-sided page of notes, **no calculators**. Nodal/supernode, KCL, dividers, Thevenin. Full typed solutions. Closest match to OSU-style rules.
- **EE 40 Sp08 Midterm 1 (Anantharam):** 50 min, **no calculators**, one double-sided page. KCL, superposition, dependent sources. Full typed solutions, but only the solution file is posted (it includes the problems).
- **EE 40 Fa11 / Fa12 / Sp12 / Sp13 / Sp15 Midterm 1 (Maharbiz):** nodal, mesh and equivalent circuits. Rules and time aren't stated. Solutions range from typed and full to brief.
- **EE 40 Sp00 Midterm 1 (King):** typed solutions; skip the logic problem.
- **Portland State ECE 241:** Winter 2018 midterm (1 hour, multiple choice, formula sheet, calculator) plus a practice exam, both with solutions.

**Midterm 2 scope**
- **EE 40 Fa08 Test 3:** 50 min, **no calculators**; op-amps are 40% of the points.
- **EE 42/100 Su12 Midterm (Dear):** 110 min, one sheet of notes, **no calculating devices**. Full typed solutions.
- **EE 40 Fa09 Midterm 1** (80 min, calculator allowed), **Fa03 Midterm 1** (50 min, calculator), **Sp04 Midterm 1** (90 min), **Sp00 Midterm 2**.
- **ASU EEE 202 Tests 1–3:** 30–75 min, one formula sheet. Short timed drills.

**Final scope**
- **EE 40 Fa08 Final:** 180 min, **no calculators**, 4 sheets of notes. One problem (a transistor amplifier) is beyond ECE 201.
- **EE 42/100 Su12 Final:** 110 min, **no calculating devices**, 2 sheets of notes.
- **EE 40 Fa03 Final (King):** 170 min, 3 sheets of notes plus a calculator. Best match for the new devices and fabrication unit.
- **EE 40 Sp00 Final** (worked solutions) and **Fa99 Final** (answers with short work).

**RC/RL practice:** EE 40 Fa06, Sp06 and Sp07 Midterm 1 (all no-calculator), Sp08 Midterm 2 (initial-condition drill), Fa08 Test 1.

**No solutions:** Georgia Tech ECE 2040 Exams 1–3 (S19, F20, F24): closed book with one handwritten page of notes. Exams 2–3 rely on Laplace methods, which ECE 201 doesn't cover.

**Different style:** Berkeley EECS 16A Spring 2015 Midterm 1, Midterm 2 and Final, with solutions. Circuits are mixed with linear algebra and design.

## Homework inventory
- **Portland State ECE 241 HW 1–7 (Winter 2018):** 37 Dorf & Svoboda problems, full worked. The solution PDFs reprint each problem. HW7 is AC, out of scope.
- **Portland State extras:** nodal/mesh extra problems (worked), quizzes 1–5 with solutions, Irwin textbook problem scans (no solutions, but the main Y-Delta source), and Karris textbook exercise scans.
- **Georgia Tech solved homework:** 70 Dorf problems across chapters 3–8, handwritten. Only the 16 chapter 3–4 PDFs were downloaded; chapters 5–8 are JPG files.
- **ASU EEE 202:** HW 1.1, 1.2, 2, 3, 4 and 6 solutions, handwritten with circuits redrawn. The HW5 link returned 404.
- **Fiore DC text:** about 254 answered odd-numbered problems (answers only).
- **Fiore Op Amps and Semiconductor Devices:** answers only.
- **Kuphaldt worksheets:** 24 worksheets, 625 questions with answers.

## Licenses
- **Berkeley exams:** all rights reserved. HKN, the student honor society that hosts them, says instructors consented to posting.
- **Georgia Tech, Portland State, ASU:** all rights reserved, publicly posted by the instructor. Portland State's solution pages are Wiley Dorf solutions-manual pages, and its extra problem scans come from Irwin (Wiley) and Karris (Orchard Publications) textbooks.
- **Fiore:** CC BY-NC-SA 3.0. The author also forbids AI training without his written consent. (Using his answer keys during a feedback request is not training, but the app will flag Fiore items so Connor can exclude them from AI feedback if he prefers.)
- **Kuphaldt:** CC BY 1.0 inside each worksheet; the site index says CC BY 3.0 US.

## Unverified
- **Purdue:** no official page found. Every engineering.purdue.edu ECE 201/20001 URL tried returns 404.
- **UMich EECS 215:** the course URL returns 403.
- **UIUC ECE 210:** the exam index loads but the files require login (401).
- **eecs16a.org/resources:** returns 404. The **Berkeley EE 40 Fall 2005** archive redirects to a login page.
- **Unchecked scans:** four solution scans couldn't be decoded locally (EE 40 fa99_mt2_sol and fa00_mt2_sol; EE 42 sp01_mt1_sol and sp01_mt2_sol). Open them in a PDF viewer.
- **Rules not stated:** the Maharbiz and King exams don't give a time limit or calculator rule.
- **Possible mismatch:** the EE 40 Sp15 Midterm 1 blank says "Spring 2014" on its cover while the solution says Spring 2015.
- **fa98_mt1_sol:** a one-page file with unknown contents; it has no exam entry.
- **Dorf homework topics:** taken from the textbook section numbers, with only some pages viewed.
- **Devices unit week:** unknown, so device items are tagged week 10 as a placeholder.
