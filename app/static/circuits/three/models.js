// 3D models of the parts, built from the same layout as the schematic. Height is voltage:
// every trace of a node is a glossy bar at its height with a light curtain under it, a
// resistor is a ramp between its two ends, a source stands upright and lifts charge from one
// level to the next. Every model is built once per drawing: update(H) only moves and stretches
// meshes (no geometry is rebuilt while heights ease or a run plays), refresh(sol) recolors,
// and edges describe the paths the current particles take through it.

import * as THREE from "three";
import { boxOf } from "../editor/symbols.js";
import {
  mat, resistorMaterial, heatColor, bandMaterial, colorBands, fieldMaterial, Screen,
} from "./materials.js";

export const BAR_W = 0.32, BAR_T = 0.13, BEAD_DY = 0.07;
const BEVEL = 0.035, LIFT = 0.25, Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

// a layout point (grid units, in the part's own frame) at height y in the world
function lay(part, lx, ly, y, out = new THREE.Vector3()) {
  let x = part.flip ? -lx : lx, z = ly;
  for (let r = 0; r < (part.rot || 0); r++) { const t = x; x = -z; z = t; }
  return out.set(part.x + x, y, part.y + z);
}

// stand a mesh whose length runs along its local Y between two points
function span(obj, a, b, minLen = 1e-3) {
  _d.subVectors(b, a);
  const len = _d.length();
  if (len < 1e-6) _d.copy(Y); else _d.divideScalar(len);
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  obj.quaternion.setFromUnitVectors(Y, _d);
  return Math.max(len, minLen);
}

const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

// ---- shared geometry (made on first use) ----
const geos = new Map();
function geo(name, make) { if (!geos.has(name)) geos.set(name, make()); return geos.get(name); }

// a trace: a beveled bar with round ends (so pieces meeting at a corner blend), top at y = 0
function barGeometry(len, w = BAR_W, t = BAR_T) {
  return geo(`bar:${len.toFixed(3)}:${w}:${t}`, () => {
    const r = w / 2 - BEVEL, half = len / 2;
    const s = new THREE.Shape();
    s.moveTo(-half, -r);
    s.lineTo(half, -r);
    s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-half, r);
    s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(t - BEVEL), 0);
    return g;
  });
}

// a rounded box (w × d footprint, h tall), its top at y = 0
function roundedBox(w, h, d, r) {
  return geo(`rbox:${w}:${h}:${d}:${r}`, () => {
    const s = new THREE.Shape(), x = w / 2 - r, z = d / 2 - r;
    s.moveTo(-x, -z - r); s.absarc(x, -z, r, -Math.PI / 2, 0); s.absarc(x, z, r, 0, Math.PI / 2);
    s.absarc(-x, z, r, Math.PI / 2, Math.PI); s.absarc(-x, -z, r, Math.PI, Math.PI * 1.5);
    const b = Math.min(r, h / 4);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 3, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(h - b), 0);
    return g;
  });
}

const unitCylinder = (r, segs = 24, open = false) => geo(`cyl:${r}:${segs}:${open}`, () => new THREE.CylinderGeometry(r, r, 1, segs, 1, open));
const sphere = () => geo("sphere", () => new THREE.SphereGeometry(1, 28, 18));
const unitPlane = () => geo("plane", () => new THREE.PlaneGeometry(1, 1));

// the classic dog-bone body of an axial resistor, along Y, 1.9 long
const R_LEN = 1.9;
function resistorRadius(y) {
  const a = Math.abs(y);
  if (a > 0.8) return 0.255 * Math.sqrt(Math.max(0, 1 - ((a - 0.8) / 0.15) ** 2));
  if (a > 0.5) return 0.255;
  return 0.255 - 0.042 * smooth((0.5 - a) / 0.12);
}
const resistorBody = () => geo("rbody", () => {
  const pts = [];
  for (let i = 0; i <= 64; i++) { const y = -R_LEN / 2 + (R_LEN * i) / 64; pts.push(new THREE.Vector2(Math.max(resistorRadius(y), 1e-4), y)); }
  return new THREE.LatheGeometry(pts, 48);
});

// a capacitor plate: a disc with a rounded rim, its axis along Y
const plateGeometry = () => geo("plate", () => {
  const pts = [new THREE.Vector2(0, -0.045)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 8; pts.push(new THREE.Vector2(0.54 + 0.045 * Math.cos(a), 0.045 * Math.sin(a))); }
  pts.push(new THREE.Vector2(0, 0.045));
  return new THREE.LatheGeometry(pts, 56);
});

// a coil wound along Y from -1 to 1 (stretched to fit), and its core
class Helix extends THREE.Curve {
  constructor(turns, r) { super(); this.turns = turns; this.r = r; }
  getPoint(t, out = new THREE.Vector3()) {
    const ang = t * this.turns * Math.PI * 2;
    return out.set(Math.cos(ang) * this.r, -1 + 2 * t, Math.sin(ang) * this.r);
  }
}
const coilGeometry = (turns = 6, r = 0.27) => geo(`coil:${turns}:${r}`, () => new THREE.TubeGeometry(new Helix(turns, r), turns * 44, 0.052, 8, false));

