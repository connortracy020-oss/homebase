// Transient analysis, posed the way textbooks pose it:
//   t = 0⁻  the circuit before anything switches, in steady state: DC (C open, L short), plus
//           the sinusoidal steady state of any sine sources
//   t = 0⁺  right after: capacitor voltages and inductor currents can't jump, so C becomes a
//           voltage source at its 0⁻ voltage and L a current source at its 0⁻ current
//   t → ∞   the new steady state
// Those three are exact (fractions when the values allow). In between, the bench steps with
// TR-BDF2 (a trapezoidal stage, then a second-order backward-difference stage): L-stable, so
// nothing rings after a switch, with the local error estimated on every step and the step
// size chosen to keep it small. Switch times and source edges are hit exactly.

import { compile } from "../core/compile.js";
import { migrate } from "../core/doc.js";
import { parseValue } from "../core/units.js";
import { waveEvents, sineOmega } from "../elements/common.js";
import { mutualValue } from "../elements/coupled.js";
import { assemble } from "./assemble.js";
import { FLOAT } from "./field.js";
import { factor, solveFactored, Singular } from "./lu.js";
import { solveDC, synthetic } from "./op.js";
import { thevenin } from "./theorems.js";
import { structuralErrors } from "./checks.js";
import { naturalModes } from "./modes.js";
import { solveAC, sourceDrive } from "./ac.js";

const MAX_STEPS = 20000;
const GAMMA = 2 - Math.SQRT2;                                  // TR-BDF2's stage point
const C2 = (1 - GAMMA) / (2 - GAMMA);                          // = γ/2: both stages share one matrix
const A2 = 1 / (GAMMA * (2 - GAMMA)), B2 = (1 - GAMMA) ** 2 / (GAMMA * (2 - GAMMA));
const KERR = (-3 * GAMMA * GAMMA + 4 * GAMMA - 2) / (12 * (2 - GAMMA));

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

const storage = (net) => net.elements.filter((el) => el.type === "C" || el.type === "L" || el.type === "K");
const sines = (net) => net.elements.filter((el) => el.def.independent && (el.params.wave?.text === "sine" || el.def.threePhase));

// time constants: each capacitor or inductor against the Thevenin resistance it sees
export function timeConstants(net) {
  const out = [];
  for (const el of net.elements.filter((e) => e.type === "C" || e.type === "L")) {
    const others = net.elements.filter((e) => e !== el && (e.type === "C" || e.type === "L"));
    // with the other storage parts at DC (C open, L short), what resistance does this one see?
    const t = thevenin({ ...net, elements: net.elements.filter((e) => !others.includes(e) || e.type === "L") }, { part: el.id });
    if (!t.ok || !t.rth || t.infinite) { out.push({ id: el.id, tau: null }); continue; }
    const R = t.rth.x;
    out.push({ id: el.id, R, tau: el.type === "C" ? R * el.params.C.value : R > 0 ? el.params.L.value / R : null });
  }
  return out;
}

