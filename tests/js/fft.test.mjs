// The FFT and the spectrum of a trace: a sine's amplitude in its own bin, a square wave's odd
// harmonics at 4/(πk), and a real transient run's spectrum.
import { test } from "node:test";
import assert from "node:assert/strict";

import { fft, spectrum } from "../../app/static/circuits/solver/fft.js";
import { transient } from "../../app/static/circuits/solver/tran.js";

test("the FFT of a cosine puts all of it in one bin", () => {
  const N = 64, re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) re[k] = Math.cos((2 * Math.PI * 5 * k) / N);
  fft(re, im);
  assert.ok(Math.abs(re[5] - N / 2) < 1e-9 && Math.abs(re[N - 5] - N / 2) < 1e-9);
  assert.ok(Math.abs(re[4]) < 1e-9 && Math.abs(im[6]) < 1e-9);
});

test("a square wave's spectrum: odd harmonics at 4/(πk), even ones absent (whole periods)", () => {
  const T = 1e-3, t = [], y = [];
  for (let k = 0; k <= 20000; k++) { const tt = (k * 10 * T) / 20000; t.push(tt); y.push((tt % T) < T / 2 ? 1 : -1); }
  const s = spectrum(t, y, { period: T });
  assert.equal(s.window, "whole periods");
  const bin = (f) => s.amp[Math.round(f / s.df)];
  for (const h of [1, 3, 5]) assert.ok(Math.abs(bin(h / T) - 4 / (Math.PI * h)) < 0.01, `harmonic ${h}: ${bin(h / T)}`);
  assert.ok(bin(2 / T) < 0.01 && bin(4 / T) < 0.01);
});

test("a run with a pulse source has its harmonics at multiples of 1/period", () => {
  const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
  const doc = {
    parts: [part("V1", "V", 0, 2, 1, { wave: "pulse", V0: "0", V1: "1", td: "0", tr: "0", tf: "0", pw: "500u", per: "1m" }),
      part("R1", "R", 0, 0, 0, { R: "1k" }), part("C1", "C", 6, 2, 1, { C: "10n" }), part("G", "GND", 0, 6)],
    wires: [{ id: "w1", a: [0, 2], b: [0, 0] }, { id: "w2", a: [4, 0], b: [6, 0] }, { id: "w3", a: [6, 0], b: [6, 2] }, { id: "w4", a: [0, 6], b: [6, 6] }],
  };
  const r = transient(doc, { tstop: 10e-3 });
  assert.ok(r.ok, r.why);
  assert.equal(r.period, 1e-3);
  const s = spectrum(r.t, r.els.C1.v, { period: r.period });
  const bin = (f) => s.amp[Math.round(f / s.df)];
  assert.ok(Math.abs(s.amp[0] - 0.5) < 1e-3, `DC ${s.amp[0]}`);  // the average of a 50 % duty pulse
  // the square wave's odd harmonics 2/(πk), each scaled by the RC's |H(jkω₀)| (τ = 10 µs)
  for (const k of [1, 3, 5]) {
    const wt = 2 * Math.PI * k * 1000 * 1e-5, want = (2 / (Math.PI * k)) / Math.sqrt(1 + wt * wt);
    assert.ok(Math.abs(bin(k * 1000) - want) < 1e-3, `harmonic ${k}: ${bin(k * 1000)} vs ${want}`);
  }
  assert.ok(bin(2000) < 1e-3 && bin(4000) < 1e-3, "no even harmonics at 50 % duty");
});