// a flat arrow, pointing along +x, lying in the XZ plane
const arrowGeometry = () => geo("arrow", () => {
  const s = new THREE.Shape();
  s.moveTo(-0.26, -0.05); s.lineTo(0.06, -0.05); s.lineTo(0.06, -0.13); s.lineTo(0.26, 0); s.lineTo(0.06, 0.13); s.lineTo(0.06, 0.05); s.lineTo(-0.26, 0.05); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
});
const plusGeometry = () => geo("plus", () => {
  const s = new THREE.Shape(), a = 0.045, b = 0.15;
  s.moveTo(-a, -b); s.lineTo(a, -b); s.lineTo(a, -a); s.lineTo(b, -a); s.lineTo(b, a); s.lineTo(a, a); s.lineTo(a, b);
  s.lineTo(-a, b); s.lineTo(-a, a); s.lineTo(-b, a); s.lineTo(-b, -a); s.lineTo(-a, -a); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
});
const minusGeometry = () => geo("minus", () => { const g = new THREE.BoxGeometry(0.3, 0.03, 0.09); g.translate(0, 0.015, 0); return g; });
const sineGeometry = () => geo("sine", () => {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3(-0.24 + 0.48 * t, 0, -0.1 * Math.sin(t * Math.PI * 2))); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.022, 6, false);
});

// ---- the shape every model shares ----
class Model {
  constructor(kind, id) {
    this.kind = kind; this.id = id;
    this.group = new THREE.Group();
    this.hits = [];       // invisible boxes the pointer picks
    this.edges = [];      // current paths: {a, b, pts: [{x, z, node, dy}], current(sol)}
    this.own = [];        // geometries and materials only this model uses
    this.ups = [];        // (H, floor, dt) => void
    this.moving = false;  // still animating (a switch blade swinging)
  }
  add(...objs) { for (const o of objs) this.group.add(o); return objs[0]; }
  hit(owner) {
    const m = new THREE.Mesh(geo("hitbox", () => new THREE.BoxGeometry(1, 1, 1)), mat("hit"));
    m.userData.pick = owner;
    this.hits.push(m);
    return m;
  }
  update(H, floor, dt) { this.moving = false; for (const u of this.ups) u(H, floor, dt); }
  refresh() {}
  setPart() {}
  dispose() { for (const o of this.own) o.dispose?.(); }
}

// ---- traces ----

export function buildWire(pc, looks) {
  const m = new Model("wire", pc.wire);
  m.node = pc.node;
  const dx = pc.b[0] - pc.a[0], dz = pc.b[1] - pc.a[1], len = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
  const cx = (pc.a[0] + pc.b[0]) / 2, cz = (pc.a[1] + pc.b[1]) / 2;
  const look = looks(pc.node);
  const bar = m.add(shadowed(new THREE.Mesh(barGeometry(len), look.solid)));
  bar.position.set(cx, 0, cz); bar.rotation.y = ang;
  bar.userData.node = pc.node;
  const curtain = m.add(new THREE.Mesh(unitPlane(), look.curtain));
  curtain.position.set(cx, 0, cz); curtain.rotation.y = ang;
  curtain.renderOrder = 2;
  const spill = m.add(new THREE.Mesh(unitPlane(), look.spill));
  spill.rotation.set(-Math.PI / 2, 0, ang);
  spill.position.set(cx, 0, cz);
  spill.renderOrder = 1;
  const box = m.hit({ kind: "wire", id: pc.wire, node: pc.node });
  box.position.set(cx, 0, cz); box.rotation.y = ang;
  box.scale.set(len + BAR_W + 0.1, BAR_T + 0.4, BAR_W + 0.4);
  m.ups.push((H, floor) => {
    const y = H(pc.node);
    bar.position.y = y;
    box.position.y = y - BAR_T / 2;
    const h = y - BAR_T - floor;
    curtain.visible = h > 0.05 && look.curtain.uniforms.uOpacity.value > 0;
    if (curtain.visible) { curtain.position.y = floor + h / 2; curtain.scale.set(len + BAR_W * 0.6, h, 1); }
    // the light it throws on the bench spreads (and dims) with height
    spill.position.y = floor + 0.012;
    const spread = 1.0 + 0.22 * Math.max(0, h);
    spill.scale.set(len + spread, spread, 1);
    spill.visible = look.spill.uniforms.uOpacity.value > 0;
  });
  m.edges.push({
    a: `${pc.a[0]},${pc.a[1]}`, b: `${pc.b[0]},${pc.b[1]}`,
    pts: [{ x: pc.a[0], z: pc.a[1], node: pc.node, dy: BEAD_DY }, { x: pc.b[0], z: pc.b[1], node: pc.node, dy: BEAD_DY }],
    current: (sol, flowOf) => flowOf(pc),
  });
  return m;
}

