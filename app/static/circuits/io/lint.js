// Checks on a drawing that the solver doesn't make, for Claude's circuit tools (they can't look
// at the bench the way you do): wire ends that touch nothing, parts whose pins all sit on one
// node, parts drawn on top of each other, wires running through a symbol, diagonal wires, and
// labels that run into something. Unconnected pins and a missing ground are the solver's own
// warnings already.

import { boxOf, labelPlacement } from "../editor/symbols.js";
import { valueText } from "../editor/labels.js";

const pt = ([x, y]) => `(${+x.toFixed(2)}, ${+y.toFixed(2)})`;
const seg = (w) => `the wire from ${pt(w.a)} to ${pt(w.b)}`;

// where a part's name and value sit, as the 2D view draws them (editor/canvas.js): the name in
// 0.5-unit text and the value in 0.58, about 0.55 em a character
export function labelRect(part) {
  const L = labelPlacement(part), v = valueText(part);
  const idY = L.y + (L.stack === "up" ? -0.72 : 0), valY = L.y + (L.stack === "up" ? 0 : 0.68);
  const w = Math.max(String(part.id).length * 0.5, v.length * 0.58) * 0.55;
  const x0 = L.anchor === "middle" ? L.x - w / 2 : L.x;
  return [x0, idY - 0.38, x0 + w, (v ? valY : idY) + 0.12];
}

const overlap = (a, b, gap = 0) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > gap && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > gap;

// does the segment p-q pass through the inside of box r (Liang-Barsky)?
function crosses(p, q, r) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [d, e] of [[-dx, p[0] - r[0]], [dx, r[2] - p[0]], [-dy, p[1] - r[1]], [dy, r[3] - p[1]]]) {
    if (d === 0) { if (e <= 0) return false; continue; }
    const t = e / d;
    if (d < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-9;
}

const shrink = (b, s) => [b[0] + s, b[1] + s, b[2] - s, b[3] - s];

// wire ends and pins that touch nothing, leaving out a named node's: a and b of a port are open
// on purpose (the solver's rule for its unconnected-pin warning)
const unnamed = (net) => ([x, y]) => !net.nodes[net.nodeAt(`${x},${y}`)]?.label;
export const openEnds = (net) => (net.openEnds || []).filter(unnamed(net));
export const openPins = (net) => (net.openPins || []).filter(unnamed(net));

export function lintDrawing(doc, net) {
  const out = [];
  const seen = new Set();
  for (const e of openEnds(net)) {
    if (seen.has(String(e))) continue;
    seen.add(String(e));
    out.push({ code: "OPEN_END", at: e, message: `A wire ends at ${pt(e)} without touching a pin or another wire.` });
  }
  for (const el of net.elements || []) {
    if (el.nodes.length === 2 && el.nodes[0] >= 0 && el.nodes[0] === el.nodes[1]) {
      out.push({ code: "SHORTED", parts: [el.id], message: `${el.id}'s two pins are on the same node, so it's shorted out.` });
    }
  }
  const parts = doc.parts.filter((p) => p.type !== "GND");
  const boxes = new Map(parts.map((p) => [p, boxOf(p)]));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = boxes.get(parts[i]), b = boxes.get(parts[j]);
      if (!overlap(a, b, 0.15)) continue;
      const at = [(Math.max(a[0], b[0]) + Math.min(a[2], b[2])) / 2, (Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2];
      out.push({ code: "OVERLAP", parts: [parts[i].id, parts[j].id], at, message: `${parts[i].id} and ${parts[j].id} are drawn on top of each other around ${pt(at.map((v) => Math.round(v * 2) / 2))}.` });
    }
  }
  for (const w of doc.wires) {
    if (w.a[0] !== w.b[0] && w.a[1] !== w.b[1]) out.push({ code: "DIAGONAL", message: `${seg(w)[0].toUpperCase()}${seg(w).slice(1)} is diagonal; draw it as horizontal and vertical runs.` });
    for (const p of parts) {
      if (crosses(w.a, w.b, shrink(boxes.get(p), 0.12))) {
        out.push({ code: "THROUGH", parts: [p.id], message: `${seg(w)[0].toUpperCase()}${seg(w).slice(1)} runs through ${p.id}'s symbol.` });
      }
    }
  }
  // labels: cosmetic, but a label on a wire or a part is easy to misread
  const labelled = doc.parts.filter((p) => p.type !== "GND" && p.type !== "LBL");
  const rects = new Map(labelled.map((p) => [p, labelRect(p)]));
  for (const p of labelled) {
    const r = rects.get(p), hits = [];
    for (const q of parts) if (q !== p && overlap(r, boxes.get(q), 0.05)) hits.push(`${q.id}'s symbol`);
    for (const q of labelled) if (q !== p && overlap(r, rects.get(q), 0.05) && labelled.indexOf(q) > labelled.indexOf(p)) hits.push(`${q.id}'s label`);
    for (const w of doc.wires) if (crosses(w.a, w.b, shrink(r, 0.04))) hits.push(seg(w));
    if (hits.length) out.push({ code: "LABEL", parts: [p.id], message: `${p.id}'s label runs into ${[...new Set(hits)].slice(0, 3).join(", ")}: move it or spread the parts out.` });
  }
  return out;
}