// capacitor voltages, inductor currents (and both currents of coupled coils) from a solve
function stateFrom(net, sol, warnings) {
  const state = new Map();
  for (const el of storage(net)) {
    const e = sol.els[el.id];
    if (!e) continue;
    if (el.type === "K") { state.set(el.id, { i1: e.pins[0].i, i2: e.pins[2].i, i1Exact: e.pins[0].ix ?? null, i2Exact: e.pins[2].ix ?? null }); continue; }
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

// the state a part carries, as numbers: C its voltage, L its current, K both currents
const xOf = (el, st) => (el.type === "C" ? [st.v ?? 0] : el.type === "L" ? [st.i ?? 0] : [st.i1 ?? 0, st.i2 ?? 0]);
function setX(el, st, x) {
  if (el.type === "C") Object.assign(st, { v: x[0], vExact: null });
  else if (el.type === "L") Object.assign(st, { i: x[0], iExact: null });
  else Object.assign(st, { i1: x[0], i2: x[1], i1Exact: null, i2Exact: null });
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
  if (!storage(net0).length && !events(doc, net0, Infinity).length && !sines(net0).length) {
    return { ok: false, why: "There's nothing that changes in time here: add a capacitor or inductor, a switch that flips, or a step, pulse or sine source." };
  }
  // 1. t = 0⁻: the circuit before anything happens (sine sources at their average here; their
  // swing is added from the phasor solution below)
  const preWhen = { ...before(0), average: true };
  let pre = solveDC(net0, { flows: false, when: preWhen });
  if (!pre.ok) {
    // Some problems give the 0⁻ values instead: two inductors in parallel, say, share a DC
    // current in a way the circuit alone doesn't fix. Hold those parts at the values given.
    const held = pre.errors.every((e) => e.code !== "PARAM" && e.code !== "CTRL") ? storage(net0).filter(givenStart) : [];
    if (held.length) {
      const swap = net0.elements.flatMap((el) => (!held.includes(el) ? [el] : el.type === "C"
        ? [synthetic("V", el.id, el.nodes, { V: el.params.v0.text })]
        : el.type === "L" ? [synthetic("I", el.id, el.nodes, { I: negated(el.params.i0.text) })]  // its current enters pin a, like the inductor's
          : [synthetic("I", `${el.id}·1`, el.nodes.slice(0, 2), { I: negated(el.params.i10.text) }), synthetic("I", `${el.id}·2`, el.nodes.slice(2), { I: negated(el.params.i20.text) })]));
      const again = solveDC({ ...net0, elements: swap }, { flows: false, when: preWhen });
      if (again.ok) {
        pre = again;
        warnings.push(`Before t = 0, ${held.map((el) => el.id).join(" and ")} ${held.length > 1 ? "are" : "is"} held at the starting value${held.length > 1 ? "s" : ""} you gave.`);
      }
    }
  }
  if (!pre.ok) return { ok: false, why: `Before t = 0 the circuit can't be solved: ${pre.errors[0]?.message}` };
  const state = stateFrom(net0, pre, warnings);
  const steady = sinusoidalSteadyState(net0, warnings);  // sine sources have been running since long ago
  for (const el of storage(net0)) {
    const st = state.get(el.id) || {};
    const ac = steady?.parts.get(el.id);
    if (ac) setX(el, st, xOf(el, st).map((x, k) => x + ac[k]));
    if (el.type === "K") {
      if (!el.params.i10.empty) Object.assign(st, { i1: el.params.i10.value, i1Exact: fracText(el.params.i10) });
      if (!el.params.i20.empty) Object.assign(st, { i2: el.params.i20.value, i2Exact: fracText(el.params.i20) });
    } else {
      const given = el.type === "C" ? el.params.v0 : el.params.i0;
      if (given && !given.empty) {
        if (el.type === "C") Object.assign(st, { v: given.value, vExact: fracText(given) });
        else Object.assign(st, { i: given.value, iExact: fracText(given) });
      }
    }
    state.set(el.id, st);
  }

  // 2. how long, and how fine: from the time constants after the last event
  const evAll = events(doc, net0, Infinity);
  const lastEvent = Math.max(0, ...evAll.map((e) => e.t).filter(Number.isFinite));
  const netEnd = compile(doc, { when: after(lastEvent) });
  const taus = timeConstants(netEnd).filter((x) => x.tau > 0);
  // with several capacitors and inductors, the circuit's own time constants (they can differ
  // from what each part sees alone: series capacitors share one)
  const nStates = storage(netEnd).reduce((n, el) => n + (el.type === "K" ? 2 : 1), 0);
  const modes = nStates > 1 ? naturalModes(netEnd) : null;
  const rates = modes?.taus.length ? modes.taus : taus.map((x) => x.tau);
  const tauMax = rates.length ? Math.max(...rates) : null;
  const periods = [...sines(netEnd).map((el) => (2 * Math.PI) / sineOmega(el.params).value), ...(modes?.periods || [])];
  const sinePeriod = sines(netEnd).length ? Math.max(...sines(netEnd).map((el) => (2 * Math.PI) / sineOmega(el.params).value)) : 0;
  let tstop = opts.tstop > 0 ? opts.tstop : niceTime(lastEvent + Math.max(5 * (tauMax || 0), 3 * sinePeriod) || lastEvent + Math.max(lastEvent, 1e-3));
  const pulse = net0.elements.find((el) => el.params.wave?.text === "pulse");
  if (!(opts.tstop > 0) && pulse) tstop = niceTime(Math.max(tstop, pulse.params.td.value + 3 * (pulse.params.per.value || pulse.params.pw.value * 2)));
  const fixed = opts.dt > 0;
  let hmax = fixed ? opts.dt : Math.min(tstop / 400, ...periods.map((T) => T / 40));
  if (tstop / hmax > MAX_STEPS) { hmax = tstop / MAX_STEPS; warnings.push(`The step was limited to ${hmax.toExponential(2)} s to stay under ${MAX_STEPS} steps.`); }
  const method = opts.method === "trap" ? "trap" : "trbdf2";
  const rtol = opts.rtol ?? 1e-5;

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
      if (!elSeries.has(id)) { const gap = () => Array(times.length - 1).fill(NaN); elSeries.set(id, { i: gap(), v: gap(), p: gap() }); }
      const s = elSeries.get(id);
      s.i.push(e.i); s.v.push(e.v); s.p.push(e.p);
    }
    // a part this solve left out (set aside, say) gets a gap, so every series lines up with the times
    for (const [id, s] of elSeries) if (!(id in els)) { s.i.push(NaN); s.v.push(NaN); s.p.push(NaN); }
  };
  const snap = (sol) => {
    const v = remap(sol.nodes.map((n) => n.v ?? 0));
    const els = {};
    for (const [id, e] of Object.entries(sol.els)) els[id] = { i: e.i, v: e.v ?? 0, p: e.p };
    return { v, els };
  };

  // the 0⁻ sample, so the scope shows any jump at t = 0 (a capacitor the solve set aside, behind
  // an open switch say, shows the voltage it starts with; sine sources add their value at t = 0)
  {
    const s = snap(pre);
    if (steady) {
      s.v = s.v.map((x, k) => (Number.isFinite(x) ? x + (steady.nodes[k] ?? 0) : x));
      for (const [id, e] of Object.entries(s.els)) { const a = steady.els[id]; if (a) { e.v += a.v; e.i += a.i; } }
    }
    for (const el of storage(net0)) {
      const st = state.get(el.id);
      if (!(el.id in s.els) && st) s.els[el.id] = el.type === "C" ? { v: st.v ?? 0, i: 0, p: 0 } : { v: 0, i: xOf(el, st)[0], p: 0 };
    }
    record(0, s.v, s.els);
  }

  let steps = 0, rejected = 0, hlo = Infinity, hhi = 0;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const t0 = cuts[k], t1 = cuts[k + 1];
    net = compile(doc, { when: after(t0) });
    // t0⁺: storage held at its values; exact when the state is exact
    const post = solveDC(net, { mode: "ic", state, when: after(t0), flows: false });
    if (!post.ok) return { ok: false, why: `Right after t = ${fmtT(t0)} the circuit can't be solved: ${post.errors[0]?.message}` };
    if (k === 0) initialPost = post;
    { const s = snap(post); record(t0, s.v, s.els); }
    mark.push(...(ev.find((e) => e.t === t0)?.labels || []).map((l) => ({ t: t0, label: l })));

    const checks = structuralErrors(net, { mode: "tran", when: after(t0), alpha: 1, beta: () => [0, 0] });
    if (checks.length) return { ok: false, why: checks[0].message };
    const stor = storage(net);
    // each part's state x and its slope dx/dt, which the t0⁺ solve gives exactly
    const X = new Map(stor.map((el) => [el, xOf(el, state.get(el.id))]));
    const DX = new Map(stor.map((el) => [el, slopeAt(el, post)]));
    const scale = scales(stor, pre, post);
    const facs = new Map();

    // one solve with the companion models: dx/dt ≈ α x_new + β (β per state, from the history)
    const stage = (alpha, beta, when) => {
      const ctx = { mode: "tran", state, alpha, beta: (el) => beta.get(el), when, off: () => false };
      const sys = assemble(net, FLOAT, ctx);
      let fac = facs.get(alpha);
      if (!fac) {
        const flat = new Float64Array(sys.size * sys.size);
        sys.A.forEach((row, r) => row.forEach((x, c) => { flat[r * sys.size + c] = x; }));
        fac = factor(flat, sys.size);
        if (facs.size > 6) facs.clear();
        facs.set(alpha, fac);
      }
      const x = solveFactored(fac, sys.b);
      const v = [0, ...Array.from(x.slice(0, sys.nv))];
      const pins = new Map(net.elements.map((el) => [el, sys.pinI.get(el).map((e) => e.eval(x))]));
      const xs = new Map(stor.map((el) => {
        const p = pins.get(el);
        return [el, el.type === "C" ? [v[el.nodes[0]] - v[el.nodes[1]]] : el.type === "L" ? [p[0]] : [p[0], p[2]]];
      }));
      const dxs = new Map(stor.map((el) => [el, xs.get(el).map((xk, i) => alpha * xk + beta.get(el)[i])]));
      return { v, pins, xs, dxs };
    };

    const accept = (t, res) => {
      for (const el of stor) { X.set(el, res.xs.get(el)); DX.set(el, res.dxs.get(el)); setX(el, state.get(el.id), res.xs.get(el)); }
      const els = {};
      for (const el of net.elements) {
        const p = res.pins.get(el), v = res.v;
        const vd = el.nodes.length >= 2 && el.nodes[0] >= 0 && el.nodes[1] >= 0 ? v[el.nodes[0]] - v[el.nodes[1]] : 0;
        const pw = el.nodes.reduce((s, nd, j) => s + (nd >= 0 ? v[nd] * p[j] : 0), 0);
        els[el.id] = el.type === "OA" ? { i: -p[2], v: v[el.nodes[2]], p: pw } : { i: p[0], v: vd, p: pw };
      }
      record(t, remap(res.v), els);
      steps++;
    };

    let t = t0, h = fixed ? opts.dt : Math.min(hmax, (Math.min(...rates, tstop) || tstop) / 200, hmax / 4), firstTrap = true;
    try {
      while (t < t1 - 1e-12 * Math.max(1, Math.abs(t1))) {
        if (steps + rejected > 2 * MAX_STEPS) { warnings.push("The run stopped early: the steps it needed got too small."); break; }
        let hs = Math.min(h, hmax, t1 - t);
        if (t1 - t - hs < 1e-6 * hs) hs = t1 - t;  // land exactly on the next event
        const tEnd = t + hs, whenEnd = Math.abs(tEnd - t1) <= 1e-12 * Math.max(1, Math.abs(t1)) ? before(t1) : after(tEnd);
        if (method === "trap") {
          // fixed-step trapezoidal with a backward-Euler step first (kept for comparison)
          const be = firstTrap;
          const alpha = be ? 1 / hs : 2 / hs;
          const beta = new Map(stor.map((el) => [el, X.get(el).map((x, i) => (be ? -x / hs : -2 * x / hs - DX.get(el)[i]))]));
          accept(tEnd, stage(alpha, beta, whenEnd));
          firstTrap = false; t = tEnd;
          continue;
        }
        // TR-BDF2: a trapezoidal stage to t + γh, then BDF2 to t + h (same matrix: α is 2/(γh) both times)
        const aTR = 2 / (GAMMA * hs);
        const bTR = new Map(stor.map((el) => [el, X.get(el).map((x, i) => -aTR * x - DX.get(el)[i])]));
        const g = stage(aTR, bTR, after(t + GAMMA * hs));
        const aB = 1 / (C2 * hs);
        const bB = new Map(stor.map((el) => [el, X.get(el).map((x, i) => (-A2 * g.xs.get(el)[i] + B2 * x) / (C2 * hs))]));
        const res = stage(aB, bB, whenEnd);
        if (!fixed) {
          // the local error estimate (Bank et al.): 2kh (f_n/γ − f_γ/(γ(1−γ)) + f_{n+1}/(1−γ))
          let err = 0;
          for (const el of stor) {
            const d0 = DX.get(el), dg = g.dxs.get(el), d1 = res.dxs.get(el), x1 = res.xs.get(el), sc = scale.get(el);
            for (let i = 0; i < d0.length; i++) {
              const lte = 2 * KERR * hs * (d0[i] / GAMMA - dg[i] / (GAMMA * (1 - GAMMA)) + d1[i] / (1 - GAMMA));
              err = Math.max(err, Math.abs(lte) / (rtol * Math.abs(x1[i]) + 1e-7 * sc[i]));
            }
          }
          const grow = err > 0 ? 0.9 * err ** (-1 / 3) : 2;
          if (err > 1 && hs > 1e-12 * tstop) { h = hs * Math.max(0.2, grow); rejected++; continue; }
          h = hs * Math.min(2, Math.max(0.5, grow));
        }
        accept(tEnd, res);
        hlo = Math.min(hlo, hs); hhi = Math.max(hhi, hs);
        t = tEnd;
      }
    } catch (err) {
      if (err instanceof Singular) return { ok: false, why: "The circuit's equations have no unique solution during the transient." };
      throw err;
    }
  }

  // t → ∞ with everything in its final position (not for pulses or sines: they never settle)
  let final = null;
  if (!pulse && !sines(netEnd).length) {
    const s = solveDC(compile(doc, { when: after(Infinity) }), { flows: false });
    if (s.ok) final = s;
  }
  const result = {
    ok: true, tstop, h: hmax, method: method === "trap" ? "trapezoidal" : "TR-BDF2", fixed,
    steps, rejected, hmin: Number.isFinite(hlo) ? hlo : hmax, hmaxUsed: hhi || hmax, warnings, events: ev, marks: mark,
    t: times, nodes: Object.fromEntries(nodeSeries), els: Object.fromEntries(elSeries),
    pre: plainSol(pre), post: initialPost ? plainSol(initialPost) : null, final: final ? plainSol(final) : null,
    // (pre, post and final keep their own node numbers; use els, which are by part name)
    taus, modes, nodeNames: net0.nodes.map((n) => n.label || n.name),
  };
  // the textbook formula when there's one storage element after the switch
  const store = storage(netEnd);
  if (store.length === 1 && store[0].type !== "K" && taus.length === 1 && result.post && result.final) {
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

// dx/dt right after an event, from the t0⁺ solve: i/C for a capacitor, v/L for an inductor,
// and L⁻¹ v for coupled coils
function slopeAt(el, post) {
  const e = post.els[el.id];
  if (!e) return el.type === "K" ? [0, 0] : [0];
  if (el.type === "C") return [e.i / el.params.C.value];
  if (el.type === "L") return [(e.v ?? 0) / el.params.L.value];
  const p = el.params, L1 = p.L1.value, L2 = p.L2.value, M = mutualValue(p), det = L1 * L2 - M * M;
  const nd = e.nodes, v = (k) => post.nodes[nd[k]]?.v ?? 0;
  const v1 = v(0) - v(1), v2 = v(2) - v(3);
  if (Math.abs(det) <= 1e-12 * L1 * L2) return [0, 0];
  return [(L2 * v1 - M * v2) / det, (L1 * v2 - M * v1) / det];
}

// what counts as "small" for each state: a millionth of the largest value it has in the run
function scales(stor, pre, post) {
  const vmax = Math.max(1e-9, ...[pre, post].flatMap((s) => s.nodes.map((n) => Math.abs(n.v ?? 0))));
  const imax = Math.max(1e-12, ...[pre, post].flatMap((s) => Object.values(s.els).map((e) => Math.abs(e.i ?? 0))));
  return new Map(stor.map((el) => [el, el.type === "C" ? [vmax] : el.type === "L" ? [imax] : [imax, imax]]));
}

// Sine sources running since long ago: each one's steady state at t = 0 (cosine reference, so
// Re of the phasor), for every frequency present, added to the DC state.
function sinusoidalSteadyState(net, warnings) {
  const src = sines(net);
  if (!src.length) return null;
  const omegas = [];
  for (const el of src) { const w = sineOmega(el.params).value; if (!omegas.some((x) => Math.abs(x - w) <= 1e-9 * w)) omegas.push(w); }
  const parts = new Map(), nodes = [], els = {};
  for (const w of omegas) {
    const s = solveAC(net, { omega: w, omegaExact: null, exact: false, drive: sourceDrive(w) });
    if (!s.ok) { warnings.push(`Before t = 0 the sine sources' steady state couldn't be found (${s.errors[0]?.message}), so the run starts from the DC state.`); return null; }
    s.nodes.forEach((n, k) => { nodes[k] = (nodes[k] ?? 0) + (n.v ? n.v.re : 0); });
    for (const [id, e] of Object.entries(s.els)) {
      const prev = els[id] || { v: 0, i: 0 };
      els[id] = { v: prev.v + (e.v ? e.v.re : 0), i: prev.i + e.i.re };
      const el = net.byId.get(id);
      if (!el || !["C", "L", "K"].includes(el.type)) continue;
      const add = el.type === "C" ? [e.v.re] : el.type === "L" ? [e.i.re] : [e.pins[0].i.re, e.pins[2].i.re];
      parts.set(id, (parts.get(id) || add.map(() => 0)).map((x, k) => x + add[k]));
    }
  }
  // the scope keys nodes by the net's own numbering (the 0⁻ net), like the DC snapshot
  return { parts, nodes, els };
}

function plainSol(s) {
  return { nodes: s.nodes.map((n) => ({ index: n.index, v: n.v, vx: n.vx })), els: Object.fromEntries(Object.entries(s.els).map(([id, e]) => [id, { v: e.v, vx: e.vx, i: e.i, ix: e.ix }])) };
}

const givenStart = (el) => (el.type === "K" ? !el.params.i10.empty && !el.params.i20.empty : !(el.type === "C" ? el.params.v0 : el.params.i0).empty);
const negated = (text) => (text.trim().startsWith("-") ? text.trim().slice(1) : `-${text.trim()}`);

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