export function buildJunction(p, node, looks) {
  const m = new Model("dot", `dot:${p[0]},${p[1]}`);
  m.node = node;
  const cap = m.add(shadowed(new THREE.Mesh(geo("junction", () => {
    const pts = [new THREE.Vector2(0, -BAR_T - 0.01)];
    pts.push(new THREE.Vector2(0.21, -BAR_T - 0.01));
    for (let i = 0; i <= 8; i++) { const a = (Math.PI / 2) * (i / 8); pts.push(new THREE.Vector2(0.15 + 0.06 * Math.cos(a), 0.02 + 0.06 * Math.sin(a))); }
    pts.push(new THREE.Vector2(0, 0.08));
    return new THREE.LatheGeometry(pts, 36);
  }), looks(node).solid)));
  cap.position.set(p[0], 0, p[1]);
  m.ups.push((H) => { cap.position.y = H(node); });
  return m;
}

// ---- parts ----

// a lead in the node's own color: the trace continuing into the part, at the node's height
function traceLead(m, part, looks, node, x0, y0, x1, y1) {
  const a = lay(part, x0, y0, 0), b = lay(part, x1, y1, 0);
  const len = a.distanceTo(b);
  if (len < 1e-3 || node < 0) return null;
  const bar = m.add(shadowed(new THREE.Mesh(barGeometry(len, BAR_W * 0.8, BAR_T * 0.85), looks(node).solid)));
  bar.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  bar.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  bar.userData.node = node;
  m.ups.push((H) => { bar.position.y = H(node); });
  return bar;
}

// put a body of its own length in the middle of the ramp from A to B (moving A and B to its
// ends); on a steep ramp it stays a resistor or a coil, and the leads take up the rest
function centre(axis, A, B, length) {
  const total = A.distanceTo(B);
  if (total > length) {
    _d.subVectors(B, A).multiplyScalar(0.5 * (1 - length / total));
    A.add(_d); B.sub(_d);
  }
  return span(axis, A, B);
}

// the ends of a body centred on its ramp, for the current's path: pass end 0 or 1
function rampEnd(part, n, x0, x1, lift, length, end) {
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  return (H, out) => {
    lay(part, x0, 0, H(n[0]) + lift, A); lay(part, x1, 0, H(n[1]) + lift, B);
    const total = A.distanceTo(B), f = total > length ? 0.5 * (1 - length / total) : 0;
    return end ? out.copy(B).lerp(A, f) : out.copy(A).lerp(B, f);
  };
}

// a tinned wire lead between two moving points
function metalLead(m, radius = 0.042) {
  const lead = m.add(shadowed(new THREE.Mesh(unitCylinder(radius, 12), mat("tin"))));
  return (a, b) => { lead.scale.set(1, span(lead, a, b), 1); };
}

// keep a part's invisible hit box around its footprint and the heights it spans
function partHit(m, part, pad = 0.15) {
  const box = m.hit({ kind: "part", id: part.id });
  const b = boxOf(part);
  return (lo, hi) => {
    box.position.set((b[0] + b[2]) / 2, (lo + hi) / 2, (b[1] + b[3]) / 2);
    box.scale.set(Math.max(0.5, b[2] - b[0] + pad), Math.max(0.5, hi - lo), Math.max(0.5, b[3] - b[1] + pad));
  };
}

const key = (x, y) => `${x},${y}`;
// a point on a part's current path: a layout point at a node's height (plus dy)
function pathPoint(part, lx, ly, node, dy = BEAD_DY) { const p = lay(part, lx, ly, 0); return { x: p.x, z: p.z, node, dy }; }
function pinKey(part, lx, ly) { const p = lay(part, lx, ly, 0); return key(Math.round(p.x), Math.round(p.z)); }

export function buildPart(part, el, ctx) {
  const m = new Model("part", part.id);
  m.part = part;
  const n = el ? el.nodes : ctx.pinNodes;
  const { looks } = ctx;
  const make = BUILDERS[part.type];
  if (make) make(m, part, n, ctx, looks);
  m.group.traverse((o) => { if (o.isMesh) o.userData.part = part.id; });
  return m;
}

