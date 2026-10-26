// 3D models of the parts, built from the same layout as the schematic. Height is voltage:
// every wire of a node is a plateau at its height, a resistor is a ramp between the
// heights of its two ends, a source stands upright and lifts charge from one level to
// the next. Each model has update(H) to follow new heights without being rebuilt, and
// path(H) for the current beads.

import * as THREE from "three";
import { transform } from "../core/doc.js";
import { mat, plateauMaterial, bandMaterial, colorBands } from "./materials.js";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
const DIAMOND = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
const RING = new THREE.TorusGeometry(1, 0.09, 12, 48);
const CONE = new THREE.ConeGeometry(0.16, 0.34, 18);
const DISC = new THREE.CylinderGeometry(1, 1, 0.07, 48);
const UP = new THREE.Vector3(0, 1, 0);

export const RIBBON_W = 0.44, RIBBON_T = 0.14;

export function at(part, lx, ly, y) {
  const [x, z] = transform(part, lx, ly);
  return new THREE.Vector3(x, y, z);
}

// put a unit box between two points: length along a->b, width kept level
export function orient(mesh, a, b, w, t) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  if (len < 1e-6) { mesh.visible = false; return; }
  mesh.visible = true;
  const x = d.clone().normalize();
  let z = new THREE.Vector3().crossVectors(x, UP);
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1); else z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(len, t, w);
}

// a cylinder standing between two heights at (x, z)
function upright(mesh, x, z, y0, y1, r, minH = 0.18) {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const h = Math.max(minH, hi - lo), mid = (lo + hi) / 2;
  mesh.position.set(x, mid, z);
  mesh.scale.set(r, h, r);
}

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// ---- wires ----

export function wirePiece(pc, colorOf) {
  const group = new THREE.Group();
  const ribbon = shadowed(new THREE.Mesh(BOX, plateauMaterial(new THREE.Color("#666"))));
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat("floor"));
  curtain.renderOrder = 1;
  ribbon.userData.node = pc.node;
  group.add(ribbon, curtain);
  return {
    group, pick: [ribbon], node: pc.node,
    update(H, sol, floor) {
      const y = H(pc.node), c = colorOf(pc.node);
      ribbon.material = c.ribbon;
      const a = new THREE.Vector3(pc.a[0], y, pc.a[1]), b = new THREE.Vector3(pc.b[0], y, pc.b[1]);
      const ext = new THREE.Vector3().subVectors(b, a).normalize().multiplyScalar(RIBBON_W / 2);
      orient(ribbon, a.clone().sub(ext), b.clone().add(ext), RIBBON_W, RIBBON_T);
      ribbon.position.y = y - RIBBON_T / 2;
      // the curtain hangs from the plateau to the floor
      const h = y - floor;
      curtain.visible = h > 0.06 && c.curtain !== null;
      if (curtain.visible) {
        curtain.material = c.curtain;
        const len = a.distanceTo(b);
        curtain.position.set((a.x + b.x) / 2, floor + h / 2 - RIBBON_T / 2, (a.z + b.z) / 2);
        curtain.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0);
        curtain.scale.set(len, h - RIBBON_T, 1);
      }
    },
    path: (H) => [[pc.a[0], H(pc.node), pc.a[1]], [pc.b[0], H(pc.node), pc.b[1]]],
  };
}

export function junction(p, node, colorOf) {
  const m = shadowed(new THREE.Mesh(CYL, plateauMaterial(new THREE.Color("#666"))));
  m.userData.node = node;
  return {
    group: m, pick: [m],
    update(H) { m.material = colorOf(node).ribbon; m.position.set(p[0], H(node) - RIBBON_T / 2 + 0.02, p[1]); m.scale.set(0.3, RIBBON_T + 0.05, 0.3); },
    path: () => null,
  };
}

// ---- parts ----

// a lead: the node's plateau continuing into a part, at that node's height
function lead(part, x0, y0l, x1, y1l, node, colorOf) {
  const m = shadowed(new THREE.Mesh(BOX, plateauMaterial(new THREE.Color("#666"))));
  m.userData.node = node;
  return {
    mesh: m,
    update(H) {
      const h = H(node);
      m.material = colorOf(node).ribbon;
      orient(m, at(part, x0, y0l, h - RIBBON_T / 2), at(part, x1, y1l, h - RIBBON_T / 2), RIBBON_W * 0.7, RIBBON_T * 0.8);
    },
  };
}

