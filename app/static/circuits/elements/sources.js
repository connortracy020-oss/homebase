// Independent sources. Voltage source: pin a is +. Current source: the arrow points at pin a,
// so its current leaves the source at a (into the circuit) and returns at b.
// Turned off (superposition, Thevenin): a voltage source becomes a short, a current source open.

import { lin, vdiff } from "../solver/lin.js";
import { TWO_PIN, pair, waveValue, fieldValue, WAVES } from "./common.js";

const waveParams = (q, unit, dflt) => [
  { key: "wave", label: "Waveform", kind: "choice", options: WAVES, default: "dc",
    labels: { dc: "Constant", step: "Step", pulse: "Pulse" } },
  { key: q, label: unit === "V" ? "Voltage" : "Current", unit, default: dflt, kind: "value", show: (p) => p.wave === "dc" },
  { key: `${q}0`, label: "Before / low", unit, default: "0", kind: "value", show: (p) => p.wave !== "dc" },
  { key: `${q}1`, label: "After / high", unit, default: dflt, kind: "value", show: (p) => p.wave !== "dc" },
  { key: "at", label: "Steps at", unit: "s", default: "0", kind: "value", show: (p) => p.wave === "step" },
  { key: "td", label: "Delay", unit: "s", default: "0", kind: "value", show: (p) => p.wave === "pulse" },
  { key: "tr", label: "Rise time", unit: "s", default: "0", kind: "value", nonneg: true, show: (p) => p.wave === "pulse" },
  { key: "tf", label: "Fall time", unit: "s", default: "0", kind: "value", nonneg: true, show: (p) => p.wave === "pulse" },
  { key: "pw", label: "Width", unit: "s", default: "1m", kind: "value", nonneg: true, show: (p) => p.wave === "pulse" },
  { key: "per", label: "Period", unit: "s", default: "2m", kind: "value", nonneg: true, show: (p) => p.wave === "pulse" },
];

function value(el, s, ctx, q) {
  const F = s.F;
  if (ctx.off?.(el)) return F.zero;
  return fieldValue(F, waveValue(el.params, q, ctx.when));
}

export const V = {
  type: "V", name: "Voltage source", prefix: "V", pins: TWO_PIN, independent: true,
  params: waveParams("V", "V", "5"),
  branchCount: () => 1,
  pinCurrents: (el, s) => pair(lin(s.F).add(s.br(el), s.F.one)),
  constraints(el, s, ctx) {
    s.row(s.br(el), vdiff(s, el.nodes[0], el.nodes[1]), value(el, s, ctx, "V"));
  },
  dcEdges: () => [[0, 1]],
  zEdges: () => [[0, 1]],
};

export const I = {
  type: "I", name: "Current source", prefix: "I", pins: TWO_PIN, independent: true,
  params: waveParams("I", "A", "1m"),
  branchCount: () => 0,
  pinCurrents(el, s, ctx) {
    // current enters the source at b and leaves at a: entering at a is -I
    return pair(lin(s.F).addK(s.F.neg(value(el, s, ctx, "I"))));
  },
  dcEdges: () => [],
  zEdges: () => [],
};
