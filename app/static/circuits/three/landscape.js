// The 3D view: the circuit lifted into a landscape where height is voltage. Traces are glossy
// bars at their node's height over light curtains, parts are real-looking components that
// ramp between their terminals, and current flows as glowing particles. In AC it shows an
// instant of the cycle, or each node's amplitude |V| with its phase as a hue. Every number,
// height and color comes from the bench's solution; easing between solutions is a short
// display transition (instant with reduced motion), and the particles' speed pictures the
// size of the current, not the electrons' real speed. It renders only while something moves.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { TIERS, detectTier, Governor } from "./quality.js";
import { Pipeline } from "./pipeline.js";
import { NodeLook, benchMaterial, zeroPlaneMaterial, voltageColor3, phaseColor3, TIME } from "./materials.js";
import { buildWire, buildJunction, buildPart, BAR_T } from "./models.js";
import { Flow } from "./flow.js";
import { Embers } from "./effects.js";
import { fmt, fmtExact } from "../core/units.js";
import { fromString } from "../core/rational.js";
import { polarText } from "../views/phasorfmt.js";
import { niceMax, phaseRGB } from "../views/palette.js";
import { pinPoints, key } from "../core/doc.js";
import { boxOf, esc } from "../editor/symbols.js";
import { valueText } from "../editor/labels.js";

