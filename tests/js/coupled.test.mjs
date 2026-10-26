// Coupled inductors and ideal transformers (DC, AC and transient), TR-BDF2's error control on
// an underdamped RLC, and the sinusoidal steady state the bench starts a run from.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import { solveAC, STEADY } from "../../app/static/circuits/solver/ac.js";
import { transient } from "../../app/static/circuits/solver/tran.js";
import { naturalModes } from "../../app/static/circuits/solver/modes.js";
import { fromString } from "../../app/static/circuits/core/rational.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });
const close = (z, re, im, tol = 1e-9) => assert.ok(Math.abs(z.re - re) <= tol * (1 + Math.abs(re)) && Math.abs(z.im - im) <= tol * (1 + Math.abs(im)), `${z.re} ${z.im}j vs ${re} ${im}j`);

// source on the left driving the primary (p1 top, p2 bottom), a load across the secondary;
// both sides grounded at the bottom (a transformer doesn't connect them otherwise)
function transformer(xfmr, load, src = { wave: "sine", Vm: "10", w: "1k" }, series = null) {
  // with `series`, a resistor (that many ohms) between the source and the primary
  return {
    parts: [part("V1", "V", 0, 0, 1, src), part("X1", xfmr.type, 4, 0, 0, xfmr.params), load,
      part("G1", "GND", 0, 6), part("G2", "GND", 12, 6), part("Lo", "LBL", 8, 0, 0, { name: "out" }),
      ...(series ? [part("R1", "R", 0, 0, 0, { R: series })] : [])],
    wires: [...(series ? [] : [wire("w1", [0, 0], [4, 0])]), wire("w2", [0, 4], [0, 6]), wire("w3", [0, 6], [4, 6]), wire("w4", [4, 4], [4, 6]),
      wire("w5", [8, 0], [12, 0]), wire("w6", [8, 4], [8, 6]), wire("w7", [8, 6], [12, 6]), wire("w8", [12, 4], [12, 6])],
  };
}
const load8 = part("RL", "R", 12, 0, 1, { R: "8" });

test("ideal transformer 2:1 with an 8 Ω load: v₂ = v₁/2, the primary sees n²R = 32 Ω, exactly", () => {
  const net = compile(migrate(transformer({ type: "TR", params: { n: "2" } }, load8)), { when: STEADY });
  const s = solveAC(net, { omega: 1000, omegaExact: fromString("1000") });
  assert.ok(s.ok, s.errors?.map((e) => e.message).join("; "));
  assert.equal(s.exact, true);
  assert.deepEqual(s.nodes[net.nodeByName.get("out")].vx, ["5", "0"]);
  assert.deepEqual(s.els.V1.ix, ["-5/16", "0"]);      // 10 V / 32 Ω, out of the + terminal
  assert.deepEqual(s.els.RL.ix, ["5/8", "0"]);        // n times the primary current
  close(s.els.X1.s, 0, 0);                             // an ideal transformer absorbs nothing
  // the opposite dot flips the secondary
  const flip = compile(migrate(transformer({ type: "TR", params: { n: "2", dot: "bottom" } }, load8)), { when: STEADY });
  assert.deepEqual(solveAC(flip, { omega: 1000, omegaExact: fromString("1000") }).nodes[flip.nodeByName.get("out")].vx, ["-5", "0"]);
});

test("coupled coils in AC: V₁ = jωL₁I₁ + jωMI₂ and V₂ = jωMI₁ + jωL₂I₂ (M given, exact)", () => {
  // L₁ = 10 mH, L₂ = 40 mH, M = 10 mH at 1000 rad/s: jωL₁ = j10, jωL₂ = j40, jωM = j10 Ω
  const net = compile(migrate(transformer({ type: "K", params: { L1: "10m", L2: "40m", spec: "M", M: "10m" } }, part("RL", "R", 12, 0, 1, { R: "40" }))), { when: STEADY });
  const s = solveAC(net, { omega: 1000, omegaExact: fromString("1000") });
  assert.ok(s.ok, s.errors?.map((e) => e.message).join("; "));
  assert.equal(s.exact, true);
  // by hand: secondary loop 0 = j10 I₁ + (40 + j40) I₂ → I₂ = −j10 I₁/(40 + j40);
  // primary 10 = j10 I₁ + j10 I₂ → I₁ = 10 / (j10 + 100/(40 + j40)) = 10/(1.25 + j8.75)
  const den = { re: 1.25, im: 8.75 }, m2 = den.re ** 2 + den.im ** 2;
  const I1 = { re: (10 * den.re) / m2, im: (-10 * den.im) / m2 };
  close(s.els.X1.i, I1.re, I1.im, 1e-12);
  // power balances: the coils store and return energy, the resistor takes it all
  close({ re: s.els.X1.s.re, im: 0 }, 0, 0, 1e-12);
});

