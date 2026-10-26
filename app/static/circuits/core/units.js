// Reading and writing values with SI prefixes: "4.7k", "2.2u", "2.2µ", "1meg", "4k7", "10 mA".
// Parsing is exact (a fraction), so typed values never pick up float noise.

import { frac, fromDecimal, mul, toNumber, isFriendly, toString as fracString, div, neg } from "./rational.js";

// prefix -> power of ten. "M" alone is ambiguous (SPICE: milli, everyone else: mega), so we ask.
const PREFIX = { T: 12, G: 9, meg: 6, MEG: 6, Meg: 6, k: 3, K: 3, m: -3, u: -6, "µ": -6, "μ": -6, n: -9, p: -12, f: -15 };
const UNIT_WORDS = {
  "Ω": "Ω", ohm: "Ω", ohms: "Ω", R: "Ω", V: "V", v: "V", A: "A", a: "A", F: "F", f: "F", H: "H", h: "H",
  s: "s", S: "A/V", Hz: "Hz", hz: "Hz", W: "W", w: "W", "A/V": "A/V", "V/A": "Ω", "V/V": "", "A/A": "",
  "rad/s": "rad/s", "°": "°", deg: "°",
};
const PREFIX_RE = "(T|G|meg|MEG|Meg|M|k|K|m|u|µ|μ|n|p|f)?";

function pow10(e) {
  return e >= 0 ? frac(10n ** BigInt(e)) : frac(1n, 10n ** BigInt(-e));
}

// -> {ok: true, exact, value, unit, text} or {ok: false, error, ambiguous?: {milli, mega}}
export function parseValue(raw, unit = "") {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ").replace("−", "-");
  if (text === "") return { ok: false, error: "Enter a value." };
  if (/^[+-]?(inf|∞|infinity)$/i.test(text)) return { ok: false, error: "Use a finite value." };
  // "4k7" style: digits, prefix, digits (the prefix marks the decimal point)
  let m = new RegExp(`^([+-]?\\d+)${PREFIX_RE.replace("?", "")}(\\d+)\\s*(.*)$`).exec(text);
  let number, prefix, rest;
  if (m && m[2] !== "M") { number = `${m[1]}.${m[3]}`; prefix = m[2]; rest = m[4]; }
  else {
    m = new RegExp(`^([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*${PREFIX_RE}\\s*(.*)$`).exec(text);
    if (!m) return { ok: false, error: `Couldn't read “${text}”. Try 4.7k, 2.2u or 10m.` };
    [, number, prefix, rest] = m;
  }
  rest = (rest || "").trim();
  // SPICE rules for letters: "1f" is femto, "1F" is farads, "1m" is milli
  if (rest) {
    const u = UNIT_WORDS[rest] ?? UNIT_WORDS[rest.toLowerCase()];
    if (u === undefined) return { ok: false, error: `Couldn't read “${text}”: unknown unit “${rest}”.` };
    if (unit && u !== "" && u !== unit) return { ok: false, error: `That's in ${u}, but this value is in ${unit}.` };
  }
  let exact = fromDecimal(number);
  if (exact === null) return { ok: false, error: `Couldn't read “${text}”.` };
  if (prefix === "M") {
    const milli = mul(exact, pow10(-3)), mega = mul(exact, pow10(6));
    return { ok: false, error: `Is “M” milli or mega?`, ambiguous: { milli: `${number}m`, mega: `${number}meg` }, milli, mega };
  }
  if (prefix) exact = mul(exact, pow10(PREFIX[prefix]));
  return { ok: true, exact, value: toNumber(exact), unit, text };
}

// ---- display -------------------------------------------------------------------------

const DISPLAY = [[12, "T"], [9, "G"], [6, "M"], [3, "k"], [0, ""], [-3, "m"], [-6, "µ"], [-9, "n"], [-12, "p"], [-15, "f"]];

export function prefixFor(x) {
  const ax = Math.abs(x);
  if (!ax || !Number.isFinite(ax)) return [0, ""];
  for (const [e, p] of DISPLAY) if (ax >= 10 ** e * 0.9995) return [e, p];
  return DISPLAY[DISPLAY.length - 1];
}

// 4 significant figures, trailing zeros trimmed: 5.538, 12, 0.4615
export function sig(x, digits = 4) {
  if (x === 0 || !Number.isFinite(x)) return Number.isFinite(x) ? "0" : String(x);
  const s = Number(x.toPrecision(digits));
  const ax = Math.abs(s);
  const out = ax >= 1e5 || ax < 1e-4 ? s.toExponential(digits - 1).replace(/\.?0+e/, "e") : String(s);
  return out.replace("-", "−");
}

// 0.0012 A -> "1.2 mA"; with unit "" -> "1.2 m"
export function fmt(x, unit = "", digits = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (Math.abs(x) < 1e-15) return `0 ${unit}`.trim();
  const [e, p] = prefixFor(x);
  return `${sig(x / 10 ** e, digits)} ${p}${unit}`.trim();
}

// An exact value shown in the same prefix as its decimal: {main: "72/13 V", decimal: "5.538 V"}
// main is the fraction only when it's a friendly one (small denominator, not a plain decimal).
export function fmtExact(exact, unit = "") {
  const x = toNumber(exact);
  const decimal = fmt(x, unit);
  if (exact.n === 0n) return { main: `0 ${unit}`.trim(), decimal: null };
  const [e, p] = prefixFor(x);
  const scaled = e >= 0 ? div(exact, pow10(e)) : mul(exact, pow10(-e));
  if (scaled.d === 1n) return { main: `${fracString(scaled).replace("-", "−")} ${p}${unit}`.trim(), decimal: null };
  if (!isFriendly(scaled)) return { main: decimal, decimal: null };
  const s = scaled.n < 0n ? `−${fracString(neg(scaled))}` : fracString(scaled);
  return { main: `${s} ${p}${unit}`.trim(), decimal };
}

// What a typed value was read as, for the editor: "4.7 kΩ"
export function describeParsed(parsed, unit) {
  return parsed.ok ? fmt(parsed.value, unit) : parsed.error;
}

// SPICE number text: 4700 -> "4.7k", 2e6 -> "2meg" (SPICE reads "M" as milli)
export function spiceNumber(x) {
  if (x === 0) return "0";
  const [e, p] = prefixFor(x);
  const s = Number((x / 10 ** e).toPrecision(12)).toString();
  return s + (p === "M" ? "meg" : p === "µ" ? "u" : p);
}

// a short value text for fields and sliders: 2345.6 -> "2.35k", 0.0047 -> "4.7m"
export function siText(x, digits = 3) {
  if (!Number.isFinite(x)) return "0";
  if (x === 0) return "0";
  const [e, p] = prefixFor(x);
  const v = Number((x / 10 ** e).toPrecision(digits));
  return `${v}${p === "M" ? "meg" : p === "µ" ? "u" : p}`;
}
