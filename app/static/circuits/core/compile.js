// Drawing -> netlist. Points joined by wires, labels with the same name, closed switches and
// ground symbols become nodes (node 0 is ground). A wire end or a part terminal that lands on
// another wire joins it (a junction); two wires that only cross do not.

import { defOf, visibleParams } from "../elements/index.js";
import { parseCtrl } from "../elements/dependent.js";
import { switchJoins, toggled } from "../elements/misc.js";
import { before } from "../elements/common.js";
import { parseValue } from "./units.js";
import { pinPoints, key } from "./doc.js";

const DEFAULT_WHEN = Object.freeze({ t: -Infinity, side: -1 });

class UnionFind {
  constructor() { this.parent = new Map(); }
  add(k) { if (!this.parent.has(k)) this.parent.set(k, k); }
  find(k) {
    this.add(k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    while (this.parent.get(k) !== r) { const n = this.parent.get(k); this.parent.set(k, r); k = n; }
    return r;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(rb, ra); }
}

// strictly between the ends of segment w?
function onInterior([x, y], w) {
  const [ax, ay] = w.a, [bx, by] = w.b;
  if ((x === ax && y === ay) || (x === bx && y === by)) return false;
  if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) !== 0) return false;
  return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

// The effective switch position at time `when` (it flips once, at `at`).
export function switchState(part, def, when) {
  const state = part.params.state || def.params[0].default;
  const at = parseValue(part.params.at ?? "", "s");
  if (!at.ok || !(at.value >= 0) || before(when, at.value)) return state;
  return toggled(def, state);
}

