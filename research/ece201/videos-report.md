# ECE 201 video lectures and MIT 6.002 materials

Generated 2026-10-19. Machine-readable data: `research/ece201/videos.json` (108 videos, 16 resources, 11 problem sets, 9 exams, week_map for weeks 1-10). Downloads: `library/ece201/mit6002/` (78 PDFs, 9.9 MB, all start with `%PDF`).

## Summary

- MIT OCW 6.002 Spring 2007 has 25 lectures in 26 videos. Lectures 9 and 15 come in two parts, and there is no Lecture 24 video. Each lecture page embeds YouTube and links a transcript PDF plus a VTT caption file. I took durations from each YouTube watch page.
- Only **6 of the 26 videos are core** for ECE 201 (L1, L2, L3, L12, L19, L20), about **4.9 h**. 6.002 is built around the digital abstraction, MOSFETs, nonlinear/small-signal analysis and second-order/AC circuits, and almost none of that is in ECE 201.
- 6.002 has no lecture on mesh, supermesh, supernode, Y-Delta or maximum power transfer. It also does no dependent-source drills and almost nothing on inductors/RL. I filled those gaps with short YouTube videos, which add about **5.9 h** of core time. Core total is about **10.8 h** over 10 weeks.
- For depth in full-lecture format, **Ali Hajimiri's Caltech "Circuits and Systems"** lectures 1-10, 14 and 15 follow ECE 201 almost topic for topic, including dependent sources, supernodes, mesh/supermesh, max power and Y-Delta (~10.5 h). They are marked optional, as an alternative track.
- None of the MIT exams or homework sets come with solutions. Many homework exercises point to the Agarwal & Lang textbook, which is not free.

## 6.002 lecture table with OSU mapping

Base URL: `https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/resources/<slug>/`. Every lecture has a transcript (PDF + VTT). The URLs are in the JSON.

| # | Title | YouTube ID | Min | OSU wk | Priority | Why |
|---|---|---|---|---|---|---|
| 1 | Introduction and Lumped Abstraction | AfQxyVuLeCs | 41.2 | 1 | **core** | Current, voltage, element laws, KCL/KVL from first principles |
| 2 | Basic Circuit Analysis Method | 2vHGYdepKLw | 49.2 | 2 (rewatch 3) | **core** | KVL/KCL method, series/parallel, dividers, node method |
| 3 | Superposition, Thevenin and Norton | RsJ1eg7XNVs | 51.2 | 6 | **core** | Theorems. No max power, no dependent-source Thevenin |
| 4 | The Digital Abstraction | 4TCnYYpZxEc | 49.1 | - | skip | Digital |
| 5 | Inside the Digital Gate | v6vqWasIHaw | 51.1 | 10 | optional | MOSFET switch model; context for the semiconductor intro |
| 6 | Nonlinear Analysis | OGtElTMJidE | 44.8 | - | skip | |
| 7 | Incremental Analysis | JqvKtMNz3RQ | 50.2 | - | skip | |
| 8 | Dependent Sources and Amplifiers | bEJ0-8pANA4 | 52.4 | 3 | optional | Dependent-source concept, then MOSFET amps that rely on L5-7 |
| 9a/9b | MOSFET Amplifier Large Signal Analysis | Nijya-QJ45Y / jURSAKBlIZA | 50.6 / 50.6 | - | skip | |
| 10 | Amplifiers - Small Signal Model | 9RqFFlZgf60 | 50.5 | - | skip | |
| 11 | Small Signal Circuits | R4KxlqsuZ0A | 50.1 | - | skip | |
| 12 | Capacitors and First-Order Systems | COdQmA9g9S8 | 49.2 | 9 | **core** | RC transients, time constant |
| 13 | Digital Circuit Speed | TXJIhDHtHSI | 52.9 | 9 | optional | RC step response applied to gate delay |
| 14 | State and Memory | bX8i2yECWaU | 48.0 | 10 | optional | Capacitor voltage as state / initial conditions |
| 15a/15b | Second-Order Systems | ypX20WnHNQw / -gRXU-O1FY4 | 50.2 / 50.2 | - | skip | ECE 202 |
| 16 | Sinusoidal Steady State | 3GdMaDzIUeQ | 52.1 | - | skip | ECE 202 |
| 17 | The Impedance Model | Km9YIdkc2Oo | 49.5 | - | skip | ECE 202 |
| 18 | Filters | WT-qzgaKeGI | 48.0 | - | skip | ECE 202 |
| 19 | The Operational Amplifier Abstraction | V0z_f7qxLcY | 52.5 | 8 | **core** | Ideal op-amp, inverting/non-inverting |
| 20 | Operational Amplifier Circuits | 2SwT6JnfCq8 | 49.9 | 8 | **core** | Summing, integrator, differentiator |
| 21 | Op Amps Positive Feedback | ke3SL_R92ys | 51.2 | - | skip | Comparators/oscillators |
| 22 | Energy and Power | wNuBD4PYWvs | 51.7 | 9 | optional | Energy stored in C, RC dissipation |
| 23 | Energy, CMOS | JB2HgohNHYQ | 40.2 | 10 | optional | CMOS context for the semiconductor intro |
| 25 | Violating the Abstraction Barrier | dyxcCoUgETU | 46.6 | - | skip | |

