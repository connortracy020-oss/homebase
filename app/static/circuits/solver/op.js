// DC operating point (and the t=0+ circuit): exact fractions when the values allow it,
// floating point otherwise. Every solution is checked before it's shown: KCL at every node
// and power balance (what the parts absorb sums to zero).

import { EXACT, FLOAT } from "./field.js";
import { solveField, Singular } from "./lu.js";
import { assemble, ControlLoop } from "./assemble.js";
import { structuralErrors } from "./checks.js";
import { wireFlows } from "./flows.js";
import { ExactTooBig, toString as qstr } from "../core/rational.js";
import { FloatOnly } from "../elements/common.js";
import { DEFS } from "../elements/index.js";
import { parseParam } from "../core/compile.js";
import { isolate } from "./isolate.js";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Solve, or explain why not. opts: {mode: "dc"|"ic", state, off(el), exact: bool, flows: bool}
export function solveDC(full, opts = {}) {
  const t0 = now();
  const ctx = { mode: opts.mode || "dc", when: opts.when || full.when, state: opts.state || new Map(), off: opts.off || (() => false) };
  const out = { ok: false, mode: ctx.mode, errors: [...full.errors], warnings: [...full.warnings], exact: false, empty: !full.elements.length, idle: [] };
  if (out.empty || out.errors.length) return finish(out, t0);
  // set aside parts that can't affect the answer (not connected yet, or behind a capacitor at DC)
  const iso = opts.isolate === false ? { net: full, dropEls: new Set(), warnings: [] } : isolate(full, ctx);
  const net = iso.net;
  out.warnings.push(...iso.warnings);
  out.idle = [...iso.dropEls].map((el) => el.id);
  if (net.errors.length > full.errors.length) { out.errors.push(...net.errors.slice(full.errors.length)); return finish(out, t0); }
  if (!net.elements.length) {
    out.errors.push({ code: "NOTHING", parts: [], message: "Nothing is connected to ground yet. Wire your parts into a loop and add a ground (⏚)." });
    return finish(out, t0);
  }
  const structural = structuralErrors(net, ctx);
  if (structural.length) { out.errors.push(...structural); return finish(out, t0); }

  for (const el of net.elements) {
    if (el.type !== "OA" || el.params.model.text !== "ideal" || net.elements.some((e) => e.ctrl?.target === el)) continue;
    const d = feedbackSign(net, el, ctx);
    if (d === null) continue;
    if (Math.abs(d) < 1e-9) {
      out.errors.push({ code: "NO_FEEDBACK", parts: [el.id], message: `${el.id} has no feedback: nothing connects its output back to its inputs, so the ideal model (v₊ = v₋) can't set the output. Connect the output to the − input through a part, or switch ${el.id} to the finite-gain model.` });
    } else if (d > 0) {
      out.warnings.push({ code: "POSITIVE_FEEDBACK", parts: [el.id], message: `${el.id} has positive feedback (its output pushes v₊ − v₋ further the same way). A real op-amp would saturate at a supply rail, so this ideal answer isn't physical.` });
    }
  }
  if (out.errors.length) return finish(out, t0);

  let sol = null;
  for (const F of opts.exact === false ? [FLOAT] : [EXACT, FLOAT]) {
    try { sol = solveWith(net, F, ctx); break; }
    catch (err) {
      if ((err instanceof ExactTooBig || err instanceof FloatOnly) && F === EXACT) continue;
      if (err instanceof Singular) { out.errors.push(singularError(net, err, ctx)); return finish(out, t0); }
      if (err instanceof ControlLoop) { out.errors.push({ code: "CONTROL_LOOP", parts: [err.el.id], message: err.message }); return finish(out, t0); }
      throw err;
    }
  }
  Object.assign(out, expand(full, iso, sol.summary));
  out.ok = true;
  out.exact = sol.F.exact;
  if (!out.exact && opts.exact !== false) out.warnings.push({ code: "APPROX", message: "Values are decimals: the exact fractions got too large." });
  if (opts.flows !== false) {
    out.flows = wireFlows(full, (el, j) => {
      const c = iso.copies ? iso.copies.get(el) : el;
      return c ? sol.F.toNumber(sol.pinCur.get(c)[j]) : 0;
    });
  }
  out.internal = sol;
  out.iso = iso;
  return finish(out, t0);
}

