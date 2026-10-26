// Transient analysis, posed the way textbooks pose it:
//   t = 0⁻  the circuit before anything switches, at steady state (C open, L short)
//   t = 0⁺  right after: capacitor voltages and inductor currents can't jump, so C becomes a
//           voltage source at its 0⁻ voltage and L a current source at its 0⁻ current
//   t → ∞   the new steady state
// Those three are exact (fractions when the values allow). In between, the bench steps in
// time with the trapezoidal rule, taking one backward-Euler step at t = 0 and after every
// switch or source edge, which is what keeps the trapezoidal rule from ringing.

import { compile } from "../core/compile.js";
import { migrate } from "../core/doc.js";
import { parseValue } from "../core/units.js";
import { waveEvents } from "../elements/common.js";
import { assemble } from "./assemble.js";
import { FLOAT } from "./field.js";
import { factor, solveFactored, Singular } from "./lu.js";
import { solveDC } from "./op.js";
import { thevenin } from "./theorems.js";
import { structuralErrors } from "./checks.js";

const MAX_STEPS = 20000;

const before = (t) => ({ t, side: -1 });
const after = (t) => ({ t, side: +1 });

export function events(doc, net, tstop) {
  const out = new Map();
  const note = (t, label) => { if (t >= 0 && t <= tstop) out.set(t, [...(out.get(t) || []), label]); };
  for (const part of doc.parts) {
    if ((part.type === "SW" || part.type === "SW2") && (part.params.at || "").trim()) {
      const at = parseValue(part.params.at, "s");
      if (at.ok) note(at.value, `${part.id} flips`);
    }
  }
  for (const el of net.elements) {
    if (!el.def.independent || (el.params.wave?.text || "dc") === "dc") continue;
    for (const t of waveEvents(el.params, tstop)) note(t, `${el.id} ${el.params.wave.text === "step" ? "steps" : "edge"}`);
  }
  return [...out].sort((a, b) => a[0] - b[0]).map(([t, labels]) => ({ t, labels }));
}

const storage = (net) => net.elements.filter((el) => el.type === "C" || el.type === "L");

// time constants: each storage element against the Thevenin resistance it sees
export function timeConstants(net) {
  const out = [];
  for (const el of storage(net)) {
    const others = net.elements.filter((e) => e !== el && (e.type === "C" || e.type === "L"));
    // with the other storage parts at DC (C open, L short), what resistance does this one see?
    const t = thevenin({ ...net, elements: net.elements.filter((e) => !others.includes(e) || e.type === "L") }, { part: el.id });
    if (!t.ok || !t.rth || t.infinite) { out.push({ id: el.id, tau: null }); continue; }
    const R = t.rth.x;
    out.push({ id: el.id, R, tau: el.type === "C" ? R * el.params.C.value : R > 0 ? el.params.L.value / R : null });
  }
  return out;
}

function stateFrom(net, sol, warnings) {
  // capacitor voltages and inductor currents from a solved circuit
  const state = new Map();
  for (const el of storage(net)) {
    const e = sol.els[el.id];
    if (!e) continue;
    if (el.type === "C" && e.v === null) {
      // nothing set this capacitor's voltage before t = 0: it starts uncharged, as textbooks assume
      if (el.params.v0.empty) warnings.push(`${el.id} starts uncharged (0 V): nothing set its voltage before t = 0.`);
      state.set(el.id, { v: 0, vExact: "0", i: 0, iExact: "0" });
      continue;
    }
    state.set(el.id, { v: e.v ?? 0, vExact: e.vx ?? null, i: e.i, iExact: e.ix ?? null });
  }
  return state;
}

// a point on each node, so samples keep the same node numbers when a switch joins or splits nodes
function representatives(net) {
  const reps = net.nodes.map(() => null);
  for (const p of net.pins) { const n = net.nodeAt(p.key); if (n >= 0 && reps[n] === null) reps[n] = p.key; }
  return reps;
}

