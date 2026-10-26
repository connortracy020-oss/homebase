// Ground, net labels, switches and ideal meters.
// Ground, labels and switches don't enter the equations: they decide which points are the
// same node (a closed switch joins its terminals, like a wire).

import { lin, vdiff } from "../solver/lin.js";
import { TWO_PIN, pair, zeroPair } from "./common.js";

export const GND = {
  type: "GND", name: "Ground", prefix: "GND", pins: [{ name: "g", x: 0, y: 0 }], topological: true, params: [],
};

export const LBL = {
  type: "LBL", name: "Net label", prefix: "LBL", pins: [{ name: "n", x: 0, y: 0 }], topological: true,
  params: [{ key: "name", label: "Name", kind: "text", default: "Vout" }],
};

// Single-pole switch: closed or open; optionally flips at time `at`.
export const SW = {
  type: "SW", name: "Switch", prefix: "S", pins: TWO_PIN, topological: true,
  params: [
    { key: "state", label: "Position", kind: "choice", options: ["closed", "open"], default: "closed",
      labels: { closed: "Closed", open: "Open" } },
    { key: "at", label: "Flips at", unit: "s", default: "", kind: "value", optional: true, nonneg: true,
      hint: "Empty means it doesn't move during a transient. 0 means at t = 0." },
  ],
};

// Two-way switch: common terminal c connects to throw 1 or 2; optionally flips at time `at`.
export const SW2 = {
  type: "SW2", name: "Two-way switch", prefix: "S", topological: true,
  pins: [{ name: "c", x: 0, y: 0 }, { name: "1", x: 4, y: -1 }, { name: "2", x: 4, y: 1 }],
  params: [
    { key: "state", label: "Position", kind: "choice", options: ["1", "2"], default: "1",
      labels: { 1: "To 1", 2: "To 2" } },
    { key: "at", label: "Flips at", unit: "s", default: "", kind: "value", optional: true, nonneg: true,
      hint: "Empty means it doesn't move during a transient. 0 means at t = 0." },
  ],
};

// Ammeter: an ideal 0 Ω branch. Reads the current entering its + terminal (pin a).
export const AM = {
  type: "AM", name: "Ammeter", prefix: "AM", pins: TWO_PIN, meter: "i", params: [],
  branchCount: () => 1,
  pinCurrents: (el, s) => pair(lin(s.F).add(s.br(el), s.F.one)),
  constraints: (el, s) => s.row(s.br(el), vdiff(s, el.nodes[0], el.nodes[1]), s.F.zero),
  dcEdges: () => [[0, 1]],
  zEdges: () => [[0, 1]],
};

// Voltmeter: draws no current. Reads v(+) − v(−) (pin a minus pin b).
export const VM = {
  type: "VM", name: "Voltmeter", prefix: "VM", pins: TWO_PIN, meter: "v", params: [],
  branchCount: () => 0,
  pinCurrents: (el, s) => zeroPair(s.F),
  dcEdges: () => [],
  zEdges: () => [],
};

// which pins a switch joins at a given position
export function switchJoins(def, state) {
  if (def.type === "SW") return state === "closed" ? [[0, 1]] : [];
  return state === "2" ? [[0, 2]] : [[0, 1]];
}

export function toggled(def, state) {
  if (def.type === "SW") return state === "closed" ? "open" : "closed";
  return state === "1" ? "2" : "1";
}