const BUILDERS = {
  R(m, part, n, ctx, looks) {
    const leadA = metalLead(m), leadB = metalLead(m);
    const body = resistorMaterial();
    m.own.push(body);
    const axis = new THREE.Group();
    axis.add(shadowed(new THREE.Mesh(resistorBody(), body)));
    m.add(axis);
    let bands = [];
    const setBands = (ohms) => {
      for (const b of bands) axis.remove(b);
      const code = colorBands(ohms) || [];
      const at = code.length === 5 ? [-0.7, -0.52, -0.34, -0.16, 0.62] : [-0.66, -0.44, -0.22, 0.62];
      bands = code.map((k, i) => {
        const y = at[i], r = resistorRadius(y) + 0.006;
        const ring = new THREE.Mesh(geo(`band:${r.toFixed(3)}`, () => new THREE.CylinderGeometry(r, r, 0.085, 40, 1, true)), bandMaterial(k));
        ring.position.y = y;
        ring.userData.part = part.id;
        axis.add(ring);
        return ring;
      });
    };
    setBands(ctx.ohms);
    m.setPart = (p, el2) => { if (el2?.params?.R?.value !== m.ohms) { m.ohms = el2?.params?.R?.value; setBands(m.ohms); } };
    m.ohms = ctx.ohms;
    const hit = partHit(m, part);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    m.ups.push((H) => {
      const h0 = H(n[0]), h1 = H(n[1]);
      lay(part, 0, 0, h0 + 0.03, pa); lay(part, 4, 0, h1 + 0.03, pb);
      lay(part, 1.05, 0, h0 + LIFT, A); lay(part, 2.95, 0, h1 + LIFT, B);
      const len = centre(axis, A, B, R_LEN);
      leadA(pa, A); leadB(B, pb);
      axis.scale.set(1, len / R_LEN, 1);
      hit(Math.min(h0, h1) - 0.15, Math.max(h0, h1) + 0.6);
    });
    const glow = new THREE.Color();
    m.refresh = (sol, info) => {
      const heat = info.heat ?? 0;
      heatColor(heat, glow);
      body.emissive.copy(glow);
      body.emissiveIntensity = 1.5 * heat * heat + 0.2 * heat;
      body.color.setRGB(0.83 - 0.2 * heat, 0.74 - 0.3 * heat, 0.57 - 0.32 * heat);
    };
    m.edges.push({
      a: pinKey(part, 0, 0), b: pinKey(part, 4, 0),
      pts: [pathPoint(part, 0, 0, n[0]), { at: rampEnd(part, n, 1.05, 2.95, LIFT + 0.27, R_LEN, 0) }, { at: rampEnd(part, n, 1.05, 2.95, LIFT + 0.27, R_LEN, 1) }, pathPoint(part, 4, 0, n[1])],
      current: (sol) => sol.els[part.id]?.pins[0]?.i ?? 0,
    });
  },

  C(m, part, n, ctx) {
    const leadA = metalLead(m), leadB = metalLead(m);
    const plates = [0, 1].map(() => m.add(shadowed(new THREE.Mesh(plateGeometry(), mat("plate")))));
    const field = fieldMaterial();
    m.own.push(field);
    const sheets = [0, 1].map((k) => {
      const s = new THREE.Mesh(unitPlane(), field);
      s.renderOrder = 3;
      s.userData.spin = new THREE.Quaternion().setFromAxisAngle(Y, k * Math.PI / 2);
      return m.add(s);
    });
    const hit = partHit(m, part);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();
    m.ups.push((H) => {
      const h0 = H(n[0]), h1 = H(n[1]);
      lay(part, 0, 0, h0 + 0.03, pa); lay(part, 4, 0, h1 + 0.03, pb);
      lay(part, 1.82, 0, h0 + 0.5, A); lay(part, 2.18, 0, h1 + 0.5, B);
      leadA(pa, A); leadB(B, pb);
      // the plates face each other across the gap, along the part's own axis
      lay(part, 4, 0, 0, _b).sub(lay(part, 0, 0, 0, _a)).normalize();
      for (const [p, c] of [[plates[0], A], [plates[1], B]]) { p.position.copy(c); p.quaternion.setFromUnitVectors(Y, _b); }
      // the field fills the gap between them
      const len = A.distanceTo(B);
      M.addVectors(A, B).multiplyScalar(0.5);
      _d.subVectors(B, A).normalize();
      _q.setFromUnitVectors(Y, _d);
      for (const s of sheets) {
        s.position.copy(M);
        s.quaternion.copy(_q).multiply(s.userData.spin);
        s.scale.set(1.0, Math.max(0.05, len - 0.08), 1);
      }
      hit(Math.min(h0, h1) - 0.2, Math.max(h0, h1) + 1.1);
    });
    m.refresh = (sol, info) => {
      field.uniforms.uLevel.value = Math.min(1, info.field ?? 0);
      if (info.fieldColor) field.uniforms.uColor.value.copy(info.fieldColor);
    };
    m.edges.push({
      a: pinKey(part, 0, 0), b: pinKey(part, 4, 0),
      pts: [pathPoint(part, 0, 0, n[0]), pathPoint(part, 1.78, 0, n[0], 0.5), pathPoint(part, 2.22, 0, n[1], 0.5), pathPoint(part, 4, 0, n[1])],
      current: (sol) => sol.els[part.id]?.pins[0]?.i ?? 0,
    });
  },

  L(m, part, n) {
    const leadA = metalLead(m), leadB = metalLead(m);
    const axis = new THREE.Group();
    axis.add(shadowed(new THREE.Mesh(coilGeometry(), mat("copper"))));
    const core = shadowed(new THREE.Mesh(unitCylinder(0.16, 24), mat("ferrite")));
    core.scale.set(1, 2.1, 1);
    axis.add(core);
    m.add(axis);
    const hit = partHit(m, part);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    m.ups.push((H) => {
      const h0 = H(n[0]), h1 = H(n[1]);
      lay(part, 0, 0, h0 + 0.03, pa); lay(part, 4, 0, h1 + 0.03, pb);
      lay(part, 1, 0, h0 + 0.33, A); lay(part, 3, 0, h1 + 0.33, B);
      const len = centre(axis, A, B, 2);
      leadA(pa, A); leadB(B, pb);
      axis.scale.set(1, len / 2, 1);
      hit(Math.min(h0, h1) - 0.15, Math.max(h0, h1) + 0.7);
    });
    m.edges.push({
      a: pinKey(part, 0, 0), b: pinKey(part, 4, 0),
      pts: [pathPoint(part, 0, 0, n[0]), { at: rampEnd(part, n, 1, 3, 0.66, 2, 0) }, { at: rampEnd(part, n, 1, 3, 0.66, 2, 1) }, pathPoint(part, 4, 0, n[1])],
      current: (sol) => sol.els[part.id]?.pins[0]?.i ?? 0,
    });
  },

  // sources and meters stand upright between their terminals' heights
  V: upright, I: upright, E: upright, F: upright, G: upright, H: upright, AM: upright, VM: upright,

  OA(m, part, n, ctx, looks) {
    traceLead(m, part, looks, n[0], 0, -1, 1.1, -1);
    traceLead(m, part, looks, n[1], 0, 1, 1.1, 1);
    traceLead(m, part, looks, n[2], 4.4, 0, 5, 0);
    const shape = new THREE.Shape();
    shape.moveTo(1, -1.9); shape.lineTo(1, 1.9); shape.lineTo(4.5, 0); shape.closePath();
    const tg = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 3 });
    tg.rotateX(Math.PI / 2);  // extrude downward (local y -> world -y)
    m.own.push(tg);
    const tower = m.add(shadowed(new THREE.Mesh(tg, mat("acrylic"))));
    // a glowing edge around the top, and the input signs on it
    const rim = new THREE.CurvePath();
    const tri = [[1.12, -1.66], [1.12, 1.66], [4.22, 0]];
    tri.forEach((p, i) => { const q = tri[(i + 1) % 3]; rim.add(new THREE.LineCurve3(new THREE.Vector3(p[0], 0.075, p[1]), new THREE.Vector3(q[0], 0.075, q[1]))); });
    const rg = new THREE.TubeGeometry(rim, 90, 0.022, 6, true);
    m.own.push(rg);
    const top = new THREE.Group();
    top.add(new THREE.Mesh(rg, mat("edge")));
    const minus = new THREE.Mesh(minusGeometry(), mat("glyphDim")); minus.position.set(1.55, 0.07, -1);
    const plus = new THREE.Mesh(plusGeometry(), mat("glyphDim")); plus.position.set(1.55, 0.07, 1);
    top.add(minus, plus);
    m.add(top);
    const hit = partHit(m, part);
    m.ups.push((H, floor) => {
      const out = H(n[2]), bottom = Math.min(floor + 0.05, H(n[0]), H(n[1]), out - 0.3);
      const o = lay(part, 0, 0, 0, _a);
      for (const g of [tower, top]) {
        g.position.set(o.x, out, o.z);
        g.rotation.set(0, -(part.rot || 0) * Math.PI / 2, 0);
      }
      tower.scale.set(part.flip ? -1 : 1, Math.max(0.3, out - bottom), 1);
      top.scale.set(part.flip ? -1 : 1, 1, 1);
      hit(bottom, out + 0.3);
    });
    m.edges.push({
      a: `${part.id}:out`, b: pinKey(part, 5, 0),
      pts: [pathPoint(part, 4.4, 0, n[2]), pathPoint(part, 5, 0, n[2])],
      current: (sol) => -(sol.els[part.id]?.pins[2]?.i ?? 0),
    });
  },

  SW: knifeSwitch, SW2: knifeSwitch,

  GND(m, part, n, ctx) {
    const node = ctx.pinNodes[0];
    const stem = metalLead(m, 0.045);
    const bars = [0.72, 0.46, 0.22].map((w) => m.add(shadowed(new THREE.Mesh(roundedBox(w * 2, 0.07, 0.12, 0.03), mat("chrome")))));
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    m.ups.push((H) => {
      const h = H(node);
      lay(part, 0, 0, h, p); lay(part, 0, 0.62, h, q);
      stem(p, q);
      bars.forEach((b, i) => {
        lay(part, 0, 0.62 + i * 0.3, h + 0.035, b.position);
        b.rotation.set(0, -(part.rot || 0) * Math.PI / 2, 0);
      });
    });
  },

  LBL(m, part, n, ctx, looks) {
    const node = ctx.pinNodes[0];
    if (node < 0) return;
    const pole = metalLead(m, 0.035);
    const tip = m.add(shadowed(new THREE.Mesh(sphere(), looks(node).solid)));
    tip.scale.setScalar(0.11);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    m.ups.push((H) => { const h = H(node); lay(part, 0, 0, h, p); lay(part, 0, 0, h + 0.85, q); pole(p, q); tip.position.copy(q); });
  },

  K: coupled, TR: coupled,
  V3Y: generator, V3D: generator,
};

