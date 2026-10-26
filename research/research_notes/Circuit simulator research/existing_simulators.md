# Existing Circuit Simulators: Landscape for an Educational Analog Simulator (2D schematic + truthful 3D)

Research date: 2026-10-26. Scope: tools students and engineers use for learning ECE circuit analysis (DC, RC/RL, op-amps, AC/phasors, filters, diodes, transistors). Facts are sourced inline. Items with no source are under Inferences or Gaps. Several vendor pages render with JavaScript and could not be read (PhET sim pages, CircuitLab membership page, NI EOL letter), so some details come from secondary copies and are flagged.

Headline news as of Oct 2026:
- **Multisim Live reached end of life on Sept 15, 2026.**
- **Falstad CircuitJS1 was rewritten in TypeScript as version 5.0, released Oct 18, 2026.** Releases 5.0.1 to 5.0.3 followed through Oct 25, and a C++/Qt native port is in progress.
- **Several new MIT-licensed browser engines appeared in 2025-2026:** spice-ts (pure TypeScript SPICE) and repath (Rust compiled to WASM).

---

## Q1. What analyses does each tool support (DC op, transient, AC sweep/Bode, parameter sweep, noise, Fourier)?

### Takeaway
The tools split into two camps:
- **Real-time "interactive" simulators** (Falstad CircuitJS1, EveryCircuit, iCircuit, PhET, SimulIDE, Tinkercad, DCACLab) run a continuous transient simulation. Some add scope-based FFT or Bode views. Only EveryCircuit and iCircuit advertise a Bode or AC view among them.
- **SPICE-class batch simulators** (LTspice, ngspice and its front-ends KiCad, Qucs-S and EEcircuit, CircuitLab, Multisim) offer the full set of analyses: .op, .dc sweep, .tran, .ac, .noise, .four and parameter stepping.

No single mainstream tool combines Falstad-style live animation with SPICE-grade AC/Bode/sweep analysis on the same schematic. That gap is the opening for the new tool.

### Cited Findings

