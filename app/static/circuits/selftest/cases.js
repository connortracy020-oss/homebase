// Golden problems: ECE 201 exercises whose official worked solutions are Homebase answer keys
// (Ulaby, Maharbiz & Furse, Circuit Analysis and Design, exercise solutions). Each circuit is
// drawn the way the bench stores it, and the bench must reproduce the published answer: the
// exact value where the book gives one, else to the digits it prints.
// Run by tests/js/golden.test.mjs and, in any browser (the phone too), by /circuits/selftest.

import { migrate } from "../core/doc.js";
import { compile } from "../core/compile.js";
import { solveDC } from "../solver/op.js";
import { thevenin } from "../solver/theorems.js";
import { transient } from "../solver/tran.js";

// a two-terminal part from pin a to pin b (4 grid units apart, in a line)
function two(id, type, a, b, params = {}) {
  const rot = { "4,0": 0, "0,4": 1, "-4,0": 2, "0,-4": 3 }[`${b[0] - a[0]},${b[1] - a[1]}`];
  if (rot === undefined) throw new Error(`${id}: pins must be 4 apart in a line`);
  return { id, type, x: a[0], y: a[1], rot, params };
}
const at = (id, type, p, params = {}) => ({ id, type, x: p[0], y: p[1], rot: 0, params });
let wires = 0;
const path = (...pts) => pts.slice(1).map((p, i) => ({ id: `w${++wires}`, a: pts[i], b: p }));
const circuit = (parts, ...paths) => migrate({ parts, wires: paths.flat() });

function dc(doc) {
  const net = compile(doc);
  const s = solveDC(net, { flows: false });
  if (!s.ok) throw new Error(s.errors.map((e) => e.message).join("; "));
  return {
    v: (x, y) => s.nodes[net.nodeAt(`${x},${y}`)].v,
    i: (id) => s.els[id].i,
    vp: (id) => s.els[id].v,
    exact: (id, q) => s.els[id][q === "v" ? "vx" : "ix"],
  };
}

// the bench's value against the published one, to the digits it's printed with
function near(label, got, want, unit, digits = 0) {
  const tol = digits ? 0.5 * 10 ** -digits : 1e-9 * (1 + Math.abs(want));
  return { label, got, want, unit, ok: Number.isFinite(got) && Math.abs(got - want) <= tol };
}
const same = (label, got, want) => ({ label, got, want, unit: "", ok: got === want });
// a curve against the book's formula, at every time step
function curve(label, r, series, f, unit, tol) {
  const worst = Math.max(...r.t.map((t, j) => (j ? Math.abs(series[j] - f(t)) : 0)));
  return { label, got: worst, want: 0, unit, ok: worst < tol, note: "largest difference from the book's formula" };
}

