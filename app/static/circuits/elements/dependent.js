// Dependent (controlled) sources, the way textbooks draw them: a two-terminal diamond whose
// value is a gain times a voltage or current somewhere else in the circuit.
//   ctrl: "v(R2)"  voltage across part R2 (its pin a minus pin b)
//         "i(R2)"  current through R2 (entering pin a)
//         "v(Vx)"  a labelled node against ground;  "v(Vx, Vy)" between two labelled nodes
//   a leading "-" flips the sign: "-v(R2)".
// E: voltage-controlled voltage source, G: voltage-controlled current source,
// H: current-controlled voltage source, F: current-controlled current source.
// Voltage-type (E, H): pin a is +. Current-type (G, F): the arrow points at pin a.

import { lin, vdiff } from "../solver/lin.js";
import { TWO_PIN, pair } from "./common.js";

const ctrlParam = (dflt) => ({ key: "ctrl", label: "Controlled by", kind: "ctrl", default: dflt,
  hint: "v(R2) for the voltage across R2, i(R2) for the current through it; -v(R2) flips the sign." });
const nameParam = (dflt) => ({ key: "cname", label: "Name of the controlling quantity", kind: "text", default: dflt, optional: true });

function voltageType(type, name, gainLabel, unit, dflt, ctrl, cname) {
  return {
    type, name, prefix: type, pins: TWO_PIN, dependent: true, controls: ctrl.startsWith("v") ? "v" : "i",
    params: [{ key: "gain", label: gainLabel, unit, default: dflt, kind: "value" }, ctrlParam(ctrl), nameParam(cname)],
    branchCount: () => 1,
    pinCurrents: (el, s) => pair(lin(s.F).add(s.br(el), s.F.one)),
    constraints(el, s, ctx) {
      // v(a) - v(b) - gain * control = 0
      const F = s.F, control = s.ctrl(el, ctx).scaled(F.neg(s.p(el, "gain")));
      s.row(s.br(el), vdiff(s, el.nodes[0], el.nodes[1]).plus(control), F.zero);
    },
    dcEdges: () => [[0, 1]],
    zEdges: () => [[0, 1]],
  };
}

function currentType(type, name, gainLabel, unit, dflt, ctrl, cname) {
  return {
    type, name, prefix: type, pins: TWO_PIN, dependent: true, controls: ctrl.startsWith("v") ? "v" : "i",
    params: [{ key: "gain", label: gainLabel, unit, default: dflt, kind: "value" }, ctrlParam(ctrl), nameParam(cname)],
    branchCount: () => 0,
    pinCurrents(el, s, ctx) {
      // current leaves at a: entering at a is -gain * control
      return pair(s.ctrl(el, ctx).scaled(s.F.neg(s.p(el, "gain"))));
    },
    dcEdges: () => [],
    zEdges: () => [],
  };
}

export const E = voltageType("E", "Voltage-controlled voltage source", "Gain μ", "", "2", "v(R1)", "vx");
export const H = voltageType("H", "Current-controlled voltage source", "Transresistance r", "Ω", "1k", "i(R1)", "ix");
export const G = currentType("G", "Voltage-controlled current source", "Transconductance g", "A/V", "1m", "v(R1)", "vx");
export const F = currentType("F", "Current-controlled current source", "Gain β", "", "2", "i(R1)", "ix");

// Parse a control reference. -> {sign, kind: "v"|"i", part?, nodes?: [a, b]} or {error}
export function parseCtrl(text) {
  const m = /^\s*([+-]?)\s*([vViI])\s*\(\s*([^,()]+?)\s*(?:,\s*([^,()]+?)\s*)?\)\s*$/.exec(String(text || ""));
  if (!m) return { error: `“${text}” isn't a control like v(R2) or i(R2).` };
  const sign = m[1] === "-" ? -1 : 1, kind = m[2].toLowerCase(), a = m[3], b = m[4];
  if (kind === "i") return b ? { error: "A current control names one part: i(R2)." } : { sign, kind, part: a };
  return b ? { sign, kind, nodes: [a, b] } : { sign, kind, ref: a };
}
