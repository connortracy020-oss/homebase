// Circuit theorems, computed exactly from the same solver:
//   thevenin: the circuit as seen from a part's terminals (or two nodes): V_th, R_th, I_N,
//             found the textbook way (open-circuit voltage, sources off + a 1 A test source,
//             short-circuit current), so dependent sources are handled correctly.
//   superposition: each independent source's share of every voltage and current.

import { solveDC, synthetic } from "./op.js";
import * as Q from "../core/rational.js";

const exactOf = (x, xs) => (xs ? Q.fromString(xs) : null);

function nodeV(sol, i) {
  const n = sol.nodes[i];
  return n && n.v !== null ? { x: n.v, q: exactOf(n.v, n.vx) } : null;
}

function vab(sol, a, b) {
  const va = nodeV(sol, a), vb = nodeV(sol, b);
  if (!va || !vb) return null;
  const q = va.q && vb.q ? Q.sub(va.q, vb.q) : null;
  return { x: va.x - vb.x, q };
}

export function thevenin(net, { part = null, nodes = null } = {}) {
  let a, b, rest = net.elements, load = null;
  if (part) {
    load = net.byId.get(part);
    if (!load || load.nodes.length !== 2) return { ok: false, why: "Pick a two-terminal part." };
    if (net.elements.some((e) => e.ctrl?.target === load)) return { ok: false, why: `A dependent source is controlled by ${part}'s current, so ${part} can't be taken out.` };
    [a, b] = load.nodes;
    rest = net.elements.filter((e) => e !== load);
  } else [a, b] = nodes;
  if (a === b) return { ok: false, why: "Both terminals are the same node." };
  const base = { ...net, elements: rest };

  const oc = solveDC(base, { flows: false });
  if (!oc.ok) return { ok: false, why: `With ${part || "the load"} removed the circuit can't be solved: ${oc.errors[0]?.message}` };
  const voc = vab(oc, a, b);
  if (!voc) return { ok: false, why: "The two terminals aren't both connected to the rest of the circuit." };

  // every independent source off, then push 1 A into terminal a: R_th = v_a - v_b
  const test = synthetic("I", "__test", [a, b], { I: "1" });
  const rt = solveDC({ ...base, elements: rest.concat(test) }, { off: (el) => el !== test && !!el.def.independent, flows: false });
  let rth = null, infinite = false;
  if (rt.ok) rth = vab(rt, a, b);
  else infinite = rt.errors.some((e) => e.code === "FLOATING");

  // short the terminals with an ideal ammeter: Norton current, a -> b through the short
  const short = synthetic("AM", "__short", [a, b]);
  const sc = solveDC({ ...base, elements: rest.concat(short) }, { flows: false });
  const isc = sc.ok ? { x: sc.els.__short.i, q: exactOf(sc.els.__short.i, sc.els.__short.ix) } : null;

  const out = { ok: true, a, b, part, voc, rth, isc, infinite, exact: !!(voc.q && (!rth || rth.q)) };
  if (load && load.type === "R" && rth && !infinite) {
    const RL = load.params.R;
    const total = rth.x + RL.value;
    out.load = { R: RL.value, i: total ? voc.x / total : null };
    if (rth.x > 0) {
      out.maxPower = { R: rth.x, p: (voc.x * voc.x) / (4 * rth.x) };
      if (voc.q && rth.q) out.maxPower.q = Q.div(Q.mul(voc.q, voc.q), Q.mul(Q.frac(4n), rth.q));
    }
  }
  return out;
}

export function superposition(net) {
  const sources = net.elements.filter((el) => el.def.independent);
  if (sources.length < 2) return { ok: false, why: sources.length ? "There's only one independent source, so there's nothing to split up." : "There are no independent sources." };
  const full = solveDC(net, { flows: false });
  if (!full.ok) return { ok: false, why: full.errors[0]?.message };
  const parts = [];
  for (const s of sources) {
    const sol = solveDC(net, { off: (el) => !!el.def.independent && el !== s, flows: false });
    if (!sol.ok) return { ok: false, why: `With only ${s.id} on, the circuit can't be solved: ${sol.errors[0]?.message}` };
    parts.push({ source: s.id, nodes: sol.nodes, els: sol.els });
  }
  // the shares must add up to the full answer, exactly when the solve was exact
  let adds = true;
  for (const nd of full.nodes) {
    if (nd.v === null) continue;
    const sum = parts.reduce((s, p) => s + (p.nodes[nd.index].v ?? 0), 0);
    if (Math.abs(sum - nd.v) > 1e-9 * (1 + Math.abs(nd.v))) adds = false;
    if (full.exact && nd.vx && parts.every((p) => p.nodes[nd.index].vx)) {
      const q = parts.reduce((s, p) => Q.add(s, Q.fromString(p.nodes[nd.index].vx)), Q.ZERO);
      if (!Q.eq(q, Q.fromString(nd.vx))) adds = false;
    }
  }
  return { ok: true, full, parts, adds, sources: sources.map((s) => s.id) };
}

export { exactOf };
