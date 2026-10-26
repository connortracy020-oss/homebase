# Local codebases: Circuit Foundry and Homebase (input for a Circuits simulator in Homebase)

Read-only survey done 2026-10-26. Nothing was changed in either folder. "Sources" are local file paths.
CF = `C:\Users\conno\Documents\Codex\2026-10-06\are\outputs\CircuitFoundry`. HB = `C:\Users\conno\Documents\Homebase`.

## 1. Circuit Foundry: tech stack, structure, size, license

### Takeaway
Circuit Foundry is a React 19 + TypeScript + Vite 8 Electron app. Its 3D view uses **Babylon.js 9.29 (not Three.js)**. The 2D view is React SVG laid out by elkjs 0.11 in a Web Worker. Tests run on Vitest 4 plus Playwright. It is a digital-logic (nand2tetris HDL) tool with no analog or MNA code. Nothing in it runs without a bundler.

### Cited Findings
- package.json: name `circuit-foundry`, version 0.4.0, `"private": true`, `"license": "UNLICENSED"`, author "Local development for Connor Tracy", Electron entry `desktop/main.cjs`. — [CF/package.json](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/package.json)
- Scripts: `vite` dev on 127.0.0.1:5178, `vite build`, `tsc --noEmit`, `vitest run`, `eslint src`, `prettier`, `playwright test --config tests/visual/playwright.config.mjs`, `electron .`. — [CF/package.json](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/package.json)
- Dependencies (all listed under devDependencies):
  - Rendering and layout: @babylonjs/core 9.29.0, @babylonjs/loaders 9.29.0, elkjs ^0.11.0 (0.11.1 installed).
  - UI: react 19.3.0, react-dom 19.3.0, motion 13.4.0, lucide-react ^0.468, monaco-editor ^0.57 with @monaco-editor/react.
  - Parsing and language: ohm-js 17.5.0 (HDL grammar), rxjs 7.8.2.
  - Tooling: typescript ^5.9.3, vite 8.3.3, vitest ^4.1.11, jsdom 30.1.2, @testing-library/react 16.3.3, @playwright/test ^1.63, @axe-core/playwright 4.13, eslint 10, prettier 3.9.
  - Fonts: Inter, JetBrains Mono, DM Sans and IBM Plex Mono via @fontsource.
  - Source: [CF/package.json](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/package.json)
