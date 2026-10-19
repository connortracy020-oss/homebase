# ECE 200 Discrete-Time Signal Processing: research report

Generated 2026-10-19 for Homebase.
- **Data:** `research/ece200/resources.json`, with resources (115), videos (161), problem_sets (18), exams (137), week_map (10), unverified and python_labs (10).
- **Problem index:** `research/ece200/dspfirst_problems.json`, one entry per DSP First database problem (1,024).
- **Local copies:** `library/ece200/`, personal study only.

## 1. OSU ECE 200: known vs assumed

### Known (fetched and checked)
- **Catalog entry (2026-27):** 4 credits, covering DT signals and LTI systems in the time and frequency domains, DT convolution, complex sinusoids and phasors, and the DT Fourier series and transform.
  - Prerequisite: MTH 251, 251H, 251Z or 251HZ with a C or better.
  - Enrollment is limited to ECE majors in the College of Engineering. It is also offered via Ecampus.
  - No learning outcomes are published.
- **Not a renamed course.** It is absent from the March 2023 catalog snapshot and present from June 2024 onward.
  - It is part of the new sophomore core (ECE 200-204), which replaces ENGR 201-203 plus ECE 351/352 for new students. ECE 351/352 still exist.
- **What builds on it:**
  - ECE 202 (AC circuits) requires ECE 200, which may be taken at the same time.
  - ECE 203 (continuous-time signal processing, including the Laplace transform) requires ECE 200 plus MTH 252.
  - ECE 350 (Foundations of DSP) requires ECE 203. It lists the z-transform, DTFT, IIR filters and DFT/FFT. That suggests the z-transform and IIR filters belong to ECE 350, not ECE 200 (inference).
- **Degree plan:** the sample plan puts ECE 200 in second-year Fall. Connor is taking it as a freshman in Winter.
- **Winter 2027 schedule (from the OSU class search):**
  - Lecture 001, CRN 37746: **Jinsub Kim**, Mon/Wed 4:00-5:20 pm in Weniger 151, 108 seats, Jan 4 to Mar 12, 2027.
  - Six 2-hour labs, all listed under J. Kim, in Kidder 028 (tagged as a PC lab), 18 seats each: Tue 8-9:50a, Tue 2-3:50p, Thu 8-9:50a, Thu 2-3:50p, Fri 12-1:50p, Fri 2-3:50p.
  - The Ecampus section 400 is taught by J. Henriquez.
- **Fall 2026:** the Corvallis sections (instructor "Staff") show as **Cancelled**; only Ecampus section 400 (Henriquez) ran. Spring 2026 had no sections.
- **Fall 2025:** the Ecampus section was taught by A. Debnath (archived Ecampus page from October 2025).
- **Coursicle** lists instructors J. Henriquez, J. Kim, V. Mathews and A. Debnath for Fall 2025 through Winter 2027, but doesn't say who taught which term.
- **Jinsub Kim:**
  - Associate Professor in EECS, at OSU since August 2014.
  - PhD in ECE from Cornell (2014, minors in statistics and applied math); BS from KAIST.
  - Research: statistical signal processing, anomaly detection, power-system state estimation, ML security, ML for energy systems.
  - His teaching page lists ECE 352 Signals & Systems II (Winter and Spring 2022), ECE/CS 499 Statistical Signal Processing (Fall 2021) and ECE 599 Nonlinear Optimization.
  - No ECE 200 course page, syllabus or GitHub repo was found for him or anyone else.
- **Textbook:** the OSU Beaver Store shows the Fall 2026 Ecampus section as "See Canvas And/Or Instructor For Course Materials - No Cost". The Winter 2027 sections list no books yet, so no required paid textbook is known.
- **Ecampus section:** requires online proctored testing. The syllabus is only in Canvas.

### Assumed or low confidence
- **Course style:** that it follows DSP First is an assumption, though the catalog topics match closely.
- **Grading and exams:** unknown. The only hints are two reviews:
  - A V. Mathews review on Coursicle, possibly about ECE 200, says quizzes were closed-note, notes were allowed on the midterm and final, and there was a big curve.
  - The one ECE 200 review is of the Ecampus Henriquez section: pre-recorded videos he didn't make, and slow grading.