Core 6.002 time: 293 min (4.9 h). Optional: 6 videos, about 4.9 h.

## Gaps and supplemental picks

All picks were checked on their YouTube watch pages on 2026-10-19 (title, channel, lengthSeconds, captions present). The first pick in each row is core; the rest are optional.

| Gap topic (OSU wk) | Core picks | Optional / deeper |
|---|---|---|
| Sign convention, basics (1) | Engineer4Free "Passive Sign Convention" `C_EDm61hwLw` (5.8) | Question Solutions "Basic Concepts" `rE_0ejMU6yM` (16.4); Hajimiri 001/002 |
| KCL/KVL, dividers (2) | Engineer4Free KCL `P3QX1PQnoo0` (6.2), KVL `nbzWLzDPFBU` (5.2), voltage division `AGP3x069cFA` (8.2), current division `tCJ2s4aoHvM` (7.3) | QS Ohm/Kirchhoff `8pJcXfl8oq0`; QS series/parallel `Gn26z60tTog` |
| Dependent sources (2-3) | Engineer4Free `d-NK63PEkM8` (7.2); Jim Pytel "Circuit Analysis with Dependent Sources" `VN3QXcvSmVI` (16.7) | Pytel `6U6z79oRDB0`; ALL ABOUT ELECTRONICS `SfKw8bHk7-o`; Hajimiri 005 `QQCYJnmbXYw` (31.6) |
| Y-Delta (3) | Question Solutions `XtciQU4KMSg` (12.7) | van Biezen `t-Xy2_3tIUE` + `qQYRc9UibKk`; AAE `OV0qi7yzKAM`; Pytel `2kPdJHVEkiA`; Hajimiri 009 |
| Nodal (3) | Engineer4Free `f-sbANgw4fo` (8.4); QS "Complete Guide to Nodal Analysis" `JptsfzvKbuo` (27.2) | Organic Chem Tutor `BMnFC63m1fQ` (32.3); Hajimiri 004 |
| Supernode (4) | Engineer4Free `khtZubT9K8E` (6.5) + example `2JfKcLuESTw` (7.9) | AAE `iIswDPKSQT4`; Hajimiri 006 `DJcvNUkzWmQ` |
| Mesh (4) | Engineer4Free `eQpc2QRFv7Y` (9.8); QS "Complete Guide to Mesh Analysis" `D92DjS43-Qw` (26.8) | E4F example `jewkmjVjbmw`; OCT `k5Tlg27JDtc`; Hajimiri 007 `XJ0MKFfwEUo` |
| Supermesh (6) | Engineer4Free `72W_ZQl4qmE` (7.0) + example `2Yc5zvDIvJ0` (7.0) | AAE `8RGckMZLTBo` |
| Superposition (6) | QS `uoZ0E6zxoi0` (12.5) | AAE `S0GsrzjVkd4`; OCT `EX52BuZxpQM` (44.3); QS source transformation `C5kr0uDR_so` |
| Thevenin/Norton (7) | QS Thevenin `-X7otqsma4Q` (23.3), QS Norton `rSP32xF5MUc` (24.0); AAE Thevenin with dependent sources `8udwPc5pCoA` (16.6) | AAE Norton `DdLA8rntWEY`; UConn HKN `tk5OgmjDXW8`; Neso `roh1pkffYb0`; OCT `zTDgziJC-q8`; Hajimiri 008 |
| Max power transfer (7) | QS `bPG7o-97dJ0` (16.1) | AAE `RbII8o49Hvs`; OCT `8CA6ZNXgI-Y`; Pytel `T5owy52XEuc`; Hajimiri 009 `Ho0thejpuoY` |
| Op-amp drills (8) | OCT inverting/non-inverting `idJEMYhrIfs` (12.0); CircuitBread practice problems `uxcCJVl96hU` (12.3) | van Biezen drills: inverting `x2xxOKOTwM4`, non-inverting `c3u9RRIVkok`, summing `BYtEP0kY64E`, difference `Ea5AsPZgB64`, cascaded `yTkC6vdtHaY`; Khan `_Ut-nQ535iE`; Hajimiri 010 |
| RC/RL step response (9-10) | AAE first-order RC/RL `KylJ2v1_c-o` (27.2) + solved examples `zDcXt9Vx34o` (16.9); van Biezen RC strategy `N0vcIGaXsn4` (7.0), RL strategy `ZYrO0I35mho` (2.4) | Khan `zfqJRZyeGRE`; MvB `tEmksld8sC0`; OCT RC `PLQrPqYlPmI`, RL `RR0sQeDAxgk`; Hajimiri 011/014/015 |
| Semiconductors and fabrication (10) | CircuitBread pn junction `btOIDQeMrMg` (5.0), MOSFET `Bfvyj88Hs_o` (4.7); TED-Ed "How are microchips made?" `IkRXpFIRUl4` (5.5) | Branch Education `dX9CGRZwD-w` (27.8); Veritasium `IcrBqCFLHIY`; Samsung `Bu52CE55BN0`; AAE pn junction `USrY0JspDEg`; Hajimiri 101N solid-state `403CnTftB4M` (59.4); 6.002 L5, L23 |