export function partModel(part, el, colorOf, info) {
  const g = new THREE.Group();
  const n = el ? el.nodes : info.pinNodes;
  const parts = [];
  const add = (...ms) => { for (const m of ms) { g.add(m); } };
  const updaters = [];
  const leadTo = (x0, y0, x1, y1, node) => { const L = lead(part, x0, y0, x1, y1, node, colorOf); add(L.mesh); updaters.push((H) => L.update(H)); parts.push(L.mesh); return L; };
  let path = () => null;

  switch (part.type) {
    case "R": {
      leadTo(0, 0, 1.05, 0, n[0]); leadTo(2.95, 0, 4, 0, n[1]);
      const bodyMat = mat("ceramic").clone();
      const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.5, 8, 24), bodyMat));
      const bands = (colorBands(info.ohms) || []).map((k, i, all) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.283, 0.283, 0.1, 32), bandMaterial(k));
        ring.userData.f = all.length === 5 ? [-0.48, -0.28, -0.08, 0.12, 0.5][i] : [-0.44, -0.22, 0, 0.5][i];
        return ring;
      });
      const axis = new THREE.Group();
      axis.add(body, ...bands);
      add(axis);
      updaters.push((H, sol) => {
        const a = at(part, 1, 0, H(n[0]) + 0.14), b = at(part, 3, 0, H(n[1]) + 0.14);
        const d = new THREE.Vector3().subVectors(b, a), len = d.length();
        axis.position.copy(a).add(b).multiplyScalar(0.5);
        axis.quaternion.setFromUnitVectors(UP, d.clone().normalize());
        body.scale.set(1, Math.max(0.6, len / 2.04), 1);
        for (const r of bands) r.position.y = r.userData.f * len * 0.5;
        const heat = info.heat?.() ?? 0;
        bodyMat.emissive.setRGB(1, 0.42, 0.12);
        bodyMat.emissiveIntensity = 1.6 * heat;
      });
      path = (H) => [[...at(part, 0, 0, H(n[0])).toArray()], [...at(part, 1, 0, H(n[0])).toArray()], [...at(part, 3, 0, H(n[1])).toArray()], [...at(part, 4, 0, H(n[1])).toArray()]];
      break;
    }
    case "V": case "I": case "E": case "F": case "G": case "H": case "AM": case "VM": {
      const c = at(part, 2, 0, 0);
      leadTo(0, 0, 2, 0, n[0]); leadTo(4, 0, 2, 0, n[1]);
      const isDep = "EFGH".includes(part.type), meter = part.type === "AM" || part.type === "VM";
      const body = shadowed(new THREE.Mesh(isDep ? DIAMOND : CYL, meter ? mat("glass") : mat("plastic")));
      if (isDep) body.rotation.y = Math.PI / 4;
      const ring = new THREE.Mesh(RING, plateauMaterial(new THREE.Color("#666")));
      ring.rotation.x = Math.PI / 2;
      add(body, ring);
      let arrow = null;
      if ("IFG".includes(part.type)) { arrow = new THREE.Mesh(CONE, mat("arrow")); add(arrow); }
      updaters.push((H) => {
        const h0 = H(n[0]), h1 = H(n[1]);
        upright(body, c.x, c.z, h0, h1, 0.5);
        // the + terminal's ring, colored by its node
        ring.material = colorOf(n[0]).ribbon;
        ring.position.set(c.x, h0, c.z);
        ring.scale.set(0.56, 0.56, 0.56);
        if (arrow) {
          // points the way the source pushes current: toward its arrow end (pin a)
          const top = Math.max(h0, h1) + 0.32, pa = at(part, 0, 0, top), dir = new THREE.Vector3().subVectors(pa, new THREE.Vector3(c.x, top, c.z)).normalize();
          arrow.position.set(c.x, top, c.z);
          arrow.quaternion.setFromUnitVectors(UP, dir);
        }
      });
      path = (H) => [[...at(part, 0, 0, H(n[0])).toArray()], [c.x, H(n[0]), c.z], [c.x, H(n[1]), c.z], [...at(part, 4, 0, H(n[1])).toArray()]];
      break;
    }
    case "C": {
      leadTo(0, 0, 1.8, 0, n[0]); leadTo(2.2, 0, 4, 0, n[1]);
      const pa = shadowed(new THREE.Mesh(DISC, mat("plate"))), pb = shadowed(new THREE.Mesh(DISC, mat("plate")));
      add(pa, pb);
      updaters.push((H) => {
        const A = at(part, 1.85, 0, H(n[0])), B = at(part, 2.15, 0, H(n[1]));
        const dir = new THREE.Vector3().subVectors(at(part, 4, 0, 0), at(part, 0, 0, 0)).normalize();
        for (const [m, p] of [[pa, A], [pb, B]]) { m.position.copy(p); m.quaternion.setFromUnitVectors(UP, dir); m.scale.set(0.62, 1, 0.62); }
      });
      path = (H) => [[...at(part, 0, 0, H(n[0])).toArray()], [...at(part, 1.85, 0, H(n[0])).toArray()], [...at(part, 2.15, 0, H(n[1])).toArray()], [...at(part, 4, 0, H(n[1])).toArray()]];
      break;
    }
    case "L": {
      leadTo(0, 0, 1, 0, n[0]); leadTo(3, 0, 4, 0, n[1]);
      let coil = null;
      updaters.push((H) => {
        const a = at(part, 1, 0, H(n[0]) + 0.22), b = at(part, 3, 0, H(n[1]) + 0.22);
        const key = `${a.toArray().map((v) => v.toFixed(3))}|${b.toArray().map((v) => v.toFixed(3))}`;
        if (coil?.userData.key === key) return;
        if (coil) { g.remove(coil); coil.geometry.dispose(); }
        coil = shadowed(new THREE.Mesh(new THREE.TubeGeometry(new Helix(a, b, 5, 0.26), 160, 0.06, 10, false), mat("copper")));
        coil.userData.key = key;
        g.add(coil);
      });
      path = (H) => [[...at(part, 0, 0, H(n[0])).toArray()], [...at(part, 1, 0, H(n[0])).toArray()], [...at(part, 3, 0, H(n[1])).toArray()], [...at(part, 4, 0, H(n[1])).toArray()]];
      break;
    }
    case "OA": {
      // a tower whose top is the output's height; the inputs meet its side at their own heights
      leadTo(0, -1, 1, -1, n[0]); leadTo(0, 1, 1, 1, n[1]); leadTo(4.5, 0, 5, 0, n[2]);
      const shape = new THREE.Shape();
      shape.moveTo(1, -1.9); shape.lineTo(1, 1.9); shape.lineTo(4.5, 0); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
      geo.rotateX(Math.PI / 2);  // extrude downward (local y -> world -y)
      const tower = shadowed(new THREE.Mesh(geo, mat("plastic")));
      add(tower);
      updaters.push((H, sol, floor) => {
        const top = H(n[2]), bottom = Math.min(floor + 0.05, H(n[0]), H(n[1]), top - 0.25);
        const o = at(part, 0, 0, 0);
        tower.position.set(o.x, top, o.z);
        tower.rotation.set(0, -(part.rot || 0) * Math.PI / 2, 0);
        tower.scale.set(part.flip ? -1 : 1, Math.max(0.25, top - bottom), 1);
      });
      path = (H) => [[...at(part, 4.5, 0, H(n[2])).toArray()], [...at(part, 5, 0, H(n[2])).toArray()]];
      break;
    }
    case "V3Y": case "V3D": {
      // a generator block; each terminal's lead runs at its own node's height
      const pins = part.type === "V3Y" ? [[4, 0], [4, 2], [4, 4], [0, 2]] : [[4, 0], [4, 2], [4, 4]];
      pins.forEach(([x, y], k) => leadTo(x, y, x === 0 ? 0.6 : 3.2, y, n[k]));
      const block = shadowed(new THREE.Mesh(BOX, mat("plastic")));
      add(block);
      updaters.push((H) => {
        const hs = n.map((x) => H(x)), lo = Math.min(...hs), hi = Math.max(...hs);
        orient(block, at(part, 1.9, -0.6, (lo + hi) / 2), at(part, 1.9, 4.6, (lo + hi) / 2), 2.6, Math.max(0.5, hi - lo + 0.4));
      });
      break;
    }
    case "K": case "TR": {
      leadTo(0, 0, 1.3, 0, n[0]); leadTo(1.3, 0, 1.3, 0.6, n[0]); leadTo(0, 4, 1.3, 4, n[1]); leadTo(1.3, 4, 1.3, 3.4, n[1]);
      leadTo(4, 0, 2.7, 0, n[2]); leadTo(2.7, 0, 2.7, 0.6, n[2]); leadTo(4, 4, 2.7, 4, n[3]); leadTo(2.7, 4, 2.7, 3.4, n[3]);
      const coils = [null, null];
      let core = null;
      if (part.type === "TR") { core = shadowed(new THREE.Mesh(BOX, mat("plastic"))); add(core); }
      updaters.push((H) => {
        [[1.3, n[0], n[1]], [2.7, n[2], n[3]]].forEach(([x, top, bottom], k) => {
          const a = at(part, x, 0.6, H(top) + 0.22), b = at(part, x, 3.4, H(bottom) + 0.22);
          const keyName = `${a.toArray().map((v) => v.toFixed(3))}|${b.toArray().map((v) => v.toFixed(3))}`;
          if (coils[k]?.userData.key === keyName) return;
          if (coils[k]) { g.remove(coils[k]); coils[k].geometry.dispose(); }
          coils[k] = shadowed(new THREE.Mesh(new THREE.TubeGeometry(new Helix(a, b, 6, 0.3), 180, 0.06, 10, false), mat("copper")));
          coils[k].userData.key = keyName;
          g.add(coils[k]);
        });
        if (core) {
          const lo = Math.min(...n.map((x) => H(x))), hi = Math.max(...n.map((x) => H(x)));
          orient(core, at(part, 2, 0.4, (lo + hi) / 2 + 0.22), at(part, 2, 3.6, (lo + hi) / 2 + 0.22), 0.16, Math.max(0.4, hi - lo + 0.5));
        }
      });
      path = (H) => [[...at(part, 0, 0, H(n[0])).toArray()], [...at(part, 1.3, 0, H(n[0])).toArray()], [...at(part, 1.3, 4, H(n[1])).toArray()], [...at(part, 0, 4, H(n[1])).toArray()]];
      break;
    }
    case "SW": case "SW2": {
      leadTo(0, 0, 1.2, 0, n[0]);
      if (part.type === "SW") leadTo(2.8, 0, 4, 0, n[1]);
      else { leadTo(2.8, -1, 4, -1, n[1]); leadTo(2.8, 1, 4, 1, n[2]); }
      const lever = shadowed(new THREE.Mesh(BOX, mat("lead")));
      add(lever);
      updaters.push((H) => {
        const ns = info.pinNodes;
        const closed = part.type === "SW" ? part.params.state !== "open" : true;
        const toPin = part.type === "SW2" ? (part.params.state === "2" ? [4, 1] : [4, -1]) : [4, 0];
        const a = at(part, 1.2, 0, H(ns[0]) + 0.08);
        const bTarget = at(part, toPin[0] - 1.2, toPin[1] * 0.86, H(ns[part.type === "SW2" ? (part.params.state === "2" ? 2 : 1) : 1]) + 0.08);
        const b = closed ? bTarget : at(part, 2.55, -0.95, H(ns[0]) + 1.1);
        orient(lever, a, b, 0.14, 0.1);
      });
      path = () => null;
      break;
    }
    case "GND": {
      const bars = [0.72, 0.45, 0.2].map((w) => { const m = new THREE.Mesh(BOX, mat("mark")); m.scale.set(w * 2, 0.05, 0.1); add(m); return m; });
      updaters.push((H) => { bars.forEach((m, i) => { const p = at(part, 0, 0.6 + i * 0.32, H(info.pinNodes[0]) - 0.02); m.position.copy(p); m.rotation.y = -(part.rot || 0) * Math.PI / 2; }); });
      break;
    }
    case "LBL": {
      const pole = new THREE.Mesh(CYL, mat("lead"));
      add(pole);
      updaters.push((H) => { const p = at(part, 0, 0, H(info.pinNodes[0])); pole.position.set(p.x, p.y + 0.45, p.z); pole.scale.set(0.04, 0.9, 0.04); });
      break;
    }
    default: break;
  }
  return {
    group: g, pick: parts,
    update(H, sol, floor) { for (const u of updaters) u(H, sol, floor); },
    path,
  };
}

// a coil wound along the line from a to b
class Helix extends THREE.Curve {
  constructor(a, b, turns, r) { super(); this.a = a; this.b = b; this.turns = turns; this.r = r; }
  getPoint(t, target = new THREE.Vector3()) {
    const d = new THREE.Vector3().subVectors(this.b, this.a);
    const x = d.clone().normalize();
    let y = new THREE.Vector3().crossVectors(x, UP);
    if (y.lengthSq() < 1e-8) y.set(1, 0, 0); else y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    const ang = t * this.turns * Math.PI * 2;
    return target.copy(this.a).addScaledVector(d, t).addScaledVector(y, Math.cos(ang) * this.r).addScaledVector(z, Math.sin(ang) * this.r);
  }
}
