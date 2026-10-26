// Solver tests with closed-form answers. Run: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";

import { netFromList } from "../../app/static/circuits/solver/netlist.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import { parseValue, fmtExact, fmt } from "../../app/static/circuits/core/units.js";
import * as Q from "../../app/static/circuits/core/rational.js";

const solve = (elements, opts) => solveDC(netFromList({ elements }), opts);
const V = (s, name) => s.nodes.find((n) => n.name === name);

test("SI values parse exactly", () => {
  const cases = [["4.7k", "4700"], ["2.2u", "11/5000000"], ["2.2µ", "11/5000000"], ["1meg", "1000000"], ["4k7", "4700"],
    ["10 mA", "1/100"], ["3e-3", "3/1000"], ["-5", "-5"], [".5", "1/2"], ["100 ohms", "100"], ["1kΩ", "1000"], ["5V", "5"]];
  for (const [text, exact] of cases) {
    const unit = /A$/.test(text) ? "A" : /V$/.test(text) ? "V" : "";
    const p = parseValue(text, unit);
    assert.ok(p.ok, `${text}: ${p.error}`);
    assert.equal(Q.toString(p.exact), exact, text);
  }
  assert.equal(parseValue("1M", "Ω").ok, false);
  assert.ok(parseValue("1M", "Ω").ambiguous);
  assert.equal(parseValue("abc", "Ω").ok, false);
  assert.equal(parseValue("5 V", "A").ok, false);
});

test("exact display picks friendly fractions", () => {
  assert.deepEqual(fmtExact(Q.frac(72n, 13n), "V"), { main: "72/13 V", decimal: "5.538 V" });
  assert.deepEqual(fmtExact(Q.frac(42n, 13000n), "A"), { main: "42/13 mA", decimal: "3.231 mA" });
  assert.equal(fmtExact(Q.frac(5n, 2n), "V").main, "2.5 V");
  assert.equal(fmtExact(Q.frac(-72n, 13n), "V").main, "−72/13 V");
  assert.equal(fmt(0.0012, "A"), "1.2 mA");
});

test("voltage source, series R, parallel pair (the mockup circuit)", () => {
  const s = solve([
    { id: "Vs", type: "V", nodes: ["n1", 0], params: { V: "12" } },
    { id: "R1", type: "R", nodes: ["n1", "out"], params: { R: "2k" } },
    { id: "R2", type: "R", nodes: ["out", 0], params: { R: "3k" } },
    { id: "R3", type: "R", nodes: ["out", 0], params: { R: "4k" } },
  ]);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.ok(s.exact);
  assert.equal(V(s, "out").vx, "72/13");
  assert.equal(s.els.R1.ix, "21/6500");       // 42/13 mA
  assert.equal(s.els.Vs.ix, "-21/6500");      // current enters + terminal: negative = delivering
  assert.equal(s.els.Vs.px, "-63/1625");      // delivers 38.77 mW
  assert.ok(Math.abs(s.els.R2.p + s.els.R3.p + s.els.R1.p + s.els.Vs.p) < 1e-15);
});

test("current source into a resistor: direction follows the arrow", () => {
  const s = solve([
    { id: "I1", type: "I", nodes: ["top", 0], params: { I: "2m" } },
    { id: "R1", type: "R", nodes: ["top", 0], params: { R: "1k" } },
  ]);
  assert.equal(V(s, "top").vx, "2");
  assert.equal(s.els.I1.px, "-1/250");   // delivers 4 mW
});

test("all four dependent sources", () => {
  // VCVS: E = 3 v(R1); R1 sees 2V from a divider
  let s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "4" } },
    { id: "R1", type: "R", nodes: ["a", "b"], params: { R: "1k" } },
    { id: "R2", type: "R", nodes: ["b", 0], params: { R: "1k" } },
    { id: "E1", type: "E", nodes: ["c", 0], params: { gain: "3", ctrl: "v(R1)" } },
    { id: "R3", type: "R", nodes: ["c", 0], params: { R: "1k" } },
  ]);
  assert.equal(V(s, "c").vx, "6");
  // CCCS: F = 2 i(R1), into a 1k load
  s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "1" } },
    { id: "R1", type: "R", nodes: ["a", 0], params: { R: "1k" } },
    { id: "F1", type: "F", nodes: ["c", 0], params: { gain: "2", ctrl: "i(R1)" } },
    { id: "R2", type: "R", nodes: ["c", 0], params: { R: "1k" } },
  ]);
  assert.equal(V(s, "c").vx, "2");
  // VCCS with feedback onto its own control node: g v(a) leaves at a
  s = solve([
    { id: "I1", type: "I", nodes: ["a", 0], params: { I: "1m" } },
    { id: "R1", type: "R", nodes: ["a", 0], params: { R: "1k" } },
    { id: "G1", type: "G", nodes: [0, "a"], params: { gain: "1m", ctrl: "v(a)" } },
  ]);
  // KCL at a: 1m = v/1k + 1m*v  ->  v = 1/2 V
  assert.equal(V(s, "a").vx, "1/2");
  // CCVS: H = 500 i(R1)
  s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "2" } },
    { id: "R1", type: "R", nodes: ["a", 0], params: { R: "1k" } },
    { id: "H1", type: "H", nodes: ["c", 0], params: { gain: "500", ctrl: "-i(R1)" } },
    { id: "R2", type: "R", nodes: ["c", 0], params: { R: "1k" } },
  ]);
  assert.equal(V(s, "c").vx, "-1");
});

