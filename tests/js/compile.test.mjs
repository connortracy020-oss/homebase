// Drawing -> nodes: junctions, crossings, labels, switches, ground.
import { test } from "node:test";
import assert from "node:assert/strict";

import { compile } from "../../app/static/circuits/core/compile.js";
import { migrate } from "../../app/static/circuits/core/doc.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });
const docOf = (parts, wires) => migrate({ parts, wires });
const vAt = (net, sol, x, y) => sol.nodes[net.nodeAt(`${x},${y}`)].v;

// Vs on the left, R1 across the top, R2 and R3 down to a bottom wire, ground on that wire
function mockup(extraParts = [], extraWires = []) {
  return docOf([
    part("Vs", "V", 2, 2, 1, { V: "12" }),
    part("R1", "R", 4, 0, 0, { R: "2k" }),
    part("R2", "R", 10, 2, 1, { R: "3k" }),
    part("R3", "R", 14, 2, 1, { R: "4k" }),
    part("GND1", "GND", 6, 6),
    ...extraParts,
  ], [
    wire("w1", [2, 2], [2, 0]), wire("w2", [2, 0], [4, 0]),
    wire("w3", [8, 0], [14, 0]), wire("w4", [10, 0], [10, 2]), wire("w5", [14, 0], [14, 2]),
    wire("w6", [2, 6], [14, 6]),
    ...extraWires,
  ]);
}

test("junctions: a wire end or terminal on another wire joins it", () => {
  const net = compile(mockup());
  assert.equal(net.nodes.length, 3);
  assert.equal(net.errors.length, 0);
  const s = solveDC(net);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(s.nodes[net.nodeAt("10,0")].vx, "72/13");
  assert.equal(net.nodeAt("6,6"), 0);
  // junction dots where three things meet: (10,0) on the top wire, (10,6) on the bottom wire, ground at (6,6)
  const dots = net.junctions.map(([x, y]) => `${x},${y}`).sort();
  assert.deepEqual(dots, ["10,0", "10,6", "6,6"]);
});

test("wires that only cross don't connect", () => {
  const net = compile(mockup([], [wire("x1", [12, -2], [12, 4])]));
  // the stray vertical wire crosses the top wire at (12,0) without joining it
  assert.equal(net.nodeAt("12,-2"), -1);
  assert.equal(net.junctions.some(([x, y]) => x === 12 && y === 0), false);
});

test("labels with the same name are one node", () => {
  const doc = docOf([
    part("V1", "V", 0, 0, 1, { V: "5" }), part("GND1", "GND", 0, 4),
    part("L1", "LBL", 0, 0, 0, { name: "Vin" }),
    part("L2", "LBL", 10, 0, 0, { name: "Vin" }),
    part("R1", "R", 10, 0, 1, { R: "1k" }), part("GND2", "GND", 10, 4),
  ], []);
  const net = compile(doc);
  const s = solveDC(net);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(net.nodeAt("0,0"), net.nodeAt("10,0"));
  assert.equal(s.nodes.find((n) => n.name === "Vin").vx, "5");
  assert.equal(s.els.R1.ix, "1/200");
});

test("switches join or separate", () => {
  const build = (state) => docOf([
    part("V1", "V", 0, 2, 1, { V: "10" }), part("GND1", "GND", 0, 6),
    part("S1", "SW", 0, 0, 0, { state }),
    part("R1", "R", 4, 2, 1, { R: "1k" }),
  ], [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [4, 2]), wire("w3", [0, 6], [4, 6])]);
  let net = compile(build("closed"));
  let s = solveDC(net);
  assert.equal(s.els.R1.vx, "10");
  assert.equal(s.flows.find((f) => f.part === "S1").i.toFixed(6), "0.010000");
  net = compile(build("open"));
  s = solveDC(net);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(s.els.R1.vx, "0");
  assert.ok(net.warnings.length === 0 || net.warnings.every((w) => w.code !== "OPEN_PIN" || w.parts[0] === "R1"));
});

test("no ground: the source's − terminal is used, with a warning", () => {
  const doc = docOf([part("V1", "V", 0, 0, 1, { V: "3" }), part("R1", "R", 4, 0, 1, { R: "1k" })],
    [wire("w1", [0, 0], [4, 0]), wire("w2", [0, 4], [4, 4])]);
  const net = compile(doc);
  assert.ok(net.autoGround);
  assert.ok(net.warnings.some((w) => w.code === "AUTO_GROUND"));
  const s = solveDC(net);
  assert.equal(s.nodes[net.nodeAt("0,0")].vx, "3");
});

test("open terminals are pointed out", () => {
  const doc = docOf([part("V1", "V", 0, 0, 1, { V: "3" }), part("GND1", "GND", 0, 4), part("R1", "R", 4, 0, 0, { R: "1k" })],
    [wire("w1", [0, 0], [4, 0])]);
  const net = compile(doc);
  assert.ok(net.warnings.some((w) => w.code === "OPEN_PIN" && w.parts[0] === "R1"));
  assert.deepEqual(net.openPins, [[8, 0]]);
  const s = solveDC(net);
  assert.ok(s.ok, JSON.stringify(s.errors));   // a dangling resistor end just sits at the same voltage
  assert.equal(s.nodes[net.nodeAt("8,0")].vx, "3");
});

test("wire currents: KCL through a T junction", () => {
  const net = compile(mockup());
  const s = solveDC(net);
  const flow = (a, b) => s.flows.find((f) => `${f.a}` === `${a}` && `${f.b}` === `${b}`).i;
  // top wire from R1 (8,0) to the junction (10,0) carries all of I1; past it only R3's share
  const i1 = s.els.R1.i, i3 = s.els.R3.i, i2 = s.els.R2.i;
  assert.ok(Math.abs(flow([8, 0], [10, 0]) - i1) < 1e-12);
  assert.ok(Math.abs(flow([10, 0], [14, 0]) - i3) < 1e-12);
  assert.ok(Math.abs(flow([10, 0], [10, 2]) - i2) < 1e-12);
});

test("migrate keeps what it understands", () => {
  const doc = migrate({ parts: [{ id: "R1", type: "R", x: 1.4, y: 2, rot: 5, params: { R: 1000 } }, { id: "Z", type: "nope" }], wires: [{ id: "w", a: [0, 0], b: [0, 0] }] });
  assert.equal(doc.parts.length, 1);
  assert.equal(doc.parts[0].x, 1);
  assert.equal(doc.parts[0].rot, 1);
  assert.equal(doc.parts[0].params.R, "1000");
  assert.equal(doc.wires.length, 0);
  assert.equal(vAt.length, 4);
});