export function compile(doc, { when = DEFAULT_WHEN } = {}) {
  const errors = [], warnings = [];
  const uf = new UnionFind();
  const pins = [];
  for (const part of doc.parts) {
    const def = defOf(part.type);
    pinPoints(part).forEach((pp, index) => {
      const k = key(pp.x, pp.y);
      uf.add(k);
      pins.push({ part, def, index, name: pp.name, x: pp.x, y: pp.y, key: k });
    });
  }
  const wires = doc.wires;
  for (const w of wires) uf.union(key(...w.a), key(...w.b));

  // junctions: any wire end or terminal on another wire's interior joins it and splits it
  const points = new Map();
  for (const p of pins) points.set(p.key, [p.x, p.y]);
  for (const w of wires) { points.set(key(...w.a), w.a); points.set(key(...w.b), w.b); }
  const splits = new Map(wires.map((w) => [w, []]));
  for (const [k, pt] of points) {
    for (const w of wires) {
      if (onInterior(pt, w)) { uf.union(k, key(...w.a)); splits.get(w).push(pt); }
    }
  }

  // labels with the same name, closed switches, and every ground symbol
  const labels = new Map();
  const switchEdges = [];
  let groundKey = null;
  for (const p of pins) {
    if (p.def.type === "LBL") {
      const name = (p.part.params.name || "").trim();
      if (!name) continue;
      if (labels.has(name)) uf.union(labels.get(name).key, p.key);
      else labels.set(name, p);
    } else if (p.def.type === "GND") {
      if (groundKey) uf.union(groundKey, p.key); else groundKey = p.key;
    }
  }
  for (const part of doc.parts) {
    const def = defOf(part.type);
    if (def.type !== "SW" && def.type !== "SW2") continue;
    const pp = pinPoints(part), state = switchState(part, def, when);
    for (const [i, j] of switchJoins(def, state)) {
      uf.union(key(pp[i].x, pp[i].y), key(pp[j].x, pp[j].y));
      switchEdges.push({ part: part.id, a: [pp[i].x, pp[i].y], b: [pp[j].x, pp[j].y] });
    }
  }

  // nodes: groups that touch at least one part terminal, numbered top-left first
  const groups = new Map();
  const groupOf = (k) => {
    const r = uf.find(k);
    if (!groups.has(r)) groups.set(r, { root: r, keys: [], pins: [], electrical: 0, wireEnds: 0, labels: [] });
    return groups.get(r);
  };
  for (const k of points.keys()) groupOf(k).keys.push(k);
  for (const p of pins) {
    const g = groupOf(p.key);
    g.pins.push(p);
    if (p.def.type === "LBL") { if (p.part.params.name?.trim()) g.labels.push(p.part.params.name.trim()); }
    else g.electrical += 1;
  }
  for (const w of wires) { groupOf(key(...w.a)).wireEnds += 1; groupOf(key(...w.b)).wireEnds += 1; }
  const elementGroups = [...groups.values()].filter((g) => g.pins.some((p) => !p.def.topological || p.def.type === "GND"));
  const topLeft = (g) => {
    let best = null;
    for (const k of g.keys) { const [x, y] = points.get(k); if (!best || y < best[1] || (y === best[1] && x < best[0])) best = [x, y]; }
    return best;
  };
  elementGroups.sort((a, b) => { const p = topLeft(a), q = topLeft(b); return p[1] - q[1] || p[0] - q[0]; });

  let ground = groundKey ? groups.get(uf.find(groundKey)) : null;
  let autoGround = false, autoWhere = "";
  if (!ground && elementGroups.length) {
    const firstPin = (type, idx) => pins.find((p) => p.def.type === type && p.index === idx);
    const pick = firstPin("V", 1) || firstPin("I", 1) || null;
    ground = pick ? groups.get(uf.find(pick.key)) : elementGroups.reduce((a, b) => (b.electrical > a.electrical ? b : a));
    autoWhere = pick ? `the node at ${pick.part.id}'s ${pick.def.type === "V" ? "−" : "tail"} terminal` : "the busiest node";
    autoGround = true;
  }
  const nodes = [];
  const nodeOfRoot = new Map();
  if (ground) {
    nodeOfRoot.set(ground.root, 0);
    nodes.push({ index: 0, name: "ground", label: null, ground: true, group: ground, at: topLeft(ground) });
  }
  const used = new Set(elementGroups.flatMap((g) => g.labels));
  let n = 0;
  for (const g of elementGroups) {
    if (g === ground) continue;
    const label = g.labels[0] || null;
    let name = label;
    if (!name) { do n += 1; while (used.has(`n${n}`)); name = `n${n}`; }
    nodeOfRoot.set(g.root, nodes.length);
    nodes.push({ index: nodes.length, name, label, ground: false, group: g, at: topLeft(g) });
  }
  if (ground?.labels.length) nodes[0].label = ground.labels[0];
  if (autoGround) {
    warnings.push({ code: "AUTO_GROUND", message: `No ground symbol, so ${nodes[0].label || autoWhere} is used as 0 V. Add a ground (⏚) to choose the reference.`, nodes: [0] });
  }
  const nodeAt = (k) => (nodeOfRoot.has(uf.find(k)) ? nodeOfRoot.get(uf.find(k)) : -1);

  // elements with parsed parameters
  const elements = [];
  const byId = new Map();
  for (const part of doc.parts) {
    const def = defOf(part.type);
    if (def.topological) continue;
    const el = { id: part.id, type: def.type, def, part, nodes: [], params: {}, ctrl: null };
    el.nodes = pinPoints(part).map((pp) => nodeAt(key(pp.x, pp.y)));
    const shown = new Set(visibleParams(def.type, part.params).map((p) => p.key));
    for (const pd of def.params) {
      el.params[pd.key] = parseParam(pd, part.params[pd.key], shown.has(pd.key), (msg) =>
        errors.push({ code: "PARAM", message: `${part.id}: ${msg}`, parts: [part.id], param: pd.key }));
    }
    elements.push(el);
    byId.set(el.id, el);
  }
  const nodeByName = new Map(nodes.map((nd) => [nd.name, nd.index]));
  if (nodes[0]?.label) nodeByName.set(nodes[0].label, 0);
  nodeByName.set("0", 0); nodeByName.set("ground", 0); nodeByName.set("gnd", 0);
  for (const el of elements) {
    if (!el.def.dependent) continue;
    const c = parseCtrl(el.params.ctrl.text);
    const fail = (message) => errors.push({ code: "CTRL", message: `${el.id}: ${message}`, parts: [el.id] });
    if (c.error) { fail(c.error); continue; }
    if (c.kind === "i") {
      const target = byId.get(c.part);
      if (!target) { fail(doc.parts.some((p) => p.id === c.part) ? `the current through ${c.part} isn't an unknown here; put an ammeter in that branch and use i(AM…).` : `there's no part ${c.part}.`); continue; }
      if (target === el) { fail("a source can't be controlled by its own current."); continue; }
      el.ctrl = { kind: "i", sign: c.sign, target };
    } else if (c.ref) {
      const target = byId.get(c.ref) || doc.parts.find((p) => p.id === c.ref);
      if (target && pinPoints(target.part || target).length >= 2) {
        const pp = pinPoints(target.part || target);
        el.ctrl = { kind: "v", sign: c.sign, nodes: [nodeAt(key(pp[0].x, pp[0].y)), nodeAt(key(pp[1].x, pp[1].y))], across: c.ref };
      } else if (nodeByName.has(c.ref)) el.ctrl = { kind: "v", sign: c.sign, nodes: [nodeByName.get(c.ref), 0] };
      else fail(`there's no part or labelled node called ${c.ref}.`);
    } else {
      const [a, b] = c.nodes.map((nm) => nodeByName.get(nm));
      if (a === undefined || b === undefined) { fail(`couldn't find node ${a === undefined ? c.nodes[0] : c.nodes[1]}.`); continue; }
      el.ctrl = { kind: "v", sign: c.sign, nodes: [a, b] };
    }
    if (el.ctrl?.kind === "v" && el.ctrl.nodes.includes(-1)) { fail("its controlling voltage isn't connected to the circuit."); el.ctrl = null; }
  }

  // wire pieces (wires split at junctions), junction dots and open ends, for drawing and currents
  const pieces = [];
  const degree = new Map();
  const bump = (k) => degree.set(k, (degree.get(k) || 0) + 1);
  for (const w of wires) {
    const along = [w.a, ...splits.get(w).sort((p, q) => dist(w.a, p) - dist(w.a, q)), w.b];
    for (let i = 0; i + 1 < along.length; i++) {
      pieces.push({ wire: w.id, a: along[i], b: along[i + 1], node: nodeAt(key(...along[i])) });
      bump(key(...along[i])); bump(key(...along[i + 1]));
    }
  }
  for (const p of pins) if (p.def.type !== "LBL") bump(p.key);
  const junctions = [...degree].filter(([, d]) => d >= 3).map(([k]) => points.get(k));
  const openEnds = [];
  for (const pc of pieces) for (const end of [pc.a, pc.b]) if (degree.get(key(...end)) === 1) openEnds.push(end);
  const openPins = pins.filter((p) => !p.def.topological && groupOf(p.key).electrical === 1);
  for (const p of openPins) {
    if (groupOf(p.key).labels.length) continue;  // a named terminal (a and b of a port) is open on purpose
    warnings.push({ code: "OPEN_PIN", message: `${p.part.id}'s ${pinLabel(p)} terminal isn't connected.`, parts: [p.part.id], at: [p.x, p.y] });
  }

  return {
    nodes, elements, byId, pins, pieces, switchEdges, junctions, openEnds, openPins: openPins.map((p) => [p.x, p.y]),
    nodeAt, nodeByName, errors, warnings, autoGround, when,
    labelOf: (index) => nodes[index]?.label || null,
  };
}

