# Circuit Bench: full plan (approved October 2026; phase 1 built, see section 15)

A circuit bench inside Homebase. You draw a circuit, it solves it exactly, and you can see
it two ways: as a live schematic, or as a 3D landscape where voltage is height. It checks
your hand work and explains its answers. It is built for ECE 201 first and grows with the
OSU sequence (202, 203, then 320/323), so it stays useful through the degree.

Background research, with sources for every claim:
[research/reports/Circuit simulator research.md](../research/reports/Circuit%20simulator%20research.md).
Working mockup of the look: [design/circuits-mock.html](circuits-mock.html).

Contents: 1 What it is · 2 Rules · 3 Look and feel · 4 Mechanics · 5 Study features ·
6 Architecture · 7 Solver · 8 Graphics engine · 9 Data, server, Claude ·
10 Quality and testing · 11 Phases · 12 Build order · 13 Risks · 14 Decisions · 15 As built

---

## 1. What it is, and why build it

No existing tool combines all three of these:
- live, visual intuition, like Falstad or EveryCircuit;
- exact, trustworthy answers, like LTspice;
- explanation (no tool does this).

Multisim Live, which Ulaby's book is built around, shut down on Sept 15, 2026.

The research also shows what actually helps learning:
- **Predict first, then see.** Predicting before a demo roughly doubles what you learn from it.
- **Pictures of voltage.** Voltage as height had the strongest evidence.
- Animated current dots, which every simulator shows off, made no measurable difference to
  learning. Here they are an honest, optional layer.

LTspice stays the tool for heavy and professional simulation. The bench exports to it,
and later imports from it.

## 2. The rules (from Circuit Foundry and the research)

1. **The solver decides everything you see.** Every number, height, color, glow and moving
   marker comes from a solver result.
   - Graphics never advance the simulation.
   - Short display easings (≤200 ms) are labeled as easing.
   - Under reduced motion they are instant.
2. **The bench never quietly fixes a broken circuit.** Falstad hides a 100 MΩ resistor to
   ground on floating nodes. The bench stops instead, says "node 3 is floating", and
   highlights the problem.
3. **Exact when possible.** It shows 72/13 V next to 5.538 V, the way hand answers look.
4. **Assumptions are always visible:** ideal wires, ideal meters, the op-amp model in use, and so on.
5. **Meaning never rides on color alone.** Every color has a number or shape beside it. The
   voltage palette stays readable with color-blindness. There are no red/green pairs.
6. **Small files and plain modules.** Each file is a few hundred lines. Homebase's no-build
   rule holds: browser ES modules, vendored libraries.
7. **Nothing is ever lost.** Every action can be undone. Saving is automatic, and a local
   draft covers a dropped Wi-Fi connection.
8. **Editing is never blocked.** A circuit with an error stays fully editable. The error
   banner stays until the problem is fixed, and the last good solution is shown dimmed.

## 3. Look and feel

### Overall direction: "precision instrument on a warm desk"

Homebase is calm and warm: cream and charcoal, terracotta for ECE 201. The bench keeps that
outside the work area. The work area itself is a darker, quieter **bench mat** (in both
themes), so light, voltage and current read clearly. Think of a well-made audio instrument
on a wooden desk, not a gaming HUD.

- **Typography:** Inter for numbers and labels, with tabular figures so values don't jitter
  as they change. Fraunces for headings.
- **Voltage palette:** one diverging scale centered on ground. Negative voltages are cool
  slate blue, 0 V is neutral warm gray, positive voltages rise through ochre to bright
  amber. Brightness rises steadily with |V|, so it stays readable with color-blindness and
  in grayscale. A legend shows the scale in volts.
- **Current:** small chevrons that travel along wires.
  - Their spacing is fixed and even, so they never "pile up" behind a resistor.
  - Speed is proportional to |I| on a log scale, and the speed scale is shown.
  - Direction is conventional current, with an electron-flow toggle.
- **Power:** resistors that absorb power warm up with a soft glow and a heat shimmer on
  high-power parts. Sources that deliver power show a small "delivering" ring. The signed
  number is always one tap away.
- **Motion:** spring-based, interruptible, 150–220 ms, never decorative.

### The 2D schematic (the main working view)

The schematic is drawn as **SVG**, so it is crisp at any zoom and every part is a real,
focusable element with a label that screen readers can use.

- **Symbols:** clean, standard US symbols, drawn with care: 1.6 px ink strokes, rounded
  joints, symbol bodies filled with the mat color.
