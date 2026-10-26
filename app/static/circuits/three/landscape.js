// The 3D view: the circuit lifted into a landscape where height is voltage. Every number,
// height and color comes from the bench's solution; easing between solutions is a short
// display transition (instant with reduced motion), and the beads' speed pictures the size
// of the current, not the electrons' real speed. Rendering happens only when something moves.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { TIERS, detectTier, Governor } from "./quality.js";
import { boardMaterial, plateauMaterial, curtainMaterial, voltageColor3, mat } from "./materials.js";
import { wirePiece, junction, partModel } from "./models.js";
import { fmt, fmtExact } from "../core/units.js";
import { fromString } from "../core/rational.js";
import { pinPoints, key } from "../core/doc.js";
import { boxOf } from "../editor/symbols.js";
import { valueText } from "../editor/labels.js";
import { esc } from "../editor/symbols.js";

const HEIGHT = 4.6;       // world units for the largest voltage, at height scale 1
const SPACING = 1.25, MAX_SPEED = 2.4;

export class Landscape {
  constructor(host, opts) {
    Object.assign(this, opts);
    this.host = host;
    this.visible = false;
    this.ref = 0;  // the node shown at 0 height (display only: voltages are differences)
    this.h = new Map(); this.target = new Map();
    this.models = []; this.sig = "";
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.beadsOn = this.prefs.beads3d !== false;
    this.heightScale = this.prefs.height3d || 1;

    host.innerHTML = "";
    host.classList.add("v3d");
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor("#151412");
    renderer.toneMapping = THREE.NeutralToneMapping;  // keeps the voltage colors true
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color("#141311");  // (a clear color would skip color management in the composer)
    scene.fog = new THREE.Fog("#141311", 60, 140);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.42;
    scene.add(new THREE.HemisphereLight("#fff5e6", "#1d1a15", 0.32));
    this.key = new THREE.DirectionalLight("#fff1dc", 1.05);
    this.key.position.set(-14, 26, 18);
    scene.add(this.key, this.key.target);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.49, minDistance: 3, maxDistance: 160, screenSpacePanning: true });
    this.controls.listenToKeyEvents(renderer.domElement);
    this.controls.addEventListener("change", () => this.kick());
    this.controls.addEventListener("start", () => { this.userMoved = true; });

    this.world = new THREE.Group();
    scene.add(this.world);
    this.governor = new Governor(() => this.lower());
    this.setTier(this.prefs.quality3d || "auto");

    // picking: hover reads a node, click focuses it, double-click flies to it
    this.ray = new THREE.Raycaster();
    renderer.domElement.addEventListener("pointermove", (e) => this.hover(e));
    renderer.domElement.addEventListener("pointerleave", () => { this.tip.hidden = true; });
    renderer.domElement.addEventListener("click", (e) => { const n = this.pickNode(e); if (n !== null) this.onFocusNode?.(n); });
    renderer.domElement.addEventListener("dblclick", (e) => this.flyTo(e));
    host.addEventListener("click", (e) => this.toolbar(e));
    host.addEventListener("change", (e) => this.toolbar(e));
    host.addEventListener("input", (e) => this.toolbar(e));
    new ResizeObserver(() => this.resize()).observe(host);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.kick(); });
    this.update();
  }

  // ---- quality ----
  setTier(name) {
    this.tierName = name;
    const tier = this.tier = TIERS[name === "auto" ? detectTier(this.renderer) : name] || TIERS.balanced;
    this.ratio = Math.min(devicePixelRatio || 1, tier.ratio);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = tier.shadows;
    this.key.castShadow = tier.shadows;
    if (tier.shadows) { this.key.shadow.mapSize.set(tier.shadowSize, tier.shadowSize); this.key.shadow.bias = -0.0004; this.key.shadow.radius = 5; this.key.shadow.map?.dispose(); this.key.shadow.map = null; }
    this.composer?.dispose?.();
    this.composer = null;
    this.governor.reset();
    if (tier.bloom || tier.ao) {
      const w = this.host.clientWidth || 800, h = this.host.clientHeight || 500;
      const rt = new THREE.WebGLRenderTarget(w * this.ratio, h * this.ratio, { samples: tier.msaa, type: THREE.HalfFloatType });
      const c = this.composer = new EffectComposer(this.renderer, rt);
      c.setPixelRatio(this.ratio);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (tier.ao) { this.ao = new GTAOPass(this.scene, this.camera, w, h); this.ao.blendIntensity = 0.85; c.addPass(this.ao); }
      // bloom only on what's genuinely bright: beads and parts running hot
      if (tier.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.28, 0.25, 0.93); c.addPass(this.bloom); }
      c.addPass(new OutputPass());
    }
    this.resize();
    this.syncToolbar();
  }

  // frames are running long: give up resolution first, then ambient occlusion, then bloom
  lower() {
    if (this.ratio > 1.01) { this.ratio = Math.max(1, this.ratio - 0.25); this.renderer.setPixelRatio(this.ratio); this.composer?.setPixelRatio(this.ratio); this.resize(); return; }
    if (this.tier.ao) { this.setTier("balanced"); return; }
    if (this.tier.bloom) this.setTier("battery");
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.frame(false);
    this.kick();
  }

  setVisible(on) {
    this.visible = on;
    if (on) { this.resize(); this.update(); this.kick(); return; }
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ---- building the scene from the solution ----
  update() {
    const doc = this.store.doc, net = this.getNet(), sol = this.getSolution();
    if (!net) return;
    this.doc = doc; this.net = net; this.sol = sol;
    const sig = JSON.stringify([doc.parts.map((p) => [p.id, p.type, p.x, p.y, p.rot, p.flip, p.params.state, p.type === "R" ? p.params.R : ""]), doc.wires]);
    if (sig !== this.sig) { this.sig = sig; this.build(); }
    this.retarget();
    this.kick();
  }

  build() {
    for (const m of this.models) this.world.remove(m.group);
    this.world.clear();
    this.models = [];
    const { doc, net } = this;
    const colorOf = (n) => this.colors?.get(n) || { ribbon: plateauMaterial(new THREE.Color("#666")), curtain: null };
    for (const pc of net.pieces) if (pc.node >= 0) this.models.push({ ...wirePiece(pc, colorOf), kind: "wire", pc });
    for (const p of net.junctions) { const n = net.nodeAt(`${p[0]},${p[1]}`); if (n >= 0) this.models.push({ ...junction(p, n, colorOf), kind: "dot" }); }
    for (const part of doc.parts) {
      const el = net.byId.get(part.id) || null;
      const pinNodes = pinPoints(part).map((pp) => net.nodeAt(key(pp.x, pp.y)));
      if (pinNodes.some((n) => n < 0) && part.type !== "LBL" && part.type !== "GND") continue;
      const info = { ohms: el?.params?.R?.value, pinNodes, heat: () => this.heat?.get(part.id) || 0 };
      const m = partModel(part, el, colorOf, info);
      m.group.traverse((o) => { if (o.isMesh) o.userData.part = part.id; });
      this.models.push({ ...m, kind: "part", part, el });
    }
    for (const m of this.models) this.world.add(m.group);
    // the bench under it all, sized to the circuit
    const b = this.bounds();
    const w = b[2] - b[0] + 6, d = b[3] - b[1] + 6;
    this.board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), boardMaterial(w, d));
    this.board.receiveShadow = true;
    this.board.position.set((b[0] + b[2]) / 2, -0.25, (b[1] + b[3]) / 2);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, d - 1), mat("floor"));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set((b[0] + b[2]) / 2, 0, (b[1] + b[3]) / 2);
    this.world.add(this.board, this.sea);
    const s = this.key.shadow.camera;
    Object.assign(s, { left: -w / 2 - 4, right: w / 2 + 4, top: d / 2 + 4, bottom: -d / 2 - 4, near: 1, far: 120 });
    s.updateProjectionMatrix();
    this.key.target.position.set((b[0] + b[2]) / 2, 0, (b[1] + b[3]) / 2);
    this.key.position.set(this.key.target.position.x - 14, 26, this.key.target.position.z + 18);
    this.buildLabels();
    this.buildBeads();
    this.syncToolbar();
    if (!this.userMoved) this.frame(false);
  }

  bounds() {
    const pts = [];
    for (const p of this.doc.parts) { const bx = boxOf(p); pts.push([bx[0], bx[1]], [bx[2], bx[3]]); }
    for (const w of this.doc.wires) pts.push(w.a, w.b);
    if (!pts.length) return [0, 0, 10, 6];
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  }

  // heights and colors for the newest solution (heights ease toward them)
  retarget() {
    const sol = this.sol, net = this.net, hidden = this.hidden();
    const ok = sol?.ok;
    const vref = ok && sol.nodes[this.ref]?.v != null ? sol.nodes[this.ref].v : 0;
    const vd = (i) => (ok && sol.nodes[i] && sol.nodes[i].v !== null ? sol.nodes[i].v - vref : null);
    const vmax = Math.max(1e-9, ...net.nodes.map((n) => Math.abs(vd(n.index) ?? 0)));
    this.scale = (HEIGHT * this.heightScale) / vmax;
    this.colors = new Map();
    this.vmax = vmax;
    const focus = this.getFocusNode?.() ?? null;
    for (const nd of net.nodes) {
      const v = vd(nd.index), hide = hidden({ kind: "v", node: nd.index });
      const t = v === null || hide ? 0 : v * this.scale;
      this.target.set(nd.index, t);
      if (!this.h.has(nd.index) || this.reduced) this.h.set(nd.index, t);
      const color = voltageColor3(v ?? 0, vmax);
      const dim = focus !== null && focus !== nd.index;
      const unknown = v === null || hide;
      const ribbon = plateauMaterial(dim ? color.clone().multiplyScalar(0.35) : color, { unknown });
      this.colors.set(nd.index, { ribbon, curtain: unknown || dim ? null : curtainMaterial(color) });
    }
    // heat: each resistor's share of the largest power absorbed
    this.heat = new Map();
    if (ok) {
      const pmax = Math.max(1e-15, ...Object.values(sol.els).map((e) => Math.max(0, e.p)));
      for (const [id, e] of Object.entries(sol.els)) if (e.type === "R" && e.p > 0 && !hidden({ kind: "p", part: id })) this.heat.set(id, Math.sqrt(e.p / pmax));
    }
    this.flowsFor();
    this.refreshLabels();
    this.applyHeights();
  }

  H = (n) => (n >= 0 ? this.h.get(n) ?? 0 : 0);

  floorY() { return Math.min(0, ...[...this.h.values()]) - 0.06; }

  applyHeights() {
    const floor = this.floorY();
    for (const m of this.models) m.update(this.H, this.sol, floor);
    if (this.board) {
      this.board.position.y = floor - 0.25 - RIBBON_GAP;
      this.sea.visible = floor < -0.12;
    }
    this.placeLabels();
  }

  // ease displayed heights toward the solution; true while anything is still moving
  ease(dt) {
    let moving = false;
    for (const [n, t] of this.target) {
      const h = this.h.get(n) ?? t, d = t - h;
      if (Math.abs(d) > 1e-4) { this.h.set(n, h + d * Math.min(1, dt * 14)); moving = true; } else if (h !== t) { this.h.set(n, t); moving = true; }
    }
    if (moving) this.applyHeights();
    return moving;
  }

  // ---- labels ----
  buildLabels() {
    for (const o of this.labelObjs || []) { o.obj.removeFromParent(); }
    this.labelObjs = [];
    for (const nd of this.net.nodes) {
      const pieces = this.net.pieces.filter((p) => p.node === nd.index);
      if (!pieces.length) continue;
      const longest = pieces.reduce((a, b) => (len(b) > len(a) ? b : a));
      const div = document.createElement("div");
      div.className = "lbl3d";
      const obj = new CSS2DObject(div);
      this.world.add(obj);
      this.labelObjs.push({ obj, div, node: nd.index, at: [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2] });
    }
    for (const part of this.doc.parts) {
      if (part.type === "GND" || part.type === "LBL") continue;
      const div = document.createElement("div");
      div.className = "plbl3d";
      const obj = new CSS2DObject(div);
      this.world.add(obj);
      const bx = boxOf(part);
      this.labelObjs.push({ obj, div, part, at: [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2] });
    }
  }

  refreshLabels() {
    const sol = this.sol, hidden = this.hidden();
    for (const L of this.labelObjs || []) {
      if (L.node !== undefined) {
        const nd = this.net.nodes[L.node], n = sol?.ok ? sol.nodes[L.node] : null;
        const name = L.node === 0 ? "⏚" : nd.label || nd.name;
        const ref = this.ref ? ` from ${esc(this.net.nodes[this.ref].label || this.net.nodes[this.ref].name)}` : "";
        let text = "—";
        if (n && n.v !== null) {
          if (hidden({ kind: "v", node: L.node })) text = "?";
          else if (!this.ref) text = (n.vx ? fmtExact(fromString(n.vx), "V") : { main: fmt(n.v, "V") }).main;
          else text = fmt(n.v - sol.nodes[this.ref].v, "V") + ref;
        }
        L.div.innerHTML = `<span class="n">${esc(name)}</span> ${esc(text)}`;
        L.div.classList.toggle("focus", (this.getFocusNode?.() ?? null) === L.node);
      } else {
        const v = valueText(L.part);
        L.div.innerHTML = `<span class="n">${esc(L.part.id)}</span>${v ? ` ${esc(v)}` : ""}`;
        L.obj.visible = this.store.sel.parts.has(L.part.id) || this.hoverPart === L.part.id;
      }
    }
  }

  placeLabels() {
    for (const L of this.labelObjs || []) {
      if (L.node !== undefined) L.obj.position.set(L.at[0], this.H(L.node) + 0.55, L.at[1]);
      else {
        const pins = pinPoints(L.part), ns = pins.map((pp) => this.net.nodeAt(key(pp.x, pp.y)));
        const top = Math.max(...ns.map((n) => this.H(n)));
        L.obj.position.set(L.at[0], top + 1.05, L.at[1]);
      }
    }
  }

  // ---- current beads ----
  flowsFor() {
    const sol = this.sol;
    this.paths = [];
    if (!sol?.ok || this.hidden()({ kind: "i" })) return;
    const flowByEnds = new Map((sol.flows || []).filter((f) => f.wire).map((f) => [`${f.a}|${f.b}`, f.i]));
    for (const m of this.models) {
      let i = 0;
      if (m.kind === "wire") i = flowByEnds.get(`${m.pc.a}|${m.pc.b}`) ?? 0;
      else if (m.kind === "part" && m.el) {
        const e = sol.els[m.part.id];
        if (!e) continue;
        i = m.part.type === "OA" ? -e.pins[2].i : e.pins[0].i;
      } else continue;
      if (Math.abs(i) > 1e-15) this.paths.push({ m, i });
    }
    this.imax = Math.max(1e-15, ...this.paths.map((p) => Math.abs(p.i)));
  }

  buildBeads() {
    if (this.beads) { this.scene.remove(this.beads); this.beads.dispose(); }
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 12, 8), mat("bead"), this.tier.beads);
    this.beads.count = 0;
    this.beads.frustumCulled = false;
    this.scene.add(this.beads);
  }

  placeBeads(t) {
    const M = new THREE.Matrix4(), P = new THREE.Vector3();
    let k = 0;
    const cap = this.tier.beads;
    if (this.beadsOn && this.paths) {
      for (const { m, i } of this.paths) {
        const pts = m.path(this.H);
        if (!pts) continue;
        const segs = [];
        let total = 0;
        for (let s = 0; s + 1 < pts.length; s++) { const l = Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1], pts[s + 1][2] - pts[s][2]); segs.push(l); total += l; }
        if (total < 1e-6) continue;
        const speed = MAX_SPEED * Math.log10(1 + 9 * Math.abs(i) / this.imax);
        const phase = this.reduced ? SPACING / 2 : ((t * speed) % SPACING + SPACING) % SPACING;
        for (let d = phase; d < total && k < cap; d += SPACING) {
          const along = i > 0 ? d : total - d;
          let s = 0, acc = 0;
          while (s < segs.length - 1 && acc + segs[s] < along) { acc += segs[s]; s++; }
          const f = segs[s] ? (along - acc) / segs[s] : 0;
          P.set(pts[s][0] + (pts[s + 1][0] - pts[s][0]) * f, pts[s][1] + (pts[s + 1][1] - pts[s][1]) * f + 0.12, pts[s][2] + (pts[s + 1][2] - pts[s][2]) * f);
          M.makeTranslation(P.x, P.y, P.z);
          this.beads.setMatrixAt(k++, M);
        }
      }
    }
    this.beads.count = k;
    this.beads.instanceMatrix.needsUpdate = true;
  }

  // ---- camera ----
  frame(animate = true, view = this.view || "threequarter") {
    if (!this.doc) return;
    this.view = view;
    const b = this.bounds();
    const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2, r = Math.max(6, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 2);
    const dirs = { threequarter: [-0.5, 0.48, 0.78], top: [0, 1, 0.02], side: [0, 0.16, 1] };
    const dir = new THREE.Vector3(...dirs[view]).normalize();
    const fov = (this.camera.fov * Math.PI) / 180, aspect = this.camera.aspect || 1.6;
    const dist = (r / Math.sin(fov / 2)) * (aspect < 1 ? 1.1 / aspect : 0.82);
    const target = new THREE.Vector3(cx, HEIGHT * this.heightScale * 0.35, cz);
    const pos = target.clone().addScaledVector(dir, dist);
    if (!animate || this.reduced) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.kick(); return; }
    this.flight = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0 };
    this.kick();
  }

  flyTo(e) {
    const hit = this.pick(e);
    if (!hit) return;
    const p = hit.point;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.flight = { from: this.camera.position.clone(), to: p.clone().addScaledVector(dir, 9), tFrom: this.controls.target.clone(), tTo: p.clone(), t: 0 };
    this.userMoved = true;
    this.kick();
  }

  // ---- picking ----
  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    return this.ray.intersectObjects(this.models.map((m) => m.group), true).find((h) => h.object.visible && (h.object.userData.node !== undefined || h.object.userData.part)) || null;
  }

  pickNode(e) { const h = this.pick(e); return h && h.object.userData.node !== undefined ? h.object.userData.node : null; }

  hover(e) {
    if (e.buttons) { this.tip.hidden = true; return; }
    const hit = this.pick(e);
    const part = hit?.object.userData.part || null;
    if (part !== this.hoverPart) { this.hoverPart = part; this.refreshLabels(); this.kick(); }
    const n = hit && hit.object.userData.node !== undefined ? hit.object.userData.node : null;
    if (n === null || !this.sol?.ok) { this.tip.hidden = true; return; }
    const nd = this.net.nodes[n], s = this.sol.nodes[n];
    const hide = this.hidden()({ kind: "v", node: n });
    this.tip.innerHTML = `<b>${esc(n === 0 ? "ground" : nd.label || nd.name)}</b> ${hide ? "?" : s.v === null ? "no DC voltage" : esc(fmt(s.v, "V"))}`;
    const r = this.host.getBoundingClientRect();
    this.tip.style.left = `${e.clientX - r.left + 14}px`;
    this.tip.style.top = `${e.clientY - r.top + 14}px`;
    this.tip.hidden = false;
  }

  // ---- toolbar ----
  toolbar(e) {
    const t = e.target;
    if (e.type === "click") {
      const b = t.closest("[data-v3d]");
      if (!b) return;
      const act = b.dataset.v3d;
      if (act === "fit") { this.userMoved = false; this.frame(true, "threequarter"); }
      else if (act === "top" || act === "side") { this.userMoved = true; this.frame(true, act); }
      else if (act === "beads") { this.beadsOn = !this.beadsOn; this.prefs.beads3d = this.beadsOn; this.savePrefs(); b.setAttribute("aria-pressed", String(this.beadsOn)); this.kick(); }
      return;
    }
    if (t.matches("[data-v3d-ref]") && e.type === "change") { this.ref = Number(t.value); this.retarget(); this.kick(); }
    if (t.matches("[data-v3d-quality]") && e.type === "change") { this.prefs.quality3d = t.value; this.savePrefs(); this.setTier(t.value); this.buildBeads(); }
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

  // ---- loop ----
  kick() {
    if (!this.visible || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  loop(now) {
    this.raf = 0;
    if (!this.visible || document.hidden) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let active = this.ease(dt);
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / 0.55);
      const k = 1 - (1 - f.t) ** 3;
      this.camera.position.lerpVectors(f.from, f.to, k);
      this.controls.target.lerpVectors(f.tFrom, f.tTo, k);
      if (f.t >= 1) this.flight = null;
      active = true;
    }
    if (this.controls.update()) active = true;
    const beads = this.beadsOn && this.paths?.length && !this.reduced;
    this.placeBeads(now / 1000);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    if (active || beads) {
      this.governor.frame(dt * 1000);
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }
  }
}

