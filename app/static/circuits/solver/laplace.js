// The exact transfer function H(s) = N(s)/D(s) from one input source to one output. The bench
// solves the circuit in the s-domain (C as sC, L as sL, the input at 1, every other source
// off) at a few real values of s, in exact fractions, and interpolates: D(s) = det(G + sC)
// has degree at most the number of states (capacitor voltages and inductor currents), and
// N(s) = H(s)·D(s) is a polynomial too. A polynomial GCD then divides out common factors, so a
// pole-zero cancellation doesn't leave a phantom pole. Poles and zeros are the roots; the step
// and impulse responses come from the partial fractions.

import { EXACT, FLOAT } from "./field.js";
import { assemble } from "./assemble.js";
import { isolate } from "./isolate.js";
import { structuralErrors } from "./checks.js";
import { polyRoots } from "./modes.js";
import { STEADY } from "./ac.js";
import { FloatOnly } from "../elements/common.js";
import * as Q from "../core/rational.js";

const MAX_STATES = 10;

export function transferFunction(full, { input, output }) {
  const net0 = full;
  const src = net0.byId.get(input);
  if (!src || !src.def.independent || src.def.threePhase) return { ok: false, why: "Pick a voltage or current source as the input." };
  const m = net0.elements.reduce((n, el) => n + (el.type === "K" ? 2 : el.type === "C" || el.type === "L" ? 1 : 0), 0);
  if (m > MAX_STATES) return { ok: false, why: `H(s) is worked out exactly for circuits with up to ${MAX_STATES} capacitors and inductors; this one has ${m}.` };
  const drive = (el, F) => (el === src ? F.one : null), off = (el) => el !== src && !!el.def.independent;
  const ctx0 = { mode: "ac", when: STEADY, drive, off };
  const iso = isolate(net0, ctx0), net = iso.net;
  const errs = structuralErrors(net, ctx0);
  if (errs.length) return { ok: false, why: errs[0].message };
  const target = resolve(net, output, iso);
  if (!target) return { ok: false, why: "That output isn't connected to the circuit." };
  let result;
  try { result = exactH(net, m, drive, off, target); }
  catch (err) {
    if (!(err instanceof FloatOnly) && !(err instanceof Q.ExactTooBig)) throw err;
    result = floatH(net, m, drive, off, target);
  }
  if (!result) return { ok: false, why: "The circuit's equations have no unique solution for any s." };
  return finishH(result);
}

// the output, in the (maybe reduced) circuit's numbering
function resolve(net, output, iso) {
  const map = (n) => (iso.toNew ? iso.toNew[n] : n);
  if (output.kind === "v") { const n = map(output.node); return n === undefined || n < 0 ? null : { kind: "v", node: n }; }
  const el = net.byId.get(output.part);
  return el ? { kind: output.kind, el } : null;
}

function valueOf(F, sys, x, target) {
  const v = (n) => (n > 0 ? x[n - 1] : F.zero);
  if (target.kind === "v") return v(target.node);
  const el = target.el;
  if (target.kind === "vp") return F.sub(v(el.nodes[0]), v(el.nodes[1]));
  const i = sys.pinI.get(el)[0].eval(x);
  return ["V", "I", "E", "F", "G", "H"].includes(el.type) ? F.neg(i) : i;  // what a source supplies
}

