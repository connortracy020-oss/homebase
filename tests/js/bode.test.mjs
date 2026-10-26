// Frequency response against the textbook forms: first-order low-pass and high-pass corners at
// 1/RC, and a series RLC band-pass with its peak at 1/√(LC) and Q = ω₀L/R.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { bodeSweep } from "../../app/static/circuits/solver/bode.js";
import { STEADY } from "../../app/static/circuits/solver/ac.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });
const near = (a, b, rel) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

// V1 -> X1 across the top -> X2 down the right side to ground; the output is the top-right node
function divider(top, right) {
  return compile(migrate({
    parts: [part("V1", "V", 0, 2, 1, { wave: "sine", Vm: "1", w: "1k" }), top, right, part("G", "GND", 0, 6), part("Lo", "LBL", 8, 0, 0, { name: "vo" })],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [8, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
  }), { when: STEADY });
}

test("RC low-pass: 0 dB at low frequency, −3 dB and −45° at ω = 1/RC, −20 dB/decade after", () => {
  const net = divider(part("R1", "R", 0, 0, 0, { R: "1k" }), part("C1", "C", 6, 2, 1, { C: "1u" }));
  const r = bodeSweep(net, { input: "V1", output: { kind: "v", node: net.nodeByName.get("vo") } });
  assert.ok(r.ok, r.why);
  assert.equal(r.markers.shape, "low-pass");
  assert.equal(r.markers.corners.length, 1);
  near(r.markers.corners[0], 1000, 0.002);
  assert.ok(Math.abs(r.db[0]) < 0.01, String(r.db[0]));
  // the phase passes −45° at the corner and heads for −90°
  const k = r.omega.findIndex((w) => w >= 1000);
  assert.ok(Math.abs(r.phase[k] + 45) < 1.5, String(r.phase[k]));
  assert.ok(r.phase.at(-1) < -88);
  // a decade above the corner the slope is −20 dB per decade
  const at = (w) => r.db[r.omega.findIndex((x) => x >= w)];
  near(at(100e3) - at(10e3), -20, 0.01);
});

test("RC high-pass: the corner is at 1/RC too, with the phase starting at +90°", () => {
  const net = divider(part("C1", "C", 0, 0, 0, { C: "1u" }), part("R1", "R", 6, 2, 1, { R: "1k" }));
  const r = bodeSweep(net, { input: "V1", output: { kind: "v", node: net.nodeByName.get("vo") } });
  assert.equal(r.markers.shape, "high-pass");
  near(r.markers.corners[0], 1000, 0.002);
  assert.ok(r.phase[0] > 88);
});

test("series RLC band-pass across R: peak 0 dB at ω₀ = 1/√(LC), Q = ω₀L/R", () => {
  // L = 10 mH, C = 1 µF: ω₀ = 10 krad/s; R = 10 Ω: Q = 10k · 10m / 10 = 10
  const net = compile(migrate({
    parts: [part("V1", "V", 0, 2, 1, { wave: "sine", Vm: "1", w: "10k" }), part("L1", "L", 0, 0, 0, { L: "10m" }), part("C1", "C", 6, 0, 0, { C: "1u" }),
      part("R1", "R", 12, 2, 1, { R: "10" }), part("G", "GND", 0, 6), part("Lo", "LBL", 12, 0, 0, { name: "vo" })],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [10, 0], [12, 0]), wire("w4", [12, 0], [12, 2]), wire("w5", [0, 6], [12, 6])],
  }), { when: STEADY });
  const r = bodeSweep(net, { input: "V1", output: { kind: "v", node: net.nodeByName.get("vo") } });
  assert.ok(r.ok, r.why);
  assert.equal(r.markers.shape, "band-pass");
  near(r.markers.peak.omega, 1e4, 0.002);
  assert.ok(Math.abs(r.markers.peak.db) < 0.01);
  near(r.markers.Q, 10, 0.01);
  // the refinement put points close together near the sharp peak
  const k = r.omega.findIndex((w) => w >= 1e4);
  assert.ok(r.omega[k] / r.omega[k - 1] < 1.01);
});

test("an input that isn't a source is refused with a reason", () => {
  const net = divider(part("R1", "R", 0, 0, 0, { R: "1k" }), part("C1", "C", 6, 2, 1, { C: "1u" }));
  const r = bodeSweep(net, { input: "R1", output: { kind: "v", node: 1 } });
  assert.equal(r.ok, false);
  assert.match(r.why, /independent source/);
});
