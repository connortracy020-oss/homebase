// Text shown beside parts: "2 kΩ", "12 V", "step 0 → 5 V", "2vₓ".

import { parseValue, fmt, sig } from "../core/units.js";

const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ" };

// "vx" -> "vₓ", "Vout" -> "Vₒᵤₜ" isn't possible in unicode, so only short names get subscripts
export function subscript(name) {
  const m = /^([A-Za-z])([0-9a-z]{1,3})$/.exec(String(name || ""));
  if (!m || ![...m[2]].every((c) => SUB[c])) return String(name || "");
  return m[1] + [...m[2]].map((c) => SUB[c]).join("");
}

function val(text, unit) {
  const p = parseValue(text, unit);
  return p.ok ? fmt(p.value, unit) : `${text}?`;
}

const num = (text) => { const p = parseValue(text, ""); return p.ok ? sig(p.value) : `${text}?`; };

export function valueText(part) {
  const p = part.params || {};
  switch (part.type) {
    case "R": return val(p.R, "Ω");
    case "C": return val(p.C, "F");
    case "L": return val(p.L, "H");
    case "V": case "I": {
      const u = part.type === "V" ? "V" : "A", q = part.type;
      if (!p.wave || p.wave === "dc") return val(p[q], u);
      if (p.wave === "sine") {
        const ph = parseValue(p.ph ?? "0", "°"), f = p.funit === "Hz" ? val(p.f ?? "60", "Hz") : val(p.w ?? "1k", "rad/s");
        return `${val(p[`${q}m`] ?? "1", u)}${p.scale === "rms" ? " rms" : ""}${ph.ok && ph.value ? `∠${sig(ph.value)}°` : ""}, ${f}`;
      }
      const lo = val(p[`${q}0`], u), hi = val(p[`${q}1`], u);
      return p.wave === "step" ? `${lo} → ${hi}` : `pulse ${lo} / ${hi}`;
    }
    case "E": case "F": case "G": case "H": {
      const g = num(p.gain), name = subscript(p.cname || (part.type === "E" || part.type === "G" ? "vx" : "ix"));
      return `${g === "1" ? "" : g === "−1" ? "−" : g}${name}`;
    }
    case "OA": return p.model === "gain" ? `A = ${num(p.A)}` : "";
    default: return "";
  }
}
