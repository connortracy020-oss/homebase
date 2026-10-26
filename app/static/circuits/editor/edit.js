// Changes to the document: add, move (wires stay attached), rotate, mirror, delete, wire,
// paste, rename. All are plain functions on a document object; the store wraps them for undo.

import { defOf, defaultParams } from "../elements/index.js";
import { nextId, pinPoints, transform, key } from "../core/doc.js";
import { centerOf } from "./symbols.js";
import { toggled } from "../elements/misc.js";
import { compile } from "../core/compile.js";
import { route } from "./route.js";

export const PREFIX = { R: "R", C: "C", L: "L", V: "V", I: "I", E: "E", F: "F", G: "G", H: "H", OA: "U", GND: "GND", LBL: "LBL", SW: "S", SW2: "S", AM: "AM", VM: "VM" };
export const DEFAULT_ROT = { V: 1, I: 1, E: 1, F: 1, G: 1, H: 1, AM: 0, VM: 1 };

const LABEL_NAMES = ["Vout", "Vin", "Va", "Vb", "Vc", "Vx", "Vy", "Vz"];

export function addPart(doc, type, x, y, { rot, flip = false, params = {} } = {}) {
  const id = nextId(doc, PREFIX[type] || type);
  const p = { ...defaultParams(type), ...params };
  if (type === "LBL" && !params.name) {
    const used = new Set(doc.parts.filter((q) => q.type === "LBL").map((q) => q.params.name));
    p.name = LABEL_NAMES.find((n) => !used.has(n)) || `V${doc.parts.length}`;
  }
  doc.parts.push({ id, type, x: Math.round(x), y: Math.round(y), rot: rot ?? DEFAULT_ROT[type] ?? 0, flip, params: p });
  return id;
}

// where to put a part's origin so its middle lands on (x, y)
export function originFor(type, rot, flip, x, y) {
  const [cx, cy] = centerOf(type);
  const [tx, ty] = transform({ x: 0, y: 0, rot, flip }, cx, cy);
  return [Math.round(x - tx), Math.round(y - ty)];
}

const pinKeys = (part) => pinPoints(part).map((p) => key(p.x, p.y));

// Move wire ends that sat at `moves` (old point key -> new [x, y]). A wire whose two ends both
// move is shifted; one whose end moves alone stretches, with an elbow so it stays square.
function rubberBand(doc, moves, keepWires = new Set()) {
  const out = [], stretched = [];
  for (const w of doc.wires) {
    if (keepWires.has(w.id)) { out.push(w); continue; }
    const ka = key(...w.a), kb = key(...w.b);
    const na = moves.get(ka), nb = moves.get(kb);
    if (!na && !nb) { out.push(w); continue; }
    if (na && nb) { out.push({ ...w, a: [...na], b: [...nb] }); continue; }
    const fixed = na ? w.b : w.a, moved = na || nb, horizontal = w.a[1] === w.b[1];
    if (fixed[0] === moved[0] || fixed[1] === moved[1]) {
      out.push(na ? { ...w, a: [...moved] } : { ...w, b: [...moved] });
      stretched.push({ fixed: [...fixed], moved: [...moved], ids: [w.id] });
      continue;
    }
    // keep the original direction where it meets the moving end
    const corner = horizontal ? [fixed[0], moved[1]] : [moved[0], fixed[1]];
    const extra = { id: nextWireId(doc, out), a: corner, b: [...moved] };
    out.push({ ...w, a: [...fixed], b: corner }, extra);
    stretched.push({ fixed: [...fixed], moved: [...moved], ids: [w.id, extra.id] });
  }
  doc.wires = out;
  return stretched;
}

// which terminals are joined: moving or turning parts must never change this by accident
function connections(doc) {
  const net = compile(doc), groups = new Map();
  for (const p of net.pins) {
    if (p.def.type === "LBL") continue;
    const n = net.nodeAt(p.key), k = n >= 0 ? `n${n}` : p.key;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(`${p.part.id}.${p.index}`);
  }
  return [...groups.values()].map((g) => g.sort().join("+")).sort().join("|");
}

// If stretched wires made a connection that wasn't there before (an elbow landing on
// another wire, two wires overlapping), route those wires around everything instead.
function guard(base, doc, stretched) {
  if (!stretched.length) return;
  const want = connections(base);
  if (connections(doc) === want) return;
  for (const st of stretched) {
    const others = { ...doc, wires: doc.wires.filter((w) => !st.ids.includes(w.id)) };
    const path = route(others, st.fixed, st.moved);
    if (!path) continue;
    const rest = others.wires;
    const fresh = [];
    for (let i = 0; i + 1 < path.length; i++) fresh.push({ id: nextWireId({ ...doc, wires: [...rest, ...fresh] }), a: path[i], b: path[i + 1] });
    doc.wires = [...rest, ...fresh];
    st.ids = fresh.map((w) => w.id);
  }
}

