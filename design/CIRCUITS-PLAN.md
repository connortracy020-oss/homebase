# Circuits: phase 1 plan (draft for your OK)

A circuit bench inside Homebase: draw a circuit, solve it exactly, see the voltages
as a 3D landscape, and check your own hand work against it. Phase 1 covers everything
ECE 201 needs (weeks 1-10). Later phases follow the OSU sequence (202, 203, then 320).

Background: [research/reports/Circuit simulator research.md](../research/reports/Circuit%20simulator%20research.md)
(sources for every claim below are there).

**Why build it at all.** No existing tool does all three of: live, visual intuition
(Falstad, EveryCircuit), exact trustworthy answers (LTspice), and explanation (none).
Multisim Live, the tool Ulaby's book is built around, shut down Sept 15, 2026.
The research also says what matters most for learning: **predict before you see the
answer** (about doubles what you get from a demo) and **pictures of voltage**
(voltage as height had the strongest evidence). Animated current dots, the feature every
simulator shows off, made no measurable difference, so they're an optional layer here.

## 1. The rules it keeps (from Circuit Foundry, plus the research)

1. **Every number, height, color and glow comes from the solver.** Nothing decorative
   that looks like data. Graphics never advance the simulation.
2. **Never quietly fix a broken circuit.** Falstad ties floating nodes to ground with a
   hidden 100 MΩ resistor; we stop and say "Node 3 is floating" and highlight it.
3. **Exact when possible.** 12/7 V, shown next to 1.714 V, the way hand answers look.
4. **Assumptions are visible.** A small "this circuit assumes" panel: ideal wires, ideal
   meters, ideal op-amp (when it is), etc.