**Falstad CircuitJS1 (web, GPL)**
- It runs a continuous time-stepped transient simulation. The time step can be changed in Edit > Other Options, and "smaller steps are more accurate but slower, and high frequencies require smaller steps" — [Falstad directions](https://www.falstad.com/circuit/directions.html)
- "File > Find DC Operating Point" instantly charges all capacitors — [Falstad directions](https://www.falstad.com/circuit/directions.html)
- Sources can be DC, sine, square, triangle, sawtooth or pulse, with frequency and DC offset — [Falstad directions](https://www.falstad.com/circuit/directions.html)
- The scope has a "scope spectrum" (FFT) feature, credited to Ben Hayden — [pfalstad/circuitjs1 README](https://github.com/pfalstad/circuitjs1)
- Solver internals:
  - The solver is MNA (Ax = B, ground row omitted), with stamp() called once per element and doStep() called each step — [CircuitJS1 INTERNALS.md](https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md)
  - Capacitors and inductors use companion models (a resistor in parallel with a current source), with a choice of backward Euler ("more stable, less oscillation when switched suddenly") or trapezoidal ("more accurate for LRC circuits and filters but less stable") — [INTERNALS.md](https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md)
  - Nonlinear devices are linearized with a tangent line, iterated until they converge, and the voltage change per iteration is limited. Linear-only circuits are LU-factored once — [INTERNALS.md](https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md)
- An Oct 12, 2026 commit says the sparse solver "resets and converts only stamped entries" — [pfalstad/circuitjs1 commit log via GitHub API](https://github.com/pfalstad/circuitjs1/commits/master)
- The UIUC ECE 110 handout says students should eventually move to LTspice, which "provides better precision, better visualization tools … the ability to add our own components" — [UIUC ECE110 Falstad handout (PDF)](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)

**EveryCircuit (web, Android, iOS; proprietary)**
- Its engine is "custom-built for speed and interactivity," and the site claims one-click simulation from simple resistor circuits to transistor-level oscillators and mixed-signal designs — [everycircuit.com](https://everycircuit.com/)
- Analysis tools include transistor I-V curves, AC analysis with Bode plots, and XY mode — [everycircuit.com](https://everycircuit.com/)
- The app store listing claims the app uses "nonlinear semiconductor device equations" and "realistic device models." This is vendor marketing — [AppFollow iOS listing](https://apps.appfollow.io/ios/everycircuit/797157761?country=us)

**CircuitLab (web; proprietary)**
- It has a proprietary "extended-precision numerical solver core" plus a mixed-mode event-driven engine, with SPICE-like models — [circuitlab.com](https://www.circuitlab.com/)
- It supports frequency-domain (small-signal) simulation, parameter stepping, arbitrary Laplace transfer-function blocks, and time-domain plots with markers, signal math and unit-aware expressions — [circuitlab.com](https://www.circuitlab.com/)

**LTspice (Windows, macOS; freeware)**
- Analyses are transient, noise, AC, DC, DC transfer function, DC operating point and Fourier. The latest version is 26.0.2 (July 25, 2026), per the Wikipedia infobox. The article body still says XVII is the latest, so the article is internally inconsistent — [Wikipedia: LTspice](https://en.wikipedia.org/wiki/LTspice)
- .step and .meas can be combined, for example to plot stepped efficiency against load current — [ADI app note via mikrocontroller.net](https://www.mikrocontroller.net/attachment/442375/Efficiency.pdf)
- A .noise tutorial covers input- and output-referred noise — [Analog Devices LTspice](https://www.analog.com/en/ltspice)

**ngspice (CLI and shared library; open source)**
- It has nonlinear DC, nonlinear transient and linear AC analyses, plus transmission lines and mixed-signal circuits. Input is netlists only, with no schematic editor. It reads PSpice, LTspice and HSpice model libraries — [ngspice.sourceforge.io](https://ngspice.sourceforge.io/); [mankier ngspice package](https://mankier.com/package/ngspice)

**KiCad (Eeschema simulator, GPL-3.0)**
- It runs ngspice. Built-in modes are AC Sweep, DC Transfer, Operating Point and Transient, plus custom simulations. A probe tool selects nets to plot voltage and pins to plot current — [kicad.org/discover/spice](https://www.kicad.org/discover/spice/)
- The KiCad 9 simulator UI is unchanged from KiCad 8 and uses roughly ngspice-44. Generic Simulation_Spice library parts let students simulate without hunting for vendor models — [KiCad forum: simulation examples](https://forum.kicad.info/t/simulation-examples-for-kicad8-kicad9-eeschema-ngspice/45546)

**Qucs-S (desktop, GPL-2.0)**
- It is a front-end with no engine of its own. Ngspice is the recommended default; Xyce (Sandia, parallel, for large circuits) and SPICE OPUS are alternatives, and QucsatorRF ships for microwave work — [Qucs-S docs: choosing a backend](https://qucs-s-help.readthedocs.io/en/latest/overview/choosing-a-sim-backend.html)
- Version 25.2.0 came out Sept 6, 2025 — [linux.org.ru news](https://www.linux.org.ru/news/opensource/18072043)
- The repo was still actively pushed on Oct 25, 2026 — [GitHub API ra3xdh/qucs_s](https://github.com/ra3xdh/qucs_s)

**EEcircuit (web, MIT)**
- It is ngspice compiled to WebAssembly with Emscripten. Input is a schematic (with manual netlists also mentioned). Plots use webgl-plot, results export to CSV, and everything runs locally — [EEcircuit GitHub](https://github.com/eelab-dev/EEcircuit)
- The engine is published as npm `eecircuit-engine`. You call `sim.setNetList(ngspiceNetlist)` and then `await sim.runSim()`. Its README example uses `.tran` — [EEcircuit-engine README](https://github.com/eelab-dev/EEcircuit-engine)
- Inference: any ngspice analysis such as .ac or .noise should be available, since it is full ngspice.

**spice-ts (TypeScript-native SPICE, MIT; new in 2026)**
- Analyses:
  - DC op (Newton-Raphson with voltage limiting)
  - DC sweep
  - Transient (BE and trapezoidal, adaptive timestep)
  - AC small-signal (dec/oct/lin, native complex sparse LU)
- Device models: R, L, C, controlled sources, Shockley diode, Ebers-Moll BJT, Level-1 MOSFET, BSIM3v3, VDMOS, plus subcircuits
- Accuracy is checked against ngspice on a published 100-circuit parity benchmark
- It returns typed diagnostics such as `FLOATING_NODE`, `NO_DC_PATH_TO_GROUND` and `VOLTAGE_SOURCE_LOOP`
- Source: [spice-ts README](https://github.com/spicets/spice-ts)

**repath (Rust compiled to WASM, MIT; new in 2025-26)**
- It covers DC, transient, AC and mixed-signal analysis, using MNA, Newton-Raphson, companion models and adaptive timestepping
- Not yet implemented: sparse solver, noise and distortion analysis, MOSFET models beyond Shichman-Hodges
- Source: [repath README](https://github.com/Agustin-Delgado/repath)

**PhET Circuit Construction Kit (DC; AC+DC)**
- It uses MNA. "For the AC simulations, we use companion models for … Inductors and Capacitors" — [PhET CCK model.md](https://github.com/phetsims/circuit-construction-kit-common/blob/main/doc/model.md)
- The older teacher guide says capacitors and inductors are linearized each step, with dynamic timestep subdivision — [PhET CCK teacher guide (PDF)](https://clixplatform.tiss.edu/phet/files/teachers-guide/circuit-construction-kit-ac-guide.pdf)
- The AC version adds capacitors, inductors and AC sources, and can graph current and voltage against time — [CLIx PhET mirror](https://clixplatform.tiss.edu/phet/en/simulation/circuit-construction-kit-ac.html)

**iCircuit (iOS, Android, Mac, Windows; proprietary)**
- It is "Always simulating," with no run button. Microcontroller pins share the same solver as the analog parts
- The oscilloscope offers FFT, Bode and XY views and shows RMS, peak-to-peak and frequency. Version 1.16 added SPICE model and subcircuit import plus Verilog/VHDL on Apple platforms only
- Source: [icircuitapp.com](https://icircuitapp.com/)

**SimulIDE (desktop, AGPLv3)**
- It is a real-time simulator with analog and digital parts, MCUs (PIC, AVR, Arduino), an oscilloscope, a logic analyzer and circuit animation — [simulide.com](https://simulide.com/p/)
- No frequency-domain analysis is listed — [simulide.com](https://simulide.com/p/)

**Multisim / Multisim Live (NI)**
- Multisim Live reached end of life on Sept 15, 2026. NI points users to Multisim Desktop (NI Circuit Design Suite, Windows) and does not guarantee continued access to saved designs — [Digilent EOL letter (search summary; page returned 403 to the fetcher)](https://support.digilent.com/hc/en-us/articles/41178584173979-Multisim-Live-EOL-Letter); [EEVblog thread, Apr 2026](https://www.eevblog.com/forum/projects/multisim-live-going-eol-in-september-building-free-alternative/)
- The EEVblog original poster says Multisim Desktop starts at "$900/year" — [EEVblog thread](https://www.eevblog.com/forum/projects/multisim-live-going-eol-in-september-building-free-alternative/)

**EasyEDA**
- Its own documentation conflicts:
  - The Std FAQ says simulation is only in the Standard edition, not Pro — [EasyEDA Std Simulation FAQ](https://docs.easyeda.com/en/FAQ/Simulation/)
  - The Pro docs say Pro has two built-in engines, SimulIDE and NGSpice — [EasyEDA Pro simulation intro](https://prodocs.easyeda.com/en/simulation/introduction/)
  - An older forum post announced a switch from ngspice to LTspice — [EasyEDA forum](https://easyeda.com/forum/topic/EasyEDA-will-switch-the-simulation-engine-from-Ngspice-to-LTSPICE-79c41502898b404db60389902db67dd8)

**PartSim**
- It was a cloud ngspice service as of 2012 — [InsideHPC 2012](https://insidehpc.com/2012/12/partsim-a-circuit-simulator-in-the-cloud/)
- AlternativeTo lists it as discontinued, saying it "simply gets stuck at app loading screen" (date unclear) — [AlternativeTo PartSim](https://alternativeto.net/software/partsim/about/)

**Digital-only and MCU tools (out of scope for analog analysis)**
- CircuitVerse is digital logic only. It can generate combinational circuits from truth tables and validate them with testbenches and timing diagrams — [LinuxLinks CircuitVerse](https://www.linuxlinks.com/circuitverse-construct-digital-logic-circuits-online/)
- Wokwi simulates MCU boards (Arduino, ESP32, STM32, Pico) and parts. Its docs do not mention SPICE or analog circuit simulation — [docs.wokwi.com](https://docs.wokwi.com/)

**Tinkercad Circuits**
- It can "simulate an analog circuit" and run several Arduinos at once — [Arduino forum](https://forum.arduino.cc/t/simulator-which-one-is-better/1359552)
- Its built-in oscilloscope is called "very simplistic" — [Norwegian Creations review, 2018](https://www.norwegiancreations.com/2018/11/a-first-impression-of-tinkercad-circuits/)

**DCACLab**
- It offers breadboard simulation, a realistic multimeter, a three-channel real-time oscilloscope and time-domain plotting, with examples such as diode rectifiers and RLC resonance — [dcaclab.com](https://www.dcaclab.com/en)

### Inferences
- Falstad CircuitJS1 appears to have no true small-signal AC sweep or Bode analysis. Its docs and README describe only transient simulation plus scope spectrum. A student can see a filter's response only by sweeping a source by hand or watching an FFT. That is a clear gap for ECE 201/AC/filter learning that EveryCircuit, iCircuit and every SPICE tool fill.
- For a learning tool, the minimum analysis set matching typical intro-circuits topics is:
  - DC operating point, for node voltages and Thevenin checks
  - Transient, for RC/RL/RLC step response
  - AC sweep with magnitude/phase (Bode), for filters and phasors
  - A parameter sweep, the ".step" idea, for "what if R doubles"
  Noise and distortion are optional for this audience.
- The modern browser options for a SPICE-grade engine are ngspice-WASM (EEcircuit-engine), pure TS (spice-ts) and Rust-WASM (repath). All three are MIT-licensed wrappers or engines, which makes them legally easier to embed than GPL CircuitJS1 (see Q4).

### Gaps
- Exact current analysis menus for EveryCircuit (DC sweep? parameter sweep?) and DCACLab. Official pages only list high-level features.
- Whether the CircuitJS1 5.0 TypeScript rewrite added any frequency-domain analysis. The commit log reviewed shows UI and solver fixes, but no AC analysis was seen.
- Tinkercad's internal engine is undocumented in the sources found.
- Current EasyEDA Pro engine status (ngspice vs LTspice vs SimulIDE) is unresolved because the sources conflict.

---

## Q2. What visual and interaction ideas does each tool use?

### Takeaway
The key ideas worth borrowing:
- **Falstad:** voltage-colored wires, animated current dots with separate simulation-speed and current-speed controls, hover readouts showing V/I/P, per-element "View in Scope," and a one-click DC operating point
- **EveryCircuit:** voltage, current and charge animation on the schematic, mini-waveforms on wires, adjust-while-running knobs
- **iCircuit:** always-on simulation, in-schematic gauges, scope with scroll-back and RMS/p-p readouts
- **PhET:** ideal meters as draggable tools, explicit and documented idealizations
- **SPICE GUIs (KiCad, CircuitLab):** probe-a-net-to-plot, markers and unit-aware math

"Voltage as height" 3D visualization has academic precedent (Doering; Christie & Trinidad's CktViz, 1998; Dartmouth's 3-D Circuits, 2002) but no maintained mainstream tool.

### Cited Findings

**Falstad CircuitJS1**
- Colors and animation:
  - Green means positive voltage, gray means ground and red means negative voltage, and moving yellow dots show current — [falstad.com/circuit](https://www.falstad.com/circuit/)
  - In the power-factor demo, red means a component consumes power and green means it supplies power — [Falstad directions](https://www.falstad.com/circuit/directions.html)
- Readouts and scopes:
  - Hovering shows a description and the element's current state in the lower-right corner. Students hover to see "the current through it, the voltage across it, its numerical setting, and the power" and learn that negative power means delivering — [falstad.com/circuit](https://www.falstad.com/circuit/); [UIUC ECE110 handout](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
  - Three scope graphs sit at the bottom of the screen, with voltage in green and current in yellow. Right-click "View in Scope" adds an element. Hovering a scope highlights its component — [Falstad directions](https://www.falstad.com/circuit/directions.html)
- Controls:
  - Separate "Simulation Speed" and "Current Speed" sliders. The second only changes how fast the dots move — [Falstad directions](https://www.falstad.com/circuit/directions.html)
  - Clicking a switch toggles it. Reset and Run/Stop buttons. File > Recover Auto-Save. Export as a URL (shareable link) — [Falstad directions](https://www.falstad.com/circuit/directions.html)
  - Keyboard-first editing: `w` for wire, `r` for resistor, space to drag, Ctrl-Z, Ctrl-X — [UIUC ECE110 handout](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
- Embedding parameters include `hideSidebar`, `editable`, `running`, `whiteBackground`, `conventionalCurrent`, `euroResistors`/`usResistors`, `positiveColor`/`negativeColor` and `hideInfoBox` — [sharpie7/circuitjs1 README](https://github.com/sharpie7/circuitjs1)
- The Oct 2026 5.x releases added:
  - A "Show Properties on Create/Click" properties panel
  - Restored mouse-wheel adjustment of potentiometer and slider elements
  - Narrow-width and mobile menu layout fixes
  - Triggered-scope sweep persistence
  - Renaming CustomCompositeElm to SubcircuitElm (subcircuits)
  - Source: [pfalstad/circuitjs1 commits](https://github.com/pfalstad/circuitjs1/commits/master)
- The C++ port README describes the mouse wheel over a resistor, capacitor or inductor stepping its value, a new element's ends splitting any wire they land on, and drag-from-toolbar placement — [CircuitJS1 cxx/README](https://github.com/pfalstad/circuitjs1/tree/master/cxx)

**EveryCircuit**
- Voltage, current and charge animations on the schematic. Mini-waveforms appear on wires: analog voltages as numbers, digital wires color-coded — [everycircuit.com](https://everycircuit.com/)
- While running, students can flip switches, adjust potentiometers, tune LED current-limit resistors and ramp input voltages — [everycircuit.com](https://everycircuit.com/)
- A community gallery holds more than 3 million user circuits — [everycircuit.com](https://everycircuit.com/)

**iCircuit**
- Live gauges for voltage, current, frequency and resistance sit inside the schematic. A multimeter reads V/I/P from any wire or part. The scope tracks many signals, scrolls back in time and reports RMS, peak-to-peak and frequency — [icircuitapp.com](https://icircuitapp.com/)
- It "warns about over-voltage and over-power" — [icircuitapp.com](https://icircuitapp.com/)

**PhET CCK**
- The voltmeter is a separate draggable tool rather than a component, used alongside an ammeter — [PhET teacher guide](https://clixplatform.tiss.edu/phet/files/teachers-guide/circuit-construction-kit-ac-guide.pdf); [STEM Learning listing](https://stem.org.uk/rx35h4)
- "Reset Dynamics" discharges capacitors and inductors — [PhET teacher guide](https://clixplatform.tiss.edu/phet/files/teachers-guide/circuit-construction-kit-ac-guide.pdf)
- The model doc lists "household item" resistances, such as a pencil at 25 Ω and a dollar bill at 1e9 Ω — [PhET CCK model.md](https://github.com/phetsims/circuit-construction-kit-common/blob/main/doc/model.md)

**CircuitLab**
- "Smart Wires," easy-wire mode, a quick-access build box, and named nodes (such as +5V) that are resolved automatically — [circuitlab.com](https://www.circuitlab.com/)
- Configurable plot windows with vertical and horizontal markers and signal math. Vector PDF/SVG export. A beta AI assistant builds circuits from plain English and explains them. Links to the free "Ultimate Electronics" online textbook — [circuitlab.com](https://www.circuitlab.com/)

**KiCad**
- A probe tool: click a net to plot its voltage, or a pin to plot its current — [kicad.org/discover/spice](https://www.kicad.org/discover/spice/)

**EEcircuit**
- WebGL plotting (webgl-plot) for fast, large traces, and CSV export — [EEcircuit GitHub](https://github.com/eelab-dev/EEcircuit)

**repath**
- Wires are colored by voltage and current is animated along them, "derived from the simulation rather than decorated on top of it." The scope shows analog traces with a playhead. The whole circuit fits in a URL — [repath README](https://github.com/Agustin-Delgado/repath)

**Breadboard views**
- **Tinkercad:**
  - It uses a breadboard and Arduino view. Connections can be misaligned without any visible sign and then do not make contact, whereas Wokwi forces wires that only succeed when connected — [Arduino forum: Tinkercad vs Wokwi](https://forum.arduino.cc/t/virtual-online-arduino-and-esp32-simulator-wokwi-arduino-simulator-features/698481/3)
  - "Many component properties are locked or just not simulated." A motor circuit worked without the flyback diode it would need in real life — [Norwegian Creations review](https://www.norwegiancreations.com/2018/11/a-first-impression-of-tinkercad-circuits/)
- **DCACLab:** "realistic components," full breadboard simulation and a resistor color-code tool — [dcaclab.com](https://www.dcaclab.com/en)

**3D and "voltage as height" precedent**
- Christie & Trinidad (Univ. of Washington, ASEE 1998) built CktViz, which integrates visualization into a simulator to show "all current flows and voltage values" directly on the circuit, with animation for transients. Their small assessment with intro-circuits students found "a positive and significant effect on students' qualitative understanding" — [Christie & Trinidad, "Visualizing Pedagogical Circuits," ASEE 1998 (PDF)](https://peer.asee.org/visualizing-pedagogical-circuits.pdf)
- The same paper's prior-work section describes:
  - Doering: "node voltages are represented as the node height above the reference plane and the current magnitudes are shown as the width of the vertical stripe below the conducting path"
  - Zoghi et al.: voltage magnitude shown as arrow length, so "Kirchoff's voltage law can be seen qualitatively at a glance"
  - Source: [Christie & Trinidad 1998](https://peer.asee.org/visualizing-pedagogical-circuits.pdf)
- The paper argues that results shown "away from the circuit" (as in PSpice) keep the circuit-result relationship abstract. It also says "instruction in PSpice in the first circuits course may teach more about PSpice than about the circuits" — [Christie & Trinidad 1998](https://peer.asee.org/visualizing-pedagogical-circuits.pdf)
- Dartmouth's "3-D Circuits" (Charles R. Sullivan, NSF-funded, page last updated 2002) offered MATLAB-based 3D circuit animations and free tools, for example a capacitor driven by an AC source — [3dcircuits.engineering.dartmouth.edu](https://3dcircuits.engineering.dartmouth.edu/)
  - The related ASEE 2002 paper is titled "Three Dimensional Circuit Animation Visualizes Voltage" — [WebSearch result listing Dartmouth powerani.pdf](https://3dcircuits.engineering.dartmouth.edu/powerani.pdf)
- VR and AR studies:
  - A HoloLens 3D environment for electric field and potential (ETH Zurich; 26 students aged 17-20; 15 minutes of VR) showed pre-to-post gains. The authors say it is unclear whether VR beats computer or paper formats — [Schmid et al. via CERN PRISE](https://e-publishing.cern.ch/index.php/prise/article/view/1403)
  - A MacEwan 2026 work-in-progress Unity/Quest series-parallel lab was evaluated with only 7 participants — [Immersive Learning Research Network](https://publications.immersivelrn.org/index.php/practitioner/article/view/1247)

### Inferences
- A "truthful 3D" view has a natural definition from Doering's idea: node voltage becomes height above a ground plane, and branch current becomes stripe width or dot density. KVL then becomes visible because a loop returns to the same height, and resistors become visible "ramps" or drops. For the view to stay truthful:
  - Wires should be flat, at constant height, unless the model includes wire resistance
  - Voltage sources should be vertical steps
  - Heights should be relative to a user-chosen ground node
- Falstad's split between "simulation speed" and "current dot speed" shows that animation speed is a display choice, not physics. A truthful tool should label dot speed as proportional to current, not to electron drift velocity. It should also offer conventional vs electron flow; Falstad's `conventionalCurrent` parameter and PhET's toggle are precedents.
- Hover readouts with a power sign convention (Falstad) and ideal-meter tools (PhET) map directly onto ECE 201 skills: the passive sign convention, power absorbed vs delivered, and Tellegen's theorem checks.

### Gaps
- No currently maintained, public "voltage-as-height" 3D circuit simulator was found. CktViz, Doering's tool and Dartmouth's toolbox are all over 20 years old.
- The original Doering paper itself was not located; it is known only through the 1998 citation.
- PhET's current AC sim feature list (charts, stopwatch, electron view) could not be read from phet.colorado.edu, because the page renders with JavaScript and the fetch returned only navigation.

---

## Q3. What do students and instructors praise or complain about?

### Takeaway
- **Falstad** is praised for instant feedback and intuition. It is criticized for accuracy and missing physics (magnetic coupling, saturation), which makes it "not like LTspice."
- **LTspice** is the consensus "real" tool. It is free and accurate, but has a learning curve and a dated UI.
- **Tinkercad and breadboard tools** hide real-world needs.
- **Cloud and freemium tools** (EveryCircuit, CircuitLab, Multisim Live) draw complaints about paywalls, component caps and platform risk. Multisim Live's 2026 shutdown is the clearest case.
- **PhET** is explicit about its idealizations: ideal meters, near-zero wire resistance, ideal batteries.

### Cited Findings

**Falstad vs LTspice**
- The UIUC ECE 110 course starts students on Falstad because it "yields results in seconds," while LTspice needs installation and its learning curve "is a little higher and, even for simple circuits, the added steps … can be intimidating" — [UIUC ECE110 handout](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
- A Reddit-review aggregator (about 244 reviews from r/ElectricalEngineering, r/electronics and others) ranks LTspice first, Falstad at 3.8/5 and Multisim at 3.6/5. It describes Falstad as good for quick checks but "quite basic" compared with SPICE. This is an aggregator, so treat it as low confidence — [GummySearch summary](https://gummysearch.com/tools/best-products/circuit-simulator/)
- An EEVblog user said Falstad is "not accurate like LTspice … but gives a nice visual representation." Another reported that two coils do not make a transformer because there is no magnetic coupling, and that blocking oscillators that depend on core saturation will not be realistic — [EEVblog thread](https://www.eevblog.com/forum/beginners/simulation-of-a-blinking-circuit-(falstad)/msg3412558/)
- A Falstad fork found that replacing wires with tiny resistors broke the scope display because of how Falstad references voltages. The fork added an "ideal wires" option — [hausen/circuit-simulator issue #1](https://github.com/hausen/circuit-simulator/issues/1)

**LTspice**
- It is free, with "all features and models, no need to buy a license" (ADI forum) and no node or component caps — [Wikipedia: LTspice](https://en.wikipedia.org/wiki/LTspice); [ADI EngineerZone](https://ez.analog.com/design-tools-and-calculators/ltspice/f/q-a/589882/ltspice-license)

**Multisim Live**
- Before its end of life it had tiered save caps (Basic 4 circuits, Standard 10, Premium unlimited) — [Digilent FAQ](https://support.digilent.com/hc/en-us/articles/20037627990171-FAQ)
- Known issues included out-of-memory errors in Firefox, slow saves in Edge, and unreliable saving and export on iOS — [NI known issues](https://www.ni.com/en/support/documentation/bugs/16/multisim-live-known-issues.html)
- It reached end of life in Sept 2026 with no guaranteed access to saved designs — [Digilent EOL letter (via search)](https://support.digilent.com/hc/en-us/articles/41178584173979-Multisim-Live-EOL-Letter)

**EveryCircuit**
- The free tier limits a user's own circuits to 5 components. Paid options are $5/month, a $15 one-time purchase, or an educator class license of about $4/semester per student — [everycircuit.com](https://everycircuit.com/)
- A small study (16 physics students) found 42.5% agreed it improved understanding, and noted limited proficiency and internet-connection barriers — [Jurnal Pendidikan Fisika (Unismuh)](https://journal.unismuh.ac.id/index.php/jpf/en/article/view/15236)
- An aggregator says the top complaint is the limited component library. This is low confidence — [marlvel.ai](https://marlvel.ai/api/llm/apps/education/everycircuit)

**CircuitLab**
- The Micro plan costs $2/month with a schematic cap of 10 items, Hacker Lite is unlimited, and the free Student Edition requires an .edu email — [CircuitLab student page](https://www.circuitlab.com/accounts/upgrade/academic); [CircuitLab FAQ](https://Circuitlab.com/docs/faq/)
- A long-running feature request asks to "Be cheaper for students/hobbyists" — [CircuitLab forum](https://www.circuitlab.com/forums/feature-requests/topic/tnx2982x/be-cheaper-for-students_hobbyists/)

**PhET hidden assumptions (documented)**
- Batteries are ideal (very low resistance) unless set in the Lab screen, with a minimum of 1e-4 Ω
- Wires have small nonzero resistivity (at least 1e-10 Ω·m) "to avoid numerical errors or unsolvable circuits," and their resistance scales with length
- Ammeters have zero resistance and voltmeters infinite resistance
- Source: [PhET CCK model.md](https://github.com/phetsims/circuit-construction-kit-common/blob/main/doc/model.md)

**Tinkercad**
- Misaligned connections are hard to see, component properties are locked or not simulated, and the simulation is slower than Wokwi — [Arduino forum](https://forum.arduino.cc/t/virtual-online-arduino-and-esp32-simulator-wokwi-arduino-simulator-features/698481/3); [Norwegian Creations](https://www.norwegiancreations.com/2018/11/a-first-impression-of-tinkercad-circuits/)

**Learning-focused criticism of SPICE**
- Results shown away from the schematic keep the circuit abstract. PSpice in a first course "may teach more about PSpice than about the circuits" — [Christie & Trinidad 1998](https://peer.asee.org/visualizing-pedagogical-circuits.pdf)

**spice-ts error handling**
- It emits structured errors (`FLOATING_NODE`, `NO_DC_PATH_TO_GROUND`, `VOLTAGE_SOURCE_LOOP`) instead of a cryptic "singular matrix" — [spice-ts README](https://github.com/spicets/spice-ts)
- Inference: this is a good model for student-facing error messages.

### Inferences
- The recurring tension is intuition (fast, animated, forgiving) against fidelity (SPICE). A learning tool can address it by:
  - Running a SPICE-grade engine underneath
  - Showing a visible "assumptions" panel that lists ideal meters, wire resistance and source resistance, as PhET's model.md does
  - Letting students toggle "ideal" vs "real" models, for example an ideal op-amp vs one with finite gain and rails, or an ideal source vs one with internal resistance
- Clear, located error messages (floating node, voltage-source loop, no DC path for a capacitor-only node) directly address the most common beginner SPICE frustration.
- Platform risk is real: Multisim Live and PartSim are both gone. A local, offline, file-based tool avoids it.

### Gaps
- No rigorous comparative study of accuracy across these tools was found. The accuracy claims are forum or anecdotal, apart from spice-ts's ngspice parity benchmark.
- Reddit threads could not be fetched directly; the only Reddit source used is an aggregator.
- No OSU-specific ECE course page recommending a simulator was found in this pass.

---

## Q4. Licensing and open-source status: can code or models be reused?

### Takeaway
- **Copyleft:** Falstad CircuitJS1 (GPL-2.0-or-later), Qucs-S (GPL-2.0), KiCad (GPL-3.0) and SimulIDE (AGPLv3). Reusing their code makes the app a derivative work under those terms. Reading them as a reference, without copying code, is generally fine.
- **Permissive:** EEcircuit and eecircuit-engine, spice-ts, repath, CircuitVerse and avr8js are all MIT, and so easy to embed.
- **Closed:** LTspice, EveryCircuit, CircuitLab, iCircuit, Multisim, Tinkercad and DCACLab.

### Cited Findings
- **CircuitJS1:** GPL, "either version 2 of the License, or (at your option) any later version." This applies to both the sharpie7 repo (last pushed Jan 2024, about 3k stars) and the active pfalstad repo — [sharpie7/circuitjs1](https://github.com/sharpie7/circuitjs1); [pfalstad/circuitjs1](https://github.com/pfalstad/circuitjs1); [GitHub API](https://api.github.com/repos/sharpie7/circuitjs1)
- **SimulIDE:** "License: AGPLv3" per the official site. Some distro listings say GPLv3, so the sources conflict and the official site was used — [simulide.com](https://simulide.com/p/); [Flathub](https://flathub.org/sv/apps/com.simulide.simulide)
- **Qucs-S:** GPL-2.0 — [GitHub API ra3xdh/qucs_s](https://github.com/ra3xdh/qucs_s)
- **KiCad:** GPL-3.0 — [GitHub API KiCad mirror](https://github.com/KiCad/kicad-source-mirror)
- **EEcircuit and eecircuit-engine:** MIT. The engine wraps ngspice — [EEcircuit](https://github.com/eelab-dev/EEcircuit); [EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine)
- **spice-ts:** MIT — [GitHub search API](https://github.com/spicets/spice-ts)
- **repath:** MIT — [repath README](https://github.com/Agustin-Delgado/repath)
- **CircuitVerse:** MIT — [GitHub API CircuitVerse/CircuitVerse](https://github.com/CircuitVerse/CircuitVerse)
- **avr8js (Wokwi's AVR core):** MIT — [GitHub API wokwi/avr8js](https://github.com/wokwi/avr8js)
- **Wokwi itself:** "free for personal use," with paid plans for commercial users — [docs.wokwi.com](https://docs.wokwi.com/)
- **jecs (TypeScript circuit simulator):** AGPL-3.0 — [GitHub search](https://awesome.ecosyste.ms/api/v1/projects/github.com%2Faradzie%2Fjecs)
- **Older JS educational simulators:**
  - Circuit Sandbox (spinningnumbers.org) is pure JS with no license listed in the API — [willymcallister/circuit-sandbox](https://github.com/willymcallister/circuit-sandbox)
  - circuitsim/circuit-simulator is EPL-1.0 and Falstad-inspired, stale since 2023, with no nonlinear or AC analysis implemented — [circuitsim/circuit-simulator](https://github.com/circuitsim/circuit-simulator)
- **LTspice:** freeware from Analog Devices, closed source, originally based on Berkeley SPICE 3f5 but no longer — [Wikipedia: LTspice](https://en.wikipedia.org/wiki/LTspice)
- **PhET:** the GitHub API reports no license for the CCK repos. The common repo says it is "out of date and no longer actively maintained" and that the code has moved to a monorepo "not publicly available at this time" — [phetsims/circuit-construction-kit-common](https://github.com/phetsims/circuit-construction-kit-common)
  - However, the repo was pushed on Oct 9, 2026, so its status is ambiguous — [GitHub API](https://github.com/phetsims/circuit-construction-kit-common)

### Inferences
- If the new simulator lives inside a personal, local study app that is never distributed, GPL obligations mostly arise only on distribution. Still, the cleanest path is:
  - Use an MIT engine (eecircuit-engine/ngspice-WASM, spice-ts or repath) as a dependency, or write your own MNA following the publicly documented algorithm
  - Use Falstad's INTERNALS.md and the PhET model.md as references for algorithms and assumptions, without copying their code
  - Treat MNA, companion models, Newton-Raphson with limiting, and the Shockley and Ebers-Moll equations as textbook methods that are not copyrightable
- ngspice's own license should be checked before bundling eecircuit-engine. It is commonly described as modified BSD, but this was not confirmed in this pass.
- Falstad's example-circuit text files are GPL content too. Re-creating similar textbook circuits from scratch is safe.

### Gaps
- The ngspice software license was not confirmed; the sourceforge page fetched only showed the documentation license (GFDL).
- PhET's code license (historically GPL/MIT for PhET libraries) and its sim content license (historically CC-BY) could not be confirmed. The licensing page did not render.
- The licenses of the Circuit Sandbox and MIT 6.002x cktsim.js lineage are unknown.

---

## Q5. Which run in the browser or on phones, and how (WASM, JS, server)?

### Takeaway
- **Browser, pure client-side JS/TS:** Falstad CircuitJS1 (now TypeScript/Vite, with a service worker for offline use), PhET (HTML5), Circuit Sandbox, CircuitVerse and spice-ts
- **Browser via WASM:** EEcircuit (ngspice compiled with Emscripten) and repath (Rust)
- **Browser, proprietary, probably server-assisted or cloud accounts:** EveryCircuit, CircuitLab, Tinkercad, DCACLab, and formerly Multisim Live
- **Server-side SPICE:** FOSSEE eSim web, and formerly PartSim
- **Native phone apps:** EveryCircuit and iCircuit, plus Falstad's web app, whose mobile layout was fixed in Oct 2026
- **Desktop only:** LTspice, Qucs-S, KiCad and SimulIDE

### Cited Findings
- **Falstad CircuitJS1:**
  - It was originally a Java applet, then compiled to JS with GWT, and is now "written in TypeScript and built with Vite … no Java, GWT, or Eclipse required." Builds include a service-worker offline cache, an Electron offline app, and Docker/podman images — [pfalstad/circuitjs1 README](https://github.com/pfalstad/circuitjs1)
  - Version 5.0.0ts was tagged Oct 18, 2026 and 5.0.3 on Oct 25, 2026, including "Fix narrow-width layout: sidebar handle, toolbar width, mobile menu." A C++17/Qt "line-for-line port" with simtrace/compare tools that diff traces against the TS version is in progress — [GitHub commits API](https://github.com/pfalstad/circuitjs1/commits/master); [cxx/README](https://github.com/pfalstad/circuitjs1/tree/master/cxx)
  - The repo's language mix is about 2.5 MB TypeScript and 2.35 MB C++ — [GitHub languages API](https://api.github.com/repos/pfalstad/circuitjs1/languages)
- **EEcircuit:** ngspice compiled to WASM with Emscripten, running locally, so netlists "are never uploaded." It works in Chrome, Edge, Safari 15+ and Firefox 111+ — [EEcircuit GitHub](https://github.com/eelab-dev/EEcircuit); [EEsim README](https://github-redirect.dependabot.com/danchitnis/EEsim)
  - It was created by Dr Danial Chitnis at the University of Edinburgh — [search result summary of EEcircuit repo](https://github.com/jamestiotio/EEcircuit)
  - The repos were active in Oct 2026 — [GitHub API](https://github.com/eelab-dev/EEcircuit)
- **repath:** the engine is Rust compiled to WASM with wasm-pack, and the UI is SvelteKit with a canvas editor. The fully static build "can drop on any host" — [repath README](https://github.com/Agustin-Delgado/repath)
- **spice-ts:** runs "in Node, in the browser or inside an agent sandbox, with no ngspice binary to ship." It is on npm as `@spice-ts/core` and `@spice-ts/ui` — [spice-ts README](https://github.com/spicets/spice-ts)
- **FOSSEE eSim web app:** "the ngspice simulator simulates the circuit on the server and sends back the results" — [esim.fossee.in](https://esim.fossee.in/webapp) (via search summary)
- **PartSim:** cloud ngspice, now apparently dead — [InsideHPC](https://insidehpc.com/2012/12/partsim-a-circuit-simulator-in-the-cloud/); [AlternativeTo](https://alternativeto.net/software/partsim/about/)
- **EveryCircuit:** web, Android and iOS — [everycircuit.com](https://everycircuit.com/)
- **iCircuit:** iPhone, iPad, Mac, Windows and Android. It is a one-time purchase with an optional "Pro" subscription on Apple platforms, and newer features are Apple-only — [icircuitapp.com](https://icircuitapp.com/)
- **CircuitLab:** browser-based, "No installation required!" — [circuitlab.com](https://www.circuitlab.com/)
- **Tinkercad:** free and runs in any modern browser — [DigiKey Maker article](https://www.digikey.com/es/maker/blogs/2022/arduino-simulators-for-hobbyists-makers-and-classroom-environments)
- **DCACLab:** in-browser simulation — [dcaclab.com](https://www.dcaclab.com/en)
- **Multisim Live (before EOL):** recommended Chrome and had mobile Safari and iOS save issues — [NI known issues](https://www.ni.com/en/support/documentation/bugs/16/multisim-live-known-issues.html)
- **LTspice:** Windows and macOS, and Linux via Wine. No mobile or browser version — [Wikipedia: LTspice](https://en.wikipedia.org/wiki/LTspice)
- **Wokwi:** browser, a VS Code extension and Wokwi CI — [docs.wokwi.com](https://docs.wokwi.com/)
- **CircuitSim (circuitsim.com):** a new browser-based schematic, SPICE and charting tool announced in April 2026 by an ex-NI employee as a Multisim Live replacement. A free tier is promised; its tech stack is undisclosed — [EEVblog thread](https://www.eevblog.com/forum/projects/multisim-live-going-eol-in-september-building-free-alternative/)

### Inferences
- For a local study web app, three engine strategies are proven in 2026:
  1. A hand-written JS/TS MNA solver (the Falstad and PhET approach). It is fast enough for real-time animation and fully controllable, but you must build every device model and an AC solver yourself.
  2. ngspice-WASM via eecircuit-engine. It has full SPICE fidelity and analyses, but is batch-oriented (netlist in, vectors out) and so less natural for continuous, real-time interaction. Its bundle size and Web Worker hosting should be evaluated.
  3. Pure-TS SPICE (spice-ts) or Rust-WASM (repath). These are SPICE-class, MIT and embeddable, but young (2025-26) with small communities.
- A hybrid is possible and matches the gap found in Q1: a light real-time MNA for animation and 3D, plus a SPICE engine for .op/.ac/.tran/.step reports and for cross-checking the real-time solver. The spice-ts ngspice parity benchmark and Falstad's C++/TS trace-diff tool are precedents for regression-testing a solver against a reference.
- Phone support: a touch-friendly web app (pointer events, narrow layout) is enough. Falstad only fixed its mobile menu in Oct 2026, which suggests mobile is an afterthought in most of the open-source tools.

### Gaps
- Bundle size and load time of the ngspice-WASM engine were not found.
- Whether EveryCircuit's or CircuitLab's simulation runs client-side or on a server is not documented in the sources found.
- Whether Tinkercad Circuits works on phones was not determined.
