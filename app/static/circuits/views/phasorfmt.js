// Phasors as text: polar "7.071 V∠−45°" and rectangular, j first the way circuits texts write
// it: "3 + j4 Ω", "−j1 kΩ", "(12 − j16)/13 V" (exact when the solve was), in peak or RMS. RMS is
// peak/√2, which has no exact form, so RMS shows decimals.

import { fmt, sig, prefixFor } from "../core/units.js";
import * as Q from "../core/rational.js";
import { polarOf } from "../solver/cfield.js";

export const RMS = Math.SQRT1_2;
export const scaleOf = (mode) => (mode === "rms" ? RMS : 1);

// −180° < angle ≤ 180°, to 0.01°
export function angleText(deg) {
  let d = Number((((deg + 180) % 360 + 360) % 360 - 180).toFixed(2));
  if (d <= -180) d = 180;
  if (Math.abs(d) < 0.005) d = 0;
  return `${sig(d, 5)}°`;
}

export function polarText(z, unit, scale = 1) {
  if (!z) return "—";
  const { mag, deg } = polarOf(z);
  if (mag * scale < 1e-15) return `0 ${unit}`.trim();
  return `${fmt(mag * scale, unit)}∠${angleText(deg)}`;
}

// a + bj with SI prefixes, exact when the parts are given ("12/5", "-16/5") and the scale is 1
export function rectText(z, zx, unit, scale = 1) {
  if (!z) return "—";
  if (zx && scale === 1) return exactRect(zx, unit);
  const re = z.re * scale, im = z.im * scale, big = Math.max(Math.abs(re), Math.abs(im));
  if (big < 1e-15) return `0 ${unit}`.trim();
  const [e, p] = prefixFor(big);
  const k = 10 ** e, a = re / k, b = im / k;
  return `${joinParts(Math.abs(a) < 1e-12 * Math.abs(big / k) ? "" : sig(a), Math.abs(b) < 1e-12 * Math.abs(big / k) ? "" : sig(Math.abs(b)), b < 0)} ${p}${unit}`.trim();
}

function exactRect([reText, imText], unit) {
  const re = Q.fromString(reText), im = Q.fromString(imText);
  if (Q.isZero(re) && Q.isZero(im)) return `0 ${unit}`.trim();
  const big = Math.max(Math.abs(Q.toNumber(re)), Math.abs(Q.toNumber(im)));
  const [e, p] = prefixFor(big);
  const k = e >= 0 ? Q.frac(10n ** BigInt(e)) : Q.frac(1n, 10n ** BigInt(-e));
  const a = Q.div(re, k), b = Q.div(im, k);
  // over one denominator: (a + bj)/d, unless the parts are plain decimals
  const d = lcm(a.d, b.d), an = a.n * (d / a.d), bn = b.n * (d / b.d);
  if (d > 9999n || decimalOnly(d)) {
    const ta = Q.isZero(a) ? "" : sig(Q.toNumber(a), 6), tb = Q.isZero(b) ? "" : sig(Math.abs(Q.toNumber(b)), 6);
    return `${joinParts(ta, tb, Q.sign(b) < 0)} ${p}${unit}`.trim();
  }
  const body = joinParts(an === 0n ? "" : big1(an), bn === 0n ? "" : big1(bn < 0n ? -bn : bn), bn < 0n);
  const text = d === 1n ? body : (an !== 0n && bn !== 0n ? `(${body})/${d}` : `${body}/${d}`);
  return `${text} ${p}${unit}`.trim();
}

// "3 − j4", "−j1", "j2", "5"
function joinParts(a, b, bNeg) {
  const jb = b === "" ? "" : `j${b}`;
  if (a === "" && jb === "") return "0";
  if (jb === "") return a.replace("-", "−");
  if (a === "") return `${bNeg ? "−" : ""}${jb}`;
  return `${a.replace("-", "−")} ${bNeg ? "−" : "+"} ${jb}`;
}

const big1 = (n) => (n < 0n ? `-${-n}` : `${n}`);

// a denominator made of 2s and 5s: the value is a short decimal, so show it that way
function decimalOnly(d) {
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}
function lcm(a, b) {
  let x = a, y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
}

// "1000 rad/s" (plain below 100k, prefixed above)
export function omegaText(w) {
  return w < 1e5 ? `${sig(w, 5)} rad/s` : fmt(w, "rad/s");
}

// "7.071 V∠−45° (peak)": the label that says which kind of amplitude it is
export const scaleWord = (mode) => (mode === "rms" ? "RMS" : "peak");