const HEIGHT = 4.6;  // world units for the largest voltage, at height scale 1
const BG = new THREE.Color("#100f0d");
const _c = new THREE.Color(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Landscape {
  constructor(host, opts) {
    Object.assign(this, opts);
    this.host = host;
    this.visible = false;
    this.ref = 0;  // the node shown at 0 height (display only: voltages are differences)
    this.h = new Map(); this.target = new Map();
    this.models = []; this.looks = new Map(); this.sig = "";
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.beadsOn = this.prefs.beads3d !== false;
    this.heightScale = this.prefs.height3d || 1;
    this.acShow = this.prefs.ac3d === "phasor" ? "phasor" : "instant";  // in AC: an instant of the cycle, or |V| and phase
    this.floorGoal = -0.2; this.floor = null;
    this.zoom = { v: 0, ndc: new THREE.Vector2() };
    this.hover = null; this.pointerAt = null; this.down = null;
    this.outlines = new Map();
    this.introPending = true; this.intro = 0;

    host.innerHTML = "";
    host.classList.add("v3d");
    this.pipe = new Pipeline();
    const renderer = this.renderer = this.pipe.renderer;
    renderer.domElement.className = "v3d-canvas";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D view of the circuit: each node's height is its voltage");
    host.append(renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "v3d-labels";
    host.append(this.labels.domElement);
    host.insertAdjacentHTML("beforeend", toolbarHTML(this));
    this.tip = Object.assign(document.createElement("div"), { className: "v3d-tip", hidden: true });
    host.append(this.tip);

    // ---- the scene: a dark room with a soft key light, a cool rim light and studio reflections
    const scene = this.scene = new THREE.Scene();
    scene.background = BG.clone();
    scene.fog = new THREE.Fog(BG, 50, 140);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.5;
    scene.add(new THREE.HemisphereLight("#fff1dc", "#17140f", 0.35));
    this.key = new THREE.DirectionalLight("#ffedd5", 1.45);
    this.key.castShadow = true;
    Object.assign(this.key.shadow, { bias: -0.00025, normalBias: 0.025, radius: 4 });
    this.rim = new THREE.DirectionalLight("#9fb7ff", 0.7);
    scene.add(this.key, this.key.target, this.rim, this.rim.target);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
    const controls = this.controls = new OrbitControls(this.camera, renderer.domElement);
    Object.assign(controls, {
      enableDamping: true, dampingFactor: 0.1, rotateSpeed: 0.8, panSpeed: 0.95, zoomSpeed: 1.1, zoomToCursor: true,
      maxPolarAngle: Math.PI * 0.485, minDistance: 2.5, maxDistance: 180, screenSpacePanning: true, keyPanSpeed: 16,
    });
    controls.listenToKeyEvents(renderer.domElement);
    controls.addEventListener("change", () => { this.labelsDirty = true; this.kick(); });
    controls.addEventListener("start", () => { this.userMoved = true; this.flight = null; this.dragging = true; this.hideTip(); });
    controls.addEventListener("end", () => { this.dragging = false; });

    this.world = new THREE.Group();
    this.hitGroup = new THREE.Group();
    scene.add(this.world, this.hitGroup);
    // the bench reaches the horizon and fades into the fog; the 0 V sheet shows when nodes are below it
    this.benchMat = benchMaterial();
    this.bench = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), this.benchMat);
    this.bench.rotation.x = -Math.PI / 2;
    this.bench.receiveShadow = true;
    this.zero = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zeroPlaneMaterial());
    this.zero.rotation.x = -Math.PI / 2;
    this.zero.renderOrder = 1;
    scene.add(this.bench, this.zero);
    this.flow = new Flow(scene, TIERS.balanced.beads);
    this.flow.still = this.reduced;
    this.embers = new Embers(scene);
    this.emitters = [];

    // ---- pointer: a click is a press and release that barely moved (an orbit drag isn't a click)
    this.ray = new THREE.Raycaster();
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button }; });
    el.addEventListener("pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.button !== 0 || e.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 650) return;
      this.click(e);
    });
    el.addEventListener("pointermove", (e) => {
      this.pointerAt = [e.clientX, e.clientY];
      if (e.buttons) { this.hideTip(); return; }
      this.wantHover = true;
      this.kick();
    });
    el.addEventListener("pointerleave", () => { this.pointerAt = null; this.setHover(null); this.hideTip(); });
    el.addEventListener("dblclick", (e) => this.flyTo(e));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // the mouse wheel zooms smoothly toward what's under the pointer (pinch zoom stays the controls')
    host.addEventListener("wheel", (e) => this.onWheel(e), { capture: true, passive: false });
    host.addEventListener("click", (e) => this.toolbar(e));
    host.addEventListener("change", (e) => this.toolbar(e));
    host.addEventListener("input", (e) => this.toolbar(e));
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    ro.observe(host.querySelector(".v3d-bar"));  // (the toolbar's height moves the picture)
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.kick(); });

    this.governor = new Governor(() => this.lower());
    this.setTier(this.prefs.quality3d || "auto");
    this.update();
  }

  // ---- quality ----
  setTier(name) {
    this.tierName = name;
    const tier = this.tier = TIERS[name === "auto" ? detectTier(this.renderer) : name] || TIERS.balanced;
    this.ratio = Math.min(devicePixelRatio || 1, tier.ratio);
    this.pipe.setPixelRatio(this.ratio);
    this.pipe.setTier(tier, this.scene, this.camera);
    const size = tier.shadowSize;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.flow.budget = tier.beads;
    this.governor.reset();
    this.shadowDirty = true;
    this.resize();
    this.syncToolbar();
  }

  // frames are running long: give up resolution, a step at a time, down to 1×
  lower() {
    if (this.ratio <= 1.01) return;
    this.ratio = Math.max(1, this.ratio - 0.25);
    this.pipe.setPixelRatio(this.ratio);
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    // the toolbar covers the top of the view, so centre the picture in what's left below it:
    // render the top of a view taller by that much
    const bar = this.host.querySelector(".v3d-bar")?.getBoundingClientRect();
    const cover = bar ? Math.max(0, Math.min(0.45 * h, bar.bottom - this.host.getBoundingClientRect().top)) : 0;
    // (resizing the canvas reallocates it, so skip it when nothing changed)
    const size = `${w}x${h}x${Math.round(cover)}x${this.ratio}`;
    if (size === this.size) return;
    this.size = size;
    this.pipe.setSize(w, h);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.labelsDirty = true;
    this.camera.aspect = w / (h + cover);
    if (cover > 0) this.camera.setViewOffset(w, h + cover, 0, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const px = ((h + cover) * this.ratio) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.flow.setScale(px);
    this.embers.setScale(px);
    if (!this.userMoved && !this.flight) this.frame(false);
    this.kick();
  }

  setVisible(on) {
    this.visible = on;
    if (on) {
      this.resize();
      this.update();
      if (this.introPending && this.models.length) this.startIntro();
      this.kick();
      return;
    }
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.again = false;
  }

  // the first time it's shown: the landscape rises out of the bench as the camera glides in
  startIntro() {
    this.introPending = false;
    if (this.reduced) return;
    for (const n of this.h.keys()) this.h.set(n, 0);
    this.floor = this.floorGoal;
    this.intro = 1.6;
    this.heightsDirty = true;
    if (!this.userMoved) {
      this.frame(false);
      const to = this.camera.position.clone(), tTo = this.controls.target.clone();
      const from = tTo.clone().add(to.clone().sub(tTo).multiplyScalar(1.45)).add(new THREE.Vector3(0, 3, 0));
      this.camera.position.copy(from);
      this.flight = { from, to, tFrom: tTo.clone(), tTo, t: 0, dur: 1.8 };
    }
  }

  // ---- building the scene from the drawing ----
  update() {
    const doc = this.getDoc?.() || this.store.doc, net = this.getNet(), sol = this.getSolution();
    this.instant = !!this.playing?.();  // playback follows the run exactly, no easing
    if (!net) return;
    const docChanged = doc !== this.doc || net !== this.net;
    const oldNet = this.net;
    this.doc = doc; this.net = net; this.sol = sol;
    if (docChanged) {
      // rebuild when the drawing's shape or its nodes change (a switch joining or splitting them);
      // a new value is applied in place. Heights and switch blades carry over, so it still eases.
      const sig = JSON.stringify([doc.parts.map((p) => [p.id, p.type, p.x, p.y, p.rot, p.flip, p.params.wave]), doc.wires,
        net.pieces.map((p) => p.node), net.pins.map((p) => net.nodeAt(p.key))]);
      if (sig !== this.sig) {
        this.sig = sig;
        const carry = this.carryFrom(oldNet);
        this.build();
        this.carryInto(carry);
      } else for (const m of this.models) if (m.part) m.setPart(doc.parts.find((p) => p.id === m.part.id) || m.part, net.byId.get(m.part.id));
    }
    this.retarget();
    if (this.needFrame && !this.userMoved && !this.flight) this.frame(false);
    this.needFrame = false;
    this.heightsDirty = true;
    this.kick();
  }

  // what the scene shows now, by terminal position (node numbers change when nodes merge)
  carryFrom(oldNet) {
    const heights = new Map(), states = new Map();
    if (oldNet) for (const p of oldNet.pins) { const n = oldNet.nodeAt(p.key); if (n >= 0 && this.h.has(n)) heights.set(p.key, this.h.get(n)); }
    for (const m of this.models) if (m.state) states.set(m.id, m.state());
    return { heights, states };
  }

  carryInto({ heights, states }) {
    this.h = new Map();
    for (const p of this.net.pins) {
      const n = this.net.nodeAt(p.key);
      if (n >= 0 && !this.h.has(n) && heights.has(p.key)) this.h.set(n, heights.get(p.key));
    }
    for (const m of this.models) if (m.restore && states.has(m.id)) m.restore(states.get(m.id));
  }

  look(n) {
    if (!this.looks.has(n)) this.looks.set(n, new NodeLook());
    return this.looks.get(n);
  }

  build() {
    for (const m of this.models) { m.group.removeFromParent(); for (const hb of m.hits) hb.removeFromParent(); m.dispose(); }
    for (const [, o] of this.outlines) for (const x of o) x.removeFromParent();
    this.outlines.clear();
    this.models = [];
    const { doc, net } = this;
    const looks = (n) => this.look(n);
    for (const pc of net.pieces) if (pc.node >= 0) this.models.push(buildWire(pc, looks));
    for (const p of net.junctions) { const n = net.nodeAt(`${p[0]},${p[1]}`); if (n >= 0) this.models.push(buildJunction(p, n, looks)); }
    for (const part of doc.parts) {
      const el = net.byId.get(part.id) || null;
      const pinNodes = pinPoints(part).map((pp) => net.nodeAt(key(pp.x, pp.y)));
      if (pinNodes.some((n) => n < 0) && part.type !== "LBL" && part.type !== "GND") continue;
      this.models.push(buildPart(part, el, { looks, pinNodes, ohms: el?.params?.R?.value }));
    }
    for (const m of this.models) { this.world.add(m.group); for (const hb of m.hits) this.hitGroup.add(hb); }
    // where current can leave the drawn wires: part terminals (and their insides), grounds, and
    // labels that join another of the same name
    const anchored = new Set(), names = new Map();
    for (const part of doc.parts) if (part.type === "LBL") { const nm = (part.params.name || "").trim(); names.set(nm, (names.get(nm) || 0) + 1); }
    for (const part of doc.parts) {
      if (part.type === "LBL" && !(names.get((part.params.name || "").trim()) > 1)) continue;
      for (const pp of pinPoints(part)) anchored.add(key(pp.x, pp.y));
    }
    for (const m of this.models) if (m.kind === "part") for (const e of m.edges) for (const k of [e.a, e.b]) if (k.includes(":")) anchored.add(k);
    this.flow.build(this.models.flatMap((m) => m.edges), anchored);
    this.emitters = this.models.filter((m) => m.emitter).map((m) => m.emitter);
    this.embers.clear();
    // the bench, the lights and their shadows sized to the circuit
    const b = this.bounds();
    const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2, w = b[2] - b[0] + 8, d = b[3] - b[1] + 8;
    this.benchMat.userData.uniforms.uCenter.value.set(cx, cz);
    this.benchMat.userData.uniforms.uRadius.value = Math.max(14, Math.hypot(w, d) * 0.75);
    this.zero.position.set(cx, 0, cz);
    this.zero.scale.set(w, d, 1);
    const s = this.key.shadow.camera, half = Math.max(w, d) / 2 + 6;
    Object.assign(s, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 160 });
    s.updateProjectionMatrix();
    this.key.target.position.set(cx, 0, cz);
    this.key.position.set(cx - 16, 30, cz + 20);
    this.rim.target.position.set(cx, 0, cz);
    this.rim.position.set(cx + 18, 12, cz - 26);
    this.scene.fog.near = Math.max(40, half * 2.6);
    this.scene.fog.far = this.scene.fog.near + 120;
    this.buildLabels();
    this.syncToolbar();
    this.shadowDirty = true;
    this.needFrame = true;  // (once the heights are known)
    // shaders now, not on the first frame that needs them (the outlines too, by a hidden pair)
    const warm = ["sel", "hover"].map((k) => new THREE.Mesh(new THREE.SphereGeometry(0.01), outlineMaterial(k)));
    for (const w of warm) { w.position.set(0, -1000, 0); this.scene.add(w); }
    this.renderer.compile(this.scene, this.camera);
    for (const w of warm) { w.removeFromParent(); w.geometry.dispose(); }
  }

  bounds() {
    const pts = [];
    for (const p of this.doc.parts) { const bx = boxOf(p); pts.push([bx[0], bx[1]], [bx[2], bx[3]]); }
    for (const w of this.doc.wires) pts.push(w.a, w.b);
    if (!pts.length) return [0, 0, 10, 6];
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  }

  // ---- heights, colors, glows and currents for the newest solution ----
  retarget() {
    const sol = this.sol, net = this.net, hidden = this.hidden();
    const ok = !!sol?.ok;
    const vref = ok && sol.nodes[this.ref]?.v != null ? sol.nodes[this.ref].v : 0;
    const vd = (i) => (ok && sol.nodes[i] && sol.nodes[i].v !== null ? sol.nodes[i].v - vref : null);
    // AC with "|V| and phase": height is each node's amplitude, color its phasor's angle (which
    // turns as the cycle plays, every node together at ω)
    const ph = this.phasorMode();
    const mag = (i) => { const z = this.acPhasor(i); return z ? Math.hypot(z.re, z.im) : null; };
    const level = ph ? mag : vd;
    // AC moments and transient runs carry a scale fixed through the cycle or run, so the
    // landscape rises and falls instead of being rescaled every frame
    const vmax = ph ? Math.max(sol.vmax || 0, niceMax(Math.max(1e-12, ...net.nodes.map((n) => mag(n.index) ?? 0))))
      : sol?.vmax || Math.max(1e-9, ...net.nodes.map((n) => Math.abs(vd(n.index) ?? 0)));
    const turn = ph ? (sol.ac.omega || 0) * (sol.time || 0) : 0;
    this.scale = (HEIGHT * this.heightScale) / vmax;
    this.vmax = vmax;
    const focus = this.getFocusNode?.() ?? null;
    let lowest = 0;
    for (const nd of net.nodes) {
      const v = level(nd.index), hide = hidden({ kind: "v", node: nd.index });
      const unknown = v === null || hide;
      const t = unknown ? 0 : v * this.scale;
      this.target.set(nd.index, t);
      if (!this.h.has(nd.index)) this.h.set(nd.index, this.reduced || this.instant || !this.visible ? t : 0);
      lowest = Math.min(lowest, t);
      if (ph) phaseColorOf(this.acPhasor(nd.index), turn, vmax, _c); else voltageColor3(v ?? 0, vmax, _c);
      this.look(nd.index).set(_c, { level: unknown ? 0 : Math.min(1, Math.abs(v ?? 0) / vmax), dim: focus !== null && focus !== nd.index, unknown });
    }
    // the bench sits under the lowest trace; in AC it stays where the cycle's lowest point is
    if (sol?.ac && !ph) for (const nd of net.nodes) { const z = this.acPhasor(nd.index); if (z) lowest = Math.min(lowest, -Math.hypot(z.re, z.im) * this.scale); }
    this.floorGoal = Math.min(0, lowest) - BAR_T - 0.08;
    if (this.floor === null) this.floor = this.floorGoal;

    // heat (each resistor's share of the most power any part takes), fields and readings
    const P = ph ? (id) => sol.ac.res.els[id]?.s?.re ?? 0 : (id) => sol?.els?.[id]?.p ?? 0;
    const pmax = ok ? (ph ? Math.max(1e-15, sol.ac.hold?.pR || 0, ...this.models.filter((m) => m.part?.type === "R").map((m) => P(m.id)))
      : sol.pmax ?? Math.max(1e-15, ...Object.values(sol.els).map((e) => Math.max(0, e.p ?? 0)))) : 1;
    const imax = sol?.imax || Math.max(1e-15, ...(ok ? Object.values(sol.els).map((e) => Math.abs(e.i ?? 0)) : [0]));
    for (const m of this.models) {
      if (m.kind !== "part") continue;
      const id = m.id, e = ok ? sol.els[id] : null, info = {};
      if (m.part.type === "L") info.flux = e && !hidden({ kind: "i" }) ? (e.i ?? 0) / imax : 0;
      if (m.part.type === "R") info.heat = e && !hidden({ kind: "p", part: id }) && P(id) > 0 ? Math.sqrt(P(id) / pmax) : 0;
      if (m.part.type === "C" && e) {
        const z = sol.ac && ph ? sol.ac.res.els[id]?.v : null;
        const v = z ? Math.hypot(z.re, z.im) : Math.abs(e.v ?? 0);
        info.field = hidden({ kind: "v" }) ? 0 : v / vmax;
        info.fieldColor = voltageColor3(v, vmax, new THREE.Color());
      }
      if ((m.part.type === "AM" || m.part.type === "VM") && e?.reading) info.reading = this.readingOf(m.part, e);
      m.refresh(sol, info);
    }

    // current: each wire piece's from the solution's wire flows, each part's from its pins
    const flows = new Map();
    for (const f of sol?.flows || []) if (f.wire) flows.set(`${f.a}|${f.b}`, f.i);
    const flowOf = (pc) => flows.get(`${pc.a}|${pc.b}`) ?? 0;
    this.flow.visible = this.beadsOn && !hidden({ kind: "i" });
    this.flow.setCurrents(ok ? sol : null, flowOf, { electron: !!this.prefs.electron, hidden: !this.flow.visible, scale: sol?.imax });

    this.refreshLabels();
    this.syncAC();
    this.syncHighlight();
  }

  readingOf(part, e) {
    const kind = e.reading.kind, unit = kind === "i" ? "A" : "V";
    if (this.hidden()({ kind: kind === "i" ? "i" : "v" })) return { text: "?", unit: "" };
    let x = e.reading.value;
    const ac = this.sol?.ac;
    if (ac) { const r = ac.res.els[part.id]; const z = kind === "i" ? r?.i : r?.v; x = z ? Math.hypot(z.re, z.im) * ac.scale : null; }
    if (x === null || x === undefined || !Number.isFinite(x)) return { text: "—", unit: "" };
    const t = fmt(x, unit), cut = t.lastIndexOf(" ");
    return cut > 0 ? { text: t.slice(0, cut), unit: t.slice(cut + 1) } : { text: t, unit: "" };
  }

  H = (n) => (n >= 0 ? this.h.get(n) ?? 0 : 0);

  phasorMode() { return this.acShow === "phasor" && !!this.sol?.ok && !!this.sol.ac; }

  // a node's AC phasor (peak), measured from the node shown at 0, or null
  acPhasor(i) {
    const nodes = this.sol?.ok ? this.sol.ac?.res.nodes : null;
    const z = nodes?.[i]?.v;
    if (!z) return null;
    if (!this.ref) return z;
    const z0 = nodes[this.ref]?.v;
    return z0 ? { re: z.re - z0.re, im: z.im - z0.im } : null;
  }

  // ease displayed heights (and the bench) toward the solution; true while anything moves
  ease(dt) {
    let moving = false;
    const rate = this.intro > 0 ? 2.6 : 12;
    const k = this.reduced || this.instant ? 1 : 1 - Math.exp(-dt * rate);
    for (const [n, t] of this.target) {
      const h = this.h.get(n) ?? t, d = t - h;
      if (Math.abs(d) > 1e-4) { this.h.set(n, h + d * k); moving = true; } else if (h !== t) { this.h.set(n, t); moving = true; }
    }
    const fd = this.floorGoal - this.floor;
    if (Math.abs(fd) > 1e-4) { this.floor += fd * (this.reduced ? 1 : 1 - Math.exp(-dt * 5)); moving = true; } else this.floor = this.floorGoal;
    if (this.intro > 0) { this.intro -= dt; moving = true; }
    const animating = this.models.some((m) => m.moving);
    if (moving || animating || this.heightsDirty) { this.applyHeights(dt); this.heightsDirty = false; }
    return moving || animating;
  }

  applyHeights(dt) {
    const floor = this.floor;
    for (const m of this.models) m.update(this.H, floor, dt);
    this.bench.position.y = floor;
    this.zero.visible = floor < -BAR_T - 0.2;
    this.placeLabels();
    this.heightsMoved = true;
    this.shadowDirty = true;
    this.labelsDirty = true;
  }

  // ---- labels ----
  buildLabels() {
    for (const o of this.labelObjs || []) o.obj.removeFromParent();
    this.labelObjs = [];
    for (const nd of this.net.nodes) {
      const pieces = this.net.pieces.filter((p) => p.node === nd.index);
      if (!pieces.length) continue;
      const longest = pieces.reduce((a, b) => (len(b) > len(a) ? b : a));
      const div = document.createElement("div");
      div.className = "lbl3d";
      div.innerHTML = `<i></i><span class="n"></span><span class="v"></span>`;
      const obj = new CSS2DObject(div);
      this.world.add(obj);
      const [dot, name, val] = div.children;
      this.labelObjs.push({ obj, div, dot, name, val, node: nd.index, seen: {}, at: [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2] });
    }
    for (const part of this.doc.parts) {
      if (part.type === "GND" || part.type === "LBL") continue;
      const div = document.createElement("div");
      div.className = "plbl3d";
      const obj = new CSS2DObject(div);
      obj.visible = false;
      this.world.add(obj);
      const bx = boxOf(part);
      this.labelObjs.push({ obj, div, part, html: "", at: [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2] });
    }
  }

  refreshLabels() {
    const sol = this.sol, hidden = this.hidden();
    for (const L of this.labelObjs || []) {
      let html;
      if (L.node !== undefined) {
        const nd = this.net.nodes[L.node], n = sol?.ok ? sol.nodes[L.node] : null;
        const name = L.node === 0 ? "⏚" : nd.label || nd.name;
        const ref = this.ref ? ` from ${this.net.nodes[this.ref].label || this.net.nodes[this.ref].name}` : "";
        let text = "—";
        if (n && n.v !== null) {
          if (hidden({ kind: "v", node: L.node })) text = "?";
          else if (sol.ac) text = polarText(this.acPhasor(L.node), "V", sol.ac.scale) + ref;  // the phasor, as the 2D pills show it
          else if (!this.ref) text = (n.vx ? fmtExact(fromString(n.vx), "V") : { main: fmt(n.v, "V") }).main;
          else text = fmt(n.v - sol.nodes[this.ref].v, "V") + ref;
        }
        // (only what changed is touched: playback recolors these every frame)
        const hex = `#${this.look(L.node).color.getHexString()}`, seen = L.seen;
        if (seen.hex !== hex) { L.dot.style.background = L.dot.style.color = seen.hex = hex; }
        if (seen.name !== name) L.name.textContent = seen.name = name;
        if (seen.text !== text) L.val.textContent = seen.text = text;
        const focused = (this.getFocusNode?.() ?? null) === L.node;
        if (seen.focus !== focused) L.div.classList.toggle("focus", seen.focus = focused);
        continue;
      } else {
        const v = valueText(L.part);
        html = `<span class="n">${esc(L.part.id)}</span>${v ? ` ${esc(v)}` : ""}`;
        L.obj.visible = this.store.sel.parts.has(L.part.id) || this.hover?.id === L.part.id;
      }
      if (html !== L.html) { L.div.innerHTML = html; L.html = html; }
    }
    this.labelsDirty = true;
  }

  placeLabels() {
    for (const L of this.labelObjs || []) {
      if (L.node !== undefined) L.obj.position.set(L.at[0], this.H(L.node) + 0.5, L.at[1]);
      else {
        const pins = pinPoints(L.part), ns = pins.map((pp) => this.net.nodeAt(key(pp.x, pp.y)));
        L.obj.position.set(L.at[0], Math.max(...ns.map((n) => this.H(n))) + 1.25, L.at[1]);
      }
    }
  }

  // ---- picking, hover and selection ----
  pick(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    _v.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5);
    this.ray.setFromCamera(_v, this.camera);
    const hit = this.ray.intersectObjects(this.hitGroup.children, false)[0];
    return hit ? { ...hit.object.userData.pick, point: hit.point } : null;
  }

  click(e) {
    if (e.detail > 1) return;  // the second click of a double-click flies there; it doesn't toggle
    const hit = this.pick(e.clientX, e.clientY);
    if (!hit) {
      if (this.store.hasSelection) this.store.clearSelection();
      if ((this.getFocusNode?.() ?? null) !== null) this.onFocusNode?.(null);
      return;
    }
    if (hit.kind === "part") this.store.select({ parts: [hit.id] });
    else if (hit.kind === "wire") this.store.select({ wires: [hit.id] });
  }

  pickHover() {
    if (!this.pointerAt || this.dragging) return;
    const hit = this.pick(...this.pointerAt);
    this.setHover(hit);
    if (hit) this.showTip(hit); else this.hideTip();
  }

  setHover(hit) {
    const was = this.hover ? `${this.hover.kind}:${this.hover.id}` : "", now = hit ? `${hit.kind}:${hit.id}` : "";
    this.hover = hit;
    this.renderer.domElement.style.cursor = hit ? "pointer" : "";
    if (was !== now) { this.syncHighlight(); this.refreshLabels(); this.kick(); }
  }

  showTip(hit) {
    const sol = this.sol, hidden = this.hidden();
    let head, body = "";
    if (hit.kind === "wire") {
      const n = hit.node, nd = this.net.nodes[n];
      head = esc(n === 0 ? "ground" : nd.label || nd.name);
      const s = sol?.ok ? sol.nodes[n] : null;
      body = hidden({ kind: "v", node: n }) ? "?" : !s || s.v === null ? "no voltage yet" : sol.ac ? polarText(sol.ac.res.nodes[n]?.v, "V", sol.ac.scale) : fmt(s.v, "V");
    } else {
      const part = this.doc.parts.find((p) => p.id === hit.id);
      head = `${esc(hit.id)}${part && valueText(part) ? ` <span>${esc(valueText(part))}</span>` : ""}`;
      const e = sol?.ok ? sol.els[hit.id] : null;
      if (e && part && !["GND", "LBL"].includes(part.type)) {
        const ac = sol.ac?.res.els[hit.id];
        const v = hidden({ kind: "v" }) ? "?" : ac ? polarText(ac.v, "V", sol.ac.scale) : e.v !== null && e.v !== undefined ? fmt(e.v, "V") : "—";
        const i = hidden({ kind: "i" }) ? "?" : ac ? polarText(ac.i, "A", sol.ac.scale) : fmt(e.i, "A");
        body = `v ${v} · i ${i}`;
      }
    }
    this.tip.innerHTML = `<b>${head}</b>${body ? ` ${esc(body)}` : ""}`;
    const r = this.host.getBoundingClientRect(), [x, y] = this.pointerAt;
    this.tip.style.left = `${Math.max(4, Math.min(x - r.left + 16, r.width - 230))}px`;
    this.tip.style.top = `${y - r.top + 16}px`;
    this.tip.hidden = false;
  }

  hideTip() { this.tip.hidden = true; }

  // glowing outlines: strong on what's selected, faint on what's under the pointer
  syncHighlight() {
    const want = new Map();
    const sel = this.store.sel;
    for (const m of this.models) {
      if (m.kind !== "part" && m.kind !== "wire") continue;
      const selected = m.kind === "part" ? sel.parts.has(m.id) : sel.wires.has(m.id);
      const hovered = this.hover && this.hover.id === m.id && this.hover.kind === m.kind;
      if (selected || hovered) want.set(m, selected ? "sel" : "hover");
    }
    for (const [m, list] of this.outlines) {
      if (want.get(m) === list.kind) continue;
      for (const o of list) o.removeFromParent();
      this.outlines.delete(m);
    }
    for (const [m, kind] of want) {
      if (this.outlines.has(m)) continue;
      const material = outlineMaterial(kind);
      const list = [];
      m.group.traverse((o) => {
        if (!o.isMesh || o.userData.outline || !o.material?.isMeshStandardMaterial) return;
        const shell = new THREE.Mesh(o.geometry, material);
        shell.userData.outline = true;
        shell.renderOrder = 4;
        list.push([o, shell]);
      });
      for (const [o, shell] of list) o.add(shell);
      const shells = list.map(([, s]) => s);
      shells.kind = kind;
      this.outlines.set(m, shells);
    }
    this.kick();
  }

  // ---- AC: the switch, the phase legend and the caption follow the solution ----
  syncAC() {
    const ac = !!(this.sol?.ok && this.sol.ac), ph = this.phasorMode();
    const g = this.host.querySelector(".v3d-ac");
    if (g) {
      g.hidden = !ac;
      for (const b of g.querySelectorAll("[data-v3d-ac]")) b.setAttribute("aria-pressed", String(b.dataset.v3dAc === this.acShow));
    }
    this.host.querySelector(".v3d-wheel")?.toggleAttribute("hidden", !ph);
    this.host.classList.toggle("phase-on", ph);
    this.host.closest(".bench-stage")?.classList.toggle("phase3d", ph);  // (the 2D voltage legend doesn't apply)
    const note = this.host.querySelector(".v3d-note");
    const text = ph ? "Height = amplitude |V| · color = phase angle, turning as the cycle plays · drag to orbit"
      : ac ? "Height = voltage at this instant of the cycle · drag to orbit · scroll to zoom · double-click to fly"
      : "Height = voltage · drag to orbit · right-drag to pan · scroll to zoom · double-click to fly to a spot";
    if (note && note.textContent !== text) note.textContent = text;
    this.renderer.domElement.setAttribute("aria-label", ph ? "3D view of the circuit: each node's height is its AC amplitude and its color its phase angle" : "3D view of the circuit: each node's height is its voltage");
  }

  // ---- camera ----
  frame(animate = true, view = this.view || "threequarter") {
    if (!this.doc) return;
    this.view = view;
    const b = this.bounds();
    // the whole landscape in view: its footprint and the heights its nodes reach, up or down
    const hs = [...this.target.values()], lo = Math.min(0, ...hs), hi = Math.max(0, ...hs);
    const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    const r = Math.max(6, Math.hypot(b[2] - b[0], b[3] - b[1], (hi - lo) * 0.9) / 2 + 2);
    const dirs = { threequarter: [-0.42, 0.56, 0.8], top: [0, 1, 0.02], side: [0, 0.16, 1] };
    const dir = _w.set(...dirs[view]).normalize();
    const fov = (this.camera.fov * Math.PI) / 180, aspect = this.camera.aspect || 1.6;
    const dist = (r / Math.sin(fov / 2)) * (aspect < 1 ? 0.9 / aspect : 0.64);
    const target = new THREE.Vector3(cx, lo + (hi - lo) * 0.42, cz);
    const pos = target.clone().addScaledVector(dir, dist);
    if (!animate || this.reduced) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.kick(); return; }
    this.flight = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0, dur: 0.75 };
    this.kick();
  }

  flyTo(e) {
    const hit = this.pick(e.clientX, e.clientY);
    let p = hit?.point;
    if (!p) {
      const r = this.renderer.domElement.getBoundingClientRect();
      _v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5);
      this.ray.setFromCamera(_v, this.camera);
      p = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.floor ?? 0)), new THREE.Vector3());
    }
    if (!p) return;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.flight = { from: this.camera.position.clone(), to: p.clone().addScaledVector(dir, 9), tFrom: this.controls.target.clone(), tTo: p.clone(), t: 0, dur: 0.7 };
    this.userMoved = true;
    this.kick();
  }

  stepFlight(dt) {
    const f = this.flight;
    if (!f) return false;
    f.t = Math.min(1, f.t + dt / f.dur);
    const k = easeInOut(f.t);
    this.camera.position.lerpVectors(f.from, f.to, k);
    this.controls.target.lerpVectors(f.tFrom, f.tTo, k);
    if (f.t >= 1) this.flight = null;
    return true;
  }

  onWheel(e) {
    if (e.target !== this.renderer.domElement && !e.target.closest?.(".v3d-labels")) return;  // the toolbar scrolls as usual
    e.preventDefault();
    e.stopPropagation();
    const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
    this.zoom.v += Math.max(-260, Math.min(260, dy)) * (e.ctrlKey ? 0.004 : 0.0017);
    const r = this.renderer.domElement.getBoundingClientRect();
    this.zoom.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.flight = null;
    this.userMoved = true;
    this.hideTip();
    this.kick();
  }

  // apply a slice of the pending zoom each frame, keeping the point under the pointer still
  stepZoom(dt) {
    const z = this.zoom;
    if (Math.abs(z.v) < 2e-4) { z.v = 0; return false; }
    const take = z.v * (1 - Math.exp(-dt * 13));
    z.v -= take;
    const cam = this.camera.position, tgt = this.controls.target;
    const dist = cam.distanceTo(tgt);
    const want = THREE.MathUtils.clamp(dist * Math.exp(take), this.controls.minDistance, this.controls.maxDistance);
    const f = want / dist;
    this.ray.setFromCamera(z.ndc, this.camera);
    const P = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -tgt.y), _v);
    const about = P && P.distanceTo(cam) < dist * 3 ? P : tgt;
    cam.sub(about).multiplyScalar(f).add(about);
    tgt.sub(about).multiplyScalar(f).add(about);
    return true;
  }

  // ---- toolbar ----
  toolbar(e) {
    const t = e.target;
    if (e.type === "click") {
      const ac = t.closest("[data-v3d-ac]");
      if (ac) { this.acShow = ac.dataset.v3dAc; this.prefs.ac3d = this.acShow; this.savePrefs(); this.retarget(); this.heightsDirty = true; this.kick(); return; }
      const b = t.closest("[data-v3d]");
      if (!b) return;
      const act = b.dataset.v3d;
      if (act === "fit") { this.userMoved = false; this.frame(true, "threequarter"); }
      else if (act === "top" || act === "side") { this.userMoved = true; this.frame(true, act); }
      else if (act === "beads") { this.beadsOn = !this.beadsOn; this.prefs.beads3d = this.beadsOn; this.savePrefs(); b.setAttribute("aria-pressed", String(this.beadsOn)); this.retarget(); this.kick(); }
      return;
    }
    if (t.matches("[data-v3d-ref]") && e.type === "change") { this.ref = Number(t.value); this.retarget(); this.kick(); }
    if (t.matches("[data-v3d-quality]") && e.type === "change") { this.prefs.quality3d = t.value; this.savePrefs(); this.setTier(t.value); }
    if (t.matches("[data-v3d-height]")) { this.heightScale = Number(t.value); this.prefs.height3d = this.heightScale; this.savePrefs(); this.retarget(); if (!this.userMoved) this.frame(false); this.kick(); }
  }

  syncToolbar() {
    const sel = this.host.querySelector("[data-v3d-ref]");
    if (sel && this.net) {
      sel.innerHTML = this.net.nodes.map((n) => `<option value="${n.index}" ${n.index === this.ref ? "selected" : ""}>${esc(n.index === 0 ? "ground" : n.label || n.name)}</option>`).join("");
    }
    const q = this.host.querySelector("[data-v3d-quality]");
    if (q) q.value = this.tierName;
  }

  // ---- loop: frames run while anything moves (heights, camera, particles), then stop. There
  // is only ever one: a kick() during a frame (the camera controls fire "change" from inside
  // it) asks for one more frame instead of starting a second loop, which would compound ----
  kick() {
    if (!this.visible) return;
    if (this.raf) { this.again = true; return; }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick = (t) => this.loop(t);

  loop(now) {
    if (!this.visible || document.hidden) { this.raf = 0; return; }
    const frameMs = now - this.last;
    const dt = Math.min(0.05, Math.max(0, frameMs / 1000));
    this.last = now;
    TIME.value += dt;
    this.heightsMoved = false;
    let active = this.ease(dt);
    if (this.stepFlight(dt)) { active = true; this.labelsDirty = true; }
    if (this.stepZoom(dt)) { active = true; this.labelsDirty = true; }
    if (this.controls.update()) active = true;
    if (this.wantHover) { this.wantHover = false; this.pickHover(); }
    const flowing = this.flow.update(dt, this.H, this.heightsMoved);
    const glowing = this.reduced ? false : this.embers.update(dt, this.emitters);
    this.pipe.render(TIME.value, this.shadowDirty);
    this.shadowDirty = false;
    if (this.labelsDirty) { this.labels.render(this.scene, this.camera); this.labelsDirty = false; }
    this.governor.frame(frameMs);
    const more = active || flowing || glowing || this.again;
    this.again = false;
    this.raf = more ? requestAnimationFrame(this.tick) : 0;
  }
}

