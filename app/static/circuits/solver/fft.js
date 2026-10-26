// The spectrum of a transient trace. The trace is resampled evenly and transformed with a
// radix-2 FFT. When the run has a known period (a pulse train, a sine source), the window is
// a whole number of periods at the end of the run, in the steady state, so each harmonic lands
// exactly on a frequency bin and needs no window; otherwise a Hann window keeps the leakage down.

// in-place iterative FFT; re and im are Float64Arrays of a power-of-two length
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// -> {f: [Hz], amp: [peak amplitude per bin], df, window, from, to}
export function spectrum(t, y, { period = null, fromFraction = 0.5, n = 4096 } = {}) {
  const t0 = t[0], t1 = t[t.length - 1];
  let a = t0 + (t1 - t0) * fromFraction;
  const b = t1;
  let whole = false;
  if (period > 0) {
    const k = Math.floor((b - a) / period + 1e-9);
    if (k >= 1) { a = b - k * period; whole = true; }
    else if (b - t0 >= period) { a = b - period; whole = true; }
  }
  const N = n, dt = (b - a) / N;
  const re = new Float64Array(N), im = new Float64Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const tk = a + k * dt;
    while (j < t.length - 2 && t[j + 1] <= tk) j++;
    const ta = t[j], tb = t[j + 1], ya = y[j], yb = y[j + 1];
    let v = tb > ta ? ya + ((yb - ya) * (tk - ta)) / (tb - ta) : yb;
    if (!Number.isFinite(v)) v = Number.isFinite(ya) ? ya : Number.isFinite(yb) ? yb : 0;
    re[k] = v;
  }
  if (!whole) for (let k = 0; k < N; k++) re[k] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N);  // Hann
  const gain = whole ? 1 : 2;  // the Hann window halves a sine's amplitude on average
  fft(re, im);
  const half = N / 2, f = [], amp = [];
  for (let k = 0; k <= half; k++) {
    f.push(k / (N * dt));
    amp.push(((k === 0 || k === half ? 1 : 2) * gain * Math.hypot(re[k], im[k])) / N);
  }
  return { f, amp, df: 1 / (N * dt), window: whole ? "whole periods" : "Hann", from: a, to: b };
}
