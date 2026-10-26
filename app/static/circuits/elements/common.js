// Shared pieces for part definitions: time-dependent source values, switch timing, and
// the two standard pin layouts.
//
// A part definition says how the part behaves in each analysis:
//   pins            [{name, x, y}] at rotation 0, in grid units
//   params          [{key, label, unit, default, kind, positive?, nonzero?, optional?, show?}]
//   branchCount     extra current unknowns it needs (voltage sources, op-amp outputs, ...)
//   pinCurrents     Lin per pin: the current entering the part at that pin
//   constraints     the rows for its branch unknowns
//   dcEdges/zEdges  pin pairs that conduct / have zero impedance (structural checks)
// Modes (ctx.mode): "dc" steady state, "ic" the t=0+ circuit (C -> V(v0), L -> I(i0)),
// "tran" one time step (companion models).

import { lin } from "../solver/lin.js";

export const TWO_PIN = [{ name: "a", x: 0, y: 0 }, { name: "b", x: 4, y: 0 }];

export const WAVES = ["dc", "step", "pulse", "sine"];

// Is time `when` before the instant `at`? when = {t, side}: side -1 means just before.
export function before(when, at) {
  return when.t < at || (when.t === at && when.side < 0);
}

// The value of a source parameter at time `when`, as a parsed {exact, value} (exact may be
// null on a ramp). p is the parsed params object, prefix "V" or "I".
export function waveValue(p, prefix, when) {
  const kind = p.wave?.text || "dc";
  if (kind === "dc") return p[prefix];
  if (kind === "sine") {
    const dc = p[`${prefix}dc`];
    if (!Number.isFinite(when.t) || when.average) return dc;  // DC analysis (steady state): only the average counts
    const w = sineOmega(p).value, a = sinePeak(p, prefix).value;
    return { exact: null, value: dc.value + a * Math.cos(w * when.t + (p.ph.value * Math.PI) / 180) };
  }
  const lo = p[`${prefix}0`], hi = p[`${prefix}1`];
  if (kind === "step") return before(when, p.at.value) ? lo : hi;
  // pulse: lo until td, ramp tr, hold pw at hi, ramp tf, repeat every per. A time within a
  // billionth of a corner is on it (td + k·per has rounding noise), and just before a later
  // period starts is the end of the period before it.
  const td = p.td.value, tr = p.tr.value, tf = p.tf.value, pw = p.pw.value, per = p.per.value;
  if (before(when, td) || !Number.isFinite(when.t)) return lo;
  const eps = 1e-9 * Math.max(per > 0 ? per : 0, tr + pw + tf);
  let u = when.t - td;
  if (per > 0) {
    const k = Math.round(u / per);
    if (k > 0 && Math.abs(u - k * per) <= eps) u = when.side < 0 ? per : 0;
    else u -= Math.floor(u / per) * per;
  }
  for (const c of [tr, tr + pw, tr + pw + tf]) if (Math.abs(u - c) <= eps) u = c;
  const ramp = (a, b, f) => ({ exact: null, value: a.value + (b.value - a.value) * f });
  if (tr > 0 && u < tr) return ramp(lo, hi, u / tr);
  if (u < tr + pw || (u === tr + pw && when.side < 0)) return hi;
  if (tf > 0 && u < tr + pw + tf) return ramp(hi, lo, (u - tr - pw) / tf);
  return lo;
}

// A sine source's angular frequency in rad/s, exact when it was typed as ω.
export function sineOmega(p) {
  if (p.funit?.text === "Hz") return { value: 2 * Math.PI * p.f.value, exact: null };
  return { value: p.w.value, exact: p.w.exact };
}

// Its peak amplitude as a parsed value (an RMS amplitude times √2 has no exact form).
export function sinePeak(p, prefix) {
  const a = p[`${prefix}m`];
  return p.scale?.text === "rms" ? { exact: null, value: a.value * Math.SQRT2 } : a;
}

// Times where a source's value has a corner (transient breakpoints), up to tstop.
export function waveEvents(p, tstop) {
  const kind = p.wave?.text || "dc";
  if (kind === "step") return [p.at.value];
  if (kind !== "pulse") return [];
  const td = p.td.value, tr = p.tr.value, tf = p.tf.value, pw = p.pw.value, per = p.per.value;
  const out = [];
  for (let k = 0; k < 10000; k++) {
    const start = td + k * per;  // not a running sum, which drifts
    if (start > tstop) break;
    out.push(start, start + tr, start + tr + pw, start + tr + pw + tf);
    if (!(per > 0)) break;
  }
  return [...new Set(out)].filter((t) => t >= 0 && t <= tstop);
}

// field value of a parsed source value; null exact on a ramp means floats only
export function fieldValue(F, pv) {
  if (F.exact && pv.exact === null) throw new FloatOnly();
  return F.of(pv);
}

export class FloatOnly extends Error {
  constructor() { super("this value needs floating point"); this.name = "FloatOnly"; }
}

// Shorthand for two-pin parts: [i, -i]
export function pair(i) { return [i, i.neg()]; }

export const zeroPair = (F) => [lin(F), lin(F)];