- **Planning assumption:** weekly homework, a midterm around weeks 5-6, a final, and graded labs.
- **Lab language:** MATLAB vs Python is unknown. Plan for Python but be able to read MATLAB.
- **Kim's background:** statistics, optimization and teaching ECE 352 hint at a math-careful course, but don't point to a textbook.
- **Reddit:** no r/OregonState threads about ECE 200 were found.

## 2. Recommended spine and confidence

**Videos: Lanterman, Georgia Tech ECE2026** (https://www.youtube.com/playlist?list=PLOunECWxELQTS8q48sEeJhKZHsEp5uZOK)
- 55 videos of 3-18 minutes each, about 9.5 hours in total, in DSP First chapter order.
- 33 are core (about 5.8 h). Lectures 46-60 (z-transform and IIR) are an optional stretch.
- Lectures 17, 18 and 42-44 are not in the playlist.
- Confidence: high that it fits the catalog, medium that it fits OSU's pace and notation.

**Supplements:**
- MIT RES.6-007 lectures 10 (DT Fourier series) and 11 (DTFT) are core for weeks 8-9. The catalog names these topics, and Lanterman covers the DT Fourier series in a single 6-minute video.
- 3Blue1Brown videos on convolution and Fourier series/transform, for intuition.

**Reading:**
- Signal Processing First lecture slides L01-L13 (CC BY-NC-SA 1.0).
- Barry's draft DSP First chapters on the DTFT and DFT, plus his DTFT tables, for weeks 8-10.
- Think DSP (free PDF, CC BY-NC 3.0) for the Python side.

**Practice:**
- Barry's archive of Georgia Tech ECE 2026 quizzes and finals.
- The DSP First problem database.
- Hasler's worked homework solutions.

## 3. Video candidates

| Series | Verified count | Fit to ECE 200 | Length | Confidence as spine | Role |
|---|---|---|---|---|---|
| Lanterman GT ECE2026 | 55 videos, titles and durations parsed | Freshman/sophomore level, DSP First order | 3-18 min, ~9.5 h total | **High** | **Spine** |
| MIT RES.6-007 (Oppenheim, 1987) | 26 lectures on OCW, CC BY-NC-SA 4.0 | Mixes continuous and discrete time; best on DT Fourier series and DTFT | ~1 h each (not measured) | Medium | Core for L10-L11; optional L2-L5, L12, L16 |
| Hasler GT ECE 2026 short videos | 64, all checked | Matches through week 6, then drifts to Laplace and circuits | 2-11 min | Medium-low | Optional, weeks 1-6 and 10 |
| Van Veen, AllSignalProcessing | 14 in the intro playlist (other playlists cover sampling, z-transform, IIR) | Rigorous, a bit formal | 6-22 min | Medium-low | Optional |
| MIT 6.003, Fall 2011 | 25 lectures | Starts with z/Laplace; order doesn't match | ~50 min | Low | Optional L2, L8, L17, L18 |
| Radke, RPI ECSE-4530 (2014) | 28 videos, CC BY-NC-ND 4.0 | Senior level, fast | ~75 min (not measured) | Low | Optional L1-L3, L7, L10 |
| Brunton, Fourier Analysis | 39 videos | Math view; good DFT/FFT with Python | 5-18 min | Low | Optional for DFT weeks |
| 3Blue1Brown | 3 videos checked | Intuition only | 20-25 min | n/a | Optional |
| DSP First "YouTube - MATLAB" playlist | 16 videos | MATLAB basics only | 2-6 min | n/a | Skip |
| MIT 6.341 | No videos | Graduate level | n/a | n/a | Skip |
| UIUC ECE 310 | Login required | n/a | n/a | n/a | Skip |

## 4. Problems and solutions

### DSP First 2e problem database
- Source: dspfirst.gatech.edu/database. It is publisher companion content, publicly posted.
- 1,024 problems by chapter: ch2 189, ch3 165, ch4 171, ch5 77, ch6 108, ch7 9, ch8 18, ch9 89, ch10 198.
- About 800 have solutions, as scanned handwritten or typeset images.
- Judging by the Georgia Tech file names, many are old quiz and final problems, which makes them good exam practice. That labeling is an inference.
- **Downloaded:** chapters 2-8, every problem that has a solution: 1,227 files in `library/ece200/dspfirst-db/chNN/`.
  - Statements are `pNNN.pdf` and solutions are `pNNNsK.png`.
  - 43 URLs on the server return 404.
- Chapters 9-10 (z-transform, IIR) are indexed but not downloaded.

### Hasler, Georgia Tech ECE 2026 Summer 2025
- 71 typed worked solutions to DSP First 2e end-of-chapter problems, chapters 2-10.
- Files are in `library/ece200/gt2026-hasler/hwsol/hw<ch>_<n>.pdf`.
- The problem statements are in the textbook, which isn't free; the solutions partly restate them.
- Her Topics page gives the weekly problem lists.

### Other sources
- The Signal Processing First instructor solutions are for adopting instructors only, so they were not used.
- McClellan's ECE-2025 archive (homework and quiz solutions, 1998-2009) exists, but its file links return 404.

## 5. Exams

### Barry's Georgia Tech ECE 2026 archive
- Index: https://barry.ece.gatech.edu/2026/exams.html. All 129 linked PDFs are downloaded, spanning Spring 2004 to Fall 2026 (quizzes 1-4 and finals).
- Files are in `library/ece200/gt2026-barry/`, named like `q1_sp25.pdf` and `fin_fa23.pdf`.
- **Solutions:** many PDFs contain the blank exam followed by a solutions version. This was checked by eye for Spring 2025 Quiz 1.
  - 75 have solutions confirmed by automatic detection.
  - 29 are about half image-only pages, so probably scanned solutions (not checked by eye).
  - 25 are undetermined.
- **Rules as printed on the exams:**
  - 2004-2018: "Closed book, but a calculator is permitted".
  - 2023-2026: closed book plus 1-3 two-sided handwritten note sheets.
  - Time limits seen: 25 minutes (Fall 2014/2015 clicker quizzes) and 50 minutes (Spring 2024 quizzes).
- **Typical coverage (inferred):**
  - Quiz 1: sinusoids, phasors, spectrum, Fourier series.
  - Quiz 2: sampling, FIR filters, convolution, frequency response.
  - Quiz 3: DTFT, DFT, z-transform, IIR.
  - Finals: comprehensive.
- Best for ECE 200: Quiz 1 and Quiz 2 papers, plus the DTFT/DFT problems on finals.
- Reference tables: `fin_tables.pdf` (DTFT/DFT pairs and properties) and `tables_q2.pdf`.

### Hasler exams
- 8 PDFs: Exams 1-3 for Fall 2022 and Summer 2023, Exams 1-2 for Summer 2025. No solutions detected.

### Georgia Tech grading, for context only (not OSU)
- Barry, Summer 2026: homework 20%, labs 10%, two quizzes at 20% each, final 25%, recitation 5%. Exams are closed book except handwritten equation sheets.

## 6. Python labs plan

Ten weekly labs, each with a check against NumPy/SciPy. Also stored as `python_labs` in `resources.json`.
- **Task specs:** the MATLAB lab handouts from DSP First and Hasler, in `library/ece200/dspfirst-labs/` and `gt2026-hasler/`.
- **References:** Think DSP, plus the NumPy FFT and SciPy signal docs (`freqz`, `lfilter`).

| # | Lab | Check |
|---|---|---|
| 1 | Sinusoids and phasors: add three same-frequency cosines numerically and by phasor sum | `np.allclose` of the numeric sum vs Re{(sum of phasors) e^{jωt}} |
| 2 | Spectrum and synthesis: sum of sinusoids, beats, a short song | FFT peaks at the predicted bins with height A/2 |
| 3 | Sampling and aliasing: predict the alias, sinc reconstruction | predicted \|f − k·fs\| equals the FFT peak |
| 4 | FIR filter by hand: your own loop for averager and differencer | equals `np.convolve(x,b)[:len(x)]` and `scipy.signal.lfilter(b,1,x)` |
| 5 | Convolution and LTI: flip-and-slide, cascades, linearity and time-invariance tests | `np.allclose(my_conv, np.convolve)`; cascade equals filtering in sequence |
| 6 | FIR frequency response: compute H(e^jω), pass a sinusoid through | matches `freqz`; steady-state amplitude equals \|H\|·A |
| 7 | Nulling and averaging filters on audio (UPC edge detection optional) | removed tone drops more than 40 dB; Dirichlet formula equals `freqz` |
| 8 | DTFT plotting: boxcar pair, shift and modulation properties | numeric DTFT equals the closed form |
| 9 | DT Fourier series: analysis sum and resynthesis | coefficients a_k equal `np.fft.fft(one_period)/N` |
| 10 | DFT by matrix vs `np.fft.fft`, zero padding, touch-tone (DTMF) decoder | `np.allclose`; decoded digits match the generated ones |

## 7. Week map (Winter 2027, Jan 4 to Mar 12)

This is a generalization from DSP First chapter order and Georgia Tech ECE 2026 schedules, not OSU's actual schedule.

| Week | Topics | Read | Core videos | Practice |
|---|---|---|---|---|
| 1 | Complex numbers, sinusoids, phasors | SPF L01-L03; Think DSP ch1 | Lanterman L3-L7 | DB ch2; Hasler ch2 |
| 2 | Spectrum, beats/AM, periodic signals, Fourier series | SPF L04-L07; Think DSP ch2 | L8, L9, L11, L14, L15 | DB ch3; Hasler ch3; GT Quiz 1 papers |
| 3 | Sampling, aliasing, D/A conversion, DT periodicity | SPF L08-L09 | L19-L23 | DB ch4; Hasler ch4 |
| 4 | DT systems, FIR filters, impulse response | SPF L10 | L24, L25 | DB ch5; Hasler ch5 |
| 5 | LTI systems, convolution, cascades | SPF L11 | L26-L28; 3Blue1Brown convolution | DB ch5; GT Quiz 2 papers; Hasler Exam 1 |
| 6 | FIR frequency response | SPF L12 | L29, L30 | DB ch6; Hasler ch6 |
| 7 | Averaging filters, filtering sampled signals, review | SPF L13 | L31 | DB ch6; GT Quiz 2 papers |
| 8 | DTFT | Barry ch66 + tables | L33-L35; MIT 6.007 L11 | DB ch7; Hasler ch7 |
| 9 | Ideal filters, DT Fourier series | Barry ch66/67 | L36, L41; MIT 6.007 L10 | DB ch7-8 |
| 10 | DFT, `np.fft`, zero padding, review | Barry ch67; Think DSP ch7 | L38-L40; Brunton DFT | DB ch8; Hasler ch8; DTFT/DFT problems from finals |

Optional stretch: z-transform and IIR filters (Lanterman L46-L60, SPF L14-L18).

## 8. Downloads (`library/ece200/`)

| Folder | Files | Size | Contents |
|---|---|---|---|
| spfirst-slides/ | 26 PDFs | 8.4 MB | Lecture slides L01-L26 |
| dspfirst-db/ | 580 PDFs + 647 PNG solution images | 63.3 MB | Problem database, chapters 2-8 |
| dspfirst-labs/ | 31 PDFs | 7.5 MB | 30 MATLAB lab handouts + DSP First 2e table of contents |
| gt2026-barry/ | 133 PDFs | 113.7 MB | 129 quizzes/finals + DTFT/DFT draft chapters + 2 table sheets |
| gt2026-hasler/ | 92 PDFs | 48.2 MB | 71 homework solutions, 7 labs, 4 slide decks, 8 exams, 2 MATLAB primers |
| thinkdsp/ | 1 PDF | 4.1 MB | Think DSP book |

All file headers were verified. No .m or .zip files were downloaded or run.

## 9. Unverified / open questions
- OSU's syllabus, grading, exam format, lab content and lab language are not public (Canvas only).
- The OSU textbook is unknown; Fall 2026 Ecampus shows "no cost, see Canvas".
- That the course follows DSP First is an assumption.
- Whether OSU covers the z-transform, IIR filters or the DFT is unknown.
- Who taught the Corvallis sections in Fall 2025 and Winter 2026 is unconfirmed, and the Coursicle reviews are low confidence.
- Georgia Tech exam topic tags are inferred; only Spring 2025 Quiz 1 was opened by eye.
- The 54 exam PDFs marked "probably scanned" or "undetermined" weren't checked by eye.
- The quiz/final/homework labels in the problem database are inferred from file names.
- Durations for MIT RES.6-007, MIT 6.003 and Radke weren't measured.
- Lanterman L17, L18 and L42-L44 are missing from the playlist.
- Barry's Chapter 66/67 PDFs are copyrighted draft chapters of the DSP First textbook, posted on an official Georgia Tech course server. They're kept locally, but Connor may prefer to delete them.
- McClellan's ECE-2025 archive links return 404.
- OSU Winter 2027 finals-week dates weren't checked.