function e3_12(load) {  // Figure E3-12, with or without the 1 Ω load between a and b
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

function port(doc) {
  const net = compile(doc);
  const th = thevenin(net, { nodes: [net.nodeByName.get("a"), net.nodeByName.get("b")] });
  if (!th.ok) throw new Error(th.why);
  return th;
}

const amp = (v2) => circuit([  // Ulaby 4-6's difference amplifier
  at("U1", "OA", [10, 4]),  // - input (10, 3), + input (10, 5), output (15, 4)
  two("R1", "R", [5, 3], [9, 3], { R: "2k" }), two("R2", "R", [10, 0], [14, 0], { R: "20k" }),
  two("R3", "R", [5, 5], [9, 5], { R: "5k" }), two("R4", "R", [9, 6], [9, 10], { R: "6k" }),
  two("V1", "V", [2, 6], [2, 10], { V: "0.2" }), two("V2", "V", [4, 6], [4, 10], { V: v2 }),
  at("Lo", "LBL", [16, 4], { name: "vo" }), at("G", "GND", [2, 10]),
], path([2, 6], [2, 3], [5, 3]), path([9, 3], [10, 3]), path([9, 3], [9, 0], [10, 0]), path([14, 0], [16, 0], [16, 4]),
path([15, 4], [16, 4]), path([4, 6], [4, 5], [5, 5]), path([9, 5], [10, 5]), path([9, 5], [9, 6]), path([2, 10], [9, 10]));

function e5_16(withSwitch) {
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

export const CASES = [
  {
    name: "Ulaby exercise 2-6 (KCL, KVL, a CCVS)", answer: "Ix = 1.33 A",
    run() {
      const r = dc(circuit([
        two("R4", "R", [0, 9], [0, 5], { R: "4" }),             // Ix flows up through it
        two("R2a", "R", [1, 4], [5, 4], { R: "2" }),
        two("I1", "I", [5, 0], [1, 0], { I: "4" }),             // arrow toward node 2
        two("R8", "R", [6, 5], [6, 9], { R: "8" }),
        two("R2b", "R", [7, 4], [11, 4], { R: "2" }),
        two("H1", "H", [12, 9], [12, 5], { gain: "2", ctrl: "i(R4)", cname: "Ix" }),  // + at the bottom
        at("G", "GND", [6, 10]),
      ], path([0, 5], [0, 4], [1, 4]), path([0, 4], [0, 0], [1, 0]), path([5, 0], [6, 0], [6, 4]), path([5, 4], [6, 4], [7, 4]),
      path([6, 4], [6, 5]), path([11, 4], [12, 4], [12, 5]), path([0, 9], [0, 10], [12, 10], [12, 9]), path([6, 9], [6, 10])));
      return [near("Ix", r.i("R4"), 1.33, "A", 2), same("Ix exactly", r.exact("R4", "i"), "4/3")];
    },
  },
  {
    name: "Ulaby exercise 3-1 (nodal)", answer: "Va = 2 V, I = 2 A",
    run() {
      const r = dc(circuit([
        two("R4", "R", [0, 3], [0, 7], { R: "4" }), two("R6", "R", [2, 0], [6, 0], { R: "6" }),
        two("R10", "R", [8, 1], [8, 5], { R: "10" }), two("V1", "V", [8, 6], [8, 10], { V: "24" }),
        two("R1", "R", [14, 3], [14, 7], { R: "1" }), at("G", "GND", [8, 10]),
      ], path([0, 3], [0, 0], [2, 0]), path([6, 0], [14, 0], [14, 3]), path([8, 0], [8, 1]), path([8, 5], [8, 6]),
      path([0, 7], [0, 10], [14, 10], [14, 7])));
      return [near("Va", r.v(8, 0), 2, "V"), near("I", r.i("R1"), 2, "A")];
    },
  },
  {
    name: "Ulaby exercise 3-2 (nodal, a VCVS)", answer: "Va = 5 V",
    run() {
      const r = dc(circuit([
        two("V1", "V", [0, 3], [0, 7], { V: "9" }), two("R20", "R", [1, 0], [5, 0], { R: "20" }),
        two("R10", "R", [6, 1], [6, 5], { R: "10" }),
        two("E1", "E", [6, 6], [6, 10], { gain: "0.5", ctrl: "v(R20)", cname: "Va" }),
        two("R40", "R", [12, 3], [12, 7], { R: "40" }), at("G", "GND", [6, 10]),
      ], path([0, 3], [0, 0], [1, 0]), path([5, 0], [12, 0], [12, 3]), path([6, 0], [6, 1]), path([6, 5], [6, 6]),
      path([0, 7], [0, 10], [12, 10], [12, 7])));
      return [near("Va", r.vp("R20"), 5, "V")];
    },
  },
  {
    name: "Ulaby exercise 3-3 (supernode)", answer: "I = 0.5 A",
    run() {
      const r = dc(circuit([
        two("I1", "I", [0, 5], [0, 9], { I: "2" }), two("R2", "R", [6, 5], [6, 9], { R: "2" }),
        two("R10", "R", [7, 4], [11, 4], { R: "10" }), two("V12", "V", [11, 0], [7, 0], { V: "12" }),
        two("R4a", "R", [12, 5], [12, 9], { R: "4" }), two("R4b", "R", [13, 4], [17, 4], { R: "4" }),
        two("V20", "V", [18, 5], [18, 9], { V: "20" }), at("G", "GND", [6, 10]),
      ], path([0, 5], [0, 4], [6, 4], [7, 4]), path([6, 4], [6, 5]), path([6, 4], [6, 0], [7, 0]), path([11, 0], [12, 0], [12, 4]),
      path([11, 4], [12, 4], [13, 4]), path([12, 4], [12, 5]), path([17, 4], [18, 4], [18, 5]),
      path([0, 9], [0, 10], [18, 10], [18, 9]), path([6, 9], [6, 10]), path([12, 9], [12, 10])));
      return [near("I", r.i("R2"), 0.5, "A"), near("V2 - V1", r.v(12, 4) - r.v(6, 4), 12, "V")];
    },
  },
  {
    name: "Ulaby exercise 3-4 (mesh)", answer: "I = 0",
    run() {
      const r = dc(circuit([
        two("V1", "V", [0, 3], [0, 7], { V: "12" }), two("R4a", "R", [1, 0], [5, 0], { R: "4" }),
        two("R4b", "R", [6, 3], [6, 7], { R: "4" }), two("I1", "I", [12, 7], [12, 3], { I: "3" }),
        at("G", "GND", [0, 10]),
      ], path([0, 3], [0, 0], [1, 0]), path([5, 0], [12, 0], [12, 3]), path([6, 0], [6, 3]),
      path([0, 7], [0, 10], [12, 10], [12, 7]), path([6, 7], [6, 10])));
      return [near("I", r.i("R4b"), 0, "A")];
    },
  },
  {
    name: "Ulaby exercise 3-5 (mesh, a CCCS)", answer: "I = 1.5 A",
    run() {
      const r = dc(circuit([
        two("V1", "V", [0, 3], [0, 7], { V: "60" }), two("R4", "R", [1, 0], [5, 0], { R: "4" }),
        two("R6", "R", [6, 0], [10, 0], { R: "6" }), two("R20", "R", [12, 3], [12, 7], { R: "20" }),
        two("F1", "F", [18, 7], [18, 3], { gain: "0.5", ctrl: "i(R6)", cname: "I1" }), at("G", "GND", [0, 10]),
      ], path([0, 3], [0, 0], [1, 0]), path([5, 0], [6, 0]), path([10, 0], [18, 0], [18, 3]), path([12, 0], [12, 3]),
      path([0, 7], [0, 10], [18, 10], [18, 7]), path([12, 7], [12, 10])));
      return [near("I", r.i("R20"), 1.5, "A")];
    },
  },
  {
    name: "Ulaby exercises 3-6 (supermesh) and 3-9 (superposition)", answer: "I = -0.7 A toward the 5 Ω; I = 2.3 A through the 3 Ω",
    run() {
      const r = dc(circuit([
        two("R2", "R", [0, 2], [0, 6], { R: "2" }), two("I4", "I", [6, 2], [6, 6], { I: "4" }),
        two("R3", "R", [7, 0], [11, 0], { R: "3" }), two("I3", "I", [12, 6], [12, 2], { I: "3" }),
        two("R5", "R", [18, 2], [18, 6], { R: "5" }), at("G", "GND", [0, 8]),
      ], path([0, 2], [0, 0], [7, 0]), path([6, 0], [6, 2]), path([11, 0], [18, 0], [18, 2]), path([12, 0], [12, 2]),
      path([0, 6], [0, 8], [18, 8], [18, 6]), path([6, 6], [6, 8]), path([12, 6], [12, 8])));
      return [near("I (3-6)", r.i("R5"), -0.7, "A", 1), near("I (3-9)", r.i("R3"), 2.3, "A", 1), same("I (3-6) exactly", r.exact("R5", "i"), "-7/10")];
    },
  },
  {
    name: "Ulaby exercise 3-12 (Thevenin)", answer: "V_Th = 2 V, R_Th = 3 Ω, I = 0.5 A",
    run() {
      const th = port(e3_12(false));
      const withLoad = thevenin(compile(e3_12(true)), { part: "RL" });
      return [near("V_Th", th.voc.x, 2, "V"), near("R_Th", th.rth.x, 3, "Ω"), near("I", dc(e3_12(true)).i("RL"), 0.5, "A"),
        near("I from the equivalent", withLoad.load.i, 0.5, "A")];
    },
  },
  {
    name: "Ulaby exercise 3-13 (Norton, a CCCS)", answer: "V_Th = 2 V, I_sc = 0.5 A, R_Th = 4 Ω",
    run() {
      const th = port(circuit([
        two("I2", "I", [0, 5], [0, 9], { I: "2" }), two("R10", "R", [6, 5], [6, 9], { R: "10" }),
        two("R3", "R", [7, 4], [11, 4], { R: "3" }),
        two("F1", "F", [7, 0], [11, 0], { gain: "3", ctrl: "i(R10)", cname: "I" }),  // arrow toward node 1
        at("Ta", "LBL", [16, 4], { name: "a" }), at("Tb", "LBL", [16, 10], { name: "b" }), at("G", "GND", [0, 10]),
      ], path([0, 5], [0, 4], [6, 4], [7, 4]), path([6, 4], [6, 5]), path([6, 4], [6, 0], [7, 0]), path([11, 0], [12, 0], [12, 4]),
      path([11, 4], [12, 4], [16, 4]), path([0, 9], [0, 10], [16, 10]), path([6, 9], [6, 10])));
      return [near("V_Th", th.voc.x, 2, "V"), near("I_sc", th.isc.x, 0.5, "A"), near("R_Th", th.rth.x, 4, "Ω")];
    },
  },
  {
    name: "Ulaby exercise 4-6 (difference amplifier)", answer: "R1 = 2 kΩ, v1 = 0.2 V give vo = 6 v2 - 2",
    run: () => [1, 0.5, -2].map((v2) => near(`vo at v2 = ${v2} V`, dc(amp(String(v2))).v(16, 4), 6 * v2 - 2, "V")),
  },
  {
    name: "Ulaby exercise 5-15 (series capacitors charging)", answer: "v1 = 4(1 - e^-5t) V, v2 = 8(1 - e^-5t) V",
    run() {
      const r = transient(circuit([
        two("V1", "V", [0, 3], [0, 7], { V: "12" }), two("S1", "SW", [1, 0], [5, 0], { state: "open", at: "0" }),
        two("R", "R", [6, 0], [10, 0], { R: "100k" }),
        two("C1", "C", [12, 1], [12, 5], { C: "6u", v0: "0" }), two("C2", "C", [12, 6], [12, 10], { C: "3u", v0: "0" }),
        at("G", "GND", [0, 11]),
      ], path([0, 3], [0, 0], [1, 0]), path([5, 0], [6, 0]), path([10, 0], [12, 0], [12, 1]), path([12, 5], [12, 6]),
      path([0, 7], [0, 11], [12, 11], [12, 10])), { tstop: 1, dt: 1e-3 });
      if (!r.ok) throw new Error(r.why);
      return [curve("v1(t)", r, r.els.C1.v, (t) => 4 * (1 - Math.exp(-5 * t)), "V", 1e-4),
        curve("v2(t)", r, r.els.C2.v, (t) => 8 * (1 - Math.exp(-5 * t)), "V", 1e-4),
        near("τ", r.modes?.taus[0], 0.2, "s")];
    },
  },
  {
    name: "Ulaby exercise 5-16 (parallel inductors)", answer: "i1 = 1.2(1 - e^-500t) A, i2 = 0.6(1 - e^-500t) A",
    run() {
      const r = transient(e5_16(false), { tstop: 10e-3, dt: 1e-5 });
      if (!r.ok) throw new Error(r.why);
      const asDrawn = transient(e5_16(true));
      return [curve("i1(t)", r, r.els.L1.i, (t) => 1.2 * (1 - Math.exp(-500 * t)), "A", 1e-4),
        curve("i2(t)", r, r.els.L2.i, (t) => 0.6 * (1 - Math.exp(-500 * t)), "A", 1e-4),
        near("τ", r.modes?.taus[0], 2e-3, "s"),
        { label: "a current source behind an open switch is refused", got: asDrawn.ok ? "solved" : "refused", want: "refused", unit: "", ok: !asDrawn.ok }];
    },
  },
];

// every case, never throwing: [{name, answer, checks, ok, error, ms}]
export function runAll() {
  return CASES.map((c) => {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    let checks = [], error = null;
    try { checks = c.run(); } catch (err) { error = err.message || String(err); }
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { name: c.name, answer: c.answer, checks, error, ok: !error && checks.length > 0 && checks.every((k) => k.ok), ms };
  });
}