function nextWireId(doc, extra = []) {
  const used = new Set([...doc.wires.map((w) => w.id), ...extra.map((w) => w.id), ...doc.parts.map((p) => p.id)]);
  for (let k = doc.wires.length + 1; ; k++) if (!used.has(`w${k}`)) return `w${k}`;
}

// A moving terminal that shares its point with a terminal that isn't moving (a source standing
// on a ground symbol), or sits on the middle of a wire, stays joined to it by a new wire.
// Wires that merely end there move with the terminal as usual.
function anchor(doc, sel, moves) {
  const fixedPins = new Set(doc.parts.filter((p) => !sel.parts.has(p.id)).flatMap((p) => pinKeys(p)));
  const anchored = [];
  for (const [k, to] of [...moves]) {
    const [x, y] = k.split(",").map(Number);
    const onWire = doc.wires.some((w) => !sel.wires.has(w.id) && interior([x, y], w));
    if (fixedPins.has(k) || onWire) { anchored.push([[x, y], to]); moves.delete(k); }
  }
  return anchored;
}

function interior([x, y], w) {
  const [ax, ay] = w.a, [bx, by] = w.b;
  if ((x === ax && y === ay) || (x === bx && y === by)) return false;
  return (bx - ax) * (y - ay) === (by - ay) * (x - ax) && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

function bridge(doc, anchored, stretched) {
  for (const [from, to] of anchored) {
    if (from[0] === to[0] && from[1] === to[1]) continue;
    const pts = from[0] === to[0] || from[1] === to[1] ? [from, to] : [from, [to[0], from[1]], to];
    const ids = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const id = nextWireId(doc);
      doc.wires.push({ id, a: [...pts[i]], b: [...pts[i + 1]] });
      ids.push(id);
    }
    stretched.push({ fixed: [...from], moved: [...to], ids });
  }
}

export function moveSelection(base, sel, dx, dy) {
  const doc = structuredClone(base);
  if (!dx && !dy) return doc;
  const moves = new Map();
  for (const part of doc.parts) {
    if (!sel.parts.has(part.id)) continue;
    for (const k of pinKeys(part)) { const [x, y] = k.split(",").map(Number); moves.set(k, [x + dx, y + dy]); }
  }
  const anchored = anchor(doc, sel, moves);
  for (const part of doc.parts) if (sel.parts.has(part.id)) { part.x += dx; part.y += dy; }
  const keep = new Set();
  for (const w of doc.wires) {
    if (!sel.wires.has(w.id)) continue;
    for (const end of [w.a, w.b]) moves.set(key(...end), [end[0] + dx, end[1] + dy]);
    w.a = [w.a[0] + dx, w.a[1] + dy]; w.b = [w.b[0] + dx, w.b[1] + dy];
    keep.add(w.id);
  }
  const stretched = rubberBand(doc, moves, keep);
  bridge(doc, anchored, stretched);
  guard(base, doc, stretched);
  return doc;
}

// rotate (a quarter turn either way) or mirror the selection about its middle. If that would
// change what's connected, nothing happens and `base` itself comes back.
export function turnSelection(base, sel, how) {
  const doc = structuredClone(base);
  const parts = doc.parts.filter((p) => sel.parts.has(p.id));
  const wires = doc.wires.filter((w) => sel.wires.has(w.id));
  if (!parts.length && !wires.length) return doc;
  const centers = parts.map((p) => transform(p, ...centerOf(p.type)));
  const pts = [...centers, ...wires.flatMap((w) => [w.a, w.b])];
  const mx = Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length);
  const my = Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length);
  const map = ([x, y]) => {
    const u = x - mx, v = y - my;
    if (how === "cw") return [mx - v, my + u];
    if (how === "ccw") return [mx + v, my - u];
    return [mx - u, my + v];  // mirror left-right
  };
  const moves = new Map();
  parts.forEach((p, i) => {
    const before = pinKeys(p);
    const single = parts.length === 1 && !wires.length;
    const c = single ? centers[i] : map(centers[i]);
    if (how === "cw") p.rot = (p.rot + 1) % 4;
    else if (how === "ccw") p.rot = (p.rot + 3) % 4;
    else { p.flip = !p.flip; if (p.rot % 2 === 1) p.rot = (p.rot + 2) % 4; }
    const [cx, cy] = transform({ x: 0, y: 0, rot: p.rot, flip: p.flip }, ...centerOf(p.type));
    p.x = Math.round(c[0] - cx); p.y = Math.round(c[1] - cy);
    pinPoints(p).forEach((pp, j) => moves.set(before[j], [pp.x, pp.y]));
  });
  const anchored = anchor(base, sel, moves);
  const keep = new Set();
  for (const w of wires) {
    const a = map(w.a), b = map(w.b);
    moves.set(key(...w.a), a); moves.set(key(...w.b), b);
    w.a = a; w.b = b; keep.add(w.id);
  }
  const stretched = rubberBand(doc, moves, keep);
  bridge(doc, anchored, stretched);
  guard(base, doc, stretched);
  tidy(doc);
  // a turn that would land a terminal on something else is refused (returns base unchanged)
  if (connections(doc) !== connections(base)) return base;
  return doc;
}

