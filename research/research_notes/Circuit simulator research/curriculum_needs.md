# Circuit-analysis needs across the OSU ECE degree (2026-27 catalog): roadmap for a simulator built for ECE 201

Research date: 2026-10-26. The OSU catalog pages were downloaded directly and parsed; they are labelled "2026-2027 Catalog". Items marked **(inferred)** are my reasoning, not something a source states.

## 1. What is OSU's current ECE course sequence, what do the catalog descriptions say, and which textbooks are used?

### Takeaway
OSU now has a single **Electrical and Computer Engineering BS** (major code 039). It does not offer separate EE and CompE degrees. The old ENGR 201/202/203 + ECE 271/272 sophomore sequence has been replaced by a 4-credit **ECE 200–204 sophomore core**. In the junior year, students **choose 4 of 6 "Foundations" courses** (ECE 310, 320, 330, 350, 370, 380), then take 12 junior-elective and 24 senior-elective credits. A student can therefore skip electronics, power or EM entirely. A simulator that "lasts through graduation" has to cover whichever track Connor picks. The confirmed textbooks are Ulaby/Maharbiz/Furse 3rd ed. (ECE 201 and ENGR 203) and Sedra & Smith (ECE 323).

### Cited Findings
**Degree structure (2026-27)**
- The ECE BS/HBS is one major covering "communications, signal processing and controls, electronics and integrated circuits, power electronics and energy systems, materials and devices, electromagnetism, microwaves and optics, computer architecture, digital hardware design, and computer networks." It is ABET-accredited under both the Computer Engineering and the Electrical and Electronics Engineering program criteria. — [OSU Catalog, ECE BS/HBS](https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/)
- The **ECE Sophomore Core** is ECE 200 Discrete-Time Signal Processing, ECE 201 DC and Transient Circuits, ECE 202 AC and Frequency Dependent Circuits, ECE 203 Continuous-Time Signal Processing and ECE 204 Digital Logic Design, all 4 credits. The other required courses are CS 162, CS 274, ECE 353 Probability and ENGR 330. — [OSU Catalog, ECE BS/HBS](https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/)
- **Junior core:** ECE 341/342 Junior Design I/II, plus "Select four courses from" ECE 310 Semiconductor Processing, ECE 320 Electronic Circuit Design I, ECE 330 Power Up!, ECE 350 Foundations of DSP, ECE 370 Computer Organization and Assembly, and ECE 380 EM Fields and Waves (16 credits). After that come 12 junior-elective credits (any ECE/CS/AI course at 300 level or above, at least 3 from ECE) and 24 senior-elective credits (at least 16 from ECE at 400 level or above). Senior design is ECE 441/442/443 or ENGR 415/416. — [OSU Catalog, ECE BS/HBS](https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/)
- **Sample plan:** Year 2 Fall is ECE 200 + ECE 201, Winter is ECE 202, Spring is ECE 203 + ECE 204. Year 3 Fall and Winter each hold 8 credits of Foundations courses alongside 341/342. — [OSU Catalog, ECE BS/HBS plan of study](https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/)

