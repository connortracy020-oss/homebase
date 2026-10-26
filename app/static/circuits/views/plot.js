// A small, crisp line chart for sweeps and the scope: log or linear x, one or two y axes,
// a cursor that reads every trace, and markers (the present value, a peak, t = 0).

import { fmt } from "../core/units.js";

const COLORS = ["#f0b955", "#8fb4d6", "#a9c48f", "#d79a8a", "#c9a9c5"];

export class Plot {
  constructor(canvas, readout) {
    this.canvas = canvas; this.readout = readout;
    this.data = null; this.cursor = null;
    new ResizeObserver(() => this.draw()).observe(canvas);
    canvas.addEventListener("pointermove", (e) => {
      this.cursor = e.offsetX;
      if (this.dragging && this.onPick) this.onPick(this.xAt(e.offsetX));
      this.draw();
    });
    canvas.addEventListener("pointerleave", () => { this.cursor = null; this.draw(); });
    // with onPick set, pressing or dragging on the plot picks an x (a time on the scope, a frequency on a Bode plot)
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.onPick) return;
      this.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      this.onPick(this.xAt(e.offsetX));
    });
    const up = () => { this.dragging = false; };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  // the x value under a pixel column (clamped to the plotted range)
  xAt(px) {
    const lay = this.layout;
    if (!lay) return null;
    const f = Math.max(0, Math.min(1, (px - lay.L) / (lay.W - lay.L - lay.R)));
    return lay.log ? 10 ** (Math.log10(lay.X0) + f * (Math.log10(lay.X1) - Math.log10(lay.X0))) : lay.X0 + f * (lay.X1 - lay.X0);
  }

  // {x: [...], xLabel, xUnit, xLog, series: [{name, unit, y: [...], axis: 0|1}], markers: [{x, label}]}
  set(data) { this.data = data; this.draw(); }

  draw() {
    const c = this.canvas, d = this.data, dpr = Math.min(2, devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!d || !d.x.length) return;
    const L = 58, R = d.series.some((s) => s.axis === 1) ? 58 : 16, T = 14, B = 30;
    const xs = d.x, X0 = xs[0], X1 = xs[xs.length - 1];
    const fx = d.xLog ? (x) => (Math.log10(x) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0)) : (x) => (x - X0) / (X1 - X0 || 1);
    const px = (x) => L + fx(x) * (W - L - R);
    this.layout = { L, R, W, X0, X1, log: !!d.xLog };
    // each y axis spans round numbers that contain its traces
    const ranges = [0, 1].map((ax) => {
      const vals = d.series.filter((s) => (s.axis || 0) === ax).flatMap((s) => s.y.filter((v) => v !== null && Number.isFinite(v)));
      if (!vals.length) return null;
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
      const step = niceStep((hi - lo) / 4);
      return [Math.floor(lo / step - 1e-9) * step, Math.ceil(hi / step + 1e-9) * step, step];
    });
    const py = (v, ax) => { const [lo, hi] = ranges[ax]; return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    const css = getComputedStyle(c);
    const ink = css.getPropertyValue("--mat-soft").trim() || "#b3aa97", line = css.getPropertyValue("--mat-line").trim() || "#3a3731";
    g.font = "11px Inter, system-ui, sans-serif";
    g.lineWidth = 1;
    // grid and axes
    g.strokeStyle = line; g.fillStyle = ink;
    for (const ax of [0, 1]) {
      if (!ranges[ax]) continue;
      const [lo, hi, step] = ranges[ax], unit = d.series.find((s) => (s.axis || 0) === ax)?.unit || "";
      for (let v = lo; v <= hi + step * 1e-6; v += step) {
        const y = py(v, ax);
        if (ax === 0) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.globalAlpha = 1; }
        g.textAlign = ax === 0 ? "right" : "left";
        g.fillText(fmt(v, unit, 3), ax === 0 ? L - 6 : W - R + 6, y + 4);
      }
    }
    const ticks = d.xLog ? logTicks(X0, X1) : linTicks(X0, X1);
    g.textAlign = "center";
    for (const t of ticks) { const x = px(t); g.globalAlpha = 0.35; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.globalAlpha = 1; g.fillText(fmt(t, d.xUnit, 3), x, H - B + 16); }
    // markers
    for (const m of d.markers || []) {
      if (m.x < Math.min(X0, X1) || m.x > Math.max(X0, X1)) continue;
      const x = px(m.x);
      g.setLineDash([4, 3]); g.strokeStyle = m.color || "#ffd98a"; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = m.color || "#ffd98a"; g.textAlign = x > W - 120 ? "right" : "left";
      g.fillText(m.label, x + (x > W - 120 ? -5 : 5), m.low ? H - B - 6 : T + 10);
    }
    // traces
    d.series.forEach((s, k) => {
      const ax = s.axis || 0;
      if (!ranges[ax]) return;
      g.strokeStyle = s.color || COLORS[k % COLORS.length]; g.lineWidth = 2; g.beginPath();
      let pen = false;
      s.y.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { pen = false; return; }
        const X = px(xs[i]), Y = py(v, ax);
        if (pen) g.lineTo(X, Y); else { g.moveTo(X, Y); pen = true; }
      });
      g.stroke();
    });
    // cursor readout
    if (this.cursor !== null && this.cursor >= L && this.cursor <= W - R) {
      let best = 0, bd = Infinity;
      xs.forEach((x, i) => { const dd = Math.abs(px(x) - this.cursor); if (dd < bd) { bd = dd; best = i; } });
      const X = px(xs[best]);
      g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(X, T); g.lineTo(X, H - B); g.stroke();
      d.series.forEach((s, k) => { const v = s.y[best]; if (v === null || !ranges[s.axis || 0]) return; g.fillStyle = s.color || COLORS[k % COLORS.length]; g.beginPath(); g.arc(X, py(v, s.axis || 0), 3.5, 0, 7); g.fill(); });
      if (this.readout) this.readout.innerHTML = `<b>${d.xLabel} = ${fmt(xs[best], d.xUnit)}</b> ` + d.series.map((s, k) => `<span style="color:${s.color || COLORS[k % COLORS.length]}">${s.name} ${fmt(s.y[best], s.unit)}</span>`).join(" ");
    } else if (this.readout) {
      this.readout.innerHTML = d.series.map((s, k) => `<span style="color:${s.color || COLORS[k % COLORS.length]}">● ${s.name}</span>`).join(" ");
    }
  }
}

function niceStep(x) {
  const e = 10 ** Math.floor(Math.log10(x || 1)), m = x / e;
  return ([1, 2, 2.5, 5, 10].find((k) => m <= k + 1e-9) || 10) * e;
}

function logTicks(a, b) {
  const out = [];
  for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) for (const m of [1, 2, 5]) { const t = m * 10 ** e; if (t >= a * 0.999 && t <= b * 1.001) out.push(t); }
  return out.length > 8 ? out.filter((t) => /^1/.test(t.toExponential())) : out;
}

function linTicks(a, b) {
  const span = b - a, step = 10 ** Math.floor(Math.log10(span / 5 || 1));
  const s = [1, 2, 5, 10].map((k) => k * step).find((k) => span / k <= 6) || step * 10;
  const out = [];
  for (let t = Math.ceil(a / s) * s; t <= b + 1e-12; t += s) out.push(Number(t.toPrecision(12)));
  return out;
}

export { COLORS };