// a source or meter: leads in its nodes' colors from both terminals to its middle, and a body
// standing from the lower terminal's height to the higher one's
function upright(m, part, n, ctx, looks) {
  traceLead(m, part, looks, n[0], 0, 0, 2, 0);
  traceLead(m, part, looks, n[1], 4, 0, 2, 0);
  const t = part.type, meter = t === "AM" || t === "VM", dependent = "EFGH".includes(t);
  const sine = part.params?.wave === "sine";
  const c = lay(part, 2, 0, 0);
  const body = new THREE.Group();
  m.add(body);
  let sleeve = null, capTop = null, capBottom = null, ringTop = null, glyph = null, screen = null, nub = null;
  if (meter) {
    sleeve = shadowed(new THREE.Mesh(roundedBox(1.15, 1, 0.82, 0.12), mat("housing")));
    body.add(sleeve);
    screen = new Screen();
    m.own.push(screen);
    const face = new THREE.Mesh(unitPlane(), screen.material);
    face.rotation.x = -Math.PI / 2;
    face.scale.set(0.86, 0.38, 1);
    face.userData.face = true;
    body.add(face);
    glyph = face;
  } else if (dependent) {
    sleeve = shadowed(new THREE.Mesh(unitCylinder(0.55, 4), mat("acrylic")));
    sleeve.rotation.y = Math.PI / 4;
    body.add(sleeve);
    ringTop = new THREE.Mesh(geo("dep-rim", () => new THREE.TorusGeometry(0.55, 0.022, 6, 4)), mat("edge"));
    ringTop.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    body.add(ringTop);
    glyph = new THREE.Mesh("FG".includes(t) ? arrowGeometry() : plusGeometry(), mat("glyph"));
    body.add(glyph);
  } else {
    sleeve = shadowed(new THREE.Mesh(unitCylinder(0.42, 48, true), mat(t === "I" ? "sleeveI" : sine ? "sleeveAC" : "graphite")));
    body.add(sleeve);
    capTop = shadowed(new THREE.Mesh(unitCylinder(0.425, 48), mat("chrome")));
    capBottom = shadowed(new THREE.Mesh(unitCylinder(0.425, 48), mat("chrome")));
    capTop.scale.y = capBottom.scale.y = 0.06;
    ringTop = shadowed(new THREE.Mesh(geo("cell-ring", () => new THREE.TorusGeometry(0.43, 0.03, 10, 48)), mat("positive")));
    ringTop.rotation.x = Math.PI / 2;
    body.add(capTop, capBottom, ringTop);
    if (t === "V") { nub = shadowed(new THREE.Mesh(unitCylinder(0.14, 24), mat("chrome"))); nub.scale.y = 0.1; body.add(nub); }
    glyph = new THREE.Mesh(t === "I" ? arrowGeometry() : sine ? sineGeometry() : plusGeometry(), mat("glyph"));
    body.add(glyph);
  }
  // the + terminal (pin a) or the arrow's end (pin a) sets which way the glyphs point
  const toA = Math.atan2(-(lay(part, 0, 0, 0).z - c.z), lay(part, 0, 0, 0).x - c.x);
  const hit = partHit(m, part);
  m.ups.push((H) => {
    const h0 = H(n[0]), h1 = H(n[1]);
    const lo = Math.min(h0, h1), hi = Math.max(h0, h1), height = Math.max(meter ? 0.5 : 0.22, hi - lo);
    const mid = (lo + hi) / 2, top = mid + height / 2, bottom = mid - height / 2;
    body.position.set(c.x, 0, c.z);
    if (meter) {
      sleeve.position.y = top; sleeve.scale.set(1, height, 1);
      glyph.position.set(0, top + 0.004, 0);  // the screen, upright for the default view
    } else if (dependent) {
      sleeve.position.y = mid; sleeve.scale.set(1, height, 1);
      ringTop.position.y = top;
      glyph.position.set(0, top + 0.005, 0);
      glyph.rotation.y = toA;
    } else {
      sleeve.position.y = mid; sleeve.scale.set(1, height, 1);
      capTop.position.y = top; capBottom.position.y = bottom;
      // the + end: a red ring and (for a battery) the nub, on whichever end pin a is at
      const plusUp = h0 >= h1;
      ringTop.position.y = plusUp ? top - 0.07 : bottom + 0.07;
      if (nub) nub.position.y = plusUp ? top + 0.05 : bottom - 0.05;
      glyph.position.set(0, top + 0.035, 0);
      glyph.rotation.y = t === "I" ? toA : 0;
    }
    hit(lo - 0.15, hi + 0.45);
  });
  if (screen) m.refresh = (sol, info) => { if (info.reading) screen.draw(info.reading.text, info.reading.unit); };
  m.edges.push({
    a: pinKey(part, 0, 0), b: pinKey(part, 4, 0),
    pts: [pathPoint(part, 0, 0, n[0]), pathPoint(part, 2, 0, n[0]), pathPoint(part, 2, 0, n[1]), pathPoint(part, 4, 0, n[1])],
    current: (sol) => sol.els[part.id]?.pins[0]?.i ?? 0,
  });
}