export function transient(rawDoc, opts = {}) {
  const doc = migrate(rawDoc);
  const net0 = compile(doc, { when: before(0) });
  const warnings = [];
  if (!storage(net0).length && !events(doc, net0, Infinity).length) {
    return { ok: false, why: "There's nothing that changes in time here: add a capacitor or inductor, a switch that flips, or a step or pulse source." };
  }
  // 1. t = 0⁻: the circuit before anything happens
  const pre = solveDC(net0, { flows: false });
  if (!pre.ok) return { ok: false, why: `Before t = 0 the circuit can't be solved: ${pre.errors[0]?.message}` };
  const state = stateFrom(net0, pre, warnings);
  for (const el of storage(net0)) {
    const given = el.type === "C" ? el.params.v0 : el.params.i0;
    const st = state.get(el.id) || {};
    if (given && !given.empty) {
      if (el.type === "C") Object.assign(st, { v: given.value, vExact: fracText(given) });
      else Object.assign(st, { i: given.value, iExact: fracText(given) });
    }
    state.set(el.id, st);
  }

  // 2. how long, and how fine: from the time constants after the last event
  const evAll = events(doc, net0, Infinity);
  const lastEvent = Math.max(0, ...evAll.map((e) => e.t).filter(Number.isFinite));
  const netEnd = compile(doc, { when: after(lastEvent) });
  const taus = timeConstants(netEnd).filter((x) => x.tau > 0);
  const tauMax = taus.length ? Math.max(...taus.map((x) => x.tau)) : null;
  const tauMin = taus.length ? Math.min(...taus.map((x) => x.tau)) : null;
  let tstop = opts.tstop > 0 ? opts.tstop : niceTime(lastEvent + 5 * (tauMax || Math.max(lastEvent, 1e-3)));
  const pulse = net0.elements.find((el) => el.params.wave?.text === "pulse");
  if (!(opts.tstop > 0) && pulse) tstop = niceTime(Math.max(tstop, pulse.params.td.value + 3 * (pulse.params.per.value || pulse.params.pw.value * 2)));
  let h = opts.dt > 0 ? opts.dt : Math.min(tstop / 400, (tauMin || tstop) / 60);
  if (tstop / h > MAX_STEPS) { h = tstop / MAX_STEPS; warnings.push(`The step was enlarged to ${h.toExponential(2)} s to stay under ${MAX_STEPS} steps.`); }

  const ev = events(doc, net0, tstop);
  const cuts = [0, ...ev.map((e) => e.t).filter((t) => t > 0 && t < tstop), tstop];
  const times = [], nodeSeries = new Map(), elSeries = new Map();
  const mark = [];
  const reps = representatives(net0);
  let net = net0, initialPost = null;
  const remap = (v) => reps.map((k) => { const n = k ? net.nodeAt(k) : -1; return n >= 0 ? v[n] : NaN; });

  const record = (t, v, els) => {
    times.push(t);
    v.forEach((x, k) => { if (!nodeSeries.has(k)) nodeSeries.set(k, []); nodeSeries.get(k).push(x); });
    for (const [id, e] of Object.entries(els)) {
      if (!elSeries.has(id)) elSeries.set(id, { i: [], v: [], p: [] });
      const s = elSeries.get(id);
      s.i.push(e.i); s.v.push(e.v); s.p.push(e.p);
    }
  };
  const snap = (sol) => {
    const v = remap(sol.nodes.map((n) => n.v ?? 0));
    const els = {};
    for (const [id, e] of Object.entries(sol.els)) els[id] = { i: e.i, v: e.v ?? 0, p: e.p };
    return { v, els };
  };

  // the 0⁻ sample, so the scope shows any jump at t = 0
  { const s = snap(pre); record(0, s.v, s.els); }

  for (let k = 0; k + 1 < cuts.length; k++) {
    const t0 = cuts[k], t1 = cuts[k + 1];
    net = compile(doc, { when: after(t0) });
    // t0⁺: storage held at its values; exact when the state is exact
    const post = solveDC(net, { mode: "ic", state, when: after(t0), flows: false });
    if (!post.ok) return { ok: false, why: `Right after t = ${fmtT(t0)} the circuit can't be solved: ${post.errors[0]?.message}` };
    if (k === 0) initialPost = post;
    { const s = snap(post); record(t0, s.v, s.els); }
    for (const el of storage(net)) {
      const st = state.get(el.id), e = post.els[el.id];
      if (el.type === "C") st.i = e.i;        // the current the capacitor starts with
      else st.v = e.v ?? 0;                   // the inductor's starting voltage
    }
    mark.push(...(ev.find((e) => e.t === t0)?.labels || []).map((l) => ({ t: t0, label: l })));

    const ctxBase = { mode: "tran", state, off: () => false };
    const checks = structuralErrors(net, { ...ctxBase, h: 1, method: "be", when: after(t0) });
    if (checks.length) return { ok: false, why: checks[0].message };
    let fac = null, facMethod = null, sys = null;
    const steps = Math.max(1, Math.ceil((t1 - t0) / h - 1e-9));
    const hk = (t1 - t0) / steps;
    for (let n = 1; n <= steps; n++) {
      const t = t0 + n * hk, method = n === 1 ? "be" : "trap";
      const ctx = { ...ctxBase, h: hk, method, when: n === steps ? before(t) : after(t) };
      sys = assemble(net, FLOAT, ctx);
      if (facMethod !== method) {
        const flat = new Float64Array(sys.size * sys.size);
        sys.A.forEach((row, r) => row.forEach((x, c) => { flat[r * sys.size + c] = x; }));
        try { fac = factor(flat, sys.size); } catch (err) { if (err instanceof Singular) return { ok: false, why: "The circuit's equations have no unique solution during the transient." }; throw err; }
        facMethod = method;
      }
      const x = solveFactored(fac, sys.b);
      const v = [0, ...Array.from(x.slice(0, sys.nv))];
      const els = {};
      for (const el of net.elements) {
        const pins = sys.pinI.get(el).map((e) => e.eval(x));
        const vd = el.nodes.length >= 2 && el.nodes[0] >= 0 && el.nodes[1] >= 0 ? v[el.nodes[0]] - v[el.nodes[1]] : 0;
        const p = el.nodes.reduce((s, nd, j) => s + (nd >= 0 ? v[nd] * pins[j] : 0), 0);
        els[el.id] = el.type === "OA" ? { i: -pins[2], v: v[el.nodes[2]], p } : { i: pins[0], v: vd, p };
        if (el.type === "C" || el.type === "L") Object.assign(state.get(el.id), { v: vd, i: pins[0], vExact: null, iExact: null });
      }
      record(t, remap(v), els);
    }
  }

  // t → ∞ with everything in its final position (not for pulses: they never settle)
  let final = null;
  if (!pulse) {
    const s = solveDC(compile(doc, { when: after(Infinity) }), { flows: false });
    if (s.ok) final = s;
  }
  const result = {
    ok: true, tstop, h, warnings, events: ev, marks: mark,
    t: times, nodes: Object.fromEntries(nodeSeries), els: Object.fromEntries(elSeries),
    pre: plainSol(pre), post: initialPost ? plainSol(initialPost) : null, final: final ? plainSol(final) : null,
    // (pre, post and final keep their own node numbers; use els, which are by part name)
    taus, nodeNames: net0.nodes.map((n) => n.label || n.name),
  };
  // the textbook formula when there's one storage element after the switch
  const store = storage(netEnd);
  if (store.length === 1 && taus.length === 1 && result.post && result.final) {
    const el = store[0], q = el.type === "C" ? "v" : "i";
    const at0 = result.post.els[el.id], atInf = result.final.els[el.id];
    result.firstOrder = {
      id: el.id, kind: el.type, q, tau: taus[0].tau, R: taus[0].R,
      x0: q === "v" ? at0.v : at0.i, x0x: q === "v" ? at0.vx : at0.ix,
      xinf: q === "v" ? atInf.v : atInf.i, xinfx: q === "v" ? atInf.vx : atInf.ix,
      t0: lastEvent,
    };
  }
  return result;
}

function plainSol(s) {
  return { nodes: s.nodes.map((n) => ({ index: n.index, v: n.v, vx: n.vx })), els: Object.fromEntries(Object.entries(s.els).map(([id, e]) => [id, { v: e.v, vx: e.vx, i: e.i, ix: e.ix }])) };
}

function fracText(p) {
  if (!p.exact) return null;
  return p.exact.d === 1n ? `${p.exact.n}` : `${p.exact.n}/${p.exact.d}`;
}

// round a stop time up to 1, 2 or 5 times a power of ten
function niceTime(t) {
  const e = 10 ** Math.floor(Math.log10(t)), m = t / e;
  return [1, 2, 5, 10].find((k) => m <= k + 1e-9) * e;
}

function fmtT(t) { return `${Number(t.toPrecision(3))} s`; }

