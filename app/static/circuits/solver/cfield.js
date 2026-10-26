// Complex numbers for AC (phasor) analysis, in the same field interface as field.js so the
// assembly and LU code run unchanged: CFLOAT for speed (Bode sweeps), CEXACT (fractions in
// both parts, a + bj) when ω and every value are exact, so a phasor can read (12 − 16j)/5 V.
// Engineers write j for √−1, and phasors here use the cosine reference: v(t) = Re(V e^{jωt}).

import * as Q from "../core/rational.js";

const c = (re, im) => ({ re, im });

export const CFLOAT = Object.freeze({
  name: "complex", exact: false, complex: true,
  zero: c(0, 0), one: c(1, 0), j: c(0, 1),
  of: (p) => c(p.value, 0),          // a parsed parameter {exact, value}
  num: (x) => c(x, 0),
  cnum: (re, im) => c(re, im),
  add: (a, b) => c(a.re + b.re, a.im + b.im),
  sub: (a, b) => c(a.re - b.re, a.im - b.im),
  mul: (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re),
  div(a, b) {
    // Smith's method: no overflow or needless rounding when |b| is very large or small
    if (Math.abs(b.re) >= Math.abs(b.im)) {
      const r = b.im / b.re, d = b.re + b.im * r;
      return c((a.re + a.im * r) / d, (a.im - a.re * r) / d);
    }
    const r = b.re / b.im, d = b.re * r + b.im;
    return c((a.re * r + a.im) / d, (a.im * r - a.re) / d);
  },
  neg: (a) => c(-a.re, -a.im),
  conj: (a) => c(a.re, -a.im),
  isZero: (a) => a.re === 0 && a.im === 0,
  mag: (a) => Math.hypot(a.re, a.im),
  toComplex: (a) => a,
  toNumber: (a) => a.re,
  exactParts: () => null,
});

const QZ = Q.ZERO;
const q = (re, im) => Object.freeze({ re, im });

export const CEXACT = Object.freeze({
  name: "complex exact", exact: true, complex: true,
  zero: q(QZ, QZ), one: q(Q.ONE, QZ), j: q(QZ, Q.ONE),
  of: (p) => q(p.exact, QZ),
  num: (x) => q(Q.fromNumber(x), QZ),
  cnum: (re, im) => q(Q.fromNumber(re), Q.fromNumber(im)),
  fromQ: (re, im = QZ) => q(re, im),
  add: (a, b) => q(Q.add(a.re, b.re), Q.add(a.im, b.im)),
  sub: (a, b) => q(Q.sub(a.re, b.re), Q.sub(a.im, b.im)),
  mul: (a, b) => q(Q.sub(Q.mul(a.re, b.re), Q.mul(a.im, b.im)), Q.add(Q.mul(a.re, b.im), Q.mul(a.im, b.re))),
  div(a, b) {
    const d = Q.add(Q.mul(b.re, b.re), Q.mul(b.im, b.im));
    return q(Q.div(Q.add(Q.mul(a.re, b.re), Q.mul(a.im, b.im)), d), Q.div(Q.sub(Q.mul(a.im, b.re), Q.mul(a.re, b.im)), d));
  },
  neg: (a) => q(Q.neg(a.re), Q.neg(a.im)),
  conj: (a) => q(a.re, Q.neg(a.im)),
  isZero: (a) => Q.isZero(a.re) && Q.isZero(a.im),
  mag: (a) => Math.hypot(Q.toNumber(a.re), Q.toNumber(a.im)),
  toComplex: (a) => c(Q.toNumber(a.re), Q.toNumber(a.im)),
  toNumber: (a) => Q.toNumber(a.re),
  exactParts: (a) => [Q.toString(a.re), Q.toString(a.im)],
});

// ---- plain complex numbers ({re, im}) for views and results ----

export const cx = {
  of: c,
  add: CFLOAT.add, sub: CFLOAT.sub, mul: CFLOAT.mul, div: CFLOAT.div, neg: CFLOAT.neg, conj: CFLOAT.conj,
  abs: CFLOAT.mag,
  scale: (a, k) => c(a.re * k, a.im * k),
  arg: (a) => Math.atan2(a.im, a.re),
  polar: (r, rad) => c(r * Math.cos(rad), r * Math.sin(rad)),
  // the instantaneous value of a phasor at time t: Re(X e^{jωt})
  at: (a, omega, t) => a.re * Math.cos(omega * t) - a.im * Math.sin(omega * t),
};

export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

// A phasor at an angle in degrees, exact when the angle is a multiple of 90°.
export function phasorOf(F, magnitude, degrees) {
  const turns = (((degrees % 360) + 360) % 360) / 90;
  if (F.exact && magnitude.exact && Number.isInteger(turns)) {
    const m = magnitude.exact, z = Q.ZERO;
    return [q(m, z), q(z, m), q(Q.neg(m), z), q(z, Q.neg(m))][turns];
  }
  if (F.exact) return null;  // irrational parts: the caller falls back to floats
  return F.cnum(magnitude.value * Math.cos(rad(degrees)), magnitude.value * Math.sin(rad(degrees)));
}

// "4.472∠−63.43°"-style parts for display: {mag, deg}
export function polarOf(z) {
  const m = Math.hypot(z.re, z.im);
  return { mag: m, deg: m < 1e-300 ? 0 : deg(Math.atan2(z.im, z.re)) };
}
