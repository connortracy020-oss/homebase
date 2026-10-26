# Schematic Editor UX, File Formats and 3D Rendering for a Browser-Based Educational Circuit Simulator

Scope note: 16 search/fetch calls were made. Primary sources (KiCad docs, circuitjs1 source, netlistsvg README, Eclipse ELK docs, arXiv/Zenodo) are cited where possible. Several useful details come from background knowledge and were not verified in this pass. They are marked "(background, unverified)" and kept under Inferences or Gaps, never under Cited Findings.

## 1. Schematic editing UX in existing tools (placing, wiring, moving, shortcuts, frustrations)

### Takeaway
Desktop tools agree on a small set of patterns: single-letter hotkeys for tools (W wire, R rotate, X/Y mirror, E edit), a coarse snap grid that also defines connectivity, junction dots added automatically only where a wire ends on another wire, and two kinds of move (KiCad's "Move" breaks connections, "Drag" keeps wires attached). An educational editor should make the "drag keeps wires attached" behavior the default and use a grid coarse enough that endpoints cannot miss each other.

### Cited Findings
- KiCad Eeschema separates **Move (M)**, which "moves the symbol itself without maintaining wired connections," from **Drag (G)**, which "moves the symbol without breaking wired connections to its pins" (rubber-banding). — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- KiCad hotkeys: R rotate, X / Y mirror, A place symbol (opens chooser), W wire, E properties dialog, U / V / F edit Reference / Value / Footprint directly, Insert repeats the last placed item (for example auto-incremented labels). — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- KiCad default grid is 50 mil (1.27 mm). Holding Ctrl disables grid snapping, holding Shift disables snapping to connected objects. Connectivity depends on exact endpoint coincidence, and the manual warns about off-grid parts. — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- KiCad junctions: dots are "automatically added to wires that start or end on top of an existing wire". Plain crossings are not joined. — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- KiCad wire modes: free-angle, 90-degree and 45-degree, cycled with Shift+Space. — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- KiCad net naming: labels with the same text connect nets, global labels connect across sheets, and "A net can only have one name". Conflicting labels raise an ERC (electrical rules check) violation. — [KiCad Eeschema manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.html)
- Falstad CircuitJS: press "w" (or Draw > Wire) to draw wires. You hover an element until it highlights, then Ctrl-X deletes it. Box-drag with the left button selects a group. — [UIUC ECE110 Falstad skill guide](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
- In Falstad, placing a part is a drag between two connection points. The component body keeps its size while the leads stretch, so there is a minimum length. — [UIUC ECE110 Falstad skill guide](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
- CircuitJS source: every element is defined by two snapped endpoints (x, y, x2, y2). `drag()` snaps to the grid via `snapGrid`, a `noDiagonal` mode forces horizontal/vertical, and `movePoint()` refuses moves that would collapse an element to zero length. — [circuitjs1 CircuitElm.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CircuitElm.java)
- An older Falstad guide describes connecting via Right-click > Add Wire. Small circles appear on part legs as wire snap targets while dragging. — [UIUC ECE110 Falstad skill guide](https://courses.grainger.illinois.edu/ECE110/content/labs/Experiments/Skill_Sim_Falstad.pdf)
- A Falstad fork lists double-click to edit, Delete to delete, a crosshair cursor in place mode and Esc to return to select mode. These conventions are from the fork and may not match upstream. — [hausen/circuit-simulator](https://github.com/hausen/circuit-simulator)

### Inferences
- Design idea: one "Select/Move" mode where dragging a part always rubber-bands attached wires (KiCad's G), with a modifier (for example Alt-drag) to detach. Beginners rarely want KiCad's M behavior.
- Design idea: use the KiCad junction rule (auto-dot only where an endpoint lands on a wire, never at plain crossings) and show a visible "unconnected endpoint" marker. Off-grid endpoints and accidental near-misses are the recurring connectivity failure that the KiCad manual warns about.
- Design idea: Falstad's two-endpoint model (a part is a segment from post A to post B) is simple to implement, serialize and hit-test, and it maps directly to two-terminal SPICE elements. It does cost layout flexibility for 3- and 4-terminal parts.
- Hotkey set to adopt (cited from KiCad, plus common conventions): W wire, R rotate, X/Y mirror, E edit, V value, Delete, Esc cancel, Insert/repeat-last. Background (unverified): LTspice uses F2 component, F3 wire, F4 net label, Ctrl+R rotate, Ctrl+E mirror, G ground, R/C/L for resistor/capacitor/inductor. A user-selectable "LTspice-style" keymap would ease migration.
- SI prefix entry (background, unverified): SPICE treats suffixes case-insensitively, so "M" means milli and "MEG" means mega. This trips up many students. An educational parser should accept "1k, 4.7u, 4.7µ, 2.2n, 1M" with an explicit, displayed interpretation (for example show "1 MΩ?" vs "1 mΩ?") and reject ambiguous input instead of guessing silently.

### Gaps
- I did not fetch primary docs for CircuitLab, LTspice, Qucs-S, Digikey Scheme-it, tldraw or Excalidraw in this pass. Their shortcut sets and wire-routing behavior (for example CircuitLab's drag-from-pin wiring, or tldraw's arrow-binding model as a reference for "wire stays attached to shape") remain unverified.
- No HCI study quantifying common schematic-editor frustrations was found. The frustrations above are inferred from tool documentation, not user research.

## 2. Touch and mobile circuit editing (EveryCircuit, iCircuit)

### Takeaway
EveryCircuit, the touch-first reference, avoids drag-precision problems by using tap-tap interactions: tap a palette item to add it, then tap one terminal and another terminal to wire them, with automatic wire routing. This model is the best documented answer to fat-finger wiring errors.

### Cited Findings
- EveryCircuit (user demo): you connect by tapping one component terminal and then another terminal. Components are added by tapping, not dragging. Every circuit needs a ground. — [EveryCircuit demo circuit](https://everycircuit.com/circuit/4947946720985088/everycircuit-demo-1)
- EveryCircuit's schematic editor includes automatic wire routing. You tap play to see voltage, current and charge animations, and you can adjust parameters with an analog knob while the simulation runs. — [EveryCircuit App Store listing](https://apps.apple.com/app/id797157761)

### Inferences
- Design idea for phone: (1) a bottom-sheet palette, where tapping a part drops it at viewport center or at the last tap location; (2) tap terminal A, then terminal B, then auto-route orthogonally; (3) terminal hit targets at least about 44 px (iOS HIG convention, background, unverified) that are larger than the drawn pin; (4) one-finger drag pans the canvas when started on empty space and moves the part when started on a part; (5) pinch to zoom; (6) long-press opens a context menu (rotate, flip, delete, edit value). Avoid requiring precise drag-to-pin on touch.
- Show a magnified "loupe" or a highlighted snap target when a finger is near a terminal, so the finger does not hide the target. This is a common mobile pattern, not verified for EveryCircuit or iCircuit.
- Use Pointer Events (one code path for mouse, pen and touch) and set `touch-action: none` on the canvas so the browser does not hijack pan and zoom. This is standard web practice (background).

### Gaps
- I found no primary documentation for iCircuit's touch gestures, or for how EveryCircuit handles deleting and moving wires. Search results did not cover these.
- No usability study comparing tap-tap vs drag wiring on touch was found.

## 3. Data formats: SPICE netlists, Falstad text, KiCad schematic, a JSON schema with layout

### Takeaway
Use your own versioned JSON as the canonical format, with explicit nodes/nets plus layout, and treat SPICE (netlist only, no layout), Falstad text (layout implied by endpoints) and KiCad `.kicad_sch` (full layout as S-expressions) as import/export targets. Falstad's format is the easiest to round-trip because it is one line per element: `type x1 y1 x2 y2 flags params...`.

### Cited Findings
- **Falstad/CircuitJS text format**: each element line is `<typecode> x y x2 y2 flags` followed by element-specific fields. The type code is written as a character when below 127, otherwise as a number. Node voltages and current are not stored. — [circuitjs1 CircuitElm.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CircuitElm.java)
- The resistor uses type code `'r'` and appends one field, resistance (a double). Example shape: `r x y x2 y2 flags 1000.0`. — [circuitjs1 ResistorElm.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/ResistorElm.java)
- The file starts with a `$` header line (simulation options), and scope lines start with `o`. This comes from community examples, not an official spec. — [Parallax forum](https://forums.parallax.com/discussion/comment/548444)
- Converting Falstad to a netlist is mostly a coordinate problem: you have to infer nodes from coincident endpoints. — [All About Circuits forum](https://forum.allaboutcircuits.com/threads/conversion-of-netlist-to-schematic.206055/post-1975377)
- A Falstad-to-CircuitikZ converter (Chrome extension) consumes the "export as text" output, which shows that third parties already target this format. — [Chrome Web Store](https://chromewebstore.google.com/detail/nleeeifoclihbeplddddioklamlkgigd)
- Licensing: the circuitjs fork README points to falstad.com/licensing.html before redistribution or modification. — [hausen/circuit-simulator](https://github.com/hausen/circuit-simulator)
- **KiCad `.kicad_sch`** (KiCad 6+): S-expression root `(kicad_sch (version YYYYMMDD) (generator ...) (uuid ...) (lib_symbols ...) (junction ...) (wire ...) (symbol ...) ...)`. Wires are point lists with start/end, and junctions are single positions. Labels, global_labels, hierarchical_labels, no_connect and sheets each carry a uuid. A symbol instance references an embedded `lib_symbols` entry and holds position/angle, unit and properties. Reference designators live in an `instances` block keyed by sheet path. Third-party tools should not use `eeschema` as their generator name. — [KiCad dev docs: schematic file format](https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/)
- **SPICE dependent sources**: E = VCVS, G = VCCS, F = CCCS, H = CCVS. — [PSpice overview (mfgrobots)](https://www.mfgrobots.com/Article/mfg/it/1497.html); [pyspicey](https://pypi.org/project/pyspicey/)
- `.AC DEC ND FSTART FSTOP` (also OCT / LIN). At least one independent source must have an AC value. — [Berkeley EE140 HSPICE handout](https://inst.eecs.berkeley.edu/~ee140/sp09/handouts/H-SpiceHandout.pdf)
- Example transient line: `.TRAN 1u 10m UIC`. Analyses supported in a SPICE3/ngspice-conventions tool: .ac, .dc, .op, .tran. — [pyspicey](https://pypi.org/project/pyspicey/)

### Inferences
- SPICE subset to implement (background, unverified details of argument order): `Rname n+ n- value`; `Cname n+ n- value [IC=v]`; `Lname n+ n- value [IC=i]`; `Vname n+ n- [DC v] [AC mag [phase]] [SIN(...)|PULSE(...)|PWL(...)]`; `Iname` same as V; `Ename n+ n- nc+ nc- gain`; `Gname n+ n- nc+ nc- gm`; `Fname n+ n- Vctrl gain`; `Hname n+ n- Vctrl r`; `Dname a k model`; `Qname c b e model`; `Mname d g s b model`; `.model`; `.op`; `.dc Vsrc start stop step`; `.tran tstep tstop [tstart [tmax]] [UIC]`; `.ac dec|oct|lin n fstart fstop`; `.end`; node `0` is ground; first line is the title; `*` starts a comment; `+` continues a line. Verify against the ngspice manual before shipping.
- F and H require a controlling voltage source by name. The editor's export must emit a 0 V "ammeter" source in series with the controlling branch when the user picks "current through element X" as the control. This is a frequent export bug.
- Proposed canonical JSON (design idea):
  ```json
  {
    "format": "homebase-circuit", "version": 1,
    "meta": {"title": "...", "source": "textbook 3.12", "created": "...", "units": "grid"},
    "grid": 16,
    "parts": [{"id": "R1", "type": "R", "value": "1k", "valueSI": 1000,
               "pins": {"1": "n1", "2": "n2"}, "pos": [4, 2], "rot": 90, "flip": false,
               "label": {"offset": [1, 0]}}],
    "wires": [{"id": "w1", "pts": [[4,2],[8,2]], "net": "n1"}],
    "nets": [{"id": "n1", "name": "Vout"}, {"id": "0", "name": "GND", "ground": true}],
    "probes": [], "analysis": {"type": "tran", "tstep": "1u", "tstop": "10m"}
  }
  ```
  Store both the user's typed string and the parsed SI number. Store nets explicitly (do not rely only on geometric coincidence like Falstad), so a netlist-only import (no layout) is still a valid document. Use an integer `version` with a migration function per version step.
- KiCad export is feasible but heavy: you must embed full `lib_symbols` definitions for each symbol type. Treat it as a later "export to KiCad" nicety. Falstad import/export and SPICE export are the high-value interop targets for students.

### Gaps
- Exact Falstad `$` header field meanings and the per-element type codes for all parts (c, l, v, i, d, t, f, w, g, ...) were not fetched. They live in each `*Elm.java` in circuitjs1 and should be read there.
- KiCad coordinate units (mm in v6+, background, unverified) and the exact `property "Value"` syntax are in the shared S-expression intro page, which was not fetched.
- The ngspice manual was not fetched, so exact E/F/G/H/D/Q/M argument orders above are from background knowledge.

## 4. Auto-layout from a netlist (ELK/elkjs, netlistsvg)

### Takeaway
netlistsvg plus elkjs is the most direct prior art: it already lays out analog parts (resistors, transistors, vcc, gnd) from a JSON netlist using ELK's layered (Sugiyama-style) algorithm with orthogonal routing. Results are readable for small circuits but look "dataflow-like", not textbook-like.

### Cited Findings
- netlistsvg draws an SVG schematic from a Yosys JSON netlist (JSON5 accepted for hand-written input). Cells have `type`, `connections`, optional `port_directions` and `parameters`. — [netlistsvg README](https://github.com/nturley/netlistsvg)
- netlistsvg layout is done by elkjs, which "is using a layered approach (Sugiyama, Ganser), similar to dot in the Graphviz package". Layout options come from the skin's `s:layoutEngine` block. Node and edge properties are not yet configurable. — [netlistsvg README](https://github.com/nturley/netlistsvg)
- netlistsvg ships an analog skin (`analog.svg`) with types like `r_v`, `q_pnp`, `vcc`, `gnd`, and values such as `"10k"` as attributes. Skins define per-component size and port positions. It renders only one module. — [netlistsvg README](https://github.com/nturley/netlistsvg)
- ELK Layered with orthogonal routing respects arbitrary port constraints, "thus enabling the layout of block diagrams such as actor-oriented models or circuit schematics". — [Eclipse ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- ELK has FIXED_SIDE / FIXED_ORDER port constraints. `allowNonFlowPortsToSwitchSides` lets north/south ports switch sides to reduce crossings. — [ELK option reference](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-allowNonFlowPortsToSwitchSides.html)
- ELK can route edges with libavoid (object-avoiding orthogonal connector routing). — [ELK blog: Edge Routing with Libavoid](https://eclipse.dev/elk/blog/posts/2022/22-11-17-libavoid.html)

### Inferences
- Design idea: for textbook-style output, pre-process before ELK. (1) Put ground-connected nodes on a bottom rail and supply nodes on a top rail. (2) Orient two-terminal parts vertically when they connect to ground or supply, horizontally otherwise. (3) Use FIXED_SIDE ports, with a resistor's pins on west/east or north/south, chosen by that orientation. (4) Lay out left-to-right from sources toward loads. Then let the user nudge parts, with drag rubber-banding re-routing wires.
- For live editing, a simpler A*/grid-based orthogonal router between pins (or libavoid-js) is better than re-running a global layout, because global relayout moves parts the user already placed.
- elkjs runs in a Web Worker, which keeps layout off the UI thread on phones (background, unverified).

### Gaps
- No academic paper specifically on analog schematic auto-placement was retrieved in this pass. Search terms like "schematic generation from netlist placement" or "automatic schematic diagram generation" would be the next step.

## 5. Entering circuits from textbook images (recognition research and feasibility)

### Takeaway
Image-to-netlist is an active research area with public datasets (CGHD for hand-drawn work, Masala-CHAI's textbook corpus, AMSNet, CircuitThink) and recent pipelines (SINA, 2026) that combine a YOLO detector, connectivity inference, OCR and a VLM. Accuracy is good for component detection but weaker for full connectivity. A realistic product design is "AI draft + user correction in the editor", not fully automatic entry.

### Cited Findings
- **CGHD** (Circuit Graph Hand-Drawn): public images of hand-drawn circuits with annotations and segmentation ground truth. The latest Zenodo listing reports 3,269 annotated raw images, 248,020 bounding-box annotations and 320 binary segmentation maps. Version 5 had 2,208 images and 58 classes. — [Zenodo CGHD](https://zenodo.org/records/15333233); [Zenodo earlier version](https://zenodo.org/records/7331677)
- Each CGHD drafter drew 12 circuits twice and photographed each drawing 4 times under varied camera, lighting and paper conditions. A modular pipeline on CGHD reports 98.16% binary-segmentation accuracy but only 53.37% in template-assisted orientation regression. — [Modular Graph Extraction for Handwritten Circuit Diagram Images, arXiv 2402.11093](https://arxiv.org/pdf/2402.11093)
- CGHD limitation: component connector types are not differentiated, which limits accurate simulation of non-linear circuits (for example knowing which diode pin is the anode). — [SciTePress 2023 paper](https://scitepress.org/publishedPapers/2023/117526/pdf/index.html)
- **SINA** (Jan 2026): an open-source pipeline from schematic images to SPICE-compatible netlists, using YOLOv11 detection, connectivity inference, OCR plus a VLM for reference designators. Self-reported: 96.47% component-detection F1 on 75 schematics, and 2.72x the overall accuracy of Masala-CHAI on a 40-schematic comparison. — [SINA, arXiv 2601.22114](https://arxiv.org/pdf/2601.22114)
- **Masala-CHAI**: a corpus of 7,500 schematics from 10 textbooks, used to benchmark open and proprietary LLMs on netlist generation. Dataset and code are open-sourced. — [arXiv 2411.14299](https://arxiv.org/abs/2411.14299v5)
- **AMSNet**: transistor-level schematics paired with SPICE netlists for multimodal LLM work. — [arXiv 2405.09045](https://arxiv.org/abs/2405.09045v2)
- **CircuitThink** (AAAI 2026): 3,100 circuit-image/netlist samples with step-by-step annotations. — [AAAI proceedings](https://ojs.aaai.org/index.php/AAAI/article/view/37465/41427)

### Inferences
- Feasibility with a local vision model: a general local VLM alone is likely unreliable at connectivity, since the dedicated pipelines above still need a detector plus explicit wire tracing. A practical design is to ask the model for a JSON netlist plus approximate part positions, then feed that through the auto-layout path (section 4) and show the result next to the source image for side-by-side correction. Optionally overlay the image as a semi-transparent "trace layer" under the editor grid, so users can redraw over it quickly.
- Validation helps catch AI errors cheaply: check for floating nodes, a missing ground, voltage-source loops and parts with an unconnected pin before simulating, and highlight the suspect elements.

### Gaps
- No head-to-head numbers for small local VLMs (for example Qwen-VL or LLaVA class) on Masala-CHAI or CGHD were found. Accuracy figures above are self-reported by the paper authors, with differing protocols.
- Licenses for CGHD, Masala-CHAI and SINA were not checked.

## 6. 3D rendering in the browser (library choice, instancing, schematic-to-3D mapping, mobile performance, reduced motion)

### Takeaway
For a modest scene that must load fast on phones, Three.js is the pragmatic choice: about 168 kB min+gzip vs about 1.4 MB for Babylon.js. Animated charge particles should be one `InstancedMesh` (or a `Points` cloud) per particle look, updated per frame, with the instance count set explicitly and shadows avoided on mobile.

### Cited Findings
- Bundlephobia sizes: Three.js v0.175.0 about 168.4 kB min+gzip, Babylon.js v8.1.1 about 1.4 MB. Babylon is modular and tree-shakable. — [Utsubo: Three.js vs Babylon.js vs PlayCanvas (2026)](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)
- Mobile anecdotes: one user found Three.js smoother on Android/iOS, tracing it to Babylon's CascadedShadowGenerator, which is costly on mobile. Another first-frame slowness report was disputed as a mobile-emulation artifact. — [Babylon forum thread](https://forum.babylonjs.com/t/babylonjs-takes-longer-to-render-the-first-frame-on-mobile-compared-to-threejs/41213)
- InstancedMesh renders many objects in a single draw call. A community guide reports about 19,365 draw calls reduced to 2 (desktop M1 test) and recommends instancing for 100+ repeated objects sharing geometry and material. — [three.js forum](https://discourse.threejs.org/t/rendering-thousands-of-objects-results-in-low-fps-but-also-low-gpu-usage/40142.md); [threejs-perf skill guide](https://www.typingmind.com/skills/playableintelligence-threejs-perf)
- Common bug: the InstancedMesh `count` must be set explicitly, or all allocated instances draw. Stacking many instances at the same spot causes overdraw slowdowns. — [three.js forum: drawing 1,000,000 spheres](https://discourse.threejs.org/t/how-to-draw-spheres-more-than-1000000/19731)
- Per-instance culling mainly helps mobile and low-end GPUs. One report went from about 15 fps to 60 fps on an older iPhone when only 20 to 30% of instances were visible. — [three.js forum: instance placement performance](https://discourse.threejs.org/t/seeking-advice-on-three-js-instance-placement-performance/67434)
- An older raw-WebGL test reported about 150k instanced particles at 60 fps on an iPhone 6+, heavily hardware-dependent. — [Hacker News](https://news.ycombinator.com/item?id=9333910)

### Inferences
- Charge particles: an educational circuit needs on the order of 10 to 50 dots per wire, so a few thousand instances in total, which is far below the limits above. Compute each particle's position as `pathLength * fract(phase + speed * t)` along the wire polyline, with speed proportional to branch current and sign giving direction. Doing this in a vertex shader (a per-instance attribute for wire ID and offset, plus a uniform for time) avoids per-frame CPU matrix updates.
- Schematic-to-3D mapping ideas: (a) an "extruded board" that reuses the 2D layout, with wires as tubes and parts as low-poly 3D models; (b) voltage-as-height, where each net's wire segments are lifted to z = V(node) and parts become ramps between heights (resistors as slopes, sources as "lifts"), which makes KVL visible as "the loop returns to the same height"; (c) current as particle speed and density, power as glow or color on resistors. Keep the 2D schematic as the source of truth and generate the 3D scene from the same JSON.
- Mobile tips (background, unverified): cap devicePixelRatio at about 2, use `MeshBasicMaterial`/`MeshLambertMaterial` over PBR, skip real-time shadows (bake a fake contact shadow), render on demand when nothing animates, and pause the loop when the tab is hidden.
- Reduced motion: honor `prefers-reduced-motion: reduce` by replacing streaming particles with static arrows or a slow, low-contrast animation, and offer an in-app toggle. This is standard CSS media-query practice, not verified against a source in this pass.
- WebGPU: Three.js has a WebGPURenderer with WebGL fallback (background, unverified). For this modest scene, WebGL2 is enough and has wider phone support.

### Gaps
- No controlled, current mobile benchmark comparing Three.js and Babylon.js was found. The evidence is anecdotal.
- Prior educational examples of "voltage-as-height" 3D circuit views (for example the "ski-lift" analogy visualizations) were not searched for in this pass.

## 7. Accessibility (keyboard-only editing, screen-reader circuit descriptions)

### Takeaway
Research shows plain alt-text circuit descriptions work for experienced users but leave novices struggling with spatial structure. Tactile schematics have design standards but do not scale to a course's hundreds of circuits. A netlist-backed editor is well placed to generate structured, navigable descriptions (node by node and element by element) and to support full keyboard editing.

### Cited Findings
- Circuit diagrams have historically been conveyed to blind users through alt-text read by a screen reader, and a study found novices struggled with this. — [Dartmouth AccessibleCircuit paper](https://cs.dartmouth.edu/%7Ezheer/files/AccessibleCircuit.pdf)
- Experienced builders can use written circuit descriptions, but beginners benefit from the spatial information a schematic provides. — [IEEE Spectrum](https://spectrum.ieee.org/you-dont-need-sight-to-read-these-electronic-schematics)
- Lauren Race (NYU ITP) developed design standards and best practices for converting schematics to tactile schematics. — [NYU ITP thesis 2019](https://itp.nyu.edu/shows/thesis2019/?p=3337)
- Tactile schematics cannot scale to the hundreds of circuits in a single intro ECE course. — [a11y review](https://a11y-paradise.onrender.com/reviews/69b2c2fe3b3ba4c602a56f57)
- At UNED (Spain), staff simplify each image and ONCE experts produce tactile diagrams that are mailed to the student. An inaccessible circuit simulator was flagged as a barrier. — [Open University APS 2023 abstracts](https://university.open.ac.uk/widening-participation/external-events-and-publications/biennial-aps-conference/2023-abstracts-towards-accessibility-digital-electronics)
- The TeDUB project presented technical diagrams, including circuits, via a screen reader, with extra detail via low-cost joysticks. — [CORDIS TeDUB](https://cordis.europa.eu/project/id/IST-2001-32366/results/fr)

### Inferences
- Design ideas: (1) a parallel "netlist view" as an ARIA tree, listing nodes and, under each node, the connected element terminals ("Node Vout: R1 pin 2, C1 pin 1, probe"), so arrow keys walk the graph topologically; (2) element announcements like "R1, resistor, 1 kilohm, between node Vin and node Vout, current 2.3 milliamps left to right"; (3) keyboard editing: Tab/arrow keys move a grid cursor, a key places the selected part, Enter on a pin starts a wire, arrow keys extend it, and Enter on another pin completes it; (4) a live region announcing simulation results after each change; (5) text entry of a netlist line as a first-class way to add parts, which helps keyboard and screen-reader users and also serves power users.
- Keep SVG for the 2D schematic so every element can be a focusable DOM node with `role` and `aria-label`. A pure canvas renderer would need a separate hidden DOM mirror.

### Gaps
- The Dartmouth paper's specific design and evaluation results were only seen in a snippet. Fetching it would give concrete interaction techniques.
- No WCAG-specific guidance for interactive diagram editors was retrieved in this pass.