// solve A x = b and give det(A) too (0 and no x when it's singular)
function detSolve(F, A0, b0) {
  const n = b0.length, A = A0.map((r, i) => [...r, b0[i]]);
  let det = F.one;
  for (let k = 0; k < n; k++) {
    let best = -1, mag = -1;
    for (let i = k; i < n; i++) if (!F.isZero(A[i][k]) && F.mag(A[i][k]) > mag) { mag = F.mag(A[i][k]); best = i; }
    if (best < 0) return { det: F.zero, x: null };
    if (best !== k) { [A[k], A[best]] = [A[best], A[k]]; det = F.neg(det); }
    det = F.mul(det, A[k][k]);
    for (let i = k + 1; i < n; i++) {
      if (F.isZero(A[i][k])) continue;
      const f = F.div(A[i][k], A[k][k]);
      for (let j = k; j <= n; j++) if (!F.isZero(A[k][j])) A[i][j] = F.sub(A[i][j], F.mul(f, A[k][j]));
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let j = i + 1; j < n; j++) if (!F.isZero(A[i][j])) sum = F.sub(sum, F.mul(A[i][j], x[j]));
    x[i] = F.div(sum, A[i][i]);
  }
  return { det, x };
}

function sample(net, F, s, drive, off, target) {
  const sys = assemble(net, F, { mode: "ac", when: STEADY, drive, off, jw: s });
  if (!sys.size) return { det: F.one, y: F.zero };
  const { det, x } = detSolve(F, sys.A, sys.b);
  if (!x) return null;
  return { det, y: valueOf(F, sys, x, target) };
}

// ---- exact: rational samples, Newton interpolation, GCD over the rationals ----

function exactH(net, m, drive, off, target) {
  const xs = [], ds = [], ns = [];
  for (let k = 1; xs.length < m + 2 && k < 4 * m + 20; k++) {
    const s = Q.frac(BigInt(k));
    const r = sample(net, EXACT, s, drive, off, target);
    if (!r || Q.isZero(r.det)) continue;
    xs.push(s); ds.push(r.det); ns.push(Q.mul(r.y, r.det));
  }
  if (xs.length < m + 2) return null;
  // interpolate through m + 1 points and check the last one
  const D = interpQ(xs.slice(0, m + 1), ds.slice(0, m + 1)), N = interpQ(xs.slice(0, m + 1), ns.slice(0, m + 1));
  if (!Q.eq(evalQ(D, xs[m + 1]), ds[m + 1]) || !Q.eq(evalQ(N, xs[m + 1]), ns[m + 1])) return null;
  let num = trimQ(N), den = trimQ(D);
  const g = gcdQ(num, den);
  if (g.length > 1) { num = divQ(num, g)[0]; den = divQ(den, g)[0]; }
  const lead = den[den.length - 1];
  num = num.map((c) => Q.div(c, lead)); den = den.map((c) => Q.div(c, lead));
  return { exact: true, num, den };
}

function interpQ(xs, ys) {
  const n = xs.length, c = [...ys];
  for (let j = 1; j < n; j++) for (let i = n - 1; i >= j; i--) c[i] = Q.div(Q.sub(c[i], c[i - 1]), Q.sub(xs[i], xs[i - j]));
  let p = [c[n - 1]];
  for (let k = n - 2; k >= 0; k--) {
    // p = p·(s − x_k) + c_k
    const q = new Array(p.length + 1).fill(Q.ZERO);
    p.forEach((a, i) => { q[i + 1] = Q.add(q[i + 1], a); q[i] = Q.sub(q[i], Q.mul(a, xs[k])); });
    q[0] = Q.add(q[0], c[k]);
    p = q;
  }
  return p;
}

const evalQ = (p, x) => p.reduceRight((acc, c) => Q.add(Q.mul(acc, x), c), Q.ZERO);
function trimQ(p) { const q = [...p]; while (q.length > 1 && Q.isZero(q[q.length - 1])) q.pop(); return q; }

const isZeroQ = (p) => p.length === 1 && Q.isZero(p[0]);

// polynomial long division over the rationals: [quotient, remainder]
function divQ(a, b) {
  a = trimQ(a); b = trimQ(b);
  const q = new Array(Math.max(1, a.length - b.length + 1)).fill(Q.ZERO);
  let r = [...a];
  while (r.length >= b.length && !isZeroQ(r)) {
    const k = r.length - b.length, f = Q.div(r[r.length - 1], b[b.length - 1]);
    q[k] = f;
    for (let i = 0; i < b.length; i++) r[i + k] = Q.sub(r[i + k], Q.mul(f, b[i]));
    r.pop();  // its leading term is zero now
    r = trimQ(r.length ? r : [Q.ZERO]);
  }
  return [q, r];
}

