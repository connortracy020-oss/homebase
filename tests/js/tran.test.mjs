// Transients against closed-form answers, and the trapezoidal rule's accuracy order.
import { test } from "node:test";
import assert from "node:assert/strict";

import { transient } from "../../app/static/circuits/solver/tran.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });

// V1 (left, vertical) -> switch S1 across the top -> R1 -> node "out" -> C1 down to ground
function rc({ sw = "open", at = "0", v0 = "", V = "5", C = "1u", R = "1k" } = {}) {
  return {
    parts: [
      part("V1", "V", 0, 2, 1, { V }), part("S1", "SW", 0, 0, 0, { state: sw, at }),
      part("R1", "R", 4, 0, 0, { R }), part("C1", "C", 10, 2, 1, { C, v0 }), part("GND1", "GND", 0, 6),
      part("L1", "LBL", 8, 0, 0, { name: "out" }),
    ],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [8, 0], [10, 0]), wire("w3", [10, 0], [10, 2]), wire("w4", [0, 6], [10, 6])],
  };
}

const outIndex = (r) => r.nodeNames.indexOf("out");
function maxErr(r, exact) {
  const k = outIndex(r);
  let worst = 0;
  r.t.forEach((t, j) => { if (j > 1) worst = Math.max(worst, Math.abs(r.nodes[k][j] - exact(t))); });
  return worst;
}

test("RC charging after a switch closes matches 5(1 - e^(-t/RC))", () => {
  const r = transient(rc());
  assert.ok(r.ok, r.why);
  assert.ok(Math.abs(r.firstOrder.tau - 1e-3) < 1e-12);
  assert.equal(r.firstOrder.x0x, "0");
  assert.equal(r.firstOrder.xinfx, "5");
  assert.ok(maxErr(r, (t) => 5 * (1 - Math.exp(-t / 1e-3))) < 2e-3, `error ${maxErr(r, (t) => 5 * (1 - Math.exp(-t / 1e-3)))}`);
  assert.equal(r.tstop, 5e-3);
});

test("the trapezoidal rule's error falls like h squared", () => {
  const exact = (t) => 5 * (1 - Math.exp(-t / 1e-3));
  const e1 = maxErr(transient(rc(), { tstop: 3e-3, dt: 2e-5 }), exact);
  const e2 = maxErr(transient(rc(), { tstop: 3e-3, dt: 1e-5 }), exact);
  const ratio = e1 / e2;
  assert.ok(ratio > 3 && ratio < 5.5, `ratio ${ratio}`);
});

test("a charged capacitor discharging: initial voltage given", () => {
  const doc = {
    parts: [part("C1", "C", 0, 0, 1, { C: "2u", v0: "10" }), part("S1", "SW", 0, 0, 0, { state: "open", at: "0" }), part("R1", "R", 4, 0, 1, { R: "500" }), part("GND1", "GND", 0, 4), part("L1", "LBL", 0, 0, 2, { name: "out" })],
    wires: [wire("w1", [0, 4], [4, 4])],
  };
  const r = transient(doc);
  assert.ok(r.ok, r.why);
  const tau = 1e-3;
  assert.ok(Math.abs(r.firstOrder.tau - tau) < 1e-12);
  assert.ok(maxErr(r, (t) => 10 * Math.exp(-t / tau)) < 5e-3);
});

test("RL step response: i = (V/R)(1 - e^(-tR/L))", () => {
  const doc = {
    parts: [part("V1", "V", 0, 2, 1, { wave: "step", V0: "0", V1: "10", at: "0" }), part("R1", "R", 0, 0, 0, { R: "100" }), part("L1", "L", 6, 2, 1, { L: "10m" }), part("GND1", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
  };
  const r = transient(doc);
  assert.ok(r.ok, r.why);
  const tau = 1e-4, i = r.els.L1.i;
  let worst = 0;
  r.t.forEach((t, j) => { if (j > 1) worst = Math.max(worst, Math.abs(i[j] - 0.1 * (1 - Math.exp(-t / tau)))); });
  assert.ok(worst < 1e-4, `worst ${worst}`);
  assert.equal(r.firstOrder.kind, "L");
  assert.equal(r.firstOrder.xinfx, "1/10");
});

test("nothing to animate gets a plain reason", () => {
  const r = transient({ parts: [part("V1", "V", 0, 0, 1, {}), part("R1", "R", 0, 0, 0, {})], wires: [] });
  assert.equal(r.ok, false);
  assert.match(r.why, /nothing that changes/);
});