Core minutes per week (6.002 + supplemental): wk1 47, wk2 83, wk3 65, wk4 51, wk5 0 (midterm review), wk6 78, wk7 80, wk8 127, wk9 83, wk10 35.

### Series vetted

| Series | Exists / count | Quality signals | Use |
|---|---|---|---|
| Engineer4Free "Circuits" | Playlist fetched, 56 videos | Short concept + example pairs, 2020-21, 18k-770k views | Primary for weeks 1-4, 6 analysis methods. Stops at supermesh |
| Question Solutions "Circuit Analysis A-Z" | Playlist fetched, 11 videos | 2024-26, long solved-example videos, 35k-385k views | Drill sessions: Y-Delta, nodal, mesh, theorems, max power |
| ALL ABOUT ELECTRONICS "Network Analysis" | Playlist fetched, 136 videos | Explanation videos plus many short quiz problems | Dependent-source Thevenin/Norton, transients, extra drills |
| Michel van Biezen EE (Ch 2-5, 8) | 5 playlists fetched (29/38/37/32/50) | Very short single examples, high views; numbering in titles is messy | Op-amp and RC/RL drills |
| Jim Pytel DC Circuit Analysis (Columbia Gorge CC, Oregon) | Playlist fetched, 81 videos | Technician-level full lectures, slower and algebra-based | Dependent sources, Y-Delta, max power as slower alternatives |
| Ali Hajimiri, Caltech "Circuits and Systems" | Playlist fetched, 41 videos | Real university lecture course; 46-71 min lectures; captions | Optional full-lecture track (lectures 1-10, 14, 15) |
| The Organic Chemistry Tutor | Individual videos verified | Long worked problems, very high views | Extra repetitions |
| Khan Academy "Circuit analysis" | Playlist fetched, 17 videos, last updated 2018 | Clear, but small and ordered alphabetically on YouTube | A few optional picks |
| CircuitBread, TED-Ed, Branch Education, Veritasium, Samsung | Individual videos verified | Short animations / overviews | Semiconductor and fabrication intro |

I did not use Georgia Tech, Purdue or Ohio State full series. My searches did not turn up a verifiable public full-semester DC circuits lecture series from those schools; Jennifer Hasler (Georgia Tech) has short circuit clips but no full sequenced course. The Hajimiri series fills that role. I did not find Ulaby book companion videos.

### Other MIT options (briefly)

- **6.002x / 6.002.1x (edX)**: the same Agarwal material as a MOOC. The edX URL I tried resolved to a generic subject page, so I could not confirm it is currently offered. OCW S07 is enough.
- **6.002 Fall 2000**: the OCW course URL returns 404 (it exists on DSpace). Its lecture notes and final are already included in S07 and downloaded.
- **RES.6-010** is Electronic Feedback Systems: not relevant. **6.01**: not pursued, since circuits are a small unit there.

