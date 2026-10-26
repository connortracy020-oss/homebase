// The circuit document: what gets saved. Parts sit on an integer grid; a wire is one straight
// segment between two grid points. Which points are the same node is worked out from the
// drawing (core/compile.js), so the document never stores nets for drawn circuits.
//
// {format: "homebase-circuit", version: 1, title, course,
//  parts: [{id, type, x, y, rot: 0-3, flip: bool, params: {key: "text"}}],
//  wires: [{id, a: [x, y], b: [x, y]}],
//  view: {...}, study: {...}}

import { defOf, defaultParams } from "../elements/index.js";

export const FORMAT = "homebase-circuit";
export const VERSION = 1;

export function newDoc({ title = "Untitled circuit", course = "ECE201" } = {}) {
  return { format: FORMAT, version: VERSION, title, course, parts: [], wires: [], view: {}, study: {} };
}

// Bring any saved document up to the current version (and tidy obviously broken bits).
export function migrate(raw) {
  if (!raw || typeof raw !== "object") throw new TypeError("not a circuit document");
  if (raw.format && raw.format !== FORMAT) throw new TypeError(`not a ${FORMAT} document`);
  if ((raw.version || 1) > VERSION) throw new TypeError("this circuit was saved by a newer Homebase");
  const doc = { ...newDoc(), ...raw, format: FORMAT, version: VERSION };
  doc.parts = (raw.parts || []).filter((p) => p && defOf(p.type)).map((p) => ({
    id: String(p.id), type: p.type, x: Math.round(+p.x || 0), y: Math.round(+p.y || 0),
    rot: ((Math.round(+p.rot || 0) % 4) + 4) % 4, flip: !!p.flip,
    params: { ...defaultParams(p.type), ...stringify(p.params || {}) },
  }));
  doc.wires = (raw.wires || []).filter((w) => w && w.a && w.b).map((w) => ({
    id: String(w.id), a: [Math.round(+w.a[0]), Math.round(+w.a[1])], b: [Math.round(+w.b[0]), Math.round(+w.b[1])],
  })).filter((w) => w.a[0] !== w.b[0] || w.a[1] !== w.b[1]);
  doc.view = raw.view || {};
  doc.study = raw.study || {};
  return doc;
}

function stringify(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) out[k] = v === null || v === undefined ? "" : String(v);
  return out;
}

// rotation (quarter turns clockwise, screen y down) after an optional mirror in x
export function transform(part, x, y) {
  if (part.flip) x = -x;
  for (let r = 0; r < (part.rot || 0); r++) [x, y] = [-y, x];
  return [part.x + x, part.y + y];
}

export function pinPoints(part) {
  const def = defOf(part.type);
  return def.pins.map((p) => {
    const [x, y] = transform(part, p.x, p.y);
    return { name: p.name, x, y };
  });
}

export const key = (x, y) => `${x},${y}`;

export function nextId(doc, prefix) {
  const used = new Set([...doc.parts.map((p) => p.id), ...doc.wires.map((w) => w.id)]);
  for (let k = 1; ; k++) if (!used.has(`${prefix}${k}`)) return `${prefix}${k}`;
}

// "R1" -> {main: "R", sub: "1"}, "Vs" -> {main: "V", sub: "s"}, "Rth" -> R_th, "Vout" -> V_out
export function nameParts(id) {
  const m = /^([A-Za-z])([A-Za-z0-9_]*)$/.exec(String(id));
  if (!m || !m[2]) return { main: String(id), sub: "" };
  return { main: m[1], sub: m[2].replace(/^_/, "") };
}
