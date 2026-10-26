// The number systems the solver runs over. Assembly and LU are written once against this
// interface: FLOAT for speed (transients, sweeps) and EXACT fractions for DC answers.

import * as Q from "../core/rational.js";

export const FLOAT = Object.freeze({
  name: "float",
  exact: false,
  zero: 0,
  one: 1,
  of: (p) => p.value,           // a parsed parameter {exact, value}
  num: (x) => x,                // a plain JS number
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  neg: (a) => -a,
  isZero: (a) => a === 0,
  mag: (a) => Math.abs(a),
  toNumber: (a) => a,
  str: (a) => String(a),
});

export const EXACT = Object.freeze({
  name: "exact",
  exact: true,
  zero: Q.ZERO,
  one: Q.ONE,
  of: (p) => p.exact,
  num: (x) => Q.fromNumber(x),
  add: Q.add,
  sub: Q.sub,
  mul: Q.mul,
  div: Q.div,
  neg: Q.neg,
  isZero: Q.isZero,
  mag: (a) => Math.abs(Q.toNumber(a)),
  toNumber: Q.toNumber,
  str: Q.toString,
});
