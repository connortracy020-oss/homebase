// AC steady state (phasors) against answers worked by hand: exact where ω and the values are
// exact, and the complex power always balancing.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveAC, acFrequency, acThevenin, sourceDrive, STEADY } from "../../app/static/circuits/solver/ac.js";
import { phaseRGB } from "../../app/static/circuits/views/palette.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import { eigenvalues } from "../../app/static/circuits/solver/modes.js";
import { fromString } from "../../app/static/circuits/core/rational.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const wire = (id, a, b) => ({ id, a, b });
const sine = (amp, w = "1k", extra = {}) => ({ wave: "sine", Vm: amp, w, ...extra });

function ac(doc, omega = 1000) {
  const net = compile(migrate(doc), { when: STEADY });
  const f = acFrequency(net);
  const s = solveAC(net, { omega: f ? f.omega : omega, omegaExact: f ? f.exact : fromString(String(omega)) });
  assert.ok(s.ok, s.errors?.map((e) => e.message).join("; "));
  return { net, s, at: (x, y) => s.nodes[net.nodeAt(`${x},${y}`)] };
}
const close = (z, re, im, tol = 1e-9) => assert.ok(Math.abs(z.re - re) <= tol * (1 + Math.abs(re)) && Math.abs(z.im - im) <= tol * (1 + Math.abs(im)), `${z.re} ${z.im}j vs ${re} ${im}j`);

// V1 (left, + on top) -> R1 across the top -> C1 down the right side
const rcLowPass = (src = sine("1")) => ({
  parts: [part("V1", "V", 0, 2, 1, src), part("R1", "R", 0, 0, 0, { R: "1k" }), part("C1", "C", 6, 2, 1, { C: "1u" }), part("G", "GND", 0, 6)],
  wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [6, 0], [6, 2]), wire("w4", [0, 6], [6, 6])],
});

test("RC low-pass at ω = 1/RC: V_C = (1 − j)/2 V exactly, and the power balances", () => {
  const { s, at } = ac(rcLowPass());
  assert.equal(s.exact, true);
  assert.deepEqual(at(6, 0).vx, ["1/2", "-1/2"]);
  // R absorbs ½|I|²R = 0.25 mW; C absorbs only reactive power; the source delivers both
  close(s.els.R1.s, 2.5e-4, 0);
  close(s.els.C1.s, 0, -2.5e-4);
  close(s.els.V1.s, -2.5e-4, 2.5e-4);
  // the same circuit with f in Hz is the same to rounding (but can't be exact: ω = 2πf)
  const hz = ac(rcLowPass(sine("1", undefined, { funit: "Hz", f: String(1000 / (2 * Math.PI)) })));
  assert.equal(hz.s.exact, false);
  close(hz.at(6, 0).v, 0.5, -0.5, 1e-9);
});