const len = (pc) => Math.abs(pc.a[0] - pc.b[0]) + Math.abs(pc.a[1] - pc.b[1]);

// a node's color with |V| and phase: its phasor's angle (turned to this instant), fading to grey
// as the amplitude goes to 0
function phaseColorOf(z, turn, vmax, out) {
  if (!z) return phaseColor3(0, 0, out);
  return phaseColor3(Math.atan2(z.im, z.re) + turn, Math.min(1, Math.hypot(z.re, z.im) / (0.04 * vmax)), out);
}

// an outline shell: the mesh drawn again from the back, pushed out along its normals in view
// space (so it's the same thickness on any part), in a glowing color
const outlineMats = {};
function outlineMaterial(kind) {
  if (outlineMats[kind]) return outlineMats[kind];
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(kind === "sel" ? "#ffcf7a" : "#fff0cf").multiplyScalar(kind === "sel" ? 1.6 : 0.9),
    transparent: true, opacity: kind === "sel" ? 0.95 : 0.5, side: THREE.BackSide, depthWrite: false,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <project_vertex>", `
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      mvPosition.xyz += normalize(normalMatrix * normal) * ${kind === "sel" ? "0.045" : "0.03"};
      gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `outline-${kind}`;
  outlineMats[kind] = m;
  return m;
}

