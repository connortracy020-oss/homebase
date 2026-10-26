// Three-phase sources: three sine sources 120° apart, at one frequency.
//   V3Y  Y-connected, pins a, b, c and the neutral n: v_an = V cos(ωt + θ), v_bn 120° behind
//        (abc sequence; acb swaps b and c). V is the phase (line-to-neutral) voltage.
//   V3D  Δ-connected, pins a, b, c: v_ab = V_L cos(ωt + θ), v_bc and v_ca 120° behind and ahead.
//        V_L is the line voltage. (Only two of the three windings are in the equations: the
//        third is their sum, and an ideal Δ's circulating current isn't defined anyway.)
// Amplitudes are RMS by default, as power systems give them.

import { lin, vdiff } from "../solver/lin.js";
import { sineOmega, sinePeak } from "./common.js";

const ABC = [{ name: "a", x: 4, y: 0 }, { name: "b", x: 4, y: 2 }, { name: "c", x: 4, y: 4 }];

const params = (label, dflt) => [
  { key: "V3m", label, unit: "V", default: dflt, kind: "value", nonneg: true },
  { key: "scale", label: "Amplitude is", kind: "choice", options: ["rms", "peak"], default: "rms", labels: { rms: "RMS", peak: "Peak" } },
  { key: "funit", label: "Frequency as", kind: "choice", options: ["Hz", "rad/s"], default: "Hz", labels: { Hz: "f (Hz)", "rad/s": "ω (rad/s)" } },
  { key: "f", label: "Frequency f", unit: "Hz", default: "60", kind: "value", positive: true, show: (p) => p.funit !== "rad/s" },
  { key: "w", label: "Angular frequency ω", unit: "rad/s", default: "377", kind: "value", positive: true, show: (p) => p.funit === "rad/s" },
  { key: "ph", label: "Phase of a", unit: "°", default: "0", kind: "value" },
  { key: "seq", label: "Sequence", kind: "choice", options: ["abc", "acb"], default: "abc", labels: { abc: "abc (positive)", acb: "acb (negative)" } },
];

// the angle of winding k (0, 1, 2) in degrees
function angleOf(p, k) {
  const step = p.seq?.text === "acb" ? 120 : -120;
  return p.ph.value + step * k;
}

// winding k's value: its phasor in AC, its instantaneous value in a time step, 0 at DC
function windingValue(el, s, ctx, k) {
  const F = s.F, p = el.params;
  if (ctx.off?.(el)) return F.zero;
  if (ctx.mode === "ac") return ctx.drive(el, F, k) ?? F.zero;
  const t = ctx.when?.t;
  if (!Number.isFinite(t) || ctx.when?.average) return F.zero;
  const w = sineOmega(p).value, a = sinePeak(p, "V3").value;
  return F.num(a * Math.cos(w * t + (angleOf(p, k) * Math.PI) / 180));
}

export const V3Y = {
  type: "V3Y", name: "Three-phase source (Y)", prefix: "V", independent: true, threePhase: true,
  pins: [...ABC, { name: "n", x: 0, y: 2 }],
  params: params("Phase voltage V (line to neutral)", "120"),
  branchCount: () => 3,
  pinCurrents(el, s) {
    const F = s.F, br = [0, 1, 2].map((k) => lin(F).add(s.br(el, k), F.one));
    const n = lin(F);
    for (const b of br) n.plus(b, F.neg(F.one));
    return [...br, n];
  },
  constraints(el, s, ctx) {
    for (let k = 0; k < 3; k++) s.row(s.br(el, k), vdiff(s, el.nodes[k], el.nodes[3]), windingValue(el, s, ctx, k));
  },
  dcEdges: () => [[0, 3], [1, 3], [2, 3]],
  zEdges: () => [[0, 3], [1, 3], [2, 3]],
};

export const V3D = {
  type: "V3D", name: "Three-phase source (Δ)", prefix: "V", independent: true, threePhase: true,
  pins: ABC,
  params: params("Line voltage V_L", "208"),
  branchCount: () => 2,
  pinCurrents(el, s) {
    const F = s.F, ab = lin(F).add(s.br(el, 0), F.one), bc = lin(F).add(s.br(el, 1), F.one);
    return [ab, ab.neg().plus(bc), bc.neg()];
  },
  constraints(el, s, ctx) {
    s.row(s.br(el, 0), vdiff(s, el.nodes[0], el.nodes[1]), windingValue(el, s, ctx, 0));
    s.row(s.br(el, 1), vdiff(s, el.nodes[1], el.nodes[2]), windingValue(el, s, ctx, 1));
  },
  dcEdges: () => [[0, 1], [1, 2]],
  zEdges: () => [[0, 1], [1, 2]],
};

export { angleOf };
