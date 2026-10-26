// Three-phase sources against the textbook relations: |V_L| = √3 |V_φ| with V_ab 30° ahead of
// V_an, a Δ load's line currents √3 times its phase currents, P = √3 V_L I_L pf, no neutral
// current when balanced, and a shifted neutral when not.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveAC, acFrequency, STEADY } from "../../app/static/circuits/solver/ac.js";
import { transient } from "../../app/static/circuits/solver/tran.js";
import { naturalModes, polyRoots } from "../../app/static/circuits/solver/modes.js";

const W = 2 * Math.PI * 60;
let n = 0;
const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const label = (name, x, y) => part(`L${++n}`, "LBL", x, y, 0, { name });
const mag = (z) => Math.hypot(z.re, z.im), deg = (z) => (Math.atan2(z.im, z.re) * 180) / Math.PI;
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * (1 + Math.abs(b)), `${a} vs ${b}`);
const ang = (a, b) => assert.ok(Math.abs(((a - b + 540) % 360) - 180) < 1e-6, `${a}° vs ${b}°`);

// a two-terminal part between two named nodes, placed in its own spot on the grid
function between(id, type, from, to, params, slot) {
  const y = 10 + 4 * slot;
  return [part(id, type, 20, y, 0, params), label(from, 20, y), label(to, 24, y)];
}

function solve(parts) {
  const net = compile(migrate({ parts, wires: [] }), { when: STEADY });
  const f = acFrequency(net);
  const s = solveAC(net, { omega: f.omega, omegaExact: f.exact });
  assert.ok(s.ok, s.errors?.map((e) => e.message).join("; "));
  const v = (name) => s.nodes[net.nodeByName.get(name)].v;
  const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  return { s, net, v, vd: (a, b) => sub(v(a), v(b)) };
}

const ySource = (params = {}) => [part("S", "V3Y", 0, 0, 0, { V3m: "120", ...params }), label("A", 4, 0), label("B", 4, 2), label("C", 4, 4), label("N", 0, 2), part("G", "GND", 0, 2)];

test("balanced Y–Y: |V_ab| = √3·120 V, 30° ahead of V_an; the neutral wire carries nothing", () => {
  const load = ["A", "B", "C"].flatMap((ph, k) => [...between(`R${ph}`, "R", ph, `${ph}m`, { R: "6" }, 2 * k), ...between(`L${ph}`, "L", `${ph}m`, "X", { L: String(8 / W) }, 2 * k + 1)]);
  const { s, v, vd } = solve([...ySource(), ...load, ...between("Wn", "R", "X", "N", { R: "1e-6" }, 7)]);
  const rms = Math.SQRT1_2;
  near(mag(v("A")) * rms, 120);
  near(mag(vd("A", "B")) * rms, 120 * Math.sqrt(3));
  ang(deg(vd("A", "B")), deg(v("A")) + 30);
  ang(deg(v("B")), deg(v("A")) - 120);
  // each phase: 120 V across 6 + j8 Ω (10 Ω at −53.13°): 12 A rms, and nothing returns in the neutral
  near(mag(s.els.RA.i) * rms, 12, 1e-9);
  assert.ok(mag(s.els.Wn.i) < 1e-6 * 12);
  // total power 3·|I|²R = 3·144·6 W, = √3 V_L I_L pf
  const P = -s.els.S.s.re;
  near(P, 3 * 144 * 6, 1e-9);
  near(P, Math.sqrt(3) * 120 * Math.sqrt(3) * 12 * 0.6, 1e-9);
});

test("acb sequence: phase b leads phase a by 120°", () => {
  const load = ["A", "B", "C"].flatMap((ph, k) => between(`R${ph}`, "R", ph, "N", { R: "10" }, k));
  const { v } = solve([...ySource({ seq: "acb" }), ...load]);
  ang(deg(v("B")), deg(v("A")) + 120);
});

test("Y source into a Δ load: line currents are √3 times the phase currents, 30° behind", () => {
  const load = [["A", "B"], ["B", "C"], ["C", "A"]].flatMap(([p, q], k) => between(`R${p}${q}`, "R", p, q, { R: "30" }, k));
  const { s } = solve([...ySource(), ...load]);
  const Iab = s.els.RAB.i, Ica = s.els.RCA.i, Ia = { re: Iab.re - Ica.re, im: Iab.im - Ica.im };
  near(mag(Ia), Math.sqrt(3) * mag(Iab));
  ang(deg(Ia), deg(Iab) - 30);
  // and that line current is what the source puts out of terminal a
  const out = { re: -s.els.S.pins[0].i.re, im: -s.els.S.pins[0].i.im };
  near(out.re, Ia.re); near(out.im, Ia.im);
});