- There are no `three` imports. Babylon is imported per module, e.g. `@babylonjs/core/Cameras/arcRotateCamera`, `Engines/webgpuEngine`, `Layers/glowLayer`, `Layers/highlightLayer`, `PostProcesses/.../defaultRenderingPipeline`, `ssao2RenderingPipeline`. — grep of [CF/src](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src)
- tsconfig: ES2022, `strict: true`, `moduleResolution: Bundler`, `jsx: react-jsx`, path aliases into `vendor/nand2tetris/...`. vite.config.ts: React plugin, `base: './'`, ES-module workers, Vitest using `pool: 'forks'`, `maxWorkers: 3`, testTimeout 60 s. — [CF/tsconfig.json](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/tsconfig.json), [CF/vite.config.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/vite.config.ts)
- Main folders: `src/render` (3D and 2D), `src/sim` (worker simulation), `src/compiler`, `src/toolchain` (Jack/VM/assembler), `src/ui` (App, features/*, premium/*, instruments/*), `src/assistant` (local tutor), `src/document`, `src/shared/types.ts`, plus `desktop/*.cjs` (Electron), `vendor/nand2tetris`, `course/`, `tests/`, `docs/`, `work/` (QA scripts). — directory listing of [CF](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry)
- The `src` tree totals about 2.55 MB of source. The largest files are:

  | File | Size | Lines |
  |---|---|---|
  | `src/ui/App.tsx` | 216 KB | 5,408 |
  | `src/render/Workbench.tsx` (Babylon) | 162 KB | 3,793 |
  | `src/ui/styles.css` | 75 KB | |
  | `src/sim/session.ts` | 57 KB | 1,411 |
  | `src/ui/features/execution/execution-controller.ts` | 41 KB | |
  | `src/ui/premium/shell.css` | 40 KB | |
  | `src/render/modules.ts` | 36 KB | 1,024 |
  | `src/render/Schematic.tsx` | 23 KB | 611 |
  | `src/render/routing.ts` | 21 KB | 578 |
  | `src/render/signals.ts` | 13 KB | 320 |
  | `src/render/schematic-layout.ts` | 11.5 KB | 309 |
  | `src/render/schematic.worker.ts` | 0.9 KB | |
  | `src/render/theme.ts` | 2.6 KB | |
  | `src/ui/premium/tokens.css` | 9 KB | |

  Source: `wc` over [CF/src](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src)
- There are 158 `*.test.ts(x)` files across `tests/` and `src/`. The 0.4 notes report "1,036 passed, 0 failed, 9 opt-in checks skipped" and 90 Playwright visual snapshots plus 44 contrast checks. A later update reports 1,052 tests passing. — [CF/docs/What is new in 0.4.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.4.txt)
- `dist/` is about 16 MB. In 0.3 the first JS chunk went from 6.38 MB to 1.53 MB through lazy loading, and total JS is 10.49 MB. elkjs alone ships `elk-worker.min.js` at 1.59 MB (`elk.bundled.js` 1.6 MB). — [What is new in 0.3.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.3.txt); `node_modules/elkjs/lib` listing
- Licenses of the pieces that could be reused:
  - elkjs: **EPL-2.0** — `node_modules/elkjs/package.json`
  - Babylon core: Apache-2.0 — [docs/licenses/Babylon-core-9.29.0-Apache-2.0.md](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/licenses)
  - motion: MIT — docs/licenses/motion-13.4.0-MIT.md
  - The vendored nand2tetris web IDE and projects are MIT (© Schocken/Nisan, based on Volpe and Yaish tools). Some legacy course files are GPL-2.0 or CC-BY-NC-SA-3.0. — [CF/course/LICENSE](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/course/LICENSE), [docs/licenses/](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/licenses)
- AGENTS.md says it is "a local-only application ... Never publish or distribute externally". — [CF/AGENTS.md](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/AGENTS.md)
- START HERE.txt still describes 0.2.1. The 0.4 notes name the build `release\CircuitFoundry-0.4.0-srca75dcbb-...\Circuit Foundry.exe`. — [START HERE.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/START%20HERE.txt), [What is new in 0.4.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.4.txt)

### Inferences
- The code is Connor's own and private, so reusing it inside Homebase raises no license issue. The third-party pieces do: elkjs is EPL-2.0, which is fine for personal use and vendoring, but it is weak copyleft if the code were ever distributed.
- Any port to Homebase's no-build vanilla JS would mean stripping TypeScript types and React. Only small, framework-free modules would be cheap to port.

### Gaps
- Plugged-in performance and the exact current test count were not re-run; this was read-only, so no `npm test` was executed.

## 2. Circuit Foundry: how the 3D scene and 2D schematic are built, and how simulation state drives visuals

### Takeaway
Simulation runs in a Web Worker and sends `SimulationSnapshot` objects (port values keyed `node.port`). Both views read only snapshot values and the `CircuitGraph`. The 3D Workbench diffs net values between snapshots and turns them into glow, pulses and sparklines. The 2D Schematic is an SVG drawn from an ELK layered layout computed in a worker.

### Cited Findings
- The data model is `CircuitGraph {nodes, nets, inputs, outputs}`:
  - `CircuitNode {id, type, label, provenance, ports[]}`
  - `CircuitNet {id, name, width, from: PortRef, to: PortRef[]}`, where `PortRef` can carry a bit slice (start/end)
  - `CircuitLayout` stores the 3D positions (x, z, rotation, fixed) and wire bends separately from the topology.
  - Source: [src/shared/types.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/shared/types.ts)
- `SimulationSnapshot` holds `sourceRevision`, `sequence`, `cycle`, `phase`, `inputs`, `outputs`, `portValues: Record<string, number>`, registers/ram/screen, diagnostics, provenance and batch/running state. — [src/shared/types.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/shared/types.ts)
- The worker protocol is a command union: `compile`, `set-input`, `tick`, `tock`, `reset`, `snapshot`, `run-test`, `step`, `load-cpu`, `keyboard`, `read-memory`, and so on. Requests carry `requestId/revision/sequence`. — [src/sim/protocol.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/sim/protocol.ts), [src/sim/worker.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/sim/worker.ts), [src/sim/client.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/sim/client.ts)
- The 3D engine tries a `WebGPUEngine` first and falls back to `Engine` (WebGL2). It uses an `ArcRotateCamera` and `engine.runRenderLoop`, plus Walk (WASD, "Minecraft-style") and Orbit camera modes. — [src/render/Workbench.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/Workbench.tsx) lines ~1468-1532, 1876, 2608
- The values-to-light effect works like this (Workbench.tsx ~2871-2926):
  - For each net, it reads the driver's port value from the snapshot and compares it with the last value.
  - It records the value in a history used for the sparklines.
  - While running, it keeps an activity level that decays: `old*0.55 + 0.45` when the value changed.
  - When idle, it plays "pulse flights" along the changed wires, delayed by topological level (`level*step`).
  - Pulses are skipped when reduced motion is on or signal pulses are disabled.
  - Source: [Workbench.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/Workbench.tsx)
- signals.ts draws each net as a round cable along a rotation-minimising frame (buses are thicker). A non-zero value glows, and scrolling dashes "show direction only, not timing or propagation". It states: "Nothing here advances, alters or invents simulation state." — [src/render/signals.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/signals.ts)
- Other render modules:
  - `modules.ts`: parametric chip housings with chamfer rings, silkscreen canvas textures and shared instanced geometry.
  - `routing.ts`, `obstacle-index.ts`, `crossing-cache.ts`, `path-cache.ts`, `mesh-update.ts`: 3D cable routing with retained buffers.
  - `presentation.ts`: a left-to-right auto-arrange with one column per step.
  - `dive.ts`: camera tweens for semantic zoom.
  - `cinematic.ts`: tone mapping, SSAO and highlight outlines.
  - `studio.ts`: procedural environment light.
  - `labels.ts`: label placement.
  - `wiring.ts`: the sagging drag cable, which is drawing only.
  - Source: header comments in [src/render/](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render)
- The 2D schematic works in four steps:
  - `schematic-layout.ts` builds an ELK graph: `elk.algorithm: layered`, `direction: RIGHT`, `edgeRouting: ORTHOGONAL`, `portConstraints: FIXED_POS`, LAYER_SWEEP crossing minimisation, BRANDES_KOEPF placement. Inputs are pinned to the FIRST layer and outputs to the LAST.
  - It reads the sections back into SVG polylines. Junction dots come only from branches of the same net, so a crossing is never drawn as a connection.
  - It places collision-checked labels such as `name[a..b] /16`.
  - `readableWireLabels` keeps labels at least 12 px after fit.
  - Source: [src/render/schematic-layout.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/schematic-layout.ts)
- `schematic.worker.ts` (about 20 lines) runs ELK through `elk-api.js` with its own `elk-worker.min.js?url` worker. — [src/render/schematic.worker.ts](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/schematic.worker.ts)
- `Schematic.tsx` is a React `<svg>`:
  - It holds a `{zoom, x, y}` view state, with wheel zoom clamped to 0.4-8× and pointer-capture drag to pan.
  - It has Fit, ±, Inspect and Connect modes and a `GateSymbol` component of hand-drawn IEC/ANSI-style SVG paths for And/Nand/Or/Xor/Not/Mux/DMux.
  - Hover values read `snapshot.portValues`.
  - Source: [src/render/Schematic.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/Schematic.tsx)
- The 3D Workbench is lazy-loaded from App.tsx: `lazy(() => import("../render/Workbench"))`. — [src/ui/App.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/ui/App.tsx) line 196

### Inferences
- The architecture pattern transfers directly to an analog simulator even though the code is digital:
  - the solver runs off the UI thread and produces immutable snapshots;
  - the views are pure functions of (graph, layout, snapshot);
  - the layout is kept separate from the topology.
- For DC or transient analog, the "value" per net becomes a node voltage, and each branch also needs a current (direction and magnitude). CF has no concept of current, so `signals.ts` would need new semantics, not just a port.

### Gaps
- I did not trace every Babylon material or shader detail, or the camera code beyond the mode declarations.

## 3. Circuit Foundry: design principles and rules (AGENTS.md and the audit prompts)

### Takeaway
The rules come down to truthful visuals: every visual comes from real simulator state, graphics clocks never advance the simulation, layout never changes topology, heavy work stays off the UI thread, and evidence must be honest.

### Cited Findings
- AGENTS.md rules:
  - "Keep heavy operations off the UI thread."
  - "Spatial layout never changes logical topology."
  - "Show actual execution provenance and source revision."
  - "Tests must preserve known-failing student circuits as failures."
  - "Graphics clocks never advance the simulation."
  - Every implementation needs independent review with evidence, and "No fabricated passes or inflated 10/10."
  - It also sets out agent ownership by folder (Root, Simulation, Renderer, Toolchain).
  - Source: [CF/AGENTS.md](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/AGENTS.md)
- The premium-UI prompt restates these as three points: every glow, pulse and number comes from real simulator state; graphics clocks never advance the simulation; "No animation may imply physical timing that is not modeled." — [Codex prompt - premium UI.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt%20-%20premium%20UI.md)
- The prompt's design principles:
  1. Signals are light; the circuit is the hero and the UI is quiet glass chrome.
  2. Every effect carries meaning.
  3. Motion takes 150-250 ms, is spring-based and interruptible, and respects reduced motion.
  4. Premium means restraint.
  5. Performance is a feature: 120 fps for a small circuit, 60 fps for the CPU, no main-thread stall over 50 ms, and a Battery preset.
  6. Accessibility: colour is never the only cue, focus is always visible, and sound is off by default.
  - Source: [Codex prompt - premium UI.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt%20-%20premium%20UI.md)
- The required legend wording for pulses is "evaluation-order replay, not physical delay". In practice, dashes run on the graphics clock and "show direction only, not timing". — same prompt; [What is new in 0.4.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.4.txt)
- The taste references are Turing Complete, NandGame, Spline/Figma, Linear/Raycast, Teenage Engineering/Logic Pro and Bret Victor's explorable explanations. — [Codex prompt - premium UI.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt%20-%20premium%20UI.md)

### Inferences
- For an analog simulator these principles turn into concrete rules:
  - Current-flow animation speed must be labelled as a visual encoding of magnitude, not electron drift speed.
  - Transient playback must show the simulated time base (for example "1 ms of circuit time = 1 s on screen").
  - Values shown must come from the solver, never be interpolated between solver steps unless labelled.

### Gaps
- None.

## 4. Circuit Foundry: what worked and what the audit criticised

### Takeaway
The audit of v0.2.1 found the engine solid (674 tests, no console errors, no crashes). Circuits above about 5 parts were unreadable in both views, the layout wasted space, and App.tsx was unmaintainable. Later releases (0.3, 0.4) report fixes, but the self-reported "completed" status should be read with care. The P0 "after-verified" CPU diagram still looks cramped. App.tsx grew rather than shrank.

### Cited Findings
- Audit summary: "The engine is solid: 674 tests pass... What holds the app back is that circuits beyond about 5 parts are unreadable, the layout wastes space and mixes unrelated tools, and the code is hard to maintain." — [Codex prompt.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt.md)
- **Readability (P0):** with a 20-part CPU, "boxes look identical, labels collide... most modules have no visible name, cables cross everywhere, and the circuit fills about a third of the viewport." The audit asked for:
  - a true 2D schematic with real gate symbols and an elkjs left-to-right layout, orthogonal routing, junction dots, bus width marks and collision-free labels;
  - a 3D view that auto-fits to about 85%, uses level-of-detail labels, gives each chip type a distinct silhouette, and highlights a whole net on selection;
  - constants drawn as stubs.
  - Source: [Codex prompt.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt.md)
- **Layout (P1):**
  - The marketing header costs about 110 px.
  - The inspector is not context-aware.
  - Values show as unlabelled triplets ("0 · 0 · 0x0000").
  - The nav collapses badly at 1080x760, and the toolbar wraps at 820 px.
  - There were duplicate and unlabelled icons.
  - Errors were shown three times.
  - Source: [Codex prompt.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt.md)
- **Performance (P2):** the web build was one 6.5 MB JS file taking about 9 s to settle, and the all-NAND CPU ran about 530 cycles/s. — [Codex prompt.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt.md)
- **Code quality (P2):** "src/ui/App.tsx is 108 KB in effectively 3 functions with 80 useState hooks, and has a single 5,601-character line". — [Codex prompt.md](file:///C:/Users/conno/Documents/Circuit%20Foundry%20audit%202026-10-08/Codex%20prompt.md)
- **Claimed results in 0.3:**
  - First paint 0.92 s instead of 2.06 s; 3D ready at 1.57 s.
  - The all-NAND Computer reached 24,993-26,782 cycles/s, measured in Node.
  - Prettier and ESLint were added.
  - App.tsx was "still about 4,000 lines".
  - Source: [What is new in 0.3.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.3.txt)
- **Claimed results in 0.4:**
  - Measured fps: RTX Cinematic 56-65, Balanced 74-84; Radeon 890M Cinematic 26-28.
  - The 120 fps goal was not met.
  - 4 main-thread stalls of 51-79 ms happened while orbiting.
  - "App.tsx grew rather than shrank (about 4,800 lines)". It is 5,408 lines and 216 KB on disk today.
  - Source: [What is new in 0.4.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.4.txt); `wc` of src/ui/App.tsx
- **Things 0.4 changed after use:**
  - 16-lane bus ribbons "twisted, pinched and folded over each other at bends" and were replaced with round cables.
  - Selection painting wires cyan looked like a 1, so selection became an amber outline.
  - Interface board positions collided across chips.
  - Zoom crawled near the pivot.
  - Source: [What is new in 0.4.txt](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/What%20is%20new%20in%200.4.txt)
- `docs/audit/progress.json` marks items 1-42 "completed" except item 39 (code-quality split), which is "partial". This status is self-reported by the agent that did the work. — [docs/audit/progress.json](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/audit/progress.json)
- The P0 evidence screenshot `docs/audit/p0-readability/after-verified/cpu-diagram-1440x900.png` (viewed) shows:
  - the CPU diagram occupying roughly half of a canvas that sits inside a framed panel;
  - generic labels such as "A#10", "M#2", "¬#1";
  - large bounding rectangles and long wires overlapping;
  - the "INTERACTIVE ELECTRONICS LAB / Arrange. Connect. Inspect. Follow every bit." header still present.
  - Source: [after-verified/cpu-diagram-1440x900.png](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/audit/p0-readability/after-verified/cpu-diagram-1440x900.png)
- Before/after galleries: `docs/audit/gallery.html` and `docs/audit/premium/gallery.html`. — [docs/audit](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/docs/audit)

### Inferences
- Lessons for the new simulator:
  - Generic auto-layout (ELK) of a netlist gives correct but cramped, unnatural schematics. Textbook-style analog circuits (ladders, bridges, op-amp stages) read better with authored or template layouts on a grid than with layered graph layout.
  - A single giant component file became unmaintainable, so the Homebase version should keep small files from the start.
  - 3D adds GPU cost (Radeon 890M at 26-28 fps on Cinematic) and complexity, and it does not help readability.
  - Visuals tied to real state worked and the user cared about them. Glow-only cues were confusing (cyan selection read as a "1").

### Gaps
- I did not open every audit screenshot. The judgement of the "after" diagram rests on one image.
- No user-written verdict on the 0.4 build was found in these folders.

## 5. Circuit Foundry: what could be reused or ported into Homebase

### Takeaway
Little code transfers as-is: CF is TypeScript/React/Babylon behind a bundler, and its domain is digital logic. What is worth reusing is the patterns (worker snapshot protocol, views as pure functions of state, net highlighting, collision-checked labels, gate SVG paths), two small framework-free modules (schematic-layout, the ELK worker wrapper) and, if wanted, the test discipline. The Babylon renderer, camera controls and React UI are not realistic ports into a no-build vanilla-JS page.

### Cited Findings
- Small, mostly framework-free TS modules (possible ports after stripping types):

  | Module | Size | What it does |
  |---|---|---|
  | `schematic-layout.ts` | 11.5 KB | ELK graph build, read-back, junction derivation, label placement, `highlightedNets` |
  | `schematic.worker.ts` | 0.9 KB | Runs ELK in a worker |
  | `wiring.ts` | 124 lines | Sag/spring drag cable math |
  | `dive.ts` | 108 lines | Tween helpers |
  | `labels.ts` | 2.3 KB | Label placement |
  | `theme.ts` | 2.6 KB | Bench colours |

  Source: [src/render/](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render)
- `GateSymbol` in Schematic.tsx is a handful of SVG paths for digital gates only. Analog symbols (resistor, sources, C, L, op-amp, ground) do not exist in CF. — [src/render/Schematic.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/Schematic.tsx)
- The 3D renderer (`Workbench.tsx`, 3,793 lines, plus `modules.ts`, `signals.ts` and `routing.ts`) is tightly bound to React props, Babylon, nand2tetris graph types and instanced chip housings. — [src/render/Workbench.tsx](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/src/render/Workbench.tsx)
- Test infrastructure: Vitest unit tests (e.g. `schematic-layout.test.ts`, `routing.test.ts`), Playwright visual snapshots at 3 viewport sizes × themes with `maxDiffPixelRatio: 0.005`, and axe contrast checks. — [tests/visual/playwright.config.mjs](file:///C:/Users/conno/Documents/Codex/2026-10-06/are/outputs/CircuitFoundry/tests/visual/playwright.config.mjs)
- elkjs ships prebuilt browser files (`lib/elk.bundled.js` 1.6 MB, `elk-worker.min.js` 1.59 MB, `elk-api.js` 9 KB). These could be vendored into a no-build static folder. — `node_modules/elkjs/lib` listing

### Inferences
- Recommendation for the planner: treat CF as a design reference rather than a code donor.
  - Reuse its principles (truthful visuals, worker or solver separation, net highlighting on selection, ≥12 px labels, reduced motion).
  - Optionally reuse the ELK settings if auto-layout is needed.
- Homebase already contains a tested Python MNA solver and an SVG circuit drawer (section 7), which is a closer starting point for analog work.
- If 3D is wanted at all, starting fresh with a small library would be cheaper than extracting CF's Workbench. Three.js or Babylon as a vendored ES module would work without a bundler.

### Gaps
- No measurement exists of how much of `schematic-layout.ts` survives without TypeScript or the CF graph types. This is an estimate from reading the code.

## 6. Homebase: architecture, pages, static files, theme, widgets

### Takeaway
Homebase is FastAPI + SQLModel/SQLite + Jinja2, with server-rendered pages and small vanilla JS files. There is no bundler, no npm and no HTMX; PLAN.md proposed HTMX but the code doesn't use it. Every page extends `base.html`. Static files get a cache-busting `?v=<mtime>` through `static_v()`. All colours are CSS tokens with a `[data-theme="dark"]` swap. Interactive widgets run in sandboxed `srcdoc` iframes with a strict CSP that only allows cdn.jsdelivr.net.

### Cited Findings
- `app/main.py` mounts `/static` from `app/static` and includes routers (pages, study, reviews, exam_routes, local_routes, notes_routes, speech_routes, and api under `/api`). Its lifespan runs `init_db()`, `seed()`, an hourly backup check and the local-AI worker. `create_app(run_lifespan=False)` exists for tests. — [HB/app/main.py](file:///C:/Users/conno/Documents/Homebase/app/main.py)
- It is started with `uvicorn app.main:app --host 0.0.0.0 --port 8254` (`run.ps1`, `.claude/launch.json`). `--reload` hangs on Windows (memory note). — [HB/run.ps1](file:///C:/Users/conno/Documents/Homebase/run.ps1), [HB/.claude/launch.json](file:///C:/Users/conno/Documents/Homebase/.claude/launch.json)
- `app/routes/pages.py`:
  - holds `TEMPLATES = Jinja2Templates(...)`;
  - defines filters `mdlite`, `num`, `hm`, `md`, `ts`, `longdate`, `tex` (`$x$`→`\(x\)`) and `ccolor` (`var(--c-<code>)`);
  - defines globals `KIND_LABELS` and `static_v = lambda name: int((ROOT/'app'/'static'/name).stat().st_mtime)`;
  - has a `render(request, name, session, **ctx)` helper that injects `courses`, `today`, `pending_reviews` and `due_reviews`, which the nav badges use.
  - The docstring says "Every form here also works without JavaScript".
  - Source: [HB/app/routes/pages.py](file:///C:/Users/conno/Documents/Homebase/app/routes/pages.py)
- `base.html`:
  - sets the theme before paint from `localStorage['homebase.theme']` or `prefers-color-scheme`;
  - loads Google Fonts (Fraunces and Inter) from fonts.googleapis.com;
  - loads `/static/style.css?v={{ static_v('style.css') }}` and a PWA manifest;
  - loads **KaTeX 0.16.11 from cdn.jsdelivr.net** (CSS, JS, auto-render), so it is not vendored;
  - defines `window.renderMath(el)`;
  - has a desktop top-tab nav (Today, Plan, Courses, Notes, Review, Exams, Feedback, Progress) and a phone bottom `tabbar` (Today, Courses, Review, Exams, More sheet);
  - provides blocks `title`, `header`, `main_class` (e.g. `wide`), `content` and `scripts`;
  - marks the current tab through a `here` dict that matches path prefixes.
  - Source: [HB/app/templates/base.html](file:///C:/Users/conno/Documents/Homebase/app/templates/base.html)
- Page scripts are added per template in `{% block scripts %}<script src="/static/notes.js?v={{ static_v('notes.js') }}">`. The same pattern is used for local_ai.js and readaloud.js. — [HB/app/templates/notes.html](file:///C:/Users/conno/Documents/Homebase/app/templates/notes.html), [reader.html](file:///C:/Users/conno/Documents/Homebase/app/templates/reader.html), [problem.html](file:///C:/Users/conno/Documents/Homebase/app/templates/problem.html)
- Static JS sizes are small: app.js 7.4 KB, notes.js 25 KB, readaloud.js 11 KB, local_ai.js 11.6 KB, video.js 6 KB. style.css is 62 KB. Each JS file is a plain IIFE with no modules. — [HB/app/static](file:///C:/Users/conno/Documents/Homebase/app/static)
- `app.js` owns light/dark. `window.homebaseTheme.set('light'|'dark'|'device')` dispatches a `homebase-theme` CustomEvent and updates `meta[name=theme-color]`. "Every form still works if this file fails to load." — [HB/app/static/app.js](file:///C:/Users/conno/Documents/Homebase/app/static/app.js)
- style.css tokens ("warm tactile"):
  - Surfaces and ink: `--bg #f2ece0`, `--surface #fbf8f1`, `--raised`, `--sunken #ebe4d5`, `--field`, `--line #e2d9c6`, `--hair`, `--ink #26251f`, `--ink-soft`, `--ink-faint`, `--paper`.
  - Keys: `--key`, `--key-edge`, `--key-ink*`, `--shine`.
  - Courses: `--c-ece201 #b06a4a` (terracotta), `--c-mth254 #7a8456` (olive), `--c-ece200 #5b7790` (slate), and `--accent`.
  - Accents: `--moss`, `--ochre`, `--brick`, `--plum`.
  - Status pairs: `--ok/--ok-bg`, `--mid`, `--bad`, `--info`, `--warn`, `--claude`.
  - Shape and type: `--card-shadow`, `--radius 14px`, `--font` Inter, `--serif` Fraunces.
  - `[data-theme="dark"]` swaps every token (e.g. `--bg #1a1916`, `--c-ece201 #c98466`).
  - Breakpoints at 900/820/600 px, `pointer: coarse` and `prefers-reduced-motion`.
  - Source: [HB/app/static/style.css](file:///C:/Users/conno/Documents/Homebase/app/static/style.css)
- Existing circuit-drawing CSS: `svg.circuit` strokes use `var(--ink)` with stroke-width 2, element rects are filled with `var(--surface)`, text uses `var(--ink)` 14 px, `.arrow` uses `var(--c-ece201)`, and `.circuit-wrap {overflow-x:auto}`. Generated problem SVGs are inlined with `{{ st.svg | safe }}` and a visually-hidden text `diagram` description. — [style.css](file:///C:/Users/conno/Documents/Homebase/app/static/style.css) lines 387-394; [problem.html](file:///C:/Users/conno/Documents/Homebase/app/templates/problem.html) line 28
- The UI plan's rules:
  - Calm by default: course colour only as a stripe, dot or chip.
  - Motion under 0.15 s, only on touch.
  - Phone first: nothing scrolls sideways, and tap targets are at least 36 px.
  - "PDF crops and circuit drawings get a gentle frame in dark mode".
  - WCAG AA, and "no new framework".
  - Buttons are keycaps with a 2 px press.
  - Source: [HB/design/UI-PLAN.md](file:///C:/Users/conno/Documents/Homebase/design/UI-PLAN.md)
- Widgets (`app/widgets.py`):
  - Note blocks of kind "interactive" render as `<iframe class="nb-widget" sandbox="allow-scripts" loading="lazy" srcdoc=...>`. There is no allow-same-origin, so the frame has an opaque origin and no access to the app's cookies or API.
  - The CSP is `default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src ... ; connect-src 'none'; frame-src 'none'`.
  - The wrapper injects a copy of the theme tokens (`--c201/--c254/--c200`, `--accent` by `data-course`) and the `HB` helper (`HB.color`, `HB.theme`, `HB.onTheme`, `HB.math`).
  - The frame posts its height to the parent (capped at 900 px), and KaTeX loads from jsdelivr inside it.
  - Source: [HB/app/widgets.py](file:///C:/Users/conno/Documents/Homebase/app/widgets.py)
- On the host side, notes.js posts `{hb:'theme', theme, course}` into each `iframe.nb-widget` on load and on `homebase-theme`, and resizes frames from `{hb:'height'}` messages (min 60, max 900 px). — [HB/app/static/notes.js](file:///C:/Users/conno/Documents/Homebase/app/static/notes.js) lines ~340-357
- MCP instructions for interactive illustrations:
  - pixel-sized SVG viewBox, max-width about 360 px, under about 450 px tall;
  - pointer events for touch;
  - theme variables, with `HB.onTheme` for canvas redraws;
  - only pinned jsdelivr libraries.
  - Source: Homebase MCP server instructions (in [HB/app/mcp_server.py](file:///C:/Users/conno/Documents/Homebase/app/mcp_server.py)); [HB/docs/claude-project-instructions.md](file:///C:/Users/conno/Documents/Homebase/docs/claude-project-instructions.md)
- No service worker exists: grep for `serviceWorker` and `sw.js` in `app/` finds nothing. Only `manifest.webmanifest` is present for "Add to Home Screen". — grep of [HB/app](file:///C:/Users/conno/Documents/Homebase/app)

### Inferences
- **Adding a Circuits page** takes five pieces:
  1. A route in a new or existing router (`@router.get("/circuits")` and `/circuits/{slug}`) that returns `render(request, "circuits.html", session, ...)`.
  2. A template extending `base.html` with `main_class` `wide`.
  3. `{% block scripts %}<script src="/static/circuits.js?v={{ static_v('circuits.js') }}"></script>`.
  4. A nav entry in both the desktop `.tabs` and the phone "More" sheet, plus the `here` dict prefix. Circuits could also sit under Courses (ECE 201) to keep the nav short.
  5. `app.include_router` in main.py if it gets a new router.
- **No-build constraint:** the simulator must be hand-written ES (plain `<script>` IIFEs, or `<script type="module">` with relative imports, which works without a bundler). Libraries must be vendored as prebuilt files under `app/static/vendor/` or loaded from the jsdelivr CDN like KaTeX. TypeScript or JSX would need a build step, which goes against current conventions.
- **Offline:** today Homebase needs the internet for KaTeX and Google Fonts; fonts fall back to system fonts, but math does not render without KaTeX. A circuits page meant to work offline or on a flaky phone link should vendor its own JS and math, or avoid KaTeX in the canvas.
- Running the simulator inside a sandboxed widget iframe only fits small illustrations: it has no access to the API, a 900 px height cap and network limited to jsdelivr. A full simulator should be a first-class page with its own static JS. Saved circuits can use normal routes and SQLite.
- **Phone over Tailscale:** the page must work at iPhone width with touch (pointer events), 36 px targets and no sideways scroll, served from `http://<laptop>:8254`. That is plain HTTP, not a secure context, so service workers, `crypto.subtle` and clipboard write would not be available on the phone.

### Gaps
- Whether a non-HTTPS Tailscale origin blocks specific APIs on iOS Safari was not tested here; that conclusion comes from general web-platform rules.

## 7. Homebase: content, problems, generators and the existing circuit solver

### Takeaway
Content is JSON in `content/<course>/weekNN.json` that points at PDF pages and regions (Ulaby and others) in the git-ignored `library/`; book text is never copied. Generated problems come from Python generators that compute and double-check their keys. `app/generators/circuits_dc.py` already contains a tested modified nodal analysis (MNA) solver: R, V, I, VCCS, VCVS and ideal op-amp, with KCL and power-balance self-checks. It also has an SVG ladder/part drawer. `circuits_transient.py` checks RC/RL answers with RK4.

### Cited Findings
- Rules from content/README.md:
  - "Never put problem text, solution text or book text in them". Generated problems are the exception.
  - Regions are `{pdf, page, start, end}` (text-anchored crops), `{pdf, pages:[...]}` or `{images:[...]}`.
  - `key_type` is one of `official_worked | official_answer | computed | none`.
  - A problem set can use a pattern (`"page": "auto:Exercise 2-{n}"`) or an explicit list.
  - `scripts/validate_content.py --render <course>` must report 0 errors.
  - Source: [HB/content/README.md](file:///C:/Users/conno/Documents/Homebase/content/README.md)
- ECE 200 labs show how an interactive or practical feature plugs in. A `"labs"` array in weekNN.json has `id`, `number`, `title`, `goal`, `handout` (a resource PDF) and `starter`. The checks live in `app/lab_checks/<course>.py` (`CHECKS[number]`), there is a `/lab/{id}` page, and plan tasks link to it with `"lab": "<id>"`. — [HB/content/README.md](file:///C:/Users/conno/Documents/Homebase/content/README.md); [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md) "Python labs"
- Generator registry: each module defines `GENERATORS = {name: fn(seed) -> dict}`, merged in `app/generators/__init__.py`. That file also provides `generate(name, seed)` and `check_answer(expected, given)`. — [HB/app/generators/__init__.py](file:///C:/Users/conno/Documents/Homebase/app/generators/__init__.py)
- Problem dict shape: `{"statement": {"text", "diagram" (text description), "svg"}, "key": {"answers": [{label, value, unit, tol}], "steps" (3-8), "checks"}, "topics"}`. — [circuits_dc.py](file:///C:/Users/conno/Documents/Homebase/app/generators/circuits_dc.py) `_problem`, `_ans`
- `circuits_dc.py` (1,860 lines) covers weeks 3-8:
  - It computes each key "by the hand method its steps show, then re-solves... a modified-nodal-analysis (MNA) netlist built from the same element list that draws the picture".
  - The netlist element is `El(kind, name, a, b, value, cp, cn, out)` with kinds R, V, I, VCCS, VCVS and OPAMP (ideal virtual short).
  - `mna(els)` uses numpy `linalg.solve`, rejects matrices with condition number above 1e12, and asserts KCL at every node and power balance.
  - The drawing side has `Part` (kinds R V I C L SW VCCS CCCS VCVS CCVS), a `Ladder` class and SVG helpers (`_draw`, `_ground`, `_signs`, `_arrow`, `_mesh_arc`), plus `Units` for Ω/kΩ.
  - Source: [HB/app/generators/circuits_dc.py](file:///C:/Users/conno/Documents/Homebase/app/generators/circuits_dc.py)
- `circuits_transient.py` (week 10, RC/RL step response) checks the closed-form answer by DC analysis plus "integrates the circuit's own differential equation numerically (RK4...)". — [HB/app/generators/circuits_transient.py](file:///C:/Users/conno/Documents/Homebase/app/generators/circuits_transient.py)
- Generator files: circuits_basics.py (248 lines, week 1-2), circuits_dc.py (1,860), circuits_transient.py (274), dsp.py (847), vectorcalc.py (909). — `wc -l` of [HB/app/generators](file:///C:/Users/conno/Documents/Homebase/app/generators)
- ECE 201 topics by week:
  1. intro, passive sign convention
  2. Ohm, dependent sources, KCL
  3. KVL, series/parallel, dividers
  4. Y-Δ, nodal analysis
  5. mesh analysis, Midterm 1
  6. supermesh, superposition, Thevenin
  7. Thevenin/Norton, maximum power transfer, intro to op-amps
  8. op-amps (inverting, summing, difference, follower, instrumentation)
  9. capacitors, step/ramp/pulse, Midterm 2
  10. inductors, RC/RL first order
  - Source: [HB/content/ece201/weeks.json](file:///C:/Users/conno/Documents/Homebase/content/ece201/weeks.json)
- Course content counts for ECE 201: 48 readings, 344 problems with keys (65 generated), 7 Berkeley EE 40/100 exams. Main sources are Ulaby exercises, Kuphaldt worksheets, Fiore, MIT 6.002 and OpenStax. The Ulaby PDF lives at `library/ece201/ulaby/ulaby_cad3e.pdf`. — [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md)
- Ground rule: "Answer keys come only from real published solutions or from answers computed and checked with code." — [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md)

### Inferences
- The Python `mna()` function and the `El` netlist format are a natural reference implementation. A JS solver in the browser could be differential-tested against it in pytest, or the server could solve through an API route. That would match the ground rule that computed answers are checked a second way.
- The existing generator SVGs (`Part`/`Ladder`) already define Homebase's visual language for schematics: ink strokes, surface-filled elements, terracotta arrows. A new simulator's symbol set should match it.
- A Circuits feature could link to Ulaby problems the same way problem sets do: a region pointer into `library/`, never copied text. For example, "build this circuit" exercises could cite a Ulaby page plus a netlist written by Homebase's own code.

### Gaps
- I did not read `circuits_basics.py`, the full `Ladder` drawing code or `validate_content.py` in detail.
- I did not check whether generated SVGs have a dark-mode frame. The CSS uses tokens, so they should theme automatically.

## 8. Homebase: tests, docs conventions, and constraints for a new section

### Takeaway
The tests are pytest with a temporary data dir and a FastAPI TestClient; a full run takes about 4.5 minutes. Docs follow a "plan for Connor's OK" convention in `design/*.md` and a plain-language README section per feature. A new Circuits section must be server-rendered Jinja plus vanilla JS, with no build step, tokens-only colours, phone-first, and must keep forms working without JS where practical.

### Cited Findings
- `tests/conftest.py`:
  - autouse fixtures replace Ollama with `_NoOllama` and stub Lecture Desk's voice;
  - `data_dir` monkeypatches `config.DATA_DIR`/`DB_PATH`/`UPLOAD_DIR`/`EXPORT_DIR` to `tmp_path` and sets `HOMEBASE_TODAY=2026-11-03`;
  - `session` seeds;
  - `client` uses `TestClient(create_app(run_lifespan=False))`.
  - Source: [HB/tests/conftest.py](file:///C:/Users/conno/Documents/Homebase/tests/conftest.py)
- `test_web.py` checks pages return 200 and contain "Homebase". It asserts course colours come from `var(--c-ece201)` rather than hex, that `class="tabbar"`, the theme toggle and `aria-current` are present, and that `/static/style.css?v=` appears. — [HB/tests/test_web.py](file:///C:/Users/conno/Documents/Homebase/tests/test_web.py)
- Test files and counts (`def test`): exams 11, feedback 19, generators 5, generators_circuits 28, generators_math 16, labs 17, local_ai 25, notes 17, readaloud 8, review 17, seed 6, services 4, study 13, web 11. That is about 197 in total. — grep of [HB/tests](file:///C:/Users/conno/Documents/Homebase/tests)
- There is no JS test runner in Homebase. Browser checks are done by hand with screenshots at laptop and phone widths. — [HB/PLAN.md](file:///C:/Users/conno/Documents/Homebase/PLAN.md) §1 ("pytest, plus a browser check of each screen"); [design/UI-PLAN.md](file:///C:/Users/conno/Documents/Homebase/design/UI-PLAN.md)
- Doc conventions:
  - `PLAN.md` is a "draft for your OK" with decisions recorded.
  - `design/UI-PLAN.md`, `NOTES-PLAN.md` and `LOCAL-AI-PLAN.md` each have the sections "What's wrong / direction / build steps (about N commits) / Questions (defaults in bold)".
  - The README has one section per feature in plain language.
  - `research/` holds INDEX.md and per-course reports.
  - Source: [HB/design](file:///C:/Users/conno/Documents/Homebase/design), [HB/PLAN.md](file:///C:/Users/conno/Documents/Homebase/PLAN.md), [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md)
- Architecture rule: "Every action is a function in `app/services.py`. The pages, the JSON API, and ... the Claude MCP server all call those functions, so every change lands in the activity log." — [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md) "How it's built"
- Data: everything lives in `data/homebase.db` (git-ignored), with a daily OneDrive backup and an export zip. Tables are SQLModel classes in `app/models.py`. — [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md)
- Dev gotchas (memory notes):
  - Jinja re-reads templates on a running server, but route or filter changes need a manual server restart.
  - Use `HOMEBASE_DATA=<scratch>` and `HOMEBASE_NO_BACKUP=1` for UI testing.
  - Git Bash heredocs mangle backslashes.
  - Commit with `git commit -F`.
  - Source: memory file `homebase-course-app.md` (user auto-memory)
- Python dependencies include numpy 2.2.6, scipy 1.15.3, sympy 1.14 and matplotlib 3.10.3, which are available for server-side solving or checking. — [HB/requirements.txt](file:///C:/Users/conno/Documents/Homebase/requirements.txt)
- The phone reaches the app over Tailscale at `http://<laptop-name>:8254` and only while the laptop is on. The desktop app is Edge in app mode. — [HB/README.md](file:///C:/Users/conno/Documents/Homebase/README.md) "Run it", "Desktop app"; [PLAN.md](file:///C:/Users/conno/Documents/Homebase/PLAN.md) §10

### Inferences
- Constraints the Circuits section must fit:
  1. **No build step.** Vanilla JS in `app/static/` with `?v=static_v(...)`. Vendored prebuilt libraries or pinned jsdelivr URLs, consistent with how KaTeX is loaded today.
  2. **Page pattern.** A route plus a `render(...)` call, a template extending base.html, `{% block scripts %}`, and nav entries for both desktop and phone.
  3. **Theme.** Use only the existing tokens (`--ink`, `--surface`, `--line`, `--accent` via `ccolor`, `--moss/--ochre/--brick`), redraw on the `homebase-theme` event, and make canvas read colours from computed style.
  4. **Phone-first.** Touch pointer events, ≥36 px targets, no sideways scroll, and the bottom tabbar must not cover controls.
  5. **Persistence.** Saved circuits go through SQLModel tables and services.py functions, so the MCP tools and activity log can see them.
  6. **Keys.** Any graded circuit exercise needs a code-computed, double-checked key, for example JS solver output cross-checked by Python `mna()`.
  7. **Tests.** pytest for routes and solver parity. If JS unit tests are wanted, there is currently no runner; options are a tiny Node-free approach, such as running solver test vectors through pytest against the Python MNA, or adding Node only as a dev tool.
  8. **Offline.** Not currently supported (CDN KaTeX and fonts, no service worker). Plain-HTTP Tailscale prevents a service worker on the phone.
  9. **Docs.** Write a `design/CIRCUITS-PLAN.md` "draft for your OK" before building, then a README section.

### Gaps
- No existing JS test harness or Playwright setup was found in Homebase, so how browser behaviour would be regression-tested is an open decision.
