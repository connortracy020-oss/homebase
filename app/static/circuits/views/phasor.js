// The phasor diagram: each chosen voltage and current as an arrow from the origin, turning at
// ω, with its shadow on the real axis. The shadow is the value right now, which is the point:
// v(t) is the projection of a rotating arrow, and a phase lead is an arrow ahead of another.
// Voltages are solid and currents dashed; each kind is scaled so its largest fills the circle.

import { COLORS } from "./plot.js";
import { esc } from "../editor/symbols.js";
import { polarText } from "./phasorfmt.js";

const C = 120, R = 92;

// items: [{name, unit, z: {re, im} (peak), color}]
export function phasorSVG(items, { omega, t, scale = 1 }) {
  const biggest = new Map();
  for (const it of items) biggest.set(it.unit, Math.max(biggest.get(it.unit) || 0, Math.hypot(it.z.re, it.z.im)));
  const a = omega * t, cos = Math.cos(a), sin = Math.sin(a);
  const out = [`<svg class="phasor-svg" viewBox="0 0 240 240" role="img" aria-label="${esc(describe(items, scale))}">`,
    `<circle class="ph-ring" cx="${C}" cy="${C}" r="${R}"/>`,
    `<line class="ph-axis" x1="${C - R - 14}" y1="${C}" x2="${C + R + 14}" y2="${C}"/><line class="ph-axis" x1="${C}" y1="${C - R - 14}" x2="${C}" y2="${C + R + 14}"/>`,
    `<text class="ph-ax" x="${C + R + 10}" y="${C - 5}" text-anchor="end">Re</text><text class="ph-ax" x="${C + 5}" y="${C - R - 6}">Im</text>`];
  items.forEach((it, k) => {
    const big = biggest.get(it.unit) || 1, s = big ? R / big : 0;
    // the arrow at this instant: z·e^{jωt}; screen y points down
    const x = (it.z.re * cos - it.z.im * sin) * s, y = (it.z.re * sin + it.z.im * cos) * s;
    const color = it.color || COLORS[k % COLORS.length], X = C + x, Y = C - y;
    const len = Math.hypot(x, y);
    const dash = it.unit === "A" ? ' stroke-dasharray="5 3"' : "";
    if (len > 2) {
      const ux = x / len, uy = -y / len, hx = X - ux * 8, hy = Y - uy * 8;
      out.push(`<line class="ph-drop" x1="${X.toFixed(1)}" y1="${Y.toFixed(1)}" x2="${X.toFixed(1)}" y2="${C}" stroke="${color}"/>`,
        `<line class="ph-arrow" x1="${C}" y1="${C}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${color}"${dash}/>`,
        `<path d="M${X.toFixed(1)} ${Y.toFixed(1)} L${(hx - uy * 4).toFixed(1)} ${(hy + ux * 4).toFixed(1)} L${(hx + uy * 4).toFixed(1)} ${(hy - ux * 4).toFixed(1)} Z" fill="${color}"/>`,
        `<text class="ph-name" x="${(X + ux * 6).toFixed(1)}" y="${(Y + uy * 6 + 4).toFixed(1)}" text-anchor="${ux < -0.3 ? "end" : ux > 0.3 ? "start" : "middle"}" fill="${color}">${esc(it.name)}</text>`);
    }
    out.push(`<circle cx="${X.toFixed(1)}" cy="${C}" r="3.2" fill="${color}"/>`);
  });
  out.push("</svg>");
  return out.join("");
}

function describe(items, scale) {
  if (!items.length) return "Phasor diagram (nothing chosen yet).";
  return `Phasor diagram: ${items.map((it) => `${it.name} ${polarText(it.z, it.unit, scale)}`).join(", ")}.`;
}