test("coupled coils at DC are two wires (no coupling), and the natural modes see both states", () => {
  const doc = transformer({ type: "K", params: { L1: "10m", L2: "40m", k: "0.5" } }, load8, { V: "10" }, "1");
  const net = compile(migrate(doc));
  const dc = solveDC(net);
  assert.ok(dc.ok, dc.errors?.map((e) => e.message).join("; "));
  // the primary is a wire at DC, so 10 V across R1's 1 Ω drives 10 A; the secondary carries nothing
  assert.ok(Math.abs(dc.els.X1.pins[0].i - 10) < 1e-12);
  assert.ok(Math.abs(dc.els.X1.pins[2].i) < 1e-12);
  const m = naturalModes(compile(migrate(doc), { when: STEADY }));
  assert.ok(m && m.taus.length >= 1);
});

test("coupled coils step response: the secondary current is set by M, and it settles to 0", () => {
  // V1 steps 0 → 10 V through R1 = 1 Ω into L₁; the secondary shorted through 8 Ω
  const doc = transformer({ type: "K", params: { L1: "10m", L2: "10m", k: "0.9" } }, load8, { wave: "step", V0: "0", V1: "10", at: "0" }, "1");
  const r = transient(doc);
  assert.ok(r.ok, r.why);
  const i2 = r.els.RL.i;
  assert.ok(Math.max(...i2.map(Math.abs)) > 0.1, "the secondary picks up a pulse of current");
  assert.ok(Math.abs(i2.at(-1)) < 1e-3, "and it dies away (no DC through a transformer)");
});

test("TR-BDF2 with error control: an underdamped series RLC step matches its closed form", () => {
  // R = 10 Ω, L = 10 mH, C = 1 µF: ω₀ = 10⁴ rad/s, α = R/2L = 500 s⁻¹
  const doc = {
    parts: [part("V1", "V", 0, 2, 1, { wave: "step", V0: "0", V1: "1", at: "0" }), part("R1", "R", 0, 0, 0, { R: "10" }),
      part("L1", "L", 6, 0, 0, { L: "10m" }), part("C1", "C", 12, 2, 1, { C: "1u" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [10, 0], [12, 0]), wire("w4", [12, 0], [12, 2]), wire("w5", [0, 6], [12, 6])],
  };
  const r = transient(doc);
  assert.ok(r.ok, r.why);
  assert.equal(r.method, "TR-BDF2");
  const a = 500, wd = Math.sqrt(1e8 - a * a);
  const exact = (t) => 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t));
  const worst = Math.max(...r.t.map((t, j) => (j ? Math.abs(r.els.C1.v[j] - exact(t)) : 0)));
  assert.ok(worst < 2e-3, `worst error ${worst}`);
  assert.ok(r.hmin < r.hmaxUsed, "the step size changed with the error estimate");
});

test("TR-BDF2 damps a stiff step at once, where the trapezoidal rule rings", () => {
  // τ = 1 µs with steps of 20 µs: the capacitor current should drop to nothing right away
  const doc = {
    parts: [part("V1", "V", 0, 2, 1, { wave: "step", V0: "0", V1: "1", at: "0" }), part("R1", "R", 0, 0, 0, { R: "1" }),
      part("C1", "C", 6, 2, 1, { C: "1u" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
  };
  const r = transient(doc, { tstop: 400e-6, dt: 20e-6 });
  const trap = transient(doc, { tstop: 400e-6, dt: 20e-6, method: "trap" });
  assert.ok(r.ok && trap.ok);
  const after = (res, k) => Math.max(...res.els.C1.i.slice(2 + k).map(Math.abs));
  assert.ok(after(r, 6) < 1e-4, `TR-BDF2 still ${after(r, 6)}`);
  // (the trapezoidal rule keeps swinging: each step multiplies the error by (1 − 10)/(1 + 10))
  assert.ok(after(trap, 6) > 1e-3, `trap ${after(trap, 6)}`);
});

test("a run with a sine source starts from its sinusoidal steady state, not from rest", () => {
  // RC low-pass (ωRC = 1) driven by 10 cos(1000t) since long ago; a switch at 1 ms adds nothing
  const doc = {
    parts: [part("V1", "V", 0, 2, 1, { wave: "sine", Vm: "10", w: "1k" }), part("R1", "R", 0, 0, 0, { R: "1k" }),
      part("C1", "C", 6, 2, 1, { C: "1u" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
  };
  const r = transient(doc, { tstop: 12e-3 });
  assert.ok(r.ok, r.why);
  // steady state: v_C = 10/√2 cos(1000t − 45°), so v_C(0) = 5 V, and it stays on that curve
  const exact = (t) => (10 / Math.SQRT2) * Math.cos(1000 * t - Math.PI / 4);
  assert.ok(Math.abs(r.els.C1.v[0] - 5) < 1e-9, String(r.els.C1.v[0]));
  const worst = Math.max(...r.t.map((t, j) => Math.abs(r.els.C1.v[j] - exact(t))));
  assert.ok(worst < 5e-3, `worst ${worst}`);
});
