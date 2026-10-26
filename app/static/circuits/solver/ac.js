// AC steady state (phasors). Every source is a sinusoid at one angular frequency ω, so every
// voltage and current is a complex amplitude: peak values, cosine reference, v(t) = Re(V e^{jωt}).
// Capacitors become admittances jωC and inductors impedances jωL; the assembly and LU are the
// same as DC. Answers are exact (fractions in both parts) when ω and the values allow, and
// every solution is checked: KCL at every node, and the complex power balances (what the parts
// absorb, ½ V I*, sums to zero).

import { CEXACT, CFLOAT, phasorOf } from "./cfield.js";
import { solveField, Singular } from "./lu.js";
import { assemble, ControlLoop } from "./assemble.js";
import { structuralErrors } from "./checks.js";
import { isolate } from "./isolate.js";
import { synthetic } from "./op.js";
import { ExactTooBig, eq as qeq } from "../core/rational.js";
import { FloatOnly, sineOmega, sinePeak } from "../elements/common.js";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// AC steady state: every switch has made its last flip
export const STEADY = Object.freeze({ t: Infinity, side: 1 });

// the sine sources and their angular frequencies
export function acSources(net) {
  return net.elements
    .filter((el) => el.def.independent && el.params.wave?.text === "sine")
    .map((el) => ({ el, omega: sineOmega(el.params).value, exact: sineOmega(el.params).exact }));
}

// The frequency the circuit runs at: its sine sources' own (the first one's, if they differ).
export function acFrequency(net) {
  const src = acSources(net);
  if (!src.length) return null;
  const { omega, exact } = src[0];
  const at = src.filter((s) => same(s.omega, omega));
  return { omega, exact: exact && at.every((s) => s.exact && qeq(s.exact, exact)) ? exact : null, sources: src, mixed: at.length < src.length };
}

const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

// the phasor each independent source drives at ω (null: off at this frequency)
export function sourceDrive(omega) {
  return (el, F) => {
    const p = el.params;
    if (p.wave?.text !== "sine" || !same(sineOmega(p).value, omega)) return null;
    const z = phasorOf(F, sinePeak(p, el.type === "I" ? "I" : "V"), p.ph.value);
    if (z === null) throw new FloatOnly();
    return z;
  };
}

// Solve at ω (rad/s). opts: {omega, omegaExact (a fraction or null), drive(el, F), off(el),
// exact: false to skip the exact attempt}. Results are plain {re, im} numbers, with exact parts
// as strings ([re, im], e.g. ["12/5", "-16/5"]) when the solve was exact.
export function solveAC(full, opts) {
  const t0 = now();
  const omega = opts.omega;
  const out = { ok: false, mode: "ac", omega, f: omega / (2 * Math.PI), omegaExact: opts.omegaExact ? String(opts.omegaExact.n) + (opts.omegaExact.d === 1n ? "" : `/${opts.omegaExact.d}`) : null,
    errors: [...full.errors], warnings: [...full.warnings], exact: false, idle: [], empty: !full.elements.length };
  if (out.empty || out.errors.length) return finish(out, t0);
  if (!(omega > 0)) { out.errors.push({ code: "OMEGA", parts: [], message: "AC analysis needs a frequency above 0." }); return finish(out, t0); }
  const drive = opts.drive || sourceDrive(omega);
  const ctx = { mode: "ac", when: STEADY, off: opts.off || (() => false), omega, drive };
  const iso = isolate(full, ctx);
  const net = iso.net;
  out.warnings.push(...iso.warnings);
  out.idle = [...iso.dropEls].map((el) => el.id);
  if (!net.elements.length) {
    out.errors.push({ code: "NOTHING", parts: [], message: "Nothing is connected to ground yet. Wire your parts into a loop and add a ground (⏚)." });
    return finish(out, t0);
  }
  const structural = structuralErrors(net, ctx);
  if (structural.length) { out.errors.push(...structural); return finish(out, t0); }

  let sol = null;
  const fields = opts.exact === false || !opts.omegaExact ? [CFLOAT] : [CEXACT, CFLOAT];
  for (const F of fields) {
    ctx.jw = F.exact ? F.fromQ(F.zero.re, opts.omegaExact) : F.cnum(0, omega);
    try { sol = solveWith(net, F, ctx); break; }
    catch (err) {
      if ((err instanceof ExactTooBig || err instanceof FloatOnly) && F.exact) continue;
      if (err instanceof Singular) {
        out.errors.push({ code: "SINGULAR", parts: [], message: `At this frequency the circuit's equations have no unique solution. A capacitor and an inductor with no resistance can resonate exactly here (their impedances cancel), or a source can be cut off from the rest.` });
        return finish(out, t0);
      }
      if (err instanceof ControlLoop) { out.errors.push({ code: "CONTROL_LOOP", parts: [err.el.id], message: err.message }); return finish(out, t0); }
      throw err;
    }
  }
  Object.assign(out, expand(full, iso, sol.summary));
  out.ok = true;
  out.exact = sol.F.exact;
  return finish(out, t0);
}

function finish(out, t0) { out.ms = now() - t0; return out; }