// a knife switch: the blade swings on its pivot (one throw or two) and the change animates
function knifeSwitch(m, part, n, ctx, looks) {
  const two = part.type === "SW2";
  const pins = ctx.pinNodes;
  traceLead(m, part, looks, pins[0], 0, 0, 1.2, 0);
  if (two) { traceLead(m, part, looks, pins[1], 4, -1, 2.8, -1); traceLead(m, part, looks, pins[2], 4, 1, 2.8, 1); }
  else traceLead(m, part, looks, pins[1], 4, 0, 2.8, 0);
  const base = m.add(shadowed(new THREE.Mesh(roundedBox(two ? 2.4 : 2.3, 0.14, two ? 2.4 : 0.7, 0.08), mat("ceramic"))));
  const contacts = two ? [[2.8, -1], [2.8, 1]] : [[2.8, 0]];
  const posts = [[1.2, 0], ...contacts].map(() => m.add(shadowed(new THREE.Mesh(unitCylinder(0.1, 20), mat("brass")))));
  const blade = m.add(shadowed(new THREE.Mesh(geo("blade", () => new THREE.BoxGeometry(0.12, 1, 0.07)), mat("brass"))));
  const knob = m.add(shadowed(new THREE.Mesh(sphere(), mat("acrylic"))));
  knob.scale.setScalar(0.11);
  let swing = null, throwT = null;  // displayed 0 (closed) .. 1 (open); 0 (throw 1) .. 1 (throw 2)
  const hit = partHit(m, part);
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3();
  m.ups.push((H, floor, dt) => {
    const state = m.part.params?.state;
    const open = !two && state === "open" ? 1 : 0, which = two && state === "2" ? 1 : 0;
    const k = 1 - Math.exp(-(dt || 1) * 9);
    swing = swing === null ? open : swing + (open - swing) * k;
    throwT = throwT === null ? which : throwT + (which - throwT) * k;
    if (Math.abs(swing - open) > 1e-3 || Math.abs(throwT - which) > 1e-3) m.moving = true;
    const hp = H(pins[0]), hs = contacts.map((_, i) => H(pins[i + 1]));
    const lo = Math.min(hp, ...hs);
    lay(part, 2, 0, lo - 0.02, base.position);
    base.rotation.set(0, -(part.rot || 0) * Math.PI / 2, 0);
    [[1.2, 0, hp], ...contacts.map(([x, y], i) => [x, y, hs[i]])].forEach(([x, y, h], i) => {
      lay(part, x, y, (lo + h) / 2 + 0.06, posts[i].position);
      posts[i].scale.set(1, Math.max(0.16, h - lo + 0.16), 1);
    });
    // the blade: from the pivot toward its contact, lifted 50° when open
    lay(part, 1.2, 0, hp + 0.14, P);
    const [cx, cy] = two ? [2.8, -1 + 2 * throwT] : [2.8, 0];
    const hc = two ? hs[0] + (hs[1] - hs[0]) * throwT : hs[0];
    lay(part, cx, cy, hc + 0.14, Q);
    R.subVectors(Q, P);
    const flat = Math.hypot(R.x, R.z), lift = swing * 0.87;
    R.set(R.x * Math.cos(lift), R.y + flat * Math.sin(lift), R.z * Math.cos(lift));
    Q.addVectors(P, R);
    blade.scale.set(1, span(blade, P, Q), 1);
    knob.position.copy(Q).lerp(P, 0.18);
    knob.position.y += 0.1;
    hit(lo - 0.1, Math.max(hp, ...hs) + 0.4 + swing * 1.2);
  });
  m.setPart = (p) => { m.part = p; };
  m.state = () => ({ swing, throwT });
  m.restore = (s) => { swing = s.swing; throwT = s.throwT; };
  // current runs through the blade when it's closed (from the switch's own flow)
  const throwPin = (k) => (two ? pinKey(part, 4, k === 0 ? -1 : 1) : pinKey(part, 4, 0));
  for (let k = 0; k < contacts.length; k++) {
    const [x, y] = contacts[k], end = two ? [4, y] : [4, 0];
    m.edges.push({
      a: pinKey(part, 0, 0), b: throwPin(k),
      pts: [pathPoint(part, 0, 0, pins[0]), pathPoint(part, 1.2, 0, pins[0], 0.2), pathPoint(part, x, y, pins[k + 1], 0.2), pathPoint(part, end[0], end[1], pins[k + 1])],
      current: (sol) => {
        const f = sol.flows?.find((q) => q.part === part.id && key(...q.b) === throwPin(k));
        return f ? f.i : 0;
      },
    });
  }
}