5. **Small files.** Circuit Foundry's App.tsx reached 5,400 lines. Here: plain JS
   modules of a few hundred lines each, no build step (Homebase's rule).
6. **Color is never the only cue.** Voltages always also have numbers; the voltage color
   scale comes from Homebase's theme, not red/green.

## 2. How it looks

A new **Circuits** page. Desktop:

```
+-----------------------------------------------------------------------------------+
| Circuits · ECE 201    [My circuits ▾]  [New]     Build | Solve | 3D     [Check my work] |
+---------+--------------------------------------------------------+----------------+
| Parts   |                                                        | Node table     |
|  R  V  I|        (schematic, SVG on a dot grid)                  |  n1  12 V      |
|  C  L  ⏚|                                                        |  n2  12/7 V    |
|  op-amp |   hover a part:  R2 · 4 kΩ · 0.43 mA · absorbs 0.73 mW |    = 1.714 V   |
|  dep.   |                                                        |  ground  0 V   |
|  switch |                                                        | Equations ▸    |
|         |                                                        | Assumptions ▸  |
+---------+--------------------------------------------------------+----------------+
| scope (transient only): v(n2) vs t, cursor readout, "0⁻ / 0⁺" markers             |
+-----------------------------------------------------------------------------------+
```

Phone: the schematic fills the screen; parts come from a bottom sheet; the node table and
equations are a second sheet; the mode buttons sit in the top bar. No sideways scrolling.

**Building.** Tap a part, tap where it goes. Wire by tapping one terminal, then another
(EveryCircuit's way; no precise dragging on a phone). On a laptop also: W wire,
R rotate, X/Y mirror, E edit value, Del, Esc, Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V.
Dragging a part keeps its wires attached. A junction dot appears only where a wire
*ends* on another wire (never where two wires just cross), and every unconnected
terminal shows a small open circle, so a near-miss wire is obvious.
Values take SI prefixes ("4.7k", "2.2u", "2.2µ", "1meg") and the field shows how it read
them ("4.7 kΩ"); an ambiguous "1M" asks whether you meant milli or mega.

**Solve view.** Every node gets its voltage; hover or tap a part for its current and
**signed power** ("absorbs 0.73 mW" / "delivers 2.4 mW", which drills the passive sign
convention). Selecting a node highlights it everywhere at once: schematic, node table,
3D, scope. Optional current markers (conventional current by default, electron-flow
toggle), evenly spaced so they never "pile up" behind a resistor, speed labeled as a
picture of size, not real electron speed. Off under reduced motion.

**3D view: the potential landscape.** The same circuit, lifted: every wire of a node is a
flat plateau at height = its voltage (1 grid unit = a scale you can set, shown on an axis).
Resistors are ramps between plateaus, sources are vertical lifts, ground is the floor.
Move the ground and the whole landscape rises or falls together: only differences matter.
Walk any loop and you end where you started (KVL you can see). Resistors can glow by the
power they absorb (with the number on tap). Three.js (small, phone-friendly), loaded only
when you open 3D, drawn only when something changes. The research found height models
help a lot with series circuits but not parallel ones, so the 3D view pairs with the
node table's KCL readout at each junction ("in 3 mA = out 1 mA + 2 mA").

**Transient (switches, RC/RL).** A switch with a time ("opens at t = 0"). The bench solves
the circuit *before* the switch (capacitors open, inductors short) for the t = 0⁻ values,
then runs the circuit after the switch, exactly how the book poses these problems. The
scope plots any node or element; the cursor reads values; the 3D landscape can play the
transient with a stated time base ("1 ms of circuit = 1 s on screen").

## 3. Study modes (the part LTspice can't do)

- **Sandbox**: build and see everything.
- **Predict first** (default for exercises): values are hidden until you type your
  prediction for the asked quantities (numbers or a ranking, not multiple choice; the
  research found open answers teach better). Then it shows the truth and the gap.
- **Check my work**: type your hand-solved node voltages (or a current); the bench says
  which are right, and for a wrong one names the equation it breaks:
  "KCL at node 2 doesn't balance: in 1.2 mA, out 1.5 mA."
- **Show equations**: the bench prints the nodal equation for each node in readable form
  ("Node 2: (v₂ − v₁)/R₁ + v₂/R₂ = 0") and the matrix, straight from what it solved.
- **Thevenin finder**: pick two nodes; it gives V_th, R_th (and I_N), exact when possible,
  and can swap the rest of the circuit for its Thevenin equivalent so you can compare.
- **Superposition**: turn sources off one at a time (V becomes a short, I becomes open),
  see each one's share, and see them add up.
- **What-if slider** on any value, everything updating live.

Predictions and misses are saved (with a tag like "sign convention", "current division",
"Thevenin R") and feed the mistake log, so you and Claude see patterns.

**Open in simulator** appears on the 65 generated ECE 201 problems: their circuit opens
on the bench with the same layout (the generators already know where every part goes).
For book problems you can rebuild the circuit yourself (we never copy book figures).

## 4. How it works inside

**Solver (vanilla JS, in the browser):** modified nodal analysis (the method SPICE uses).
- Parts in phase 1: resistor, independent V and I sources (DC, step, pulse), all four
  dependent sources, ideal op-amp (checks it has negative feedback), finite-gain op-amp,
  switch (by merging nodes, not a tiny resistor), capacitor, inductor, ground, ammeter and
  voltmeter as ideal tools.
- Dense LU with pivoting (homework circuits are tiny, under a millisecond on a phone),
  run twice: in exact fractions (BigInt) when values are simple, and in floating point.
- Checks before solving, each with its own message and the offending parts highlighted:
  floating node, no ground, a loop of voltage sources / wires, current sources in series
  with nothing else, op-amp without feedback.
- Transient: trapezoidal steps with a backward-Euler step at t = 0 and at each switch or
  source edge (avoids the ringing SPICE also avoids); fixed step you can see and change.

**Python stays the referee.** Homebase's existing solver (`app/generators/circuits_dc.py`,
tested, self-checking KCL and power) and the RC/RL checker (`circuits_transient.py`)
write a set of test circuits with answers to JSON; the JS solver must match every one.
Node 26 is on the laptop, so those tests run from pytest through Node (dev only; nothing
in the app needs Node). A `/circuits/selftest` page runs the same tests in any browser,
including the phone.

**Files and storage.**
- Each circuit is Homebase's own versioned JSON: parts, values (as typed and as numbers),
  explicit nets, layout. Saved in the database (new `Circuit` table, through
  `services.py`, so it shows in the activity log and Claude can read it), and exportable
  as a `.json` file.
- **SPICE export** from day one (`.cir` text you can paste into LTspice for a second
  opinion; it adds the 0 V sense sources current-controlled sources need).
- New MCP tools so Claude can help: `circuits_list`, `circuits_get` (netlist + solution),
  `circuits_save` (e.g. Claude builds a circuit from a problem for you to open).

**Code layout** (each file small):
```
app/static/circuits/
  solver/  mna.js  lu.js  rational.js  transient.js  checks.js  thevenin.js  equations.js
  model/   circuit.js (JSON format, versions)  units.js (SI parser)  spice.js (export)
  editor/  canvas.js  tools.js  wires.js  keys.js  touch.js
  views/   readouts.js  table.js  scope.js  landscape3d.js  current.js
  study/   predict.js  check.js
  app.js   (wires the page together)
app/static/vendor/three/   (pinned Three.js build, so it works without the internet)
app/routes/circuits.py   app/templates/circuits.html   app/circuits.py (services)
tests/test_circuits.py   tests/circuit_vectors/ (shared test circuits)
```

## 5. Build steps (about 7 commits, each tested and screenshotted)

1. **Solver core + referee tests.** MNA, LU, exact fractions, the error checks; the
   Python-written test vectors; Node runner in pytest; self-test page. No UI yet.
2. **Page and editor.** `/circuits` page, parts palette, placing, tap-tap and W wiring,
   drag with attached wires, junctions, open-terminal markers, SI values, undo, save/load
   (database), phone layout, dark mode.
3. **Solve view.** Node voltages, hover/tap readouts with signed power, node table with
   KCL per junction, error highlighting, assumptions panel, SPICE export.
4. **Study tools.** Show equations, Thevenin finder, superposition, what-if slider,
   predict-first and check-my-work, mistake-log tags.
5. **3D landscape.** Three.js (vendored), plateaus/ramps/lifts, movable ground, linked
   selection, power glow, optional current markers, reduced motion, phone performance.
6. **Transients.** C, L, switches, step/pulse sources, t = 0⁻ operating point, scope with
   cursors, 3D playback with a stated time base; checked against `circuits_transient.py`.
7. **Homebase fit.** "Open in simulator" on the generated problems, MCP tools for Claude,
   a golden set of ECE 201 problems whose official answers the bench must reproduce, docs.

Steps 1-4 are enough for weeks 1-8 of ECE 201 (everything before capacitors); step 6 is
needed by week 9. All of it is before the term starts.

## 6. Later phases (so it lasts through the degree)

- **Phase 2 (ECE 202/203):** AC: complex solve, phasors with peak vs RMS clearly labeled,
  a rotating phasor linked to the scope trace (phase and lead/lag are documented trouble
  spots), complex power, coupled inductors and transformers, three-phase, Bode plots with
  −3 dB / f₀ / Q markers, second-order RLC with error-controlled steps, H(s) and pole-zero
  plots, FFT of a transient.
- **Phase 3 (before ECE 320/323):** diodes (ideal and constant-drop first, the way homework
  does them; then the real exponential model), BJT and MOSFET, a nonlinear (Newton) solver,
  **SPICE import including `.model` and `.subckt`**, tested on the actual ECE 323 course
  model files (741, 2N3904/3906, CD4007...), an operating-point table (region, gm, rπ),
  and a "verify with SPICE" button running ngspice in the browser. If this phase isn't
  ready by ECE 320, you'd switch to LTspice, so it has a deadline.
- **Phase 4 (depends on your electives):** power switches and PWM, transmission lines.
  Things like noise analysis, foundry chip models and RF stay with LTspice/Cadence.

## 7. Not in phase 1

AC/phasors, diodes and transistors, SPICE import, Falstad import, automatic layout of
an imported netlist (ELK made Circuit Foundry's diagrams cramped; drawn layouts read
better), and turning a photo of a schematic into a circuit (the research says AI can
find the parts but still gets the connections wrong; a later "AI draft you correct" mode
with the local Qwen model is possible).

## 8. Questions (defaults in bold)

1. Where does it live? **Its own "Circuits" tab in the nav** (it'll serve 202, 203 and
   320 too), or a section inside the ECE 201 course page.
2. Three.js: **copied into Homebase (works offline, about 170 kB)**, or loaded from the CDN.
3. OK to use **Node (already installed) as a test-only tool** for the solver tests?
4. Exercises **default to predict-first**, with Sandbox one tap away?
5. Current markers **off by default** (the evidence says they don't help much), or on?