test("series RLC at resonance: the impedances of L and C cancel, I = V/R, V_L = j V", () => {
  const { s } = ac({
    parts: [part("V1", "V", 0, 2, 1, sine("1")), part("R1", "R", 0, 0, 0, { R: "10" }), part("L1", "L", 6, 0, 0, { L: "10m" }),
      part("C1", "C", 12, 2, 1, { C: "100u" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [10, 0], [12, 0]), wire("w4", [12, 0], [12, 2]), wire("w5", [0, 6], [12, 6])],
  });
  assert.deepEqual(s.els.R1.ix, ["1/10", "0"]);
  assert.deepEqual(s.els.L1.vx, ["0", "1"]);
  assert.deepEqual(s.els.C1.vx, ["0", "-1"]);
  close(s.els.L1.s, 0, 0.05);   // ½|I|²X_L: the inductor stores, the capacitor gives back
  close(s.els.C1.s, 0, -0.05);
});

test("an op-amp integrator at AC: vo = −vin/(jωRC) = j vin when ωRC = 1", () => {
  const { s, net } = ac({
    parts: [part("U1", "OA", 10, 4), part("V1", "V", 2, 6, 1, sine("1")), part("R1", "R", 5, 3, 0, { R: "1k" }),
      part("C1", "C", 10, 0, 0, { C: "1u" }), part("G", "GND", 2, 10), part("G2", "GND", 8, 5), part("Lo", "LBL", 16, 4, 0, { name: "vo" })],
    wires: [wire("w1", [2, 6], [2, 3]), wire("w2", [2, 3], [5, 3]), wire("w3", [9, 3], [10, 3]), wire("w4", [9, 3], [9, 0]),
      wire("w5", [9, 0], [10, 0]), wire("w6", [14, 0], [16, 0]), wire("w7", [16, 0], [16, 4]), wire("w8", [15, 4], [16, 4]),
      wire("w9", [10, 5], [8, 5]), wire("w10", [2, 10], [2, 10])],
  });
  assert.deepEqual(s.nodes[net.nodeByName.get("vo")].vx, ["0", "1"]);
  // at DC the same circuit has no feedback path, and the bench says so instead of guessing
  const dc = solveDC(net);
  assert.equal(dc.ok, false);
});

test("a source's phase sets its phasor: 90° is exactly j, 30° needs decimals; RMS amplitudes are converted", () => {
  const ninety = ac(rcLowPass(sine("1", "1k", { ph: "90" })));
  assert.deepEqual(ninety.at(6, 0).vx, ["1/2", "1/2"]);   // j · (1 − j)/2
  const thirty = ac(rcLowPass(sine("1", "1k", { ph: "30" })));
  assert.equal(thirty.s.exact, false);
  const z = { re: Math.cos(Math.PI / 6), im: Math.sin(Math.PI / 6) };
  close(thirty.at(6, 0).v, (z.re + z.im) / 2, (z.im - z.re) / 2);
  const rms = ac(rcLowPass(sine("10", "1k", { scale: "rms" })));
  close(rms.at(0, 0).v, 10 * Math.SQRT2, 0);
});

test("sources at two frequencies: the phasor solution keeps the ones at the analysis frequency", () => {
  const doc = rcLowPass();
  doc.parts.push(part("V2", "V", 8, 2, 1, sine("5", "2k")));
  doc.wires.push(wire("w9", [6, 0], [8, 0]), wire("w10", [8, 0], [8, 2]), wire("w11", [6, 6], [8, 6]));
  const net = compile(migrate(doc), { when: STEADY });
  const f = acFrequency(net);
  assert.equal(f.mixed, true);
  const s = solveAC(net, { omega: 1000, omegaExact: f.exact });
  assert.ok(s.ok);
  // V2 is off (a short) at 1000 rad/s, so the output node is held at 0
  assert.deepEqual(s.nodes[net.nodeAt("6,0")].vx, ["0", "0"]);
});

test("an ideal parallel LC driven at resonance has no solution, and the bench explains why", () => {
  const net = compile(migrate({
    parts: [part("I1", "I", 0, 2, 1, { wave: "sine", Im: "1m", w: "1k" }), part("L1", "L", 4, 2, 1, { L: "1" }),
      part("C1", "C", 8, 2, 1, { C: "1u" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [8, 2]), wire("w2", [0, 6], [8, 6])],
  }), { when: STEADY });
  const s = solveAC(net, { omega: 1000, omegaExact: fromString("1000") });
  assert.equal(s.ok, false);
  assert.equal(s.errors[0].code, "SINGULAR");
  assert.match(s.errors[0].message, /resonate/);
});

test("AC Thevenin: Z_th = 3 + j4 Ω behind 10 V; max power with Z_L = 3 − j4 Ω is 100/24 W", () => {
  const net = compile(migrate({
    parts: [part("V1", "V", 0, 2, 1, sine("10")), part("R1", "R", 0, 0, 0, { R: "3" }), part("L1", "L", 6, 0, 0, { L: "4m" }),
      part("Ta", "LBL", 12, 0, 0, { name: "a" }), part("Tb", "LBL", 12, 6, 0, { name: "b" }), part("G", "GND", 0, 6)],
    wires: [wire("w1", [0, 2], [0, 0]), wire("w2", [4, 0], [6, 0]), wire("w3", [10, 0], [12, 0]), wire("w4", [0, 6], [12, 6])],
  }), { when: STEADY });
  const t = acThevenin(net, { nodes: [net.nodeByName.get("a"), net.nodeByName.get("b")] }, { omega: 1000, omegaExact: fromString("1000") });
  assert.ok(t.ok, t.why);
  close(t.voc, 10, 0);
  close(t.zth, 3, 4);
  close(t.isc, 10 / 25 * 3, -10 / 25 * 4);   // 10/(3 + 4j)
  close(t.maxPower.zl, 3, -4);
  assert.ok(Math.abs(t.maxPower.p - 100 / 24) < 1e-9);
});

test("DC analysis of a sine source sees only its offset", () => {
  const net = compile(migrate(rcLowPass(sine("1", "1k", { Vdc: "2" }))));
  const s = solveDC(net);
  assert.ok(s.ok);
  assert.equal(s.nodes[net.nodeAt("6,0")].v, 2);
});

test("small helpers: eigenvalues still fine after the field changes", () => {
  const ev = eigenvalues([[0, 1], [-2, -3]]).map((z) => z.re).sort((a, b) => a - b);
  assert.ok(Math.abs(ev[0] + 2) < 1e-9 && Math.abs(ev[1] + 1) < 1e-9);
});

test("the what-if slider's drive moves every source to the new ω: the low-pass falls as 1/√(1 + (ωRC)²)", () => {
  const net = compile(migrate(rcLowPass()), { when: STEADY });
  for (const w of [100, 1000, 10000]) {
    const s = solveAC(net, { omega: w, omegaExact: null, drive: sourceDrive(w, { any: true }) });
    assert.ok(s.ok);
    const z = s.nodes[net.nodeAt("6,0")].v, want = 1 / Math.sqrt(1 + (w * 1e-3) ** 2);
    assert.ok(Math.abs(Math.hypot(z.re, z.im) - want) < 1e-12, `|vo| at ${w}: ${Math.hypot(z.re, z.im)} vs ${want}`);
    assert.ok(Math.abs(Math.atan2(z.im, z.re) + Math.atan(w * 1e-3)) < 1e-12, "phase −atan(ωRC)");
  }
  // without any, a source at another frequency is off at this one
  const off = solveAC(net, { omega: 2000, omegaExact: null, drive: sourceDrive(2000) });
  assert.ok(off.ok && Math.hypot(off.nodes[net.nodeAt("6,0")].v.re, off.nodes[net.nodeAt("6,0")].v.im) === 0);
});

test("phase colors stay in gamut, keep their lightness, and go grey at zero strength", () => {
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ls = [];
  for (let k = 0; k < 72; k++) {
    const c = phaseRGB((k * Math.PI) / 36);
    assert.ok(c.every((x) => Number.isInteger(x) && x >= 0 && x <= 255));
    ls.push(lum(c));
  }
  assert.ok(Math.max(...ls) - Math.min(...ls) < 0.12, `lightness spread ${Math.min(...ls)}..${Math.max(...ls)}`);
  const grey = phaseRGB(1.234, 0);
  assert.ok(Math.max(...grey) - Math.min(...grey) <= 1, `grey ${grey}`);
  assert.notDeepEqual(phaseRGB(0), phaseRGB(Math.PI));   // opposite phases look different
});