**Catalog descriptions relevant to circuits** (all from [OSU Catalog, ECE courses](https://catalog.oregonstate.edu/courses/ece/) unless noted)
- **ECE 201 DC and Transient Circuits (4):** "circuit laws and theorems, DC circuit responses, first-order circuit behaviors, operational amplifier characteristics, and applications. Explores fundamental semiconductor devices and device fabrication." Prereqs: MTH 251, 252.
- **ECE 202 AC and Frequency Dependent Circuits (4):** "Applies circuit analysis and design techniques for alternating current (AC) and frequency-dependent circuits." Prereqs: ECE 201, and ECE 200 (which may be taken concurrently). The description gives no topic list.
- **Predecessor ENGR 202 Electrical Fundamentals II (3):** "Sinusoidal steady-state analysis and phasors… single-phase and three-phase circuits including power, mutual inductance, transformers and passive filters." **ENGR 203 (3):** "Laplace transforms, Fourier series, Bode plots, and their application to circuit analysis." **ENGR 201:** "Circuit laws and theorems. DC responses of circuits. Operational amplifier characteristics and applications." — [OSU Catalog, ENGR courses](https://catalog.oregonstate.edu/courses/engr/)
- **ECE 203 Continuous-Time Signal Processing (4):** CT LTI systems, convolution, "CT Fourier transform, CT Fourier series, and Laplace transform."
- **ECE 200 DT Signal Processing (4):** DT convolution and "complex sinusoids and phasor representation for frequency analysis," DTFS/DTFT.
- **ECE 204 Digital Logic Design (4):** "Design, minimize, and simulate combinational and sequential circuits using a Hardware Description Language (HDL)… Field Programable Gate Arrays (FPGA)." The legacy ECE 271/272 are still listed; 272 uses "computer-aided design, verification tools, and prototyping hardware."
- **ECE 320 Electronic Circuit Design I (4):** "device characteristics of diodes, MOSFETs, and bipolar junction transistors; transistor amplifier circuits and biasing techniques; small- and large-signal circuit characteristics; and, design of linear circuits." It is equivalent to the old ECE 322 Electronics I.
- **ECE 323 Electronics II (3):** "Transient operation of MOSFETs and bipolar transistors; multistage amplifiers; frequency response; feedback and stability." Prereq: ECE 322 or ECE 320. The catalog lists no "ECE 321".
- **ECE 330 Power Up! (4):** grid generation, transmission and distribution, renewables, "power conversion technologies such as DC to AC converters," energy storage, transportation electrification.
- **ECE 331/332 Electromechanical Energy Conversion (+ lab):** DC, induction, PM and synchronous machines, analysed "via space vectors." **ECE 432:** dq reference-frame machine dynamics.
- **ECE 341/342 Junior Design:** group design and fabrication. 342 "Emphasizes operation of electrical testing equipment."
- **ECE 350 Foundations of DSP / ECE 351, 352 Signals and Systems I/II:** "continuous-time and discrete-time signal, system, and circuit analysis." 350 covers sampling, z-transform, IIR/FIR, and DFT/FFT.
- **ECE 356 Systems Dynamics and Control (4):** "Models and analyzes linear continuous systems in time and frequency domains. Introduces fundamentals of single-input-single-output control system design." It is cross-listed with ME 320 and is equivalent to the old ECE 451.
- **ECE 380 EM Fields and Waves:** "static and quasi-static electric and magnetic field problems." **ECE 391 Transmission Lines (3):** "Transient and steady-state analysis of transmission line circuits." **ECE 484** Antennas, **ECE 485** Microwave Design Techniques ("high-frequency circuits and systems").
- **ECE 413 Sensors; ECE 416/417:** pn junctions and Schottky diodes, then BJT/FET device physics.
- **ECE 422 CMOS IC I (4):** "current mirrors, gain stages, single-ended operational amplifier, frequency response, and compensation." **ECE 423 CMOS IC II:** "cascoded current mirrors… fully differential operational amplifier, common-mode feedback, noise, and distortion."
- **ECE 431 Power Electronics (4):** "devices, circuits and controllers used in systems for electronic power processing." Prereqs: ECE 320/322, 323 (may be concurrent), and 350/351. **ECE 433 Power System Analysis:** real and reactive power, load flow, unbalance, stability, transients; recommended background is "Three-phase power." **ECE 437** Smart Grid. **ECE 438** EV/HEV powertrain modelling and control.
- **ECE 461/462** Communications: AM/FM, digital modulation, noise.
- **ECE 471 Energy-Efficient VLSI (4):** "logic design using CMOS transistors; analysis of power consumption and logic delay… clock design including skew, jitter… power supply noise… sub-threshold logic… transistor layouts and CAD entry." **ECE 474 VLSI System Design:** "CAD/CAE tools." **ECE 473 Microcontroller System Design:** "mixed analog and digital systems."
- **Grad courses** that seniors can take as electives with advisor approval: ECE 520 Analog CMOS, ECE 524 Phase Locked Loops, ECE 535 Adjustable Speed Drives, ECE 536 Power System Protection, ECE 539 Advanced Power Electronics, ECE 580 Network Theory, ECE 593 RF Microwave Circuit Design, ECE 621 RF IC Design, ECE 627 Oversampled Delta-Sigma Data Converters. — [OSU Catalog, ECE courses](https://catalog.oregonstate.edu/courses/ece/); 500-level electives rule from [ECE BS/HBS](https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/)
- **Fall 2026 offerings:** ECE 201 (Najim; Ecampus Boeding), 203, 204, 310, 320 (Anand; Ecampus Cain), 330 (J. Moon), 341, 351, 370, 380, 416, 422 (Yoo), 431 (Cao), 433, 464, 471 (Johnston), 482. No ECE course on the list links to a public course site. — [OSU EECS class list, Fall 2026](https://classes.engr.oregonstate.edu/eecs/)

**Textbooks**
- **ECE 201:** Ulaby, Maharbiz & Furse, *Circuit Analysis and Design*, 3rd ed. (Michigan Publishing, July 2025, 780 pp., open access, DOI 10.3998/mpub.13162125). OSU ENGR 203 (F26) also uses the 3rd edition, and W22 ENGR 201 used the 2nd. — Connor's earlier research, `C:\Users\conno\Documents\Homebase\research\ece201\report.md`; book details from [Michigan Publishing](https://services.publishing.umich.edu/Books/C/Circuit-Analysis-and-Design)
- The publisher says the book's scope runs from dc and ac analysis of "any planar, linear circuit" to Laplace and Fourier transforms. It includes Application Notes on "power supplies, CMOS inverters… signal modulators," and "Multisim is highlighted through many end-of-chapter demonstrations." — [Michigan Publishing](https://services.publishing.umich.edu/Books/C/Circuit-Analysis-and-Design)
- **ECE 323 (Spring 2026, Prof. Un-Ku Moon):** text is "Microelectronic Circuits by Sedra & Smith (& Carusone & Gaudet)," 8th-ed. sections. The reading guide covers MOSFET/BJT DC (5.1–5.3, 6.1–6.3), small-signal models and single-stage amps (7.1–7.5), current mirrors and gain cells (8.2–8.4), differential and multistage amplifiers (parts of ch. 9), high-frequency models, CS/CE high-frequency response and the open-circuit time-constant method (10.1–10.3), low-frequency response (10.8), feedback (ch. 11), and op-amp-RC and nonlinear oscillators (15.1, 15.2, 15.4). Exams are closed book with an instructor-supplied reference sheet. — [ECE 323 Spring 2026 syllabus](https://web.engr.oregonstate.edu/~moon/ece323/Spring26_syl.pdf)

### Inferences
- **(inferred)** ECE 202 probably inherits most of ENGR 202: phasors, AC power, three-phase, mutual inductance, transformers and passive filters. Frequency response and Bode plots probably move into ECE 202 from ENGR 203, which explains the "Frequency Dependent" title. Laplace and Fourier now live in ECE 203, framed as signals. The vague catalog text does not confirm this split.
- **(inferred)** The old ECE 322 → 323 chain is being replaced by ECE 320 → ECE 323. 323 still ran in Spring 2026 and accepts 320 as its prerequisite.
- **(inferred)** Every ECE student takes ECE 201, 202 and 203. That makes DC, transient, op-amp, AC phasor, frequency-response and Laplace features universally useful. Electronics (320/323), power (330/431) and EM (380/391) are each optional for any one student.
- Razavi was not found as a required text in any OSU source checked. Razavi or Gray-Meyer for ECE 422/423 is plausible but **unverified**.

### Gaps
- No public ECE 201, 202, 320, 422, 431 or 471 syllabus was found; the class list has no course-site links and Canvas is private. Textbooks for ECE 202, 320, 330, 356, 391, 422/423 and 431 are unknown.
- Lab topics for the ECE 201 2-hour weekly lab are unknown.
- Whether ECE 202 covers two-port networks is unknown. No OSU description mentions two-ports, though ECE 580 Network Theory exists at grad level.

## 2. For each course, which simulator features matter?

### Takeaway
ECE 201 needs a robust linear DC/transient core with ideal and non-ideal op-amps plus a basic diode. ECE 202/203 add AC phasors, AC sweep with Bode plots, coupled inductors, three-phase sources and Laplace transfer functions. ECE 320/323 require real nonlinear device models (diode, BJT, MOSFET via SPICE `.model`/`.subckt`), DC operating-point and sweep, small-signal AC, frequency response and stability. Later courses split by track:
- power: switching transients, PWM, magnetics
- analog IC: noise, distortion, Monte Carlo, foundry models
- VLSI: CMOS transient delay and power
- RF/EM: transmission lines, S-parameters

### Cited Findings
- **ECE 201 scope** (laws and theorems, DC response, first-order circuits, op-amp characteristics, semiconductor devices) — [OSU Catalog ECE 201](https://catalog.oregonstate.edu/courses/ece/). The textbook targets "any planar, linear circuit… driven by dc or ac sources, or by more complicated waveforms such as pulses and exponentials." Its application notes include power supplies and CMOS inverters. — [Michigan Publishing](https://services.publishing.umich.edu/Books/C/Circuit-Analysis-and-Design)
- **ENGR 202 → ECE 202 scope:** phasors, single- and three-phase power, mutual inductance, transformers, passive filters. **ENGR 203:** Laplace, Fourier series, Bode plots applied to circuits. — [OSU Catalog ENGR](https://catalog.oregonstate.edu/courses/engr/)
- **Electronics (320/323) scope:** diode/MOSFET/BJT characteristics, biasing, small- and large-signal behaviour, transient operation, multistage amps, frequency response, feedback and stability. — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/). The ECE 323 reading list adds current mirrors, differential pairs, open-circuit time constants, and op-amp-RC and nonlinear oscillators. — [ECE 323 syllabus](https://web.engr.oregonstate.edu/~moon/ece323/Spring26_syl.pdf)
- **Concrete device models used in OSU's electronics sequence:** the ECE 323 page distributes HSPICE models for an "NPN322 transistor model, NMOS transistor model, PMOS transistor model, CD4007 transistor models, CD4069UB transistor models, 741 op amp subcircuit model, 3904 (NPN) subcircuit model, 3906 (PNP) subcircuit model." Lab datasheets cover the CD4007 MOSFET array, CD4013 dual D flip-flop, CD4040 counter, CD4069 inverter, LM555, LM741, DAC0808 8-bit DAC and ADC0804 8-bit ADC. The page includes demos "using SWEEP, simulating multivibrator/oscillator" and "An old HSPICE example from ECE 322: bjtamp.sp." — [Moon ECE 323 page](https://web.engr.oregonstate.edu/~moon/ece323/)
- **Power track:** ECE 330 covers "DC to AC converters." ECE 331 covers machines "via space vectors." ECE 431 covers "devices, circuits and controllers" for power processing. ECE 433 covers real and reactive power, load flow, unbalance and stability, with three-phase as background. ECE 438 covers powertrain modelling and control. — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **Analog IC track:** ECE 422 covers mirrors, gain stages, op-amp, frequency response and compensation. ECE 423 covers cascodes, fully differential op-amps, CMFB, "noise, and distortion." ECE 524 covers PLLs and ECE 627 delta-sigma converters. — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **Digital/VLSI track:** ECE 204 simulates logic in an HDL on FPGAs. ECE 471 covers CMOS logic "power consumption and logic delay," clock skew and jitter, supply noise, DVFS and sub-threshold logic. ECE 473 covers "mixed analog and digital systems." — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **EM/RF track:** ECE 391 covers "transient and steady-state analysis of transmission line circuits." ECE 485 and 593 cover microwave and RF circuit design. — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **Signals/controls:** ECE 351/352 cover "signal, system, and circuit analysis" in CT and DT. ECE 356 covers time- and frequency-domain linear systems and SISO control design. — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **Other universities' equivalents (scope check):**
  - Georgia Tech ECE 2040 (Fall 2026) covers Kirchhoff's laws, nodal and mesh analysis, network theorems, transients, sinusoidal steady state, frequency response and power. Outcomes include "Analyze small RLC circuits by hand" and frequency response of L/C circuits. Text: Dorf & Svoboda 9th ed. — [GT ECE 2040 F26 syllabus](https://syllabus.gatech.edu/sites/default/files/2026-04/ECE%202040%20Fall%202026%20Syllabus.pdf). The GT Europe sections list DC, theorems, op-amps, first/second-order circuits, sinusoidal steady state and power. — [GTE ECE 2040 syllabus](https://europe.gatech.edu/sites/default/files/2025-09/ECE%202040%20syllabus_Sp_1.pdf)
  - MIT 6.002 covers lumped models "for resistors, sources, inductors, capacitors, and transistors," digital circuits, op-amps, differential equations for energy-storage circuits, and "simple models to represent non-linear and active elements-such as the MOSFET." — [MIT OCW 6.002 syllabus](https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/pages/syllabus/)
  - Berkeley EECS 16B covers phasor analysis, Kirchhoff's laws, RLC, op-amp signal processors and feedback. — [Berkeley EECS 16B catalog](https://www2.eecs.berkeley.edu/Courses/EECS16B). Course guides add Bode plots, analog filters, transistors, control and linearization. — [HKN 16B guide](https://hkn.eecs.berkeley.edu/courseguides/EE/16B)

**Course → feature matrix.** The feature mapping is my synthesis from the descriptions above; the topic column is sourced.

| Course (when) | Sourced topics | Simulator features needed (inferred priority) |
|---|---|---|
| ECE 201 (Y2 Fall) | KCL/KVL, theorems, DC, first-order, op-amps, semiconductor devices | DC operating point with node voltages and branch currents; dependent sources (VCVS/VCCS/CCVS/CCCS); Thevenin/Norton extraction (open-circuit V, short-circuit I, R_th); superposition (toggle sources); DC sweep; transient RC/RL with step, pulse and switch events (t=0 switching, initial conditions); op-amp models: ideal (virtual short), finite gain A, rail saturation, slew rate, GBW; basic diode (ideal or exponential); power-absorbed readout with sign check |
| ECE 202 (Y2 Winter) | phasors, AC power, three-phase, mutual inductance, transformers, filters; probably frequency response (inferred) | AC steady-state solve with phasor readout (magnitude and angle); complex power (P, Q, S, pf), max power transfer; 3-phase Y/Δ sources and loads, line and phase quantities; coupled inductors (k, dot convention) and ideal transformer; AC sweep with Bode magnitude and phase on log axes; −3 dB, f0, Q and bandwidth markers; RLC second-order transients (over/under/critical damping) |
| ECE 203 (Y2 Spring) | Laplace, CT Fourier series/transform | s-domain transfer function H(s) from a circuit; pole-zero plot; impulse and step response; Laplace/behavioural sources; Fourier spectrum (FFT) of transient output; periodic non-sinusoidal sources |
| ECE 204 (Y2 Spring) | HDL, FPGA | Low priority: course uses HDL tools. Gate-level logic is optional |
| ECE 320 → 323 (Y3) | diodes, BJT, MOSFET, biasing, small-signal, multistage, frequency response, feedback, stability, oscillators | Nonlinear Newton DC solve; SPICE `.model` diode, BJT (Gummel-Poon) and MOSFET (Level 1 minimum, ideally BSIM); `.subckt` import (741, 2N3904/3906, CD4007); DC sweep and nested/parametric sweep; small-signal AC about the operating point; transistor op-point table (gm, rπ, ro, region); rectifier, zener, clipper and clamper transients; loop gain and phase margin; oscillator start-up transient; differential pair and current mirror |
| ECE 330 / 431 (Y3–4, power track) | DC-AC converters, power electronics devices and controllers | Ideal and real switches, PWM sources, diode reverse recovery (nice-to-have); long transients with small timestep at switching edges; inductor ripple and CCM/DCM; average, RMS and efficiency measurements; saturable or coupled magnetics; feedback controller blocks |
| ECE 331/433 (power track) | machines, three-phase, load flow, unbalance | Three-phase phasor and per-unit analysis (partial). Load flow and machine dq models are beyond a circuit simulator |
| ECE 351/352/356 (signals, controls) | CT/DT systems, SISO control | Transfer-function blocks, step response, Bode and Nyquist plots, root locus (nice-to-have); often done in MATLAB/Python (inferred) |
| ECE 391 / 485 (EM/RF track) | transmission-line transients and steady state; microwave | Lossless T-line element (Z0, delay); reflections and bounce diagrams; Smith chart and S-parameters (advanced) |
| ECE 422/423 (analog IC) | mirrors, op-amps, compensation, CMFB, noise, distortion | Noise analysis, Fourier/THD, corner and Monte Carlo, foundry PDK models. In practice this is Cadence/HSPICE territory (inferred) |
| ECE 471/474 (VLSI) | CMOS delay, power, clock, layout CAD | Transistor-level transient of CMOS gates, propagation delay and energy measures. Layout is out of scope |
| ECE 473 / 341-342 / 441-443 | mixed analog/digital, design projects, test equipment | Datasheet part models (LTspice/vendor libraries), 555, ADC/DAC behavioural models; mixed-signal is nice-to-have |

### Inferences
- **(inferred)** For ECE 201 the must-haves are a linear MNA solver, dependent sources, switching events, op-amp non-idealities and readable sign conventions. The catalog's "semiconductor devices" line means at least a diode should be present from day one.
- **(inferred)** The biggest step up in difficulty is ECE 320/323. The solver must handle nonlinear devices, and Moon's distributed models come as SPICE text files. A simulator that cannot parse `.model`/`.subckt` cannot use the course's own models.
- **(inferred)** Laplace and Bode features serve ECE 202, 203, 323 (frequency response, stability), 356 (controls) and 431 (converter control loops). Building them well gives high value per effort.

### Gaps
- No OSU source states whether ECE 202 includes two-port networks, or whether three-phase stays in ECE 202 or moved to ECE 330.
- Exact ECE 201 op-amp depth (slew rate, GBW) is unknown without the syllabus. Ulaby treats ideal op-amps, finite-gain models and saturation (from general knowledge of the book; not verified in this pass).

## 3. Which simulators do these courses officially use or recommend, and are there OSU lab requirements?

### Takeaway
OSU's only publicly documented simulator choice is **HSPICE (Synopsys) in ECE 322/323**: Moon's page supplies HSPICE netlists, models and UNIX helper scripts, and links PSpice Student as optional evaluation software. The ECE 201 textbook is built around **NI Multisim** demonstrations. No current OSU page requiring LTspice, Falstad, PLECS or Cadence was found. Peer schools commonly use LTspice for circuits and electronics labs, and use Cadence or PLECS in analog-IC and power-electronics courses.

### Cited Findings
- The ECE 323 page lists an "HSPICE manual," "HSPICE help," a "Simple HSPICE demo," and UNIX shell scripts (`hsp`, `hstrip`, `hpurge`). It also points to "Appendix C & D of Sedra & Smith text," links "ECE CAD tools info/tutorial" and PSpice Student (cadencepcb.com), and states "Lab packet (sold in IEEE store) from ECE 322 will be used." — [Moon ECE 323 page](https://web.engr.oregonstate.edu/~moon/ece323/)
- The EECS CAD tools page linked from Moon's site (eecs.oregonstate.edu/comp/doc/tools/cad_pages.html) now redirects to the generic engineering.oregonstate.edu/EECS homepage, so the current OSU CAD tool list could not be read. (Direct fetch, 2026-10-26.)
- The Ulaby textbook uses "Multisim… a SPICE circuit simulator available from National Instruments… highlighted through many end-of-chapter demonstrations," plus MathScript for matrix work. — [Michigan Publishing](https://services.publishing.umich.edu/Books/C/Circuit-Analysis-and-Design). The first edition shipped a CD with Multisim and 43 chapter demos (from a search snippet of an NI education page, not fetched). — [NI DOC-3996](https://decibel.ni.com/content/docs/DOC-3996)
- The ECE 201 W27 section has a weekly 2-hour lab with a $65 fee. The syllabus is Canvas-only. — `C:\Users\conno\Documents\Homebase\research\ece201\report.md` (Connor's earlier sourced research)
- ECE 272 uses "computer-aided design, verification tools, and prototyping hardware." ECE 204 uses HDL simulation with FPGAs. ECE 474 "Introduces the use of CAD/CAE tools." — [OSU Catalog ECE](https://catalog.oregonstate.edu/courses/ece/)
- **Peers:**
  - GT ECE 2040 uses TESSAL lab kits (F26) or NI myDAQ with ELVIS software (GT Europe). Neither syllabus names a SPICE tool. — [GT F26](https://syllabus.gatech.edu/sites/default/files/2026-04/ECE%202040%20Fall%202026%20Syllabus.pdf); [GTE](https://europe.gatech.edu/sites/default/files/2025-09/ECE%202040%20syllabus_Sp_1.pdf)
  - Illinois ECE 205 runs LTspice-based labs (Thevenin, regulators, BJT, 555, RMS/AC). — [Illinois ECE 205 labs](https://courses.physics.illinois.edu/ece205/sp2021/labs.html). Illinois ECE 469 Power Electronics has an LTspice page. — [Illinois ECE 469](https://courses.grainger.illinois.edu/ece469/fa2018/ltspice). Toronto ECE354 and RPI ECSE-2010 also use LTspice (RPI pairs it with Analog Discovery). — [Toronto ECE354](https://www.eecg.toronto.edu/~johns/ece354/labs/ece354_labs.html); [RPI Lab 1](https://sites.ecse.rpi.edu/~ssawyer/CircuitsSpring2022_all/Labs/Unit1/Lab01.pdf). These come from search summaries; the pages were not individually fetched.
  - A 2025 ASEE paper favours LTspice over PSpice and Multisim because it is "full-featured… yet freely downloadable." — [ASEE paper](https://nemo.asee.org/public/conferences/365/papers/45378/view)
  - PLECS is a widely used power-electronics simulator. It runs standalone or as a Simulink blockset and has student licences. — [Plexim PLECS](https://www.plexim.com/plecs)
  - Cadence Virtuoso, Spectre and Innovus are the standard tools in peer schools' VLSI and analog-IC courses (e.g. GT ECE 6133). — [GT ECE 6133 Cadence Lab](https://limsk.ece.gatech.edu/course/ece6133/lab/)

### Inferences
- **(inferred)** Connor should expect HSPICE- or Spectre-style netlists in electronics. ECE 422/423/471/474 probably use Cadence, but OSU confirmation was not found. Power electronics probably uses LTspice, PLECS or Simulink, also unconfirmed.
- **(inferred)** A search summary mentioned a 2010 OSU ECE 323 manual with an LTspice appendix, so LTspice has likely been used informally at OSU. The underlying document (a Scribd upload) was not verified.

### Gaps
- No confirmed simulator for ECE 201's lab, ECE 202, 320, 330, 341/342, 391, 422/423, 431 or 471. These would need Canvas syllabi or the instructors themselves (Najim and Boeding for 201, Anand and Cain for 320, Yoo for 422, Cao for 431, Johnston for 471).
- OSU's licensed CAD tool list (Cadence, Synopsys, Mentor, Vivado or Quartus) could not be retrieved; the page has moved.

## 4. What would make a personal simulator worth keeping versus switching to LTspice in upper division?

### Takeaway
LTspice is free, full-featured, and the default at peer schools. By ECE 320/323, OSU hands out SPICE-format models and netlists. A personal simulator stays useful only if it interoperates with SPICE (netlist import and export, plus `.model`/`.subckt` parsing) and offers what LTspice lacks for learning. That means step-by-step, explainable analysis: showing the MNA equations, Thevenin and phasor derivations, sign-convention checks, and links into Connor's Homebase notes. Trying to beat LTspice at raw device simulation is not worth it.

### Cited Findings
- OSU electronics coursework distributes models and examples as SPICE text (`.sp` netlists, `npn322`, `nmos`, `pmos`, `ua741`, `t2n3904` files) and uses parameter sweeps and oscillator simulations. — [Moon ECE 323 page](https://web.engr.oregonstate.edu/~moon/ece323/)
- Sedra & Smith's appendices on SPICE are the referenced simulation background in ECE 323. — [Moon ECE 323 page](https://web.engr.oregonstate.edu/~moon/ece323/)
- LTspice is described as free and full-featured, which is why programmes adopt it over PSpice and Multisim. — [ASEE paper](https://nemo.asee.org/public/conferences/365/papers/45378/view)
- ECE 201 exams in the OSU circuits sequence lean toward closed book with an instructor reference sheet and no calculator, based on the ENGR 203 and ECE 323 evidence. — [ECE 323 syllabus](https://web.engr.oregonstate.edu/~moon/ece323/Spring26_syl.pdf); `C:\Users\conno\Documents\Homebase\research\ece201\report.md`

### Inferences
These are all my recommendations; none is sourced.
- **Keep-worthy features, by priority:**
  1. **SPICE netlist import and export** (R, L, C, K, V/I with DC/AC/PULSE/SIN/PWL, E/F/G/H, D, Q, M, X, T; `.op .dc .ac .tran .param .step .meas`). Coursework netlists then run in both tools, and LTspice or HSPICE can cross-check results.
  2. **`.model`/`.subckt` import** so the ECE 323 files (741, 2N3904/3906, CD4007) load unchanged.
  3. **An "explain" layer:** show node equations and the MNA matrix, the Thevenin derivation, phasor arithmetic and the operating-point region of each transistor. LTspice does none of this, and it serves hand-analysis exams.
  4. **Hand-analysis checkers:** compare Connor's answer with the simulated value; ideal versus finite-gain op-amp comparison.
  5. **Scripting and API access** (Python or JS) for sweeps and plots, and for Homebase problem generation and auto-checking.
  6. **Plot export** (CSV/SVG) and Bode, pole-zero and step plots.
  7. A **quick schematic → netlist** round-trip.
- **Where to defer to LTspice or Cadence:** real converter switching transients with vendor MOSFET models (ECE 431), BSIM foundry PDKs, noise, Monte Carlo and layout (ECE 422/423/471/474), and RF S-parameters (ECE 485/593). Building these is poor return on effort.
- **Suggested build order aligned with Connor's schedule:**
  1. ECE 201 (W27): linear DC, dependent sources, transients, op-amp models, diode.
  2. ECE 202/203: AC phasor, AC sweep and Bode, coupled inductors, 3-phase, H(s) and pole-zero.
  3. Before ECE 320/323: nonlinear Newton solver, BJT/MOSFET models, SPICE import.
  4. Track-dependent extras: T-line, switches and PWM, transfer-function blocks.

### Gaps
- No source compared personal or educational simulators (Falstad, CircuitJS, Qucs-S, ngspice) for use through a full degree; that comparison is outside this scope and was not researched.
- How strictly OSU graders require specific tool outputs (e.g. HSPICE listings versus any SPICE) is unknown.
