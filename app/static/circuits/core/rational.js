// Exact fractions on BigInt, so the bench can say 72/13 V instead of 5.538461... V.
// A fraction is a frozen {n, d} with d > 0 and gcd(n, d) = 1.

export class ExactTooBig extends Error {
  constructor() { super("exact fractions grew too large"); this.name = "ExactTooBig"; }
}

const LIMIT_BITS = 4096;  // past this, fall back to floating point (and say so)

function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function bits(x) {
  if (x < 0n) x = -x;
  return x === 0n ? 0 : x.toString(16).length * 4;
}

export function frac(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new RangeError("division by zero");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  if (g > 1n) { n /= g; d /= g; }
  if (bits(n) > LIMIT_BITS || bits(d) > LIMIT_BITS) throw new ExactTooBig();
  return Object.freeze({ n, d });
}

export const ZERO = frac(0n), ONE = frac(1n), MINUS_ONE = frac(-1n);

export const add = (a, b) => (a.d === b.d ? frac(a.n + b.n, a.d) : frac(a.n * b.d + b.n * a.d, a.d * b.d));
export const sub = (a, b) => (a.d === b.d ? frac(a.n - b.n, a.d) : frac(a.n * b.d - b.n * a.d, a.d * b.d));
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const neg = (a) => Object.freeze({ n: -a.n, d: a.d });
export const isZero = (a) => a.n === 0n;
export const sign = (a) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const cmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
export const isInteger = (a) => a.d === 1n;

export function toNumber(a) {
  let { n, d } = a;
  // keep both under ~1000 bits so Number() can't overflow to Infinity/Infinity
  const extra = Math.min(bits(n), bits(d)) - 900;
  if (extra > 0) { n >>= BigInt(extra); d >>= BigInt(extra); }
  return Number(n) / Number(d);
}

export function toString(a) {
  return a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`;
}

export function fromString(s) {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(String(s).trim());
  if (!m) throw new SyntaxError(`not a fraction: ${s}`);
  return frac(BigInt(m[1]), m[2] ? BigInt(m[2]) : 1n);
}

// Exact value of a decimal like "4.7", "-0.25" or "3e-3" (no prefixes here).
export function fromDecimal(text) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const whole = m[2] || "0", part = m[3] || "", exp = Number(m[4] || 0);
  let n = BigInt(whole + part), d = 10n ** BigInt(part.length);
  if (exp > 0) n *= 10n ** BigInt(exp);
  if (exp < 0) d *= 10n ** BigInt(-exp);
  if (m[1] === "-") n = -n;
  return frac(n, d);
}

// The exact fraction of a JS number that came from a short decimal (e.g. a slider value).
export function fromNumber(x) {
  if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
  if (Number.isInteger(x)) return frac(BigInt(x));
  return fromDecimal(String(x).replace(/^(-?)\./, "$10."));
}

// Is this fraction worth showing as a fraction? (small denominator, not just a decimal)
export function isFriendly(a, maxDen = 1000n) {
  if (a.d === 1n) return true;
  let d = a.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d !== 1n && a.d <= maxDen && bits(a.n) <= 40;
}
