// Frequency response: H(jω) = output / input, with the input source driven at 1∠0° and every
// other independent source off, swept on a log scale. The sweep starts at 20 points a decade
// and adds points where the curve bends fast (near a resonance), so a sharp peak is never
// stepped over. Markers: the −3 dB corner(s), the peak (ω₀) and Q = ω₀ / bandwidth.

import { solveAC } from "./ac.js";
import { naturalModes } from "./modes.js";

// output: {kind: "v", node} | {kind: "vp", part} | {kind: "i", part}
export function bodeSweep(net, { input, output, wmin, wmax } = {}) {
  const src = net.byId.get(input);
  if (!src || !src.def.independent) return { ok: false, why: "Pick an independent source as the input." };
  const range = wmin && wmax ? [wmin, wmax] : autoRange(net);
  const drive = (el, F) => (el === src ? F.one : null);
  const off = (el) => el !== src && !!el.def.independent;
  const at = (w) => {
    const s = solveAC(net, { omega: w, omegaExact: null, exact: false, drive, off });
    if (!s.ok) return { error: s.errors[0]?.message || "no solution" };
    const z = pick(s, output, src);
    return z ? { z } : { error: "That output isn't part of the solution." };
  };
  // a log grid, then halve the gaps where the magnitude or phase changes quickly
  const decades = Math.log10(range[1] / range[0]);
  const n0 = Math.max(2, Math.round(decades * 20) + 1);
  let ws = Array.from({ length: n0 }, (_, k) => range[0] * 10 ** ((decades * k) / (n0 - 1)));
  const val = new Map();
  const get = (w) => { if (!val.has(w)) val.set(w, at(w)); return val.get(w); };
  for (let pass = 0; pass < 5 && ws.length < 1500; pass++) {
    const next = [ws[0]];
    let added = 0;
    for (let k = 1; k < ws.length; k++) {
      const a = get(ws[k - 1]), b = get(ws[k]);
      if (a.z && b.z && (Math.abs(db(a.z) - db(b.z)) > 1 || Math.abs(wrap(arg(b.z) - arg(a.z))) > 8)) { next.push(Math.sqrt(ws[k - 1] * ws[k])); added++; }
      next.push(ws[k]);
    }
    ws = next;
    if (!added) break;
  }
  const pts = ws.map((w) => ({ w, ...get(w) }));
  const bad = pts.find((p) => p.error);
  if (pts.every((p) => p.error)) return { ok: false, why: bad.error };
  const good = pts.filter((p) => p.z);
  const omega = good.map((p) => p.w), mag = good.map((p) => Math.hypot(p.z.re, p.z.im));
  const phase = unwrap(good.map((p) => arg(p.z)));
  const out = { ok: true, input, output, omega, mag, db: mag.map((m) => 20 * Math.log10(Math.max(m, 1e-300))), phase,
    re: good.map((p) => p.z.re), im: good.map((p) => p.z.im), gaps: pts.length - good.length };
  out.markers = markers(out);
  return out;
}

function pick(s, output, src) {
  if (output.kind === "v") return s.nodes[output.node]?.v || null;
  const e = s.els[output.part];
  if (!e) return null;
  if (output.kind === "i") {
    const sourceLike = ["V", "I", "E", "F", "G", "H"].includes(e.type);
    return sourceLike ? { re: -e.i.re, im: -e.i.im } : e.i;  // what a source supplies; a → b through a part
  }
  return e.v;
}

// two decades either side of the circuit's own natural frequencies
export function autoRange(net) {
  const m = naturalModes(net);
  const ws = [...(m?.taus || []).map((t) => 1 / t), ...(m?.periods || []).map((T) => (2 * Math.PI) / T)].filter((w) => w > 0 && Number.isFinite(w));
  if (!ws.length) return [1, 1e6];
  return [Math.min(...ws) / 100, Math.max(...ws) * 100];
}

const db = (z) => 20 * Math.log10(Math.max(Math.hypot(z.re, z.im), 1e-300));
const arg = (z) => (Math.atan2(z.im, z.re) * 180) / Math.PI;
const wrap = (d) => ((d + 540) % 360) - 180;

// degrees without the jumps at ±180°
function unwrap(ph) {
  const out = [];
  let shift = 0;
  ph.forEach((p, k) => {
    if (k) { const d = p + shift - out[k - 1]; if (d > 180) shift -= 360; else if (d < -180) shift += 360; }
    out.push(p + shift);
  });
  return out;
}

// where |H| crosses `level` (dB) between samples, by interpolating in log ω
function crossings(r, level) {
  const out = [];
  for (let k = 1; k < r.omega.length; k++) {
    const a = r.db[k - 1] - level, b = r.db[k] - level;
    if (a === 0) out.push(r.omega[k - 1]);
    else if (a * b < 0) {
      const f = a / (a - b), la = Math.log10(r.omega[k - 1]), lb = Math.log10(r.omega[k]);
      out.push(10 ** (la + f * (lb - la)));
    }
  }
  return out;
}

function markers(r) {
  const n = r.db.length;
  let k = 0;
  for (let i = 1; i < n; i++) if (r.db[i] > r.db[k]) k = i;
  const peak = r.db[k], m = { max: { omega: r.omega[k], db: peak }, lowGain: r.db[0], highGain: r.db[n - 1] };
  const flat = peak - Math.min(...r.db) < 0.5;
  if (flat) return { ...m, shape: "flat" };
  const corners = crossings(r, peak - 3.0103);
  m.corners = corners;
  const interior = k > 0 && k < n - 1 && peak - r.db[0] > 3 && peak - r.db[n - 1] > 3;
  if (interior) {
    const lo = corners.filter((w) => w < r.omega[k]).pop(), hi = corners.find((w) => w > r.omega[k]);
    m.shape = "band-pass";
    m.peak = { omega: r.omega[k], db: peak };
    if (lo && hi) { m.bandwidth = hi - lo; m.Q = r.omega[k] / (hi - lo); }
  } else if (k === 0 || r.db[0] >= peak - 0.5) m.shape = "low-pass";
  else m.shape = "high-pass";
  return m;
}
