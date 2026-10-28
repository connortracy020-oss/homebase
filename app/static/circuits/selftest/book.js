// Ulaby exercises drawn on the bench the way their figures show them (Ulaby, Maharbiz & Furse,
// Circuit Analysis and Design). Their problem pages get "Open on the Circuit Bench" from these:
// scripts/export_bench_book.mjs copies them to content/ece201/bench.json, which the server
// reads. The self-test (cases.js) checks each drawing against the published answer.

import { migrate } from "../core/doc.js";

// the exercise problems' statement PDF (a book exercise is matched by it and its label)
export const BOOK_PDF = "library/ece201/ulaby/exercise_sol.pdf";

// a two-terminal part from pin a to pin b (4 grid units apart, in a line)
export function two(id, type, a, b, params = {}) {
  const rot = { "4,0": 0, "0,4": 1, "-4,0": 2, "0,-4": 3 }[`${b[0] - a[0]},${b[1] - a[1]}`];
  if (rot === undefined) throw new Error(`${id}: pins must be 4 apart in a line`);
  return { id, type, x: a[0], y: a[1], rot, params };
}
export const at = (id, type, p, params = {}) => ({ id, type, x: p[0], y: p[1], rot: 0, params });
export const path = (...pts) => pts.slice(1).map((p, i) => ({ a: pts[i], b: p }));
export const circuit = (parts, ...paths) => migrate({ parts, wires: paths.flat().map((w, i) => ({ id: `w${i + 1}`, ...w })) });

export const e2_6 = () => circuit([
  two("R4", "R", [0, 9], [0, 5], { R: "4" }),             // Ix flows up through it
  two("R2a", "R", [1, 4], [5, 4], { R: "2" }),
  two("I1", "I", [5, 0], [1, 0], { I: "4" }),             // arrow toward node 2
  two("R8", "R", [6, 5], [6, 9], { R: "8" }),
  two("R2b", "R", [7, 4], [11, 4], { R: "2" }),
  two("H1", "H", [12, 9], [12, 5], { gain: "2", ctrl: "i(R4)", cname: "Ix" }),  // + at the bottom
  at("G", "GND", [6, 10]),
], path([0, 5], [0, 4], [1, 4]), path([0, 4], [0, 0], [1, 0]), path([5, 0], [6, 0], [6, 4]), path([5, 4], [6, 4], [7, 4]),
path([6, 4], [6, 5]), path([11, 4], [12, 4], [12, 5]), path([0, 9], [0, 10], [12, 10], [12, 9]), path([6, 9], [6, 10]));

export const e3_1 = () => circuit([
  two("R4", "R", [0, 3], [0, 7], { R: "4" }), two("R6", "R", [2, 0], [6, 0], { R: "6" }),
  two("R10", "R", [8, 1], [8, 5], { R: "10" }), two("V1", "V", [8, 6], [8, 10], { V: "24" }),
  two("R1", "R", [14, 3], [14, 7], { R: "1" }), at("G", "GND", [8, 10]),
], path([0, 3], [0, 0], [2, 0]), path([6, 0], [14, 0], [14, 3]), path([8, 0], [8, 1]), path([8, 5], [8, 6]),
path([0, 7], [0, 10], [14, 10], [14, 7]));

export const e3_2 = () => circuit([
  two("V1", "V", [0, 3], [0, 7], { V: "9" }), two("R20", "R", [1, 0], [5, 0], { R: "20" }),
  two("R10", "R", [6, 1], [6, 5], { R: "10" }),
  two("E1", "E", [6, 6], [6, 10], { gain: "0.5", ctrl: "v(R20)", cname: "Va" }),
  two("R40", "R", [12, 3], [12, 7], { R: "40" }), at("G", "GND", [6, 10]),
], path([0, 3], [0, 0], [1, 0]), path([5, 0], [12, 0], [12, 3]), path([6, 0], [6, 1]), path([6, 5], [6, 6]),
path([0, 7], [0, 10], [12, 10], [12, 7]));

export const e3_3 = () => circuit([
  two("I1", "I", [0, 5], [0, 9], { I: "2" }), two("R2", "R", [6, 5], [6, 9], { R: "2" }),
  two("R10", "R", [7, 4], [11, 4], { R: "10" }), two("V12", "V", [11, 0], [7, 0], { V: "12" }),
  two("R4a", "R", [12, 5], [12, 9], { R: "4" }), two("R4b", "R", [13, 4], [17, 4], { R: "4" }),
  two("V20", "V", [18, 5], [18, 9], { V: "20" }), at("G", "GND", [6, 10]),
], path([0, 5], [0, 4], [6, 4], [7, 4]), path([6, 4], [6, 5]), path([6, 4], [6, 0], [7, 0]), path([11, 0], [12, 0], [12, 4]),
path([11, 4], [12, 4], [13, 4]), path([12, 4], [12, 5]), path([17, 4], [18, 4], [18, 5]),
path([0, 9], [0, 10], [18, 10], [18, 9]), path([6, 9], [6, 10]), path([12, 9], [12, 10]));