// coupled coils and the ideal transformer: two windings side by side; the transformer's
// laminated core runs through both and joins them top and bottom
function coupled(m, part, n, ctx, looks) {
  const tr = part.type === "TR";
  const wind = [[1.3, n[0], n[1]], [2.7, n[2], n[3]]];
  wind.forEach(([x, top, bottom], k) => {
    const pinX = k === 0 ? 0 : 4;
    traceLead(m, part, looks, top, pinX, 0, x, 0); traceLead(m, part, looks, top, x, 0, x, 0.62);
    traceLead(m, part, looks, bottom, pinX, 4, x, 4); traceLead(m, part, looks, bottom, x, 4, x, 3.38);
  });
  const axes = wind.map(() => {
    const g = new THREE.Group();
    g.add(shadowed(new THREE.Mesh(coilGeometry(7, 0.3), mat("copper"))));
    const core = shadowed(new THREE.Mesh(unitCylinder(0.19, 24), mat(tr ? "steel" : "ferrite")));
    core.scale.set(1, tr ? 2.7 : 2.2, 1);
    g.add(core);
    return m.add(g);
  });
  // the transformer's yokes join the two cores' top ends and bottom ends
  const yokes = tr ? [0, 1].map(() => m.add(shadowed(new THREE.Mesh(geo("yoke", () => new THREE.BoxGeometry(0.34, 1, 0.34)), mat("steel"))))) : [];
  const dots = [0, 1].map(() => m.add(new THREE.Mesh(sphere(), mat("glyph"))));
  for (const d of dots) d.scale.setScalar(0.08);
  const hit = partHit(m, part);
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const ends = [[new THREE.Vector3(), new THREE.Vector3()], [new THREE.Vector3(), new THREE.Vector3()]];
  m.ups.push((H) => {
    const hs = n.map((x) => H(x)), lo = Math.min(...hs), hi = Math.max(...hs);
    wind.forEach(([x, top, bottom], k) => {
      lay(part, x, 0.62, H(top) + 0.36, A); lay(part, x, 3.38, H(bottom) + 0.36, B);
      const len = span(axes[k], A, B);
      axes[k].scale.set(1, len / 2, 1);
      // where this winding's core comes out of the coil, top and bottom
      const core = tr ? 1.35 : 1.1;
      ends[k][0].copy(A).lerp(B, -(core - 1) / 2);
      ends[k][1].copy(B).lerp(A, -(core - 1) / 2);
      // the dots: the primary's at its top end; the secondary's top or bottom
      const dotTop = k === 0 || (part.params?.dot || "top") === "top";
      lay(part, x + (k === 0 ? -0.42 : 0.42), dotTop ? 0.5 : 3.5, (dotTop ? H(top) : H(bottom)) + 0.45, dots[k].position);
    });
    if (tr) for (let i = 0; i < 2; i++) yokes[i].scale.set(1, span(yokes[i], ends[0][i], ends[1][i]) + 0.34, 1);
    hit(lo - 0.15, hi + 0.9);
  });
  wind.forEach(([x, top, bottom], k) => {
    const pinX = k === 0 ? 0 : 4;
    m.edges.push({
      a: pinKey(part, pinX, 0), b: pinKey(part, pinX, 4),
      pts: [pathPoint(part, pinX, 0, top), pathPoint(part, x, 0, top), pathPoint(part, x, 0.62, top, 0.72), pathPoint(part, x, 3.38, bottom, 0.72), pathPoint(part, x, 4, bottom), pathPoint(part, pinX, 4, bottom)],
      current: (sol) => sol.els[part.id]?.pins[k * 2]?.i ?? 0,
    });
  });
}