function gcdQ(a, b) {
  a = trimQ(a); b = trimQ(b);
  while (!isZeroQ(b)) {
    const [, r] = divQ(a, b);
    a = b; b = trimQ(r);
  }
  const lead = a[a.length - 1];
  return a.map((c) => Q.div(c, lead));
}

// ---- floating point: samples on the circuit's own frequency scale; near-equal poles and
// zeros cancel after root finding ----

function floatH(net, m, drive, off, target) {
  const sigma = 1 / Math.max(1e-300, typicalTau(net));
  const us = [], ds = [], ns = [];
  for (let k = 1; us.length < m + 2 && k < 4 * m + 20; k++) {
    const r = sample(net, FLOAT, sigma * k, drive, off, target);
    if (!r || r.det === 0) continue;
    us.push(k); ds.push(r.det); ns.push(r.y * r.det);
  }
  if (us.length < m + 1) return null;
  const toS = (p) => p.map((c, j) => c / sigma ** j);
  let num = toS(interpF(us.slice(0, m + 1), ns.slice(0, m + 1))), den = toS(interpF(us.slice(0, m + 1), ds.slice(0, m + 1)));
  const tol = 1e-9 * Math.max(...den.map(Math.abs));
  while (den.length > 1 && Math.abs(den[den.length - 1]) <= tol) den.pop();
  const ntol = 1e-9 * Math.max(...num.map(Math.abs), 1e-300);
  while (num.length > 1 && Math.abs(num[num.length - 1]) <= ntol) num.pop();
  const lead = den[den.length - 1];
  return { exact: false, num: num.map((c) => c / lead), den: den.map((c) => c / lead), sigma };
}

function interpF(xs, ys) {
  const n = xs.length, c = [...ys];
  for (let j = 1; j < n; j++) for (let i = n - 1; i >= j; i--) c[i] = (c[i] - c[i - 1]) / (xs[i] - xs[i - j]);
  let p = [c[n - 1]];
  for (let k = n - 2; k >= 0; k--) {
    const q = new Array(p.length + 1).fill(0);
    p.forEach((a, i) => { q[i + 1] += a; q[i] -= a * xs[k]; });
    q[0] += c[k];
    p = q;
  }
  return p;
}

// a time scale for the float samples: the RC and L/R products in the circuit
function typicalTau(net) {
  const rs = net.elements.filter((e) => e.type === "R").map((e) => e.params.R.value);
  const R = rs.length ? Math.exp(rs.reduce((a, r) => a + Math.log(r), 0) / rs.length) : 1;
  const ts = [];
  for (const e of net.elements) {
    if (e.type === "C") ts.push(R * e.params.C.value);
    if (e.type === "L") ts.push(e.params.L.value / R);
    if (e.type === "K") ts.push(e.params.L1.value / R, e.params.L2.value / R);
  }
  return ts.length ? Math.exp(ts.reduce((a, t) => a + Math.log(t), 0) / ts.length) : 1;
}

// ---- poles, zeros, gains, responses ----