export const e3_4 = () => circuit([
  two("V1", "V", [0, 3], [0, 7], { V: "12" }), two("R4a", "R", [1, 0], [5, 0], { R: "4" }),
  two("R4b", "R", [6, 3], [6, 7], { R: "4" }), two("I1", "I", [12, 7], [12, 3], { I: "3" }),
  at("G", "GND", [0, 10]),
], path([0, 3], [0, 0], [1, 0]), path([5, 0], [12, 0], [12, 3]), path([6, 0], [6, 3]),
path([0, 7], [0, 10], [12, 10], [12, 7]), path([6, 7], [6, 10]));

export const e3_5 = () => circuit([
  two("V1", "V", [0, 3], [0, 7], { V: "60" }), two("R4", "R", [1, 0], [5, 0], { R: "4" }),
  two("R6", "R", [6, 0], [10, 0], { R: "6" }), two("R20", "R", [12, 3], [12, 7], { R: "20" }),
  two("F1", "F", [18, 7], [18, 3], { gain: "0.5", ctrl: "i(R6)", cname: "I1" }), at("G", "GND", [0, 10]),
], path([0, 3], [0, 0], [1, 0]), path([5, 0], [6, 0]), path([10, 0], [18, 0], [18, 3]), path([12, 0], [12, 3]),
path([0, 7], [0, 10], [18, 10], [18, 7]), path([12, 7], [12, 10]));

// Figures E3-6 and E3-9 are the same circuit
export const e3_6 = () => circuit([
  two("R2", "R", [0, 2], [0, 6], { R: "2" }), two("I4", "I", [6, 2], [6, 6], { I: "4" }),
  two("R3", "R", [7, 0], [11, 0], { R: "3" }), two("I3", "I", [12, 6], [12, 2], { I: "3" }),
  two("R5", "R", [18, 2], [18, 6], { R: "5" }), at("G", "GND", [0, 8]),
], path([0, 2], [0, 0], [7, 0]), path([6, 0], [6, 2]), path([11, 0], [18, 0], [18, 2]), path([12, 0], [12, 2]),
path([0, 6], [0, 8], [18, 8], [18, 6]), path([6, 6], [6, 8]), path([12, 6], [12, 8]));

export function e3_12(load) {  // Figure E3-12, with or without the 1 Ω load between a and b
  return circuit([
    two("V20", "V", [0, 7], [0, 11], { V: "20" }), two("R5a", "R", [0, 2], [0, 6], { R: "5" }),
    two("R5b", "R", [1, 0], [5, 0], { R: "5" }), two("R3", "R", [6, 1], [6, 5], { R: "3" }),
    two("R2", "R", [6, 7], [6, 11], { R: "2" }), two("I5", "I", [11, 7], [11, 11], { I: "5" }),
    two("R06", "R", [7, 0], [11, 0], { R: "0.6" }),
    at("Ta", "LBL", [16, 0], { name: "a" }), at("Tb", "LBL", [16, 6], { name: "b" }), at("G", "GND", [0, 12]),
    ...(load ? [two("RL", "R", [16, 1], [16, 5], { R: "1" })] : []),
  ], path([0, 2], [0, 0], [1, 0]), path([0, 6], [0, 7]), path([0, 11], [0, 12], [11, 12], [11, 11]), path([5, 0], [6, 0], [7, 0]),
  path([6, 0], [6, 1]), path([6, 5], [6, 6], [6, 7]), path([6, 6], [16, 6]), path([11, 6], [11, 7]), path([6, 11], [6, 12]),
  path([11, 0], [16, 0]), load ? [...path([16, 0], [16, 1]), ...path([16, 5], [16, 6])] : []);
}

export const e3_13 = () => circuit([
  two("I2", "I", [0, 5], [0, 9], { I: "2" }), two("R10", "R", [6, 5], [6, 9], { R: "10" }),
  two("R3", "R", [7, 4], [11, 4], { R: "3" }),
  two("F1", "F", [7, 0], [11, 0], { gain: "3", ctrl: "i(R10)", cname: "I" }),  // arrow toward node 1
  at("Ta", "LBL", [16, 4], { name: "a" }), at("Tb", "LBL", [16, 10], { name: "b" }), at("G", "GND", [0, 10]),
], path([0, 5], [0, 4], [6, 4], [7, 4]), path([6, 4], [6, 5]), path([6, 4], [6, 0], [7, 0]), path([11, 0], [12, 0], [12, 4]),
path([11, 4], [12, 4], [16, 4]), path([0, 9], [0, 10], [16, 10]), path([6, 9], [6, 10]));