test("a Δ source's line voltages are its windings; a balanced Y load sees V_L/√3, 30° behind", () => {
  const parts = [part("S", "V3D", 0, 0, 0, { V3m: "208" }), label("A", 4, 0), label("B", 4, 2), label("C", 4, 4),
    ...["A", "B", "C"].flatMap((ph, k) => between(`R${ph}`, "R", ph, "X", { R: "12" }, k)), label("X", 30, 30), part("G", "GND", 30, 30)];
  const { v, vd } = solve(parts);
  const rms = Math.SQRT1_2;
  near(mag(vd("A", "B")) * rms, 208);
  near(mag(vd("C", "A")) * rms, 208);
  near(mag(vd("A", "X")) * rms, 208 / Math.sqrt(3));
  ang(deg(vd("A", "X")), deg(vd("A", "B")) - 30);
  assert.ok(v("X"));
});

test("an unbalanced Y load with no neutral wire: the star point shifts off the neutral", () => {
  const load = [["A", "10"], ["B", "20"], ["C", "40"]].flatMap(([ph, r], k) => between(`R${ph}`, "R", ph, "X", { R: r }, k));
  const { vd } = solve([...ySource(), ...load]);
  // Millman: V_XN = Σ(V/R) / Σ(1/R)
  const sv = (deg0, r) => ({ re: (120 * Math.SQRT2 * Math.cos((deg0 * Math.PI) / 180)) / r, im: (120 * Math.SQRT2 * Math.sin((deg0 * Math.PI) / 180)) / r });
  const terms = [sv(0, 10), sv(-120, 20), sv(120, 40)], g = 1 / 10 + 1 / 20 + 1 / 40;
  const want = { re: terms.reduce((a, t) => a + t.re, 0) / g, im: terms.reduce((a, t) => a + t.im, 0) / g };
  const got = vd("X", "N");
  near(got.re, want.re, 1e-9); near(got.im, want.im, 1e-9);
  assert.ok(mag(got) > 10);
});

test("in a transient, a three-phase source's phases add to zero at every instant", () => {
  const load = ["A", "B", "C"].flatMap((ph, k) => between(`R${ph}`, "R", ph, "X", { R: "10" }, k));
  const r = transient({ parts: [...ySource(), ...load, ...between("Rn", "R", "X", "N", { R: "1" }, 5)], wires: [] }, { tstop: 1 / 30 });
  assert.ok(r.ok, r.why);
  const sum = r.t.map((_, j) => r.els.RA.i[j] + r.els.RB.i[j] + r.els.RC.i[j]);
  assert.ok(Math.max(...sum.map(Math.abs)) < 1e-9, "balanced: no neutral current at any instant");
  assert.ok(Math.max(...r.els.RA.i.map(Math.abs)) > 16);   // 120√2/10 ≈ 17 A peak
});

test("repeated roots come out exact: three identical loads have one triple mode, not three that wobble", () => {
  const near0 = (z, re, im) => assert.ok(Math.abs(z.re - re) <= 1e-12 * Math.abs(re) && Math.abs(z.im - im) <= 1e-12 * (1 + Math.abs(im)), `${z.re} ${z.im}j vs ${re} ${im}j`);
  for (const z of polyRoots([1, 3 * 282.75, 3 * 282.75 ** 2, 282.75 ** 3])) near0(z, -282.75, 0);   // (s + 282.75)³
  const pair = polyRoots([1, 4, 14, 20, 25]);                                                   // (s² + 2s + 5)²
  assert.equal(pair.filter((z) => z.im > 0).length, 2);
  for (const z of pair) near0(z, -1, Math.sign(z.im) * 2);
  // the Y–Y load with its star point on the neutral: τ = L/R for each phase, and no made-up
  // oscillation (round-off used to split the triple root into a wobble with a 13-hour period)
  const load = ["A", "B", "C"].flatMap((ph, k) => [...between(`R${ph}`, "R", ph, `${ph}m`, { R: "6" }, 2 * k), ...between(`L${ph}`, "L", `${ph}m`, "N", { L: String(8 / W) }, 2 * k + 1)]);
  const net = compile(migrate({ parts: [...ySource(), ...load], wires: [] }), { when: STEADY });
  const m = naturalModes(net);
  assert.deepEqual(m.periods, []);
  for (const tau of m.taus) near(tau, 8 / W / 6, 1e-9);
});