// results of the reduced circuit, laid back onto the full circuit's node numbers
function expand(full, iso, summary) {
  if (!iso.toOld) return summary;
  const nodes = full.nodes.map((nd) => ({ index: nd.index, name: nd.name, label: nd.label, v: null, vx: null }));
  summary.nodes.forEach((n, k) => { Object.assign(nodes[iso.toOld[k]], { v: n.v, vx: n.vx }); });
  const els = {};
  for (const [id, e] of Object.entries(summary.els)) {
    els[id] = { ...e, nodes: e.nodes.map((n) => (n >= 0 ? iso.toOld[n] : -1)), pins: e.pins.map((p) => ({ ...p, node: p.node >= 0 ? iso.toOld[p.node] : -1 })) };
  }
  return { ...summary, nodes, els };
}

function finish(out, t0) { out.ms = now() - t0; return out; }

export function solveWith(net, F, ctx) {
  const sys = assemble(net, F, ctx);
  const x = sys.size ? solveField(F, sys.A, sys.b) : [];
  const v = [F.zero, ...x.slice(0, sys.nv)];
  const pinCur = new Map(), power = new Map();
  const leave = net.nodes.map(() => F.zero);
  for (const el of net.elements) {
    const cur = sys.pinI.get(el).map((e) => e.eval(x));
    pinCur.set(el, cur);
    let p = F.zero, total = F.zero;
    el.nodes.forEach((node, j) => {
      if (node < 0) return;  // a terminal set aside (it carries no current)
      p = F.add(p, F.mul(v[node], cur[j]));
      leave[node] = F.add(leave[node], cur[j]);
      total = F.add(total, cur[j]);
    });
    if (el.def.groundReturn) leave[0] = F.sub(leave[0], total);  // its return current through ground
    power.set(el, p);
  }
  // the solution must satisfy KCL everywhere and conserve power, or we don't show it
  const scale = 1 + Math.max(0, ...[...pinCur.values()].flat().map((c) => F.mag(c)));
  const bad = leave.findIndex((r) => (F.exact ? !F.isZero(r) : F.mag(r) > 1e-9 * scale));
  if (bad >= 0) throw new Error(`internal check failed: KCL at ${net.nodes[bad].name}`);
  let psum = F.zero, pabs = 0;
  for (const p of power.values()) { psum = F.add(psum, p); pabs += F.mag(p); }
  if (F.exact ? !F.isZero(psum) : Math.abs(psum) > 1e-9 * (1 + pabs)) throw new Error("internal check failed: power doesn't balance");
  return { F, x, v, pinCur, power, sys, summary: summarize(net, F, v, pinCur, power) };
}

// numbers for the views: floats plus exact strings ("72/13") when exact
function summarize(net, F, v, pinCur, power) {
  const ex = (a) => (F.exact ? qstr(a) : null);
  const nodes = net.nodes.map((nd) => ({ index: nd.index, name: nd.name, label: nd.label, v: F.toNumber(v[nd.index]), vx: ex(v[nd.index]) }));
  const els = {};
  for (const el of net.elements) {
    const cur = pinCur.get(el), p = power.get(el);
    const known = el.nodes.length >= 2 && el.nodes[0] >= 0 && el.nodes[1] >= 0;
    const vd = known ? F.sub(v[el.nodes[0]], v[el.nodes[1]]) : null;
    const e = {
      type: el.type, nodes: [...el.nodes],
      v: vd === null ? null : F.toNumber(vd), vx: vd === null ? null : ex(vd), i: F.toNumber(cur[0]), ix: ex(cur[0]), p: F.toNumber(p), px: ex(p),
      pins: cur.map((c, j) => ({ node: el.nodes[j], i: F.toNumber(c), ix: ex(c) })),
    };
    if (el.type === "OA") {
      const io = F.neg(cur[2]);  // current the output drives into the circuit
      Object.assign(e, { v: F.toNumber(v[el.nodes[2]]), vx: ex(v[el.nodes[2]]), i: F.toNumber(io), ix: ex(io) });
    }
    if (el.def.meter) e.reading = el.def.meter === "i" ? { kind: "i", value: e.i, exact: e.ix } : { kind: "v", value: e.v, exact: e.vx };
    els[el.id] = e;
  }
  return { nodes, els, assumptions: assumptionsFor(net) };
}