// the legend for |V| and phase: the hue circle, 0° to the right and counterclockwise, the way
// a phasor diagram turns
function wheelHTML() {
  const C = 34, R = 26, r = 15, N = 36, out = [];
  const P = (a, rr) => `${(C + rr * Math.cos(a)).toFixed(2)} ${(C - rr * Math.sin(a)).toFixed(2)}`;
  for (let k = 0; k < N; k++) {
    const a0 = ((k - 0.5) * 2 * Math.PI) / N, a1 = ((k + 0.5) * 2 * Math.PI) / N;
    const fill = `rgb(${phaseRGB((k * 2 * Math.PI) / N).join(" ")})`;
    out.push(`<path d="M${P(a0, r)}L${P(a0, R)}A${R} ${R} 0 0 0 ${P(a1, R)}L${P(a1, r)}A${r} ${r} 0 0 1 ${P(a0, r)}Z" fill="${fill}" stroke="${fill}" stroke-width="0.6"/>`);
  }
  out.push(`<text x="${C + R + 4}" y="${C + 3.5}">0°</text><text x="${C}" y="${C - R - 4}" text-anchor="middle">90°</text>`,
    `<text x="${C - R - 4}" y="${C + 3.5}" text-anchor="end">180°</text><text x="${C}" y="${C + R + 11}" text-anchor="middle">−90°</text>`);
  return `<div class="v3d-wheel" hidden><svg viewBox="-22 -6 112 84" role="img" aria-label="Phase colors: 0° amber, 90° green, 180° blue, −90° magenta">${out.join("")}</svg></div>`;
}

