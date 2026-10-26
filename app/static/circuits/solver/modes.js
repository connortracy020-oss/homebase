// The circuit's natural time constants: the rates its stored energy dies away at, from the
// state equations (each capacitor's dv/dt and each inductor's di/dt, every source off).
// One capacitor or inductor sees a Thevenin resistance, and τ = R·C or L/R. With more, the
// rates are the eigenvalues of that state matrix: two capacitors in series charge together
// with τ = R·C1C2/(C1 + C2), which neither one "sees" on its own. A mode that never decays
// (charge trapped between series capacitors, current circling through parallel inductors)
// is left out.

import { solveDC } from "./op.js";
import { mutualValue } from "../elements/coupled.js";

const storage = (net) => net.elements.filter((el) => el.type === "C" || el.type === "L" || el.type === "K");

// column j: how fast every state changes when only state j is 1 (1 V or 1 A). Coupled coils
// carry two states (both currents), and their slopes come from v = L di/dt with the 2×2 L.
export function stateMatrix(net) {
  const els = storage(net), slots = [];
  for (const el of els) for (let k = 0; k < (el.type === "K" ? 2 : 1); k++) slots.push([el, k]);
  const n = slots.length, A = slots.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const on = (el, k) => +(slots[j][0] === el && slots[j][1] === k);
    const state = new Map(els.map((el) => [el.id, { v: el.type === "C" ? on(el, 0) : 0, i: el.type === "L" ? on(el, 0) : 0,
      i1: on(el, 0), i2: on(el, 1), vExact: null, iExact: null, i1Exact: null, i2Exact: null }]));
    const s = solveDC(net, { mode: "ic", state, off: (el) => !!el.def.independent, flows: false, exact: false });
    if (!s.ok) return null;
    for (let r = 0; r < n; r++) {
      const [el, k] = slots[r], e = s.els[el.id];
      if (!e) return null;
      if (el.type === "C") A[r][j] = e.i / el.params.C.value;
      else if (el.type === "L") A[r][j] = (e.v ?? 0) / el.params.L.value;
      else {
        const d = coilSlopes(el, s, e);
        if (!d) return null;
        A[r][j] = d[k];
      }
    }
  }
  return { els, A };
}

// di/dt of both windings: L⁻¹ v (null at perfect coupling, where L can't be inverted)
function coilSlopes(el, s, e) {
  const p = el.params, L1 = p.L1.value, L2 = p.L2.value, M = mutualValue(p), det = L1 * L2 - M * M;
  if (Math.abs(det) <= 1e-12 * L1 * L2) return null;
  const v = (k) => s.nodes[e.nodes[k]]?.v ?? 0, v1 = v(0) - v(1), v2 = v(2) - v(3);
  return [(L2 * v1 - M * v2) / det, (L1 * v2 - M * v1) / det];
}

// -> {taus: [s], periods: [s], growing} or null when the state equations can't be formed
export function naturalModes(net) {
  const m = stateMatrix(net);
  if (!m || !m.els.length) return null;
  const roots = eigenvalues(m.A);
  if (!roots) return null;
  const big = Math.max(0, ...roots.map((z) => Math.hypot(z.re, z.im)));
  const taus = [], periods = [];
  for (const z of roots) {
    if (Math.hypot(z.re, z.im) <= 1e-9 * big) continue;
    if (z.re < -1e-9 * big) taus.push(-1 / z.re);
    if (z.im > 1e-9 * big) periods.push((2 * Math.PI) / z.im);
  }
  return { taus: distinct(taus), periods: distinct(periods), growing: roots.some((z) => z.re > 1e-9 * big) };
}

function distinct(xs) {
  const out = [];
  for (const x of [...xs].sort((a, b) => b - a)) if (!out.some((y) => Math.abs(x - y) <= 1e-6 * y)) out.push(x);
  return out;
}

// Eigenvalues of a small real matrix: the roots of its characteristic polynomial
// (Faddeev–LeVerrier for the coefficients, Durand–Kerner for the roots), on the matrix
// scaled to size 1 so microsecond and second time constants are handled alike.
export function eigenvalues(A0) {
  const n = A0.length;
  if (!n) return [];
  const s = Math.max(...A0.flat().map(Math.abs));
  if (!(s > 0)) return A0.map(() => ({ re: 0, im: 0 }));
  const A = A0.map((row) => row.map((x) => x / s));
  const c = [1];  // p(λ) = λⁿ + c[1]λⁿ⁻¹ + … + c[n]
  let M = A.map((row, i) => row.map((_, j) => +(i === j)));
  for (let k = 1; k <= n; k++) {
    const AM = A.map((row) => M[0].map((_, j) => row.reduce((sum, x, l) => sum + x * M[l][j], 0)));
    const ck = -AM.reduce((sum, row, i) => sum + row[i], 0) / k;
    c.push(ck);
    M = AM.map((row, i) => row.map((x, j) => x + (i === j ? ck : 0)));
  }
  const roots = durandKerner(c);
  return roots && roots.map((z) => ({ re: z.re * s, im: z.im * s }));
}

function durandKerner(c) {
  const n = c.length - 1, R = 1 + Math.max(...c.slice(1).map(Math.abs));
  let z = Array.from({ length: n }, (_, k) => ({ re: R * Math.cos((2 * Math.PI * k) / n + 0.4), im: R * Math.sin((2 * Math.PI * k) / n + 0.4) }));
  const p = (x) => c.reduce((acc, ck) => ({ re: acc.re * x.re - acc.im * x.im + ck, im: acc.re * x.im + acc.im * x.re }), { re: 0, im: 0 });
  for (let it = 0; it < 2000; it++) {
    let moved = 0;
    z = z.map((zk, k) => {
      let den = { re: 1, im: 0 };
      z.forEach((zj, j) => { if (j !== k) den = mul(den, { re: zk.re - zj.re, im: zk.im - zj.im }); });
      const d = div(p(zk), den);
      if (!Number.isFinite(d.re) || !Number.isFinite(d.im)) return zk;
      moved = Math.max(moved, Math.hypot(d.re, d.im));
      return { re: zk.re - d.re, im: zk.im - d.im };
    });
    if (moved < 1e-14 * R) break;
  }
  return z.map((x) => (Math.abs(x.im) < 1e-9 * R ? { re: x.re, im: 0 } : x));
}

const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