test("ideal op-amp: inverting and non-inverting amplifiers", () => {
  let s = solve([
    { id: "Vin", type: "V", nodes: ["in", 0], params: { V: "1" } },
    { id: "R1", type: "R", nodes: ["in", "m"], params: { R: "1k" } },
    { id: "R2", type: "R", nodes: ["m", "out"], params: { R: "3k" } },
    { id: "U1", type: "OA", nodes: ["m", 0, "out"], params: {} },
    { id: "RL", type: "R", nodes: ["out", 0], params: { R: "1k" } },
  ]);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(V(s, "out").vx, "-3");
  assert.equal(V(s, "m").vx, "0");
  s = solve([
    { id: "Vin", type: "V", nodes: ["in", 0], params: { V: "2" } },
    { id: "U1", type: "OA", nodes: ["m", "in", "out"], params: {} },
    { id: "Rf", type: "R", nodes: ["out", "m"], params: { R: "2k" } },
    { id: "Rg", type: "R", nodes: ["m", 0], params: { R: "1k" } },
  ]);
  assert.equal(V(s, "out").vx, "6");
});

test("finite-gain op-amp approaches the ideal answer", () => {
  const s = solve([
    { id: "Vin", type: "V", nodes: ["in", 0], params: { V: "1" } },
    { id: "R1", type: "R", nodes: ["in", "m"], params: { R: "1k" } },
    { id: "R2", type: "R", nodes: ["m", "out"], params: { R: "3k" } },
    { id: "U1", type: "OA", nodes: ["m", 0, "out"], params: { model: "gain", A: "100k" } },
  ]);
  // -3 * A / (A + 4)
  assert.equal(V(s, "out").vx, "-300000/100004".replace(/\d+\/\d+/, (f) => Q.toString(Q.fromString(f))));
});

test("op-amp without feedback gets a reason, not garbage", () => {
  const s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "1" } },
    { id: "U1", type: "OA", nodes: [0, "a", "out"], params: {} },
    { id: "RL", type: "R", nodes: ["out", 0], params: { R: "1k" } },
  ]);
  assert.equal(s.ok, false);
  assert.equal(s.errors[0].code, "NO_FEEDBACK");
});

test("positive feedback is flagged", () => {
  const s = solve([
    { id: "Vin", type: "V", nodes: ["in", 0], params: { V: "1" } },
    { id: "R1", type: "R", nodes: ["in", "p"], params: { R: "1k" } },
    { id: "R2", type: "R", nodes: ["p", "out"], params: { R: "3k" } },
    { id: "U1", type: "OA", nodes: [0, "p", "out"], params: {} },
  ]);
  assert.ok(s.ok);
  assert.ok(s.warnings.some((w) => w.code === "POSITIVE_FEEDBACK"));
});

test("structural errors name the problem", () => {
  // two current sources in series
  let s = solve([
    { id: "I1", type: "I", nodes: ["a", 0], params: { I: "1m" } },
    { id: "I2", type: "I", nodes: ["b", "a"], params: { I: "1m" } },
    { id: "R1", type: "R", nodes: ["b", 0], params: { R: "1k" } },
  ]);
  assert.equal(s.ok, false);
  assert.equal(s.errors[0].code, "FLOATING");
  assert.match(s.errors[0].message, /current sources/);
  // parallel voltage sources
  s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "1" } },
    { id: "V2", type: "V", nodes: ["a", 0], params: { V: "2" } },
  ]);
  assert.equal(s.errors[0].code, "LOOP");
  assert.deepEqual(new Set(s.errors[0].parts), new Set(["V1", "V2"]));
  // inductor across a source at DC
  s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "1" } },
    { id: "L1", type: "L", nodes: ["a", 0], params: { L: "1m" } },
  ]);
  assert.equal(s.errors[0].code, "LOOP");
  assert.match(s.errors[0].message, /inductor acts as a wire/);
  // capacitors in series: the middle node has no DC path
  s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "1" } },
    { id: "C1", type: "C", nodes: ["a", "m"], params: { C: "1u" } },
    { id: "C2", type: "C", nodes: ["m", 0], params: { C: "1u" } },
  ]);
  assert.equal(s.errors[0].code, "FLOATING");
  assert.match(s.errors[0].message, /capacitor/);
  // bad value
  s = solve([{ id: "R1", type: "R", nodes: ["a", 0], params: { R: "abc" } }]);
  assert.equal(s.errors[0].code, "PARAM");
  s = solve([{ id: "R1", type: "R", nodes: ["a", 0], params: { R: "0" } }]);
  assert.match(s.errors[0].message, /wire/);
});

test("meters read what they should and change nothing", () => {
  const s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "10" } },
    { id: "AM1", type: "AM", nodes: ["a", "b"] },
    { id: "R1", type: "R", nodes: ["b", "c"], params: { R: "3k" } },
    { id: "R2", type: "R", nodes: ["c", 0], params: { R: "2k" } },
    { id: "VM1", type: "VM", nodes: ["c", 0] },
  ]);
  assert.equal(s.els.AM1.reading.exact, "1/500");
  assert.equal(s.els.VM1.reading.exact, "4");
});

test("capacitor open and inductor short at DC", () => {
  const s = solve([
    { id: "V1", type: "V", nodes: ["a", 0], params: { V: "6" } },
    { id: "R1", type: "R", nodes: ["a", "b"], params: { R: "1k" } },
    { id: "L1", type: "L", nodes: ["b", "c"], params: { L: "10m" } },
    { id: "R2", type: "R", nodes: ["c", 0], params: { R: "2k" } },
    { id: "C1", type: "C", nodes: ["c", 0], params: { C: "1u" } },
  ]);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(V(s, "c").vx, "4");
  assert.equal(s.els.L1.ix, "1/500");
  assert.equal(s.els.C1.ix, "0");
});