// Exercise 4-6's difference amplifier (Figure 4-15) with R2, R3 and R4 as given; R1 and v1 are
// what the exercise asks for
export const AMP_OUT = [20, 6];  // where vo is
export const amp = ({ v2, R1, v1 }) => circuit([
  at("U1", "OA", [14, 6]),  // - input (14, 5), + input (14, 7), output (19, 6)
  two("R1", "R", [5, 5], [9, 5], { R: R1 }), two("R2", "R", [11, 2], [15, 2], { R: "20k" }),
  two("R3", "R", [8, 9], [12, 9], { R: "5k" }), two("R4", "R", [13, 10], [13, 14], { R: "6k" }),
  two("V1", "V", [2, 8], [2, 12], { V: v1 }), two("V2", "V", [7, 10], [7, 14], { V: v2 }),
  at("Lo", "LBL", AMP_OUT, { name: "vo" }), at("G", "GND", [2, 14]),
], path([2, 8], [2, 5], [5, 5]), path([9, 5], [14, 5]), path([11, 5], [11, 2]), path([15, 2], [20, 2], [20, 6]),
path([19, 6], [20, 6]), path([7, 10], [7, 9], [8, 9]), path([12, 9], [13, 9], [13, 7], [14, 7]), path([13, 9], [13, 10]),
path([2, 12], [2, 14], [13, 14]));

export const e5_15 = () => circuit([
  two("V1", "V", [0, 3], [0, 7], { V: "12" }), two("S1", "SW", [1, 0], [5, 0], { state: "open", at: "0" }),
  two("R", "R", [6, 0], [10, 0], { R: "100k" }),
  two("C1", "C", [12, 1], [12, 5], { C: "6u", v0: "0" }), two("C2", "C", [12, 6], [12, 10], { C: "3u", v0: "0" }),
  at("G", "GND", [0, 11]),
], path([0, 3], [0, 0], [1, 0]), path([5, 0], [6, 0]), path([10, 0], [12, 0], [12, 1]), path([12, 5], [12, 6]),
path([0, 7], [0, 11], [12, 11], [12, 10]));

export function e5_16(withSwitch) {
  // The book closes a switch in series with the 1.8 A source at t = 0. An ideal current source
  // behind an open switch has nowhere to send its current, so the bench refuses that; for
  // t ≥ 0 it's the same circuit as a source that steps on at t = 0.
  const src = withSwitch ? two("I1", "I", [0, 3], [0, 7], { I: "1.8" }) : two("I1", "I", [0, 3], [0, 7], { wave: "step", I0: "0", I1: "1.8", at: "0" });
  return circuit([
    src, ...(withSwitch ? [two("S1", "SW", [1, 0], [5, 0], { state: "open", at: "0" })] : []),
    two("R", "R", [6, 3], [6, 7], { R: "2" }),
    two("L1", "L", [12, 3], [12, 7], { L: "6m", i0: "0" }), two("L2", "L", [18, 3], [18, 7], { L: "12m", i0: "0" }),
    at("G", "GND", [0, 10]),
  ], path([0, 3], [0, 0], withSwitch ? [1, 0] : [5, 0]), path([5, 0], [18, 0], [18, 3]), path([6, 0], [6, 3]), path([12, 0], [12, 3]),
  path([0, 7], [0, 10], [18, 10], [18, 7]), path([6, 7], [6, 10]), path([12, 7], [12, 10]));
}

// what each exercise's page opens, by its label; note = shown beside the button
export const BOOK = {
  "Exercise 2-6": { circuit: e2_6 },
  "Exercise 3-1": { circuit: e3_1 },
  "Exercise 3-2": { circuit: e3_2 },
  "Exercise 3-3": { circuit: e3_3 },
  "Exercise 3-4": { circuit: e3_4 },
  "Exercise 3-5": { circuit: e3_5 },
  "Exercise 3-6": { circuit: e3_6 },
  "Exercise 3-9": { circuit: e3_6 },
  "Exercise 3-12": { circuit: () => e3_12(true) },
  "Exercise 3-13": { circuit: e3_13 },
  "Exercise 4-6": {
    circuit: () => amp({ v2: "1", R1: "1k", v1: "0" }),
    note: "R1 and v1 are what you design, so they start at 1 kΩ and 0 V. Put in your values, then change v2 to check vo = 6v2 − 2.",
  },
  "Exercise 5-15": { circuit: e5_15 },
  "Exercise 5-16": {
    circuit: () => e5_16(false),
    note: "The bench can't put an ideal current source behind an open switch, so the 1.8 A source switches on at t = 0 instead: the same circuit for t ≥ 0. Open Over time for i1(t) and i2(t). At DC the bench can't split the current between two ideal inductors in parallel, so it shows an error there.",
  },
};

// content/ece201/bench.json: every drawing ready to open, in predict-first mode
export function bookJSON() {
  const circuits = {};
  for (const [label, { circuit: draw, note = "" }] of Object.entries(BOOK)) {
    circuits[label] = { note, doc: { ...draw(), title: label, course: "ECE201", study: { predict: true } } };
  }
  return { _about: "Generated by scripts/export_bench_book.mjs from app/static/circuits/selftest/book.js. Don't hand-edit.", pdf: BOOK_PDF, circuits };
}