function assumptionsFor(net) {
  const out = ["Wires are ideal (0 Ω)."];
  const types = new Set(net.elements.map((el) => el.type));
  if (types.has("V") || types.has("I")) out.push("Sources are ideal: a voltage source holds its voltage at any current, a current source its current at any voltage.");
  for (const el of net.elements.filter((e) => e.type === "OA")) {
    out.push(el.params.model.text === "ideal"
      ? `${el.id} is ideal: no current into its inputs and v₊ = v₋ (valid with negative feedback); its output can supply any current.`
      : `${el.id} has open-loop gain A = ${el.params.A.text}${el.params.rin.empty ? "" : `, input resistance ${el.params.rin.text}Ω`}${el.params.rout.value ? `, output resistance ${el.params.rout.text}Ω` : ""}.`);
  }
  if (types.has("AM") || types.has("VM")) out.push("Meters are ideal: a voltmeter draws no current and an ammeter has 0 Ω.");
  if (types.has("C") || types.has("L")) out.push("At DC (steady state), capacitors are open circuits and inductors are short circuits.");
  if ([...types].some((t) => ["E", "F", "G", "H"].includes(t))) out.push("Dependent sources are ideal and respond instantly.");
  return out;
}

function singularError(net, err, ctx) {
  const nv = net.nodes.length - 1;
  let subject = "Something in the circuit";
  if (err.col < nv) subject = `The voltage of ${net.nodes[err.col + 1].name}`;
  else {
    const sys = assemble(net, FLOAT, ctx);
    const el = [...sys.brIndex].find(([, i]) => i === err.col)?.[0];
    if (el) subject = `The current through ${el.id}`;
  }
  const hints = [];
  if (net.elements.some((e) => e.def.dependent)) hints.push("dependent sources can cancel a branch exactly (check gains and polarities)");
  if (net.elements.some((e) => e.type === "OA")) hints.push("check each op-amp's feedback");
  return { code: "SINGULAR", parts: [], message: `${subject} can't be determined: the circuit's equations have no unique solution${hints.length ? ` (${hints.join("; ")})` : ""}.` };
}

// v₊ − v₋ when the op-amp's output is driven to 1 V and every independent source is off:
// negative means negative feedback (good), positive means positive feedback, 0 means none.
function feedbackSign(net, opamp, ctx) {
  const test = synthetic("V", "__feedback", [opamp.nodes[2], 0], { V: "1" });
  const trial = { ...net, elements: net.elements.filter((e) => e !== opamp).concat(test) };
  const off = (el) => el !== test && !!el.def.independent;
  try {
    const sol = solveWith(trial, FLOAT, { ...ctx, off });
    return sol.v[opamp.nodes[1]] - sol.v[opamp.nodes[0]];
  } catch (err) {
    if (err instanceof Singular || err instanceof ControlLoop) return null;
    throw err;
  }
}

// a part that isn't in the drawing (test sources for feedback, Thevenin, ...)
export function synthetic(type, id, nodes, texts = {}) {
  const def = DEFS[type], params = {};
  for (const pd of def.params) params[pd.key] = parseParam(pd, texts[pd.key] ?? pd.default, true, () => {});
  return { id, type, def, part: null, nodes, params, ctrl: null, synthetic: true };
}