export function solveWith(net, F, ctx) {
  const sys = assemble(net, F, ctx);
  const x = sys.size ? solveField(F, sys.A, sys.b) : [];
  const v = [F.zero, ...x.slice(0, sys.nv)];
  const half = F.num(0.5);
  const pinCur = new Map(), power = new Map();
  const leave = net.nodes.map(() => F.zero);
  for (const el of net.elements) {
    const cur = sys.pinI.get(el).map((e) => e.eval(x));
    pinCur.set(el, cur);
    let s = F.zero, total = F.zero;
    el.nodes.forEach((node, j) => {
      if (node < 0) return;
      s = F.add(s, F.mul(v[node], F.conj(cur[j])));
      leave[node] = F.add(leave[node], cur[j]);
      total = F.add(total, cur[j]);
    });
    if (el.def.groundReturn) leave[0] = F.sub(leave[0], total);
    power.set(el, F.mul(half, s));
  }
  // KCL everywhere and the complex power balance (Tellegen), or we don't show it
  const scale = 1 + Math.max(0, ...[...pinCur.values()].flat().map((c) => F.mag(c)));
  const bad = leave.findIndex((r) => (F.exact ? !F.isZero(r) : F.mag(r) > 1e-9 * scale));
  if (bad >= 0) throw new Error(`internal check failed: KCL at ${net.nodes[bad].name}`);
  let ssum = F.zero, sabs = 0;
  for (const s of power.values()) { ssum = F.add(ssum, s); sabs += F.mag(s); }
  if (F.exact ? !F.isZero(ssum) : F.mag(ssum) > 1e-9 * (1 + sabs)) throw new Error("internal check failed: complex power doesn't balance");
  return { F, x, v, pinCur, power, sys, summary: summarize(net, F, v, pinCur, power) };
}

function summarize(net, F, v, pinCur, power) {
  const z = (a) => F.toComplex(a), ex = (a) => F.exactParts(a);
  const nodes = net.nodes.map((nd) => ({ index: nd.index, name: nd.name, label: nd.label, v: z(v[nd.index]), vx: ex(v[nd.index]) }));
  const els = {};
  for (const el of net.elements) {
    const cur = pinCur.get(el), s = power.get(el);
    const known = el.nodes.length >= 2 && el.nodes[0] >= 0 && el.nodes[1] >= 0;
    const vd = known ? F.sub(v[el.nodes[0]], v[el.nodes[1]]) : null;
    const e = {
      type: el.type, nodes: [...el.nodes],
      v: vd && z(vd), vx: vd && ex(vd), i: z(cur[0]), ix: ex(cur[0]), s: z(s), sx: ex(s),
      pins: cur.map((c, j) => ({ node: el.nodes[j], i: z(c), ix: ex(c) })),
    };
    if (el.type === "OA") {
      const io = F.neg(cur[2]);
      Object.assign(e, { v: z(v[el.nodes[2]]), vx: ex(v[el.nodes[2]]), i: z(io), ix: ex(io) });
    }
    if (el.def.meter) e.reading = el.def.meter === "i" ? { kind: "i", value: e.i, exact: e.ix } : { kind: "v", value: e.v, exact: e.vx };
    els[el.id] = e;
  }
  return { nodes, els };
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

// ---- Thevenin / Norton in AC: V_th and I_N as phasors, Z_th complex ----

const dif = (a, b) => (a && b ? { re: a.re - b.re, im: a.im - b.im } : null);

export function acThevenin(net, { part = null, nodes = null } = {}, opts) {
  let a, b, rest = net.elements, load = null;
  if (part) {
    load = net.byId.get(part);
    if (!load || load.nodes.length !== 2) return { ok: false, why: "Pick a two-terminal part." };
    if (net.elements.some((e) => e.ctrl?.target === load)) return { ok: false, why: `A dependent source is controlled by ${part}'s current, so ${part} can't be taken out.` };
    [a, b] = load.nodes;
    rest = net.elements.filter((e) => e !== load);
  } else [a, b] = nodes;
  if (a === undefined || b === undefined || a < 0 || b < 0) return { ok: false, why: "The two terminals aren't both connected to the rest of the circuit." };
  if (a === b) return { ok: false, why: "Both terminals are the same node." };
  const base = { ...net, elements: rest };
  const drive = opts.drive || sourceDrive(opts.omega);
  const oc = solveAC(base, { ...opts, drive });
  if (!oc.ok) return { ok: false, why: `With ${part || "the load"} removed the circuit can't be solved: ${oc.errors[0]?.message}` };
  const voc = dif(oc.nodes[a]?.v, oc.nodes[b]?.v);
  if (!voc) return { ok: false, why: "The two terminals aren't both connected to the rest of the circuit." };
  // every independent source off, a 1 A (0°) test current into a: Z_th = V_a − V_b
  const test = synthetic("I", "__test", [a, b], { I: "1" });
  const zt = solveAC({ ...base, elements: rest.concat(test) }, {
    ...opts, drive: (el, F) => (el === test ? F.one : null), off: (el) => el !== test && !!el.def.independent,
  });
  const zth = zt.ok ? dif(zt.nodes[a]?.v, zt.nodes[b]?.v) : null;
  const short = synthetic("AM", "__short", [a, b]);
  const sc = solveAC({ ...base, elements: rest.concat(short) }, { ...opts, drive });
  const isc = sc.ok ? sc.els.__short.i : null;
  const out = { ok: true, a, b, part, voc, zth, isc, infinite: !zt.ok && zt.errors.some((e) => e.code === "FLOATING") };
  if (zth && zth.re > 0) out.maxPower = { zl: { re: zth.re, im: -zth.im }, p: (voc.re * voc.re + voc.im * voc.im) / (8 * zth.re) };
  return out;
}
