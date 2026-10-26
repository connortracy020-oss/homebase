// Current in every wire segment, for the moving markers. The solver gives the current at each
// part terminal; inside a node, KCL fixes the wire currents uniquely when the wires form a
// tree (almost always). Where wires form a loop, ideal wires leave the split undefined, so we
// use the split that wires with resistance proportional to length would have.

import { solveField, Singular } from "./lu.js";
import { FLOAT } from "./field.js";
import { key } from "../core/doc.js";

const EARTH = "earth";

// pinCurrent(el, j): float current entering part `el` at pin j
export function wireFlows(net, pinCurrent) {
  const vertices = new Map();  // key -> {inj, node}
  const vtx = (k, node) => { if (!vertices.has(k)) vertices.set(k, { inj: 0, node }); return vertices.get(k); };
  const edges = [];
  for (const pc of net.pieces) {
    if (pc.node < 0) continue;
    edges.push({ u: key(...pc.a), v: key(...pc.b), len: Math.max(1, len(pc.a, pc.b)), out: { wire: pc.wire, a: pc.a, b: pc.b } });
    vtx(key(...pc.a), pc.node); vtx(key(...pc.b), pc.node);
  }
  for (const sw of net.switchEdges) {
    const node = net.nodeAt(key(...sw.a));
    if (node < 0) continue;
    edges.push({ u: key(...sw.a), v: key(...sw.b), len: 4, out: { part: sw.part, a: sw.a, b: sw.b } });
    vtx(key(...sw.a), node); vtx(key(...sw.b), node);
  }
  // labels with the same name are joined without a drawn wire; ground symbols all meet at "earth"
  const labelFirst = new Map();
  for (const p of net.pins) {
    const node = net.nodeAt(p.key);
    if (node < 0) continue;
    vtx(p.key, node);
    if (p.def.type === "LBL") {
      const nm = (p.part.params.name || "").trim();
      if (!nm) continue;
      if (labelFirst.has(nm) && labelFirst.get(nm) !== p.key) edges.push({ u: labelFirst.get(nm), v: p.key, len: 6, out: null });
      else labelFirst.set(nm, p.key);
    } else if (p.def.type === "GND") {
      vtx(EARTH, 0);
      edges.push({ u: EARTH, v: p.key, len: 1, out: null });
    }
  }
  // current from each part into the point its terminal sits on
  for (const el of net.elements) {
    const pts = el.part ? net.pins.filter((p) => p.part === el.part) : [];
    let total = 0;
    pts.forEach((p, j) => {
      const i = pinCurrent(el, j);
      total += i;
      vtx(p.key, el.nodes[j]).inj -= i;
    });
    if (el.def.groundReturn && Math.abs(total) > 0) vtx(EARTH, 0).inj += total;
  }

  // solve each connected group of the wire graph on its own
  const adj = new Map([...vertices.keys()].map((k) => [k, []]));
  edges.forEach((e, i) => { adj.get(e.u).push(i); adj.get(e.v).push(i); });
  const flows = new Array(edges.length).fill(0);
  const done = new Set();
  for (const start of vertices.keys()) {
    if (done.has(start)) continue;
    const comp = [], q = [start];
    done.add(start);
    while (q.length) {
      const k = q.shift();
      comp.push(k);
      for (const ei of adj.get(k)) { const e = edges[ei], o = e.u === k ? e.v : e.u; if (!done.has(o)) { done.add(o); q.push(o); } }
    }
    if (comp.length < 2) continue;
    const idx = new Map(comp.map((k, i) => [k, i]));
    const n = comp.length - 1;  // the last vertex is the reference
    const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
    const compEdges = new Set();
    for (const k of comp) for (const ei of adj.get(k)) compEdges.add(ei);
    for (const ei of compEdges) {
      const e = edges[ei], g = 1 / e.len, u = idx.get(e.u), v = idx.get(e.v);
      if (u < n) A[u][u] += g;
      if (v < n) A[v][v] += g;
      if (u < n && v < n) { A[u][v] -= g; A[v][u] -= g; }
    }
    comp.forEach((k, i) => { if (i < n) b[i] = vertices.get(k).inj; });
    let phi;
    try { phi = [...solveField(FLOAT, A, b), 0]; } catch (err) { if (err instanceof Singular) continue; throw err; }
    for (const ei of compEdges) {
      const e = edges[ei];
      flows[ei] = (phi[idx.get(e.u)] - phi[idx.get(e.v)]) / e.len;
    }
  }
  return edges.map((e, i) => (e.out ? { ...e.out, i: clean(flows[i]) } : null)).filter(Boolean);
}

const len = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
const clean = (x) => (Math.abs(x) < 1e-15 ? 0 : x);