const RIBBON_GAP = 0.04;
const len = (pc) => Math.abs(pc.a[0] - pc.b[0]) + Math.abs(pc.a[1] - pc.b[1]);

function toolbarHTML(L) {
  return `<div class="v3d-bar">
    <button type="button" class="small" data-v3d="fit" title="Frame the circuit">Reset view</button>
    <button type="button" class="small" data-v3d="top" title="Look straight down">Top</button>
    <button type="button" class="small" data-v3d="side" title="See the voltage profile from the side">Side</button>
    <button type="button" class="small" data-v3d="beads" aria-pressed="${L.beadsOn}" title="Moving beads show current">Current</button>
    <label class="v3d-ctl" title="Which node is shown at height 0 (voltages are differences, so the whole landscape just moves)">0 V at <select data-v3d-ref></select></label>
    <label class="v3d-ctl">Height <input type="range" data-v3d-height min="0.4" max="2.5" step="0.1" value="${L.heightScale}"></label>
    <label class="v3d-ctl">Quality <select data-v3d-quality><option value="auto">Auto</option><option value="battery">Battery</option><option value="balanced">Balanced</option><option value="cinematic">Cinematic</option></select></label>
  </div><div class="v3d-note">Height = voltage · drag to orbit · double-click to fly to a node</div>`;
}