const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

function pinLabel(p) {
  const names = { a: "first", b: "second", minus: "−", plus: "+", out: "output", c: "common", 1: "throw 1", 2: "throw 2" };
  if (p.def.type === "V" || p.def.type === "E" || p.def.type === "H") return p.index === 0 ? "+" : "−";
  return names[p.name] || p.name;
}

// text -> {text, exact, value, empty} (choices and text keep only .text)
export function parseParam(pd, raw, shown, fail) {
  let text = raw === undefined || raw === null ? pd.default : String(raw);
  if (pd.kind === "choice") {
    if (!pd.options.includes(text)) text = pd.default;
    return { text };
  }
  if (pd.kind !== "value") return { text };
  if (text.trim() === "" && pd.optional) return { text: "", empty: true, exact: null, value: null };
  const parsed = parseValue(text, pd.unit);
  let problem = null;
  if (!parsed.ok) problem = parsed.ambiguous ? `${pd.label}: is “${text}” milli or mega? Write ${parsed.ambiguous.milli} or ${parsed.ambiguous.mega}.` : `${pd.label}: ${parsed.error}`;
  else if (pd.positive && !(parsed.value > 0)) problem = `${pd.label} must be more than 0.`;
  else if (pd.nonneg && parsed.value < 0) problem = `${pd.label} can't be negative.`;
  else if (pd.nonzero && parsed.value === 0) problem = pd.key === "R" ? "0 Ω is a wire: draw a wire instead." : `${pd.label} can't be 0.`;
  if (problem) {
    if (shown) fail(problem);
    const fallback = parseValue(pd.default || "0", pd.unit);
    return { text, exact: fallback.exact, value: fallback.value, empty: false, bad: true };
  }
  return { text, exact: parsed.exact, value: parsed.value, empty: false };
}