## MIT problem sets / quizzes inventory

All files are in `library/ece201/mit6002/`. **OCW publishes no solutions** for any homework or exam in this course; text extraction found no solution content in the files.

| File | Topics | OSU wk | Relevance |
|---|---|---|---|
| hw1.pdf | KVL/KCL, power, resistor synthesis | 2 | High |
| hw2.pdf | Equivalent R, division, node method, Thevenin/Norton, superposition | 3 | High (one problem uses A&L) |
| hw3.pdf, hw4.pdf | Boolean/MOS, nonlinear | - | Skip |
| hw5.pdf | Problem 5.1: Thevenin with dependent source; rest MOSFET amps | 7 | Problem 5.1 only |
| hw6.pdf, hw7.pdf | MOSFET small-signal | - | Skip |
| hw8.pdf | First-order transients (Ch 10) | 9 | Medium (exercises use A&L) |
| hw9.pdf | L/C combos, first-order natural response, impulses | 10 | Medium |
| hw10.pdf, hw11.pdf | Second-order/impedance; audio-system pre-lab | - | Skip |
| quiz1_s07.pdf | Short resistive/node/Thevenin problems with answer choices, then digital/MOS | 5 | Good Midterm 1 practice |
| quiz1_s04 / quiz1_f03 / quiz1_f06.pdf | Resistive networks, node method, Thevenin (plus nonlinear/MOS) | 5 | Select problems |
| quiz2_s07.pdf | Problems 1E-1G first-order transients; rest MOSFET | 10 | Midterm 2 practice |
| quiz2_f04.pdf | Thevenin, transients, MOSFET amp | 10 | Problems 1 and 3 |
| quiz2_s04.pdf, final_s07.pdf, final_f00.pdf | Mixed (MOSFET, digital, op-amp, second-order) | - | Pick individual problems (final_f00 problem 1 is op-amp) |
| notes_L1..L25, notes_L15b | Fall 2000 lecture slides | per lecture | Pair with the videos. notes_L24 (power conversion/diodes) is linked from the L25 page, although the notes page says it is unavailable |
| demo_*.pdf (32) | Lecture demonstration handouts | per lecture | demo_02, 05, 11, 17a, 18, 24 are the useful ones |

The full course zip (79-113 MB sizes listed) was skipped because it is over 60 MB.

## Licenses

- MIT OCW 6.002 S07 (videos, notes, homework, exams, demos): **CC BY-NC-SA 4.0** (footer link to creativecommons.org/licenses/by-nc-sa/4.0/ on the course pages). The local copies are for personal study only, and the files carry "Cite as: Anant Agarwal and Jeffrey Lang..." attribution.
- Agarwal & Lang textbook: commercial, all rights reserved. The OCW readings page links a PDF of the book on a third-party university server; its authorization is unclear, so I did not use or download it.
- All YouTube channels: standard YouTube license (all rights reserved, publicly posted). Stream only, no downloads.
- Khan Academy: generally CC BY-NC-SA under Khan's terms, but I did not read this on a page.

## Confidence

| Series | Confidence | Basis |
|---|---|---|
| MIT 6.002 S07 inventory, IDs, durations, transcripts | high | Every lecture page fetched; durations from YouTube lengthSeconds |
| 6.002 to OSU week mapping | medium | Based on the W22 template schedule; current ECE 201 pacing may differ |
| Engineer4Free, Question Solutions, AAE, van Biezen, Pytel, Hajimiri picks | high (existence/metadata), medium (fit) | Playlists and watch pages fetched; fit judged from titles and descriptions, not by watching |
| Organic Chemistry Tutor, Khan, CircuitBread, semiconductor picks | high (existence), medium (fit) | Watch pages fetched |
| edX 6.002x, 6.002 Fall 2000, RES.6-010 | low | Search results only |

## Unverified

- Whether MITx 6.002x / 6.002.1x is currently offered on edX.
- The standalone OCW 6.002 Fall 2000 course (404 on OCW; DSpace record seen only in search results).
- RES.6-010 details (seen only in a feed listing).
- Which week current ECE 201 covers semiconductors/fabrication (placed in week 10).
- I did not watch any supplemental video. Picks rest on title, channel, length, views and playlist position.
- Exam time limits/rules were not recorded. Homework problem counts are approximate (regex over PDF text).
- Khan Academy license not confirmed on a page.