function toolbarHTML(L) {
  return `<div class="v3d-bar">
    <button type="button" class="small" data-v3d="fit" title="Frame the circuit">Reset view</button>
    <button type="button" class="small" data-v3d="top" title="Look straight down">Top</button>
    <button type="button" class="small" data-v3d="side" title="See the voltage profile from the side">Side</button>
    <button type="button" class="small" data-v3d="beads" aria-pressed="${L.beadsOn}" title="Glowing particles show the current">Current</button>
    <div class="seg small v3d-ac" role="group" aria-label="What the heights show in AC" hidden><button type="button" data-v3d-ac="instant" aria-pressed="${L.acShow === "instant"}" title="Heights swing with the voltage at this instant of the cycle">Instant</button><button type="button" data-v3d-ac="phasor" aria-pressed="${L.acShow === "phasor"}" title="Height is each node's amplitude |V|, color its phase angle">|V| and phase</button></div>
    <label class="v3d-ctl" title="Which node is shown at height 0 (voltages are differences, so the whole landscape just moves)">0 V at <select data-v3d-ref></select></label>
    <label class="v3d-ctl">Height <input type="range" data-v3d-height min="0.4" max="2.5" step="0.1" value="${L.heightScale}"></label>
    <label class="v3d-ctl">Quality <select data-v3d-quality><option value="auto">Auto</option><option value="battery">Battery</option><option value="balanced">Balanced</option><option value="cinematic">Cinematic</option></select></label>
  </div><div class="v3d-note">Height = voltage · drag to orbit · right-drag to pan · scroll to zoom · double-click to fly to a spot</div>${wheelHTML()}`;
}
