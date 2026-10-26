// Exact transfer functions against the textbook forms, and the step response from them.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { transferFunction } from "../../app/static/circuits/solver/laplace.js";
import { STEADY } from "../../app/static/circuits/solver/ac.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });
const H = (doc, out = "vo") => { const net = compile(migrate(doc), { when: STEADY }); return transferFunction(net, { input: "V1", output: { kind: "v", node: net.nodeByName.get(out) } }); };

const rc = (r = "1k", c = "1u") => ({
  parts: [part("V1", "V", 0, 2, 1, { V: "1" }), part("R1", "R", 0, 0, 0, { R: r }), part("C1", "C", 6, 2, 1, { C: c }), part("G", "GND", 0, 6), part("Lo", "LBL", 8, 0, 0, { name: "vo" })],
  wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [8, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
});

test("RC low-pass: H(s) = 1000/(s + 1000) exactly, one pole at −1000, step 1 − e^(−1000t)", () => {
  const h = H(rc());
  assert.ok(h.ok, h.why);
  assert.equal(h.exact, true);
  assert.deepEqual(h.numText, ["1000"]);
  assert.deepEqual(h.denText, ["1000", "1"]);
  assert.equal(h.poles.length, 1);
  assert.ok(Math.abs(h.poles[0].re + 1000) < 1e-9 && h.poles[0].im === 0);
  assert.equal(h.dcGain, 1);
  const { t, step } = h.responses;
  const worst = Math.max(...t.map((tt, k) => Math.abs(step[k] - (1 - Math.exp(-1000 * tt)))));
  assert.ok(worst < 1e-12, String(worst));
});

test("series RLC across C: H(s) = ω₀²/(s² + (R/L)s + ω₀²), with ω₀, ζ and Q", () => {
  const h = H({
    parts: [part("V1", "V", 0, 2, 1, { V: "1" }), part("R1", "R", 0, 0, 0, { R: "10" }), part("L1", "L", 6, 0, 0, { L: "10m" }),
      part("C1", "C", 12, 2, 1, { C: "1u" }), part("G", "GND", 0, 6), part("Lo", "LBL", 12, 0, 0, { name: "vo" })],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [10, 0], [12, 0]), wire("w4", [12, 0], [12, 2]), wire("w5", [0, 6], [12, 6])],
  });
  assert.ok(h.ok, h.why);
  assert.deepEqual(h.numText, ["100000000"]);
  assert.deepEqual(h.denText, ["100000000", "1000", "1"]);
  assert.ok(Math.abs(h.w0 - 1e4) < 1e-6 && Math.abs(h.zeta - 0.05) < 1e-12 && Math.abs(h.Q - 10) < 1e-9);
  assert.equal(h.poles.length, 2);
  assert.ok(Math.abs(h.poles[0].re + 500) < 1e-6 && Math.abs(Math.abs(h.poles[0].im) - Math.sqrt(1e8 - 2.5e5)) < 1e-6);
  // the step response from the residues matches the closed form
  const a = 500, wd = Math.sqrt(1e8 - a * a);
  const { t, step } = h.responses;
  const worst = Math.max(...t.map((tt, k) => Math.abs(step[k] - (1 - Math.exp(-a * tt) * (Math.cos(wd * tt) + (a / wd) * Math.sin(wd * tt))))));
  assert.ok(worst < 1e-9, String(worst));
});

test("a pole-zero cancellation leaves no phantom pole (a balanced lead network)", () => {
  // R1 ∥ C1 in series with R2 ∥ C2, R1C1 = R2C2: the output across R2 ∥ C2 is a flat divider
  const h = H({
    parts: [part("V1", "V", 0, 4, 1, { V: "1" }), part("R1", "R", 2, 0, 0, { R: "1k" }), part("C1", "C", 2, 2, 0, { C: "1u" }),
      part("R2", "R", 8, 4, 1, { R: "2k" }), part("C2", "C", 10, 4, 1, { C: "500n" }), part("G", "GND", 0, 8), part("Lo", "LBL", 10, 0, 0, { name: "vo" })],
    wires: [wire("w1", [0, 4], [0, 0]), wire("w2", [0, 0], [2, 0]), wire("w3", [0, 0], [0, 2]), wire("w4", [0, 2], [2, 2]),
      wire("w5", [6, 0], [10, 0]), wire("w6", [6, 2], [6, 0]), wire("w7", [8, 0], [8, 4]), wire("w8", [10, 0], [10, 4]),
      wire("w9", [0, 8], [10, 8]), wire("w10", [8, 8], [8, 8]), wire("w11", [0, 8], [0, 8])],
  });
  assert.ok(h.ok, h.why);
  assert.equal(h.poles.length, 0, JSON.stringify(h.poles));
  assert.deepEqual(h.numText, ["2/3"]);
});

test("RC high-pass: H(s) = s/(s + 1000), a zero at the origin", () => {
  const h = H({
    parts: [part("V1", "V", 0, 2, 1, { V: "1" }), part("C1", "C", 0, 0, 0, { C: "1u" }), part("R1", "R", 6, 2, 1, { R: "1k" }), part("G", "GND", 0, 6), part("Lo", "LBL", 8, 0, 0, { name: "vo" })],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [8, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
  });
  assert.ok(h.ok, h.why);
  assert.deepEqual(h.numText, ["0", "1"]);
  assert.deepEqual(h.denText, ["1000", "1"]);
  assert.equal(h.zeros.length, 1);
  assert.ok(Math.abs(h.zeros[0].re) < 1e-9);
  assert.equal(h.hfGain, 1);
});
