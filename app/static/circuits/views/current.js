// Moving current markers on the schematic. Their speed is a picture of the current's size
// (log scale, relative to the largest current), not the electrons' real drift speed, and the
// spacing is the same everywhere, so markers never "pile up" behind a resistor. Conventional
// current by default; electron flow is a toggle. With reduced motion they stand still.

import { pinPoints } from "../core/doc.js";

const SPACING = 1.25;   // grid units between markers
const MAX_SPEED = 2.4;  // grid units per second for the largest current

export class CurrentFlow {
  constructor(canvas, view) {
    this.canvas = canvas; this.view = view;
    this.ctx = canvas.getContext("2d");
    this.segments = []; this.enabled = false; this.electron = false; this.raf = 0; this.t0 = performance.now();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    new ResizeObserver(() => this.draw()).observe(canvas);
    document.addEventListener("visibilitychange", () => (document.hidden ? this.stop() : this.start()));
  }

  setData(doc, net, sol) {
    const segs = [];
    if (sol?.ok) {
      for (const f of sol.flows || []) segs.push({ a: f.a, b: f.b, i: f.i });
      for (const part of doc.parts) {
        const e = sol.els[part.id];
        if (!e || part.type === "VM") continue;
        const pins = pinPoints(part);
        if (part.type === "OA") segs.push({ a: [pins[2].x - 0.5, pins[2].y], b: [pins[2].x, pins[2].y], i: -e.pins[2].i });
        else if (pins.length === 2) segs.push({ a: [pins[0].x, pins[0].y], b: [pins[1].x, pins[1].y], i: e.pins[0].i, part: true });
      }
    }
    this.imax = Math.max(1e-15, ...segs.map((s) => Math.abs(s.i)));
    this.segments = segs.filter((s) => Math.abs(s.i) > this.imax * 1e-6).map((s) => ({ ...s, len: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) }));
    this.draw();
  }

  setEnabled(on) { this.enabled = on; if (on) this.start(); else { this.stop(); this.clear(); } }

  start() {
    if (!this.enabled || this.raf || this.reduced) { this.draw(); return; }
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  clear() {
    const c = this.canvas;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, c.width, c.height);
  }

  draw() {
    const c = this.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.clear();
    if (!this.enabled || !this.segments.length) return;
    const { x, y, s } = this.view.cam, ctx = this.ctx;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, -x * s * dpr, -y * s * dpr);
    const t = (performance.now() - this.t0) / 1000;
    ctx.lineWidth = 1.6 / s; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255, 238, 200, 0.85)";
    ctx.beginPath();
    for (const g of this.segments) {
      const sign = (g.i > 0 ? 1 : -1) * (this.electron ? -1 : 1);
      const speed = MAX_SPEED * Math.log10(1 + 9 * Math.abs(g.i) / this.imax);
      const ux = (g.b[0] - g.a[0]) / g.len, uy = (g.b[1] - g.a[1]) / g.len;
      const dx = ux * sign, dy = uy * sign, size = 0.19;
      const phase = this.reduced ? SPACING / 2 : ((t * speed) % SPACING + SPACING) % SPACING;
      for (let d = phase; d < g.len; d += SPACING) {
        const along = sign > 0 ? d : g.len - d;
        const px = g.a[0] + ux * along, py = g.a[1] + uy * along;
        ctx.moveTo(px - dx * size - dy * size, py - dy * size + dx * size);
        ctx.lineTo(px + dx * size * 0.6, py + dy * size * 0.6);
        ctx.lineTo(px - dx * size + dy * size, py - dy * size - dx * size);
        if (this.reduced) break;
      }
    }
    ctx.stroke();
  }
}