- **Wires:** each wire takes the color of its node voltage, with a thin brighter core.
  Hovering or selecting a node lights the whole net and dims everything else.
- **Values:** values and node voltages sit on small pill labels that move to avoid
  overlapping.
- **Placing parts:** a ghost preview follows the pointer and snaps to the grid with a small
  pulse. When a wire end lands on a terminal, the terminal blooms, so you know it connected.
  Unconnected terminals show open rings.
- **Readouts on parts:** each part can carry a small live readout chip (V, I, P), and you
  choose which ones to show. On wires you can pin a **mini scope**, a tiny live waveform
  (EveryCircuit's idea).
- **Meters:** voltmeter and ammeter probes are **draggable tools**, the way PhET does them.
  - Drop the voltmeter's red and black leads on two nodes and it reads the difference.
  - Drop the ammeter on a wire and it reads the current through it, with direction.

### The 3D landscape (a second view of the same circuit)

3D isn't a better way to *edit* a circuit, but it is a better way to *understand voltage*.
So the schematic stays the place you build, and 3D is a view you can open beside it, or
full screen on its own.

- **The board:** a matte ceramic slab with a soft grid. The circuit's layout is the same as
  in 2D.
- **Height is voltage:** every node is a plateau, a flat tile at height = its voltage.
  - The tiles are lit from inside with the voltage color.
  - Ground is the floor.
  - A scale post at the side shows volts.
- **Parts:**
  - *Resistors* are ramps between plateaus, with a real banded resistor body lying along the ramp.
  - *Sources* are vertical lifts (a battery or source pillar) that raise charge from one level to the next.
  - *Capacitors* are two plates whose gap fills as they charge.
  - *Inductors* are coils.
  - *Op-amps* are a triangular block on their own output plateau.
- **Current:** glowing beads roll along wires and ramps, at the same speed scale as in 2D.
- **Power:** resistor bodies glow. In high quality there is a gentle bloom on
  high-power parts.
- **What it teaches by itself:**
  - *Moving ground:* drag the ground flag to another node and the whole landscape rises or
    sinks as one piece. Only differences matter.
  - *KVL:* walk any loop and you end at the same height you started.
  - *KCL:* each junction plateau can show "in = out" arrows with currents. The research found
    height models help most with series circuits, so this covers parallel circuits and current
    division.
- **Camera:** orbit, pan and zoom with damping. Double-click a part to fly to it. Preset views
  (top, three-quarter, side view showing voltage as a profile). On phones, one finger orbits
  and two fingers pinch.
- **Labels:** crisp HTML labels pinned in 3D. They fade with distance and never overlap.

### Plots and other panels

- **Scope:** for transient results, a smooth multi-trace oscilloscope.
  - Draggable cursors with Δt and ΔV readouts.
  - Markers for t = 0⁻ and t = 0⁺, and τ marked on RC and RL curves.
  - Autoscale, plus pinch and scroll zoom.
- **Bode plot (phase 2):**
  - Magnitude and phase with a draggable frequency cursor.
  - −3 dB, f₀ and Q markers.
  - Moving the cursor updates the phasor view and the 3D landscape at that frequency.
- **Phasor view (phase 2):**
  - Rotating phasors linked to the scope trace.
  - Drag the time cursor and the phasors rotate to match.
  - Phase and lead/lag are documented trouble spots, so this view gets special care.
- **Pole-zero plot (phase 2):** poles and zeros of H(s) shown together with the step response.

### Layout

**Desktop:**
```
+------------------------------------------------------------------------------------+
| ◂ Circuits · ECE 201  "Week 4 nodal example"   Build  Solve  ▣ 2D ▣ 3D ▣ Split  ⋯ |
+-------+----------------------------------------------+-----------------------------+
| parts |                                              | Inspector / node table      |
|  R    |        schematic (or 3D, or both)            |  n1  12 V                   |
|  V  I |                                              |  n2  72/13 V = 5.538 V      |
|  C  L |   meters, probes, readout chips              |  KCL at n2: 3.23 = 1.85+1.38|
|  ⏚ ⊳  |                                              | Equations ▸  Thevenin ▸     |
|  ◇ ⟂  |                                              | Assumptions ▸               |
+-------+----------------------------------------------+-----------------------------+
| scope / Bode / phasor dock (opens when there is something to show)                  |
+------------------------------------------------------------------------------------+
```
**Phone:**
- The canvas fills the screen.
- The parts palette is a bottom sheet.
- The inspector is a second sheet.
- The view switcher sits in the top bar.
- The scope is a swipe-up panel.
- No sideways scrolling, and every tap target is at least 44 px.

## 4. Mechanics (how editing works)

### Placing parts
- Tap or click a part, then tap or click where it goes.
- **Insert** repeats the last part.
- The grid is coarse (one grid step = one terminal pitch), so near-misses can't happen.

### Wiring
- **Touch:** tap a terminal, then tap another. The wire routes itself orthogonally.
- **Desktop:** the same, or press **W** and click a path. You can also drag from a
  terminal.
- Dropping a wire on the middle of another wire joins them with a junction dot. Two wires
  that just cross are never joined.
- Auto-routing avoids parts and prefers the fewest bends. You can add a bend by
  dragging a wire's middle.

### Moving
- **Drag keeps wires attached**: they stretch and re-route. Alt-drag detaches.
- Box-select or Shift-click several parts, then move, rotate or delete them together.
- **R** rotates, **X** and **Y** mirror. The same buttons are on the selection toolbar for touch.

### Values
- Double-click, press **E**, or tap the value chip to edit.
- Accepts "4.7k", "2.2u", "2.2µ", "1meg", "3e-3" and "10 mA".
- Shows how it read the value ("4.7 kΩ"). "1M" asks whether you mean milli or mega
  (SPICE reads it as milli).
- A slider beside the value gives live what-if changes, with log steps for R, C and L.

### Labels and nets
- Name any node ("Vout"), and that name is used everywhere.
- Net labels with the same name are connected.
- The ground symbol defines 0 V. Placing a second ground still means the same node.

### Editing basics
- **Undo and redo:** Ctrl+Z / Ctrl+Y and two buttons. Every change is undoable, including
  moving ground.
- Copy and paste, also between circuits. Duplicate is Ctrl+D.
- **Zoom and pan:** wheel or pinch, Space-drag or two-finger drag. **F** fits the circuit
  to the view.

### Keyboard-only editing
- Arrow keys move focus between parts and nodes.
- Enter edits, and the other shortcuts work as above.
- A "describe circuit" sheet lists every node and what touches it. This doubles as the
  screen-reader view.

### Live solving
- The circuit re-solves within about 50 ms of every change. A small status shows
  "solved · exact" or the error.
- While you drag a value slider, it solves on every frame.

## 5. Study features (what LTspice can't do)

- **Sandbox:** build freely and see everything.
- **Predict first** (the default for exercises):
  - Asked quantities stay hidden behind "?" chips until you type a prediction, either a
    number or a ranking.
  - Then it reveals the answer, shows the gap, and lets you explore.
  - Open answers rather than multiple choice, because the research found they teach better.
- **Check my work:**
  - Type your hand-solved node voltages or currents.
  - Each one is marked right (within tolerance) or wrong.
  - For a wrong value it names the broken law: "KCL at node 2: in 1.2 mA, out 1.5 mA."
- **Show equations:**
  - One nodal equation per node, in readable form, e.g. "Node 2: (v₂ − v₁)/R₁ + v₂/R₂ = 0".
  - Then the MNA matrix, generated from exactly what was solved, rendered with KaTeX.
  - Phase 2 adds mesh equations for planar circuits.
- **Thevenin / Norton:**
  - Pick two nodes and get V_th, R_th and I_N, exact when possible.
  - It also shows how it found them (open-circuit voltage, short-circuit current).
  - "Swap in equivalent" replaces the rest of the circuit with the Thevenin equivalent so you
    can compare.
- **Superposition:**
  - Turn each source off (a V source becomes a short, an I source becomes open).
  - See each source's share as a stacked bar per node, and see that the shares add up.
- **Power check:** a table of every part's signed power, showing that delivered equals
  absorbed. This drills the passive sign convention.
- **Goal exercises:** for example, "make R3's current 2 mA without touching the source".
  These are goals rather than recipes, as the PhET research recommends.
- **Mistake log:** wrong predictions and failed checks are saved with a tag such as sign
  convention, current division, Thevenin R or initial condition. They feed Homebase's mistake
  log and spaced review.
- **Open in simulator:** on Homebase's 65 generated ECE 201 problems, the problem's own
  circuit opens on the bench in predict-first mode. Book problems are rebuilt by hand. Book
  figures are never copied.

## 6. Architecture

```
  editor (2D SVG) ─┐                         ┌─ schematic overlay (voltages, chips, chevrons)
  touch / keys ────┼─> Document (JSON) ──┐   ├─ inspector / tables / equations
  undo stack ──────┘    (one source of   │   ├─ scope / Bode / phasor / pole-zero
                         truth)          │   └─ 3D landscape (Three.js, lazy)
                                         v              ^
                     compile: nets (union-find),        │ snapshots (immutable)
                     element list, checks               │
                                         v              │
                  Solver worker: analyses (op, tran, ac, sweep, thevenin, ...) ─┘
```

- **Document.** This is the circuit file: parts, parameters, wires, labels and layout. It
  is the only thing editors change, and every change is a command (undoable, mergeable,
  serializable). Format details are in section 9.
- **Compile.** This step turns the document into a netlist.
  - Wires and labels are merged into nodes with union-find, and ground becomes node 0.
  - It outputs a typed element list and runs the structural checks.
  - It is pure, fast and the same in every view.
- **Element registry.** Each part type is one module with:
  - its pins and parameters, with units and defaults;
  - its `stamp` functions for DC, AC, transient and nonlinear analysis;
  - its 2D symbol, its 3D model builder and its readouts;
  - its SPICE export/import and its text description.

  This is what lets later phases add parts without rewriting anything.
- **Solver worker.** The analyses run in a Web Worker, so the interface stays at 60–120 fps
  even during long sweeps.
  - The same modules also run directly in the page (used by tests) and in Node (used by
    pytest).
  - Requests carry a revision number, and stale results are dropped.
  - Every result is an immutable **snapshot**: values per node and per element, the method
    used (exact or float), warnings, and the assumptions that applied.
- **Views.** Each view is a pure function of document + snapshot + view settings. Views
  never call the solver and never change the document; they send commands.
- **One store** holds the document, the selection, the current snapshot and the view
  settings, and emits change events. There is no framework. The code is small enough for
  plain ES modules and the style Homebase already uses.

### File layout
```
app/static/circuits/
  core/      doc.js  commands.js  history.js  store.js  compile.js  units.js
  elements/  index.js  resistor.js  vsource.js  isource.js  dependent.js  opamp.js
             switch.js  capacitor.js  inductor.js  ground.js  label.js  meters.js
             (phase 2) coupled.js  threephase.js  (phase 3) diode.js  bjt.js  mosfet.js  subckt.js
  solver/    field.js (float, exact fraction, complex, polynomial-in-s)  lu.js  assemble.js
             checks.js  op.js  tran.js  ac.js  sweep.js  thevenin.js  superpose.js
             equations.js  newton.js (phase 3)  worker.js  api.js
  editor/    canvas.js  place.js  wire.js  route.js  select.js  keys.js  touch.js  values.js
  views/     overlay.js  chips.js  current.js  inspector.js  equations.js  scope.js
             bode.js  phasor.js  polezero.js  palette.js (voltage colors)
  three/     landscape.js  models.js  materials.js  labels.js  quality.js  camera.js
  study/     predict.js  check.js  goals.js  log.js
  io/        spice_out.js  spice_in.js (phase 3)  json.js
  app.js     (wires the page together)
app/static/vendor/three/   (pinned Three.js r170 plus the add-ons used; works offline)
app/circuits.py            (services: save, list, attempts, mistakes, vectors)
app/routes/circuits.py     (pages + JSON API)
app/templates/circuits.html, circuits_list.html, circuits_selftest.html
tests/test_circuits*.py    tests/circuit_vectors/*.json
```

## 7. Solver

**Method: modified nodal analysis (MNA),** the formulation SPICE uses. Each element
"stamps" its contribution into a matrix. Elements whose current can't be written from
node voltages add one current unknown: V sources, voltage-output dependent sources, the
ideal op-amp output, and 0 V ammeters.

**Number types ("fields").** The same assembly and LU code runs over four number types:
- **Float64** (fast path on typed arrays), used for everything.
- **Exact fractions** (BigInt), used when every value is a simple decimal. Results
  show 72/13 V. If numbers grow huge, it falls back to float and says so.
- **Complex** (phase 2), for phasors and AC sweeps.
- **Polynomials in s with exact coefficients** (phase 2), giving the exact H(s) of small
  linear circuits for pole-zero plots and Laplace work.

**LU.** Dense LU with partial pivoting. Homework circuits have fewer than 100 unknowns,
so this takes well under 1 ms on a phone. A pivot-ratio guard reports near-singular
systems instead of returning garbage.

**Checks before solving.** Each check gives its own message and highlights the parts
involved:
- no ground;
- floating node or floating sub-circuit (no path to ground);
- a loop of voltage sources and wires;
- a cut-set of only current sources (current with nowhere to go);
- an ideal op-amp with no negative-feedback path, or both inputs tied to fixed voltages;
- a short-circuited voltage source;
- a capacitor loop with only sources (transient).

Wires and closed ideal switches **merge nodes**; they are not tiny resistors. That keeps
the matrix clean.

**Analyses:**

| Analysis | Phase | Notes |
|---|---|---|
| DC operating point | 1 | Exact when possible |
| Parameter sweep | 1 | What-if slider; plot any value against R, V, ... |
| Thevenin / Norton | 1 | Open-circuit V and short-circuit I between two nodes, plus R_th by test source (handles dependent sources) |
| Superposition | 1 | One solve per source, with the others turned off |
| Transient | 1 | C and L as companion models; trapezoidal steps with a backward-Euler step at t=0 and at every switch or source edge (stops trapezoidal ringing, as SPICE does); fixed visible step in phase 1; t=0⁻ solved with C open and L shorted; optional "use initial conditions" |
| Error-controlled transient | 2 | TR-BDF2 with local truncation error control, for RLC and stiff circuits |
| AC phasor at one frequency | 2 | |
| AC sweep / Bode | 2 | Log sweep, with adaptive refinement near peaks |
| Exact H(s) | 2 | Poles and zeros found by polynomial root finding |
| FFT of a transient | 2 | |
| Nonlinear DC and transient | 3 | Newton-Raphson; junction voltage limiting; gmin stepping, then source stepping; ngspice tolerances (RELTOL 1e-3, VNTOL 1 µV, ABSTOL 1 pA) |
| Small-signal AC around the operating point | 3 | |

**Part models:**
- **Phase 1:** R; independent DC, step and pulse V and I sources; VCVS, VCCS, CCVS, CCCS;
  ideal op-amp; finite-gain op-amp; ideal switch with a switching time; C; L; ground; ideal
  meters.
- **Phase 2:** sine and AC sources, coupled inductors (k), ideal transformer, three-phase
  Y and Δ sources, op-amp with rails and slew rate.
- **Phase 3:**
  - Diode: ideal, then constant-drop (the way homework solves it), then Shockley.
  - Zener.
  - BJT: Ebers-Moll, then a Gummel-Poon subset.
  - MOSFET: square law (level 1) with λ.
  - Subcircuits.

**Explanations come from the solve.** Each stamp records which element made it, so
"Show equations" prints exactly the system that was solved. That is never a separate
re-derivation that could disagree.

## 8. Graphics engine

### 2D
- SVG for the parts, symbols and labels. These need to be crisp and accessible.
- A single `<canvas>` overlay draws the current chevrons and the glows, so hundreds of
  moving markers stay cheap.
- Animation runs on one requestAnimationFrame loop that sleeps when nothing moves.

### 3D
- **Engine:** Three.js r170 (WebGL2), vendored, loaded only when the 3D view opens (about
  170 kB compressed).
- **Look:** physically based materials (`MeshPhysicalMaterial` for the glass-like plateau
  tiles with clearcoat, `MeshStandardMaterial` for the ceramic board and resistor bodies).
  Image-based lighting comes from a generated studio environment (`RoomEnvironment` +
  PMREM), so it needs no downloaded image files. ACES tone mapping, sRGB output.
- **Voltage glow:** each plateau's emissive color comes from the voltage palette.
  Brightness is clamped, so the board stays readable.
- **Current beads:** one instanced mesh, with positions computed in the vertex shader
  from (time × speed scale × branch current) along each wire's path.
  - Thousands of beads cost almost nothing.
  - Speed comes straight from the snapshot.
- **Shadows:** soft contact shadows (a blurred depth pass under the board, re-rendered
  only when the circuit changes). Real-time shadow maps are high quality only.
- **Post-processing (high quality):**
  - ground-truth ambient occlusion (GTAO), for depth;
  - selective bloom, only on power glow and beads;
  - SMAA anti-aliasing.
- **Labels:** HTML labels via `CSS2DRenderer`, so the text is crisp, selectable and themed,
  with collision fading.
- **Transitions:**
  - When a value changes, plateau heights ease to the new solution in ≤200 ms, labeled as
    display easing; under reduced motion they jump.
  - Transient playback uses solver samples with a stated time base ("1 ms of circuit time
    = 1 s on screen") and linear interpolation between samples.

### Quality tiers
Picked automatically, with a manual override in the ⋯ menu:

| Tier | For | Settings | Target |
|---|---|---|---|
| Battery | phone, laptop on battery | No post, contact shadow only, pixel ratio ≤ 1.5, FXAA | 60 fps |
| Balanced | Radeon 890M | Pixel ratio 2, MSAA, contact shadow | 60 fps |
| Cinematic | RTX 5070 Ti, plugged in | Native pixel ratio, GTAO, bloom, SMAA, shadow map | 120 fps |

- A frame-time governor lowers resolution before it drops effects.
- Rendering happens only on demand, plus during animation. The 3D view pauses when hidden.
- Colors redraw on Homebase's `homebase-theme` event, so dark and light both look right.

### Accessibility
- Every 3D state also exists as numbers in the inspector.
- 3D is never the only way to see something.
- The 3D camera can be driven from the keyboard.

## 9. Data, server and Claude

### Circuit document (JSON, versioned)
```json
{ "format": "homebase-circuit", "version": 1, "title": "...", "course": "ECE201",
  "parts": [{"id": "R1", "type": "R", "at": [4, 2], "rot": 0,
             "params": {"R": {"text": "2k", "value": 2000}}}],
  "wires": [{"id": "w1", "path": [[2,2],[4,2]]}],
  "labels": [{"at": [6,2], "name": "Vout"}],
  "ground": "auto", "analysis": {"type": "op"},
  "study": {"mode": "predict", "ask": [{"node": "Vout"}], "keys": "computed"} }
```
- The file stores both the typed text and the parsed number for every value.
- Nets are computed from the layout. An imported netlist with no drawing stores explicit
  nets and is still valid.
- Each version change has a migration function. Files never become unreadable.

### Database tables
- `Circuit`: title, course, week, source (me, claude, generated or imported),
  problem link, document, created/updated, archived.
- `CircuitAttempt`: predictions, checks and results, misconception tags, time spent.
  These feed the mistake log and Homebase's progress pages.

All writes go through `app/circuits.py` services, so they show up in the activity log.

### Routes
- `/circuits`: your circuits, grouped by course and week.
- `/circuits/new`, `/circuits/{id}`: the bench.
- `/circuits/selftest`: runs the solver test vectors in any browser, including the phone.
- JSON API: get, save (autosave debounced to 1 s; a localStorage draft covers dropped
  connections), duplicate, export (`.json` and SPICE `.cir`), attempts.

### Claude tools (MCP)
- `circuits_list`
- `circuits_get`: the document, a netlist and the latest solution.
- `circuits_save`: Claude can build a circuit from a problem for you to open.
- `circuits_attempts`

Everything Claude saves is marked as done by Claude.

### Links into the rest of Homebase
- **Notes:** "Add to notes" saves a static snapshot image and a link back to the circuit.
- **Problems:** "Open in simulator" on generated problems.

### SPICE
- **Phase 1:** export, ready to paste into LTspice. The exporter adds the 0 V sense sources
  that current-controlled sources need, and writes "meg" for mega.
- **Phase 3:** import (R C L V I E F G H D Q M, `.model`, `.subckt`, `.param`, `.op`,
  `.tran`, `.ac`, `.dc`), tested on the ECE 323 course model files (741, 2N3904/3906,
  CD4007, ...). Imported circuits with no drawing get a simple automatic layout that you
  can tidy up.

## 10. Quality and testing

"It all works properly" has to be proven, because you'll trust these answers for homework.

1. **Solver unit tests** (`node --test`, run from pytest; Node 26 is already installed and
   is only used for tests).
   - Every stamp is tested on circuits with known closed-form answers: dividers, bridges,
     ladders, every dependent source, the op-amp configurations, Thevenin.
   - Exact mode must match the answer exactly.
2. **Referee tests against Homebase's own Python solver.** pytest generates hundreds of
   random and textbook-style circuits with `app/generators/circuits_dc.py`. That solver is
   already tested and checks KCL and power balance itself. The JS solver must match every
   one. RC/RL circuits are checked against `circuits_transient.py`.
3. **Physics properties** on random circuits: KCL at every node, power balance, superposition,
   reciprocity, and Thevenin equivalence (the swapped-in equivalent gives the same load
   current).
4. **Accuracy of the time-stepping.** On an RC step, the error must shrink at the rate
   theory predicts: like h for backward Euler, like h² for trapezoidal. Trapezoidal must
   not ring after a switch.
5. **Every error path.** Each malformed circuit gives its named message, never NaN.
6. **Golden problems.** A set of Homebase ECE 201 problems with official answer keys. The
   bench must reproduce each key.
7. **Phase 3 cross-check.** The same netlists run through ngspice in the browser
   (`eecircuit-engine`, loaded on demand), with its license and size checked first. This
   also becomes the "verify with SPICE" button.
8. **Interface checks** in the browser pane on every build step:
   - laptop width and phone width, light and dark mode;
   - screenshots reviewed before each commit;
   - frame rate measured at each quality tier;
   - no console errors.
9. **Page tests in pytest:** routes, saving and loading, migrations, MCP tools, and that
   the self-test page passes.

Performance budget:
- DC solve of a 50-node circuit: < 2 ms.
- Re-solve and redraw after an edit: < 16 ms.
- The bench is interactive within 300 ms of opening.
- 3D opens in < 1 s on a laptop and < 2 s on a phone.

## 11. Phases (what each covers)

| Phase | Course | Adds |
|---|---|---|
| 1 | ECE 201 | Everything above marked phase 1: editor, exact DC, dependent sources, op-amps, Thevenin, superposition, transients with switches, 2D live view, 3D landscape, scope, study modes, saving, SPICE export, Claude tools, "Open in simulator" |
| 2 | ECE 202 / 203 | AC phasors (peak vs RMS clearly labeled), complex power and power factor, coupled inductors, transformers, three-phase, Bode with cursor, phasor view linked to the scope, 3D at a chosen frequency (height = magnitude, rotation shown as phase color), RLC with error-controlled steps, exact H(s), pole-zero, step/impulse, FFT |
| 3 | before ECE 320 / 323 | Newton solver, diodes (ideal, constant-drop, real), zener, BJT, MOSFET, operating-point table (region, gm, rπ, ro), small-signal AC, SPICE import with `.model` / `.subckt`, ngspice "verify" |
| 4 | electives | Switches and PWM for power electronics, transmission lines, mixed digital gates (Circuit Foundry ideas), whatever your track needs |

## 12. Build order (today and after)

Each step ends with tests passing, screenshots at laptop and phone width, and a commit.

1. **Solver core:** document, compile, number types, LU, assembly, the error checks, DC op,
   exact mode. Node test runner and the Python referee tests.
2. **Bench page and editor:** route, template, store, history, placing, wiring, routing,
   dragging, values, labels, saving, phone layout.
3. **Live 2D view:** voltage-colored nets, chips, current chevrons, power glow, inspector,
   node table with KCL, errors highlighted, meters, assumptions, SPICE export.
4. **Study tools:** equations, Thevenin, superposition, power check, sweep slider,
   predict first, check my work, mistake tags.
5. **3D landscape:** vendored Three.js, board, plateaus, parts, beads, labels, camera,
   quality tiers, split view, ground moving.
6. **Transients:** C, L, switches, step and pulse sources, t=0⁻, scope with cursors,
   3D playback with a time base.
7. **Homebase fit:** list page, attempts, "Open in simulator", MCP tools, notes snapshot,
   golden problems, docs.
8. **Phase 2:** complex number type, AC sources, phasor solve, Bode, phasor view, coupled
   inductors and transformers, three-phase, TR-BDF2, H(s), pole-zero, FFT.
9. **Phase 3:** Newton solver and devices, SPICE import, operating-point table, ngspice
   verify.

**Today:** steps 1–7 (all of phase 1, finished and tested), then as far into step 8 as
quality allows.
- I won't rush the solver: a wrong answer is worse than a missing feature.
- At the end of the day I'll report exactly what's done, what's tested, and what's left.

## 13. Risks and how they're handled

- **A solver bug teaches you something wrong.**
  - Three independent checks: closed-form answers, the Python referee, and later ngspice.
  - Physics properties checked on random circuits.
  - Golden problems with official keys.
- **Wiring feels fiddly.** The coarse grid, tap-tap wiring, open-terminal rings and
  rubber-band dragging handle it. I'll test with real week 1–10 circuits at phone width.
- **3D is pretty but slow on the phone.** Quality tiers, render on demand, a frame-time
  governor, and the 3D view is never required.
- **Big files grow until no one can maintain them** (Circuit Foundry's App.tsx). The module
  layout above, with each file under about 400 lines, is checked in review.
- **The height view doesn't help with parallel circuits** (what the research found). The KCL
  arrows at junctions and current-division readouts cover that. Your logged predictions
  will show whether it works for you.
- **Phase 3 arrives after ECE 320 starts.** It's scheduled long before 320. SPICE export
  already lets you cross-check in LTspice.

## 14. Decisions (defaults from the first draft; say if you want any changed)

1. **Its own "Circuits" tab in the nav,** serving 201 now and 202, 203 and 320 later.
2. **Three.js copied into Homebase,** so it works offline.
3. **Node is used only to run the solver tests.**
4. **Exercises default to predict first,** with Sandbox one tap away.
5. **Current markers off by default in 2D, on in 3D,** with a one-tap toggle in each.

## 15. As built (phase 1, October 26, 2026)

Phase 1 (build steps 1–7) is done. Where the build differs from the plan above:

**Files.** The layout follows section 6 with fewer, larger modules (each still under about
400 lines):
- `elements/`: `passive.js` (R, C, L), `sources.js` (V, I), `dependent.js`, `opamp.js`,
  `misc.js` (ground, label, switches, meters), `common.js`.
- `core/`: undo is document snapshots in `store.js` (no separate `commands.js` /
  `history.js`); `rational.js` holds the exact fractions.
- `solver/`: `theorems.js` (Thevenin and superposition), `isolate.js` (parts not connected
  yet, or reached only through capacitors at DC), `flows.js` (wire currents), `modes.js`
  (natural time constants), `run.js` (op, sweep and transient for the worker), `netlist.js`
  (the netlist format the tests use).
- `editor/`: `edit.js`, `input.js`, `hit.js`, `route.js`, `symbols.js` (the 2D symbols),
  `labels.js`, `inspector.js`, `persist.js` (saving), `palette.js` (the parts palette).
- `views/`: `overlay.js`, `current.js`, `panels.js`, `plot.js` (scope and sweep plots),
  `palette.js` (voltage colors), `snapshot.js` ("Add to notes").
- `study/`: `study.js` (predict first, sweeps), `check.js`, `tools.js` (equations,
  Thevenin and superposition cards), `transient.js` (over time, the scope, playback).
- `io/spice.js` (export), `selftest/cases.js` (the golden problems).
- Server: `app/circuits.py`, `app/routes/circuit_routes.py`, `app/templates/circuit.html`,
  `circuits_list.html`, `circuits_selftest.html`. Three.js is in
  `app/static/vendor/three-r170/`.
- Tests: `tests/js/*.test.mjs` (run by `tests/test_circuits_solver.py`),
  `tests/test_circuits.py`, `tests/test_circuits_bridge.py`. Test vectors are generated
  inside the tests instead of being stored in `tests/circuit_vectors/`.

**The document** (section 9) is simpler: each part is `{id, type, x, y, rot, flip, params}`
with every value kept as the text you typed, each wire is one straight segment `{a, b}`, and
labels and ground are parts. Nets are always worked out from the drawing.

**Number types:** float and exact fractions. Complex numbers and polynomials in s come with
phase 2.

**Study features not built yet:** "swap in equivalent" on the Thevenin card (the card does
compare the equivalent's load current with the full circuit's), stacked bars for
superposition (it's a table), ranking predictions, and goal exercises.

**Added along the way:**
- The circuit's own time constants (`modes.js`, the eigenvalues of its state equations)
  set the time window when there's more than one capacitor or inductor. Series capacitors
  share one time constant that neither sees on its own.
- When the textbook gives the 0⁻ values (two inductors in parallel, say, whose DC split the
  circuit can't fix), those parts are held at the given values before t = 0.
- A named terminal left open on purpose (a and b of a port) isn't flagged as a loose end, and
  terminals named a and b get a "Thevenin at a–b" card (the plan's "pick two nodes").
- Generated problems carry their bench drawing (`app/generators/bench_bridge.py`): ladders are
  laid out automatically, the op-amp amplifiers and the Δ-Y bridge by hand-made layouts. Tests
  check that the bench's answers match each generator's own (node voltages, vₒ, R_eq). 52 of
  the 65 ECE 201 generated problems have one; the other 13 have no circuit to draw.

**Decision 3 changed slightly:** Node still isn't needed to use the bench, but Claude's
circuit tools use it when it's there (`scripts/bench_solve.mjs`), so Claude checks each
drawing with the bench's own solver. Without Node, Claude can still save circuits, unchecked.

**Verification:** 57 Node tests (closed-form circuits, every dependent source, op-amps,
switching transients and their accuracy order, editing, and the golden problems), agreement with Homebase's Python
solver on 360 random circuits and on every generated problem (11 generators × 15 seeds), and
12 Ulaby exercises whose worked solutions the bench reproduces, which `/circuits/selftest`
re-runs on any device.