function finishH(r) {
  const num = r.exact ? r.num.map(Q.toNumber) : r.num, den = r.exact ? r.den.map(Q.toNumber) : r.den;
  const roots = (p) => (p.length > 1 ? polyRoots([...p].reverse()) : []);
  let poles = roots(den), zeros = roots(num);
  if (!r.exact) {
    // in floats, a pole and a zero at the same place cancel
    const keep = [];
    for (const z of zeros) {
      const k = poles.findIndex((p) => Math.hypot(p.re - z.re, p.im - z.im) <= 1e-6 * (1 + Math.hypot(p.re, p.im)));
      if (k >= 0) poles.splice(k, 1); else keep.push(z);
    }
    zeros = keep;
  }
  const at0 = den[0] !== 0 ? num[0] / den[0] : null;
  const hInf = num.length === den.length ? num[num.length - 1] : 0;
  const out = {
    ok: true, exact: r.exact, num, den, poles: tidy(poles), zeros: tidy(zeros), dcGain: at0, hfGain: hInf,
    numText: r.exact ? r.num.map(Q.toString) : null, denText: r.exact ? r.den.map(Q.toString) : null,
  };
  if (den.length === 3) {
    // s² + a1 s + a0: ω₀ = √a0, ζ = a1/(2ω₀), Q = 1/(2ζ)
    const w0 = Math.sqrt(den[0]), zeta = den[1] / (2 * w0);
    if (den[0] > 0) Object.assign(out, { w0, zeta, Q: zeta > 0 ? 1 / (2 * zeta) : Infinity });
  }
  out.responses = responses(out);
  return out;
}

function tidy(zs) {
  return zs.map((z) => {
    const big = Math.hypot(z.re, z.im) || 1;
    return { re: Math.abs(z.re) < 1e-10 * big ? 0 : z.re, im: Math.abs(z.im) < 1e-9 * big ? 0 : z.im };
  }).sort((a, b) => b.re - a.re || b.im - a.im);
}

// step and impulse responses from the residues, when the poles are distinct and stable enough
function responses(h) {
  const { poles, num, den } = h;
  if (!poles.length) return { t: [0, 1], step: [h.dcGain ?? 0, h.dcGain ?? 0], impulse: [0, 0], note: "No poles: the output follows the input at once." };
  const distinct = poles.every((p, i) => poles.every((q, j) => i === j || Math.hypot(p.re - q.re, p.im - q.im) > 1e-6 * (1 + Math.hypot(p.re, p.im))));
  if (!distinct || poles.some((p) => Math.hypot(p.re, p.im) < 1e-12)) return { note: "Repeated poles (or one at s = 0): see the step response under Over time instead." };
  const ev = (p, z) => p.reduceRight((acc, c) => ({ re: acc.re * z.re - acc.im * z.im + c, im: acc.re * z.im + acc.im * z.re }), { re: 0, im: 0 });
  const dden = den.slice(1).map((c, k) => c * (k + 1));
  const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
  const terms = poles.map((p) => {
    const Np = ev(num, p), Dp = ev(dden, p);
    const imp = div(Np, Dp);                       // residue of H(s) at p
    const stp = div(imp, p);                       // residue of H(s)/s at p
    return { p, imp, stp };
  });
  const slow = Math.min(...poles.map((p) => Math.abs(p.re)).filter((x) => x > 0), Infinity);
  const fast = Math.max(...poles.map((p) => Math.hypot(p.re, p.im)));
  const tEnd = Number.isFinite(slow) ? 6 / slow : 20 / fast;
  const N = 500, t = Array.from({ length: N }, (_, k) => (tEnd * k) / (N - 1));
  const sum = (key, tt) => terms.reduce((acc, tr) => {
    const e = Math.exp(tr.p.re * tt), c = Math.cos(tr.p.im * tt), s = Math.sin(tr.p.im * tt);
    return acc + e * (tr[key].re * c - tr[key].im * s);
  }, 0);
  const H0 = h.dcGain ?? 0;
  const strict = num.length < den.length;
  return {
    t, step: t.map((tt) => H0 + sum("stp", tt)), impulse: t.map((tt) => sum("imp", tt)),
    note: strict ? null : `H(∞) = ${Number(h.hfGain.toPrecision(4))}, so the impulse response also has an impulse of that size at t = 0 (not drawn).`,
    unstable: poles.some((p) => p.re > 1e-9 * Math.hypot(p.re, p.im)),
  };
}
