// The circuit's natural time constants: the rates its stored energy dies away at, from the
// state equations (each capacitor's dv/dt and each inductor's di/dt, every source off).
// One capacitor or inductor sees a Thevenin resistance, and τ = R·C or L/R. With more, the
// rates are the eigenvalues of that state matrix: two capacitors in series charge together
// with τ = R·C1C2/(C1 + C2), which neither one "sees" on its own. A mode that never decays
// (charge trapped between series capacitors, current circling through parallel inductors)
// is left out.

import { solveDC } from "./op.js";

const storage = (net) => net.elements.filter((el) => el.type === "C" || el.type === "L");

// column j: how fast every state changes when only state j is 1 (1 V or 1 A)
export function stateMatrix(net) {
  const els = storage(net), n = els.length;
  const A = els.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const state = new Map(els.map((el, k) => [el.id, { v: el.type === "C" ? +(k === j) : 0, i: el.type === "L" ? +(k === j) : 0, vExact: null, iExact: null }]));
    const s = solveDC(net, { mode: "ic", state, off: (el) => !!el.def.independent, flows: false, exact: false });
    if (!s.ok) return null;
    for (let k = 0; k < n; k++) {
      const e = s.els[els[k].id];
      if (!e) return null;
      A[k][j] = els[k].type === "C" ? e.i / els[k].params.C.value : (e.v ?? 0) / els[k].params.L.value;
    }
  }
  return { els, A };
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