export function deleteSelection(doc, sel) {
  doc.parts = doc.parts.filter((p) => !sel.parts.has(p.id));
  doc.wires = doc.wires.filter((w) => !sel.wires.has(w.id));
  tidy(doc);
}

// add a wire along points [[x, y], ...]; returns the new wire ids
export function addWirePath(doc, points) {
  const ids = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const id = nextWireId(doc);
    doc.wires.push({ id, a: [...a], b: [...b] });
    ids.push(id);
  }
  tidy(doc);
  return ids.filter((id) => doc.wires.some((w) => w.id === id));
}

// remove zero-length and duplicate wires; join straight runs split by a bare bend point
export function tidy(doc) {
  const seen = new Set();
  doc.wires = doc.wires.filter((w) => {
    if (w.a[0] === w.b[0] && w.a[1] === w.b[1]) return false;
    const k = [key(...w.a), key(...w.b)].sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pinAt = new Set(doc.parts.flatMap((p) => pinKeys(p)));
  for (let pass = 0; pass < 50; pass++) {
    const ends = new Map();
    for (const w of doc.wires) for (const end of ["a", "b"]) {
      const k = key(...w[end]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push([w, end]);
    }
    let merged = false;
    for (const [k, list] of ends) {
      if (list.length !== 2 || pinAt.has(k)) continue;
      const [[w1, e1], [w2, e2]] = list;
      if (w1 === w2) continue;
      const o1 = e1 === "a" ? w1.b : w1.a, o2 = e2 === "a" ? w2.b : w2.a;
      const [x, y] = k.split(",").map(Number);
      const collinear = (o1[0] === x && o2[0] === x) || (o1[1] === y && o2[1] === y);
      const opposite = (o1[0] - x) * (o2[0] - x) <= 0 && (o1[1] - y) * (o2[1] - y) <= 0;
      if (!collinear || !opposite || onAnyInterior(doc, [x, y], w1, w2)) continue;
      w1.a = [...o1]; w1.b = [...o2];
      doc.wires = doc.wires.filter((w) => w !== w2);
      merged = true;
      break;
    }
    if (!merged) break;
  }
}

function onAnyInterior(doc, [x, y], ...skip) {
  return doc.wires.some((w) => {
    if (skip.includes(w)) return false;
    const [ax, ay] = w.a, [bx, by] = w.b;
    if ((x === ax && y === ay) || (x === bx && y === by)) return true;
    return (bx - ax) * (y - ay) === (by - ay) * (x - ax) && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
  });
}

export function setParam(doc, id, k, value) {
  const part = doc.parts.find((p) => p.id === id);
  if (part) part.params = { ...part.params, [k]: value };
}

export function toggleSwitch(doc, id) {
  const part = doc.parts.find((p) => p.id === id);
  if (!part || (part.type !== "SW" && part.type !== "SW2")) return;
  part.params = { ...part.params, state: toggled(defOf(part.type), part.params.state || defOf(part.type).params[0].default) };
}

// rename a part, keeping dependent-source controls that point at it
export function renamePart(doc, id, next) {
  next = String(next || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(next)) return "A name is a letter then letters or digits, like R1 or RL.";
  if (next !== id && doc.parts.some((p) => p.id === next)) return `There's already a ${next}.`;
  const part = doc.parts.find((p) => p.id === id);
  if (!part) return "No such part.";
  part.id = next;
  const re = new RegExp(`\\b([vViI])\\(\\s*${id}\\s*\\)`, "g");
  for (const p of doc.parts) if (p.params?.ctrl) p.params = { ...p.params, ctrl: p.params.ctrl.replace(re, `$1(${next})`) };
  return null;
}

export function copySelection(doc, sel) {
  return {
    parts: structuredClone(doc.parts.filter((p) => sel.parts.has(p.id))),
    wires: structuredClone(doc.wires.filter((w) => sel.wires.has(w.id))),
  };
}

// paste a copy shifted by (dx, dy); returns the new selection
export function paste(doc, clip, dx, dy) {
  const parts = [], wires = [];
  for (const p of clip.parts) {
    const id = nextId(doc, PREFIX[p.type] || p.type);
    doc.parts.push({ ...structuredClone(p), id, x: p.x + dx, y: p.y + dy });
    parts.push(id);
  }
  for (const w of clip.wires) {
    const id = nextWireId(doc);
    doc.wires.push({ id, a: [w.a[0] + dx, w.a[1] + dy], b: [w.b[0] + dx, w.b[1] + dy] });
    wires.push(id);
  }
  return { parts, wires };
}
