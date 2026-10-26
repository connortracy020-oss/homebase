// What's under the pointer: a terminal (or a loose wire end), a part, a wire, or nothing.
// Terminals win when close, so starting a wire never grabs the part by mistake.

import { pinPoints } from "../core/doc.js";
import { boxOf } from "./symbols.js";

export function hitTest(doc, x, y, { pinRadius = 0.5, wireRadius = 0.35, touch = false } = {}) {
  const pr = touch ? pinRadius * 1.5 : pinRadius;
  let best = null, bestD = pr;
  for (const part of doc.parts) {
    pinPoints(part).forEach((pp, index) => {
      const d = Math.hypot(pp.x - x, pp.y - y);
      if (d < bestD) { bestD = d; best = { kind: "pin", part, pin: index, point: [pp.x, pp.y] }; }
    });
  }
  for (const w of doc.wires) {
    for (const end of [w.a, w.b]) {
      const d = Math.hypot(end[0] - x, end[1] - y);
      if (d < bestD) { bestD = d; best = { kind: "end", wire: w, point: [...end] }; }
    }
  }
  if (best) return best;
  // smallest part box under the pointer (so a label inside a big part still wins)
  let partHit = null, area = Infinity;
  for (const part of doc.parts) {
    const [x0, y0, x1, y1] = boxOf(part);
    const m = touch ? 0.45 : 0.2;
    if (x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m) {
      const a = (x1 - x0) * (y1 - y0);
      if (a < area) { area = a; partHit = part; }
    }
  }
  if (partHit) return { kind: "part", part: partHit };
  const wr = touch ? wireRadius * 1.6 : wireRadius;
  let wire = null, wd = wr;
  for (const w of doc.wires) {
    const d = segDist([x, y], w.a, w.b);
    if (d < wd) { wd = d; wire = w; }
  }
  if (wire) return { kind: "wire", wire, point: snapOnto([x, y], wire) };
  return { kind: "none" };
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// nearest grid point on a horizontal or vertical wire
export function snapOnto([x, y], w) {
  if (w.a[1] === w.b[1]) return [Math.max(Math.min(w.a[0], w.b[0]), Math.min(Math.max(w.a[0], w.b[0]), Math.round(x))), w.a[1]];
  if (w.a[0] === w.b[0]) return [w.a[0], Math.max(Math.min(w.a[1], w.b[1]), Math.min(Math.max(w.a[1], w.b[1]), Math.round(y)))];
  return [Math.round(x), Math.round(y)];
}

// parts and wires inside a rectangle (box select)
export function inBox(doc, a, b) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  return {
    parts: doc.parts.filter((p) => { const bx = boxOf(p); return inside([bx[0], bx[1]]) && inside([bx[2], bx[3]]); }).map((p) => p.id),
    wires: doc.wires.filter((w) => inside(w.a) && inside(w.b)).map((w) => w.id),
  };
}