// a three-phase source: a generator housing with a post for each phase (and the neutral)
function generator(m, part, n, ctx, looks) {
  const y = part.type === "V3Y";
  const terms = y ? [[4, 0], [4, 2], [4, 4], [0, 2]] : [[4, 0], [4, 2], [4, 4]];
  terms.forEach(([x, yy], k) => traceLead(m, part, looks, n[k], x, yy, x === 0 ? 0.7 : 3.1, yy));
  const c = lay(part, 1.9, 2, 0);
  const housing = m.add(shadowed(new THREE.Mesh(unitCylinder(1.15, 64), mat("housing"))));
  const ring = m.add(new THREE.Mesh(geo("gen-ring", () => new THREE.TorusGeometry(1.16, 0.025, 6, 64)), mat("edge")));
  ring.rotation.x = Math.PI / 2;
  const fins = [];
  for (let i = 0; i < 12; i++) {
    const f = m.add(shadowed(new THREE.Mesh(geo("fin", () => new THREE.BoxGeometry(0.08, 1, 0.3)), mat("housing"))));
    f.userData.a = (i / 12) * Math.PI * 2;
    fins.push(f);
  }
  const posts = terms.map(() => m.add(shadowed(new THREE.Mesh(unitCylinder(0.12, 20), mat("brass")))));
  const hit = partHit(m, part);
  m.ups.push((H) => {
    const hs = n.slice(0, terms.length).map((x) => H(x)), lo = Math.min(...hs), hi = Math.max(...hs);
    const height = Math.max(0.6, hi - lo + 0.5), mid = (lo + hi) / 2;
    housing.position.set(c.x, mid, c.z); housing.scale.set(1, height, 1);
    ring.position.set(c.x, mid + height / 2, c.z);
    for (const f of fins) { f.position.set(c.x + Math.cos(f.userData.a) * 1.16, mid, c.z + Math.sin(f.userData.a) * 1.16); f.rotation.y = -f.userData.a; f.scale.set(1, height * 0.86, 1); }
    terms.forEach(([x, yy], k) => {
      lay(part, x === 0 ? 0.7 : 3.1, yy, (hs[k] + lo) / 2, posts[k].position);
      posts[k].scale.set(1, Math.max(0.2, hs[k] - lo + 0.2), 1);
    });
    hit(lo - 0.2, hi + 0.7);
  });
  terms.forEach(([x, yy], k) => {
    m.edges.push({
      a: pinKey(part, x, yy), b: `${part.id}:core`,
      pts: [pathPoint(part, x, yy, n[k]), pathPoint(part, x === 0 ? 0.7 : 3.1, yy, n[k]), { x: c.x, z: c.z, avg: n.slice(0, terms.length), dy: 0.3 }],
      current: (sol) => sol.els[part.id]?.pins[k]?.i ?? 0,
    });
  });
}
