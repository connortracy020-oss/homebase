// The 2D schematic: an SVG in grid units with a movable camera. Layers, bottom to top:
// grid, wires, junction dots and open ends, parts, labels, overlay (voltages, chips),
// selection, and the ghost/preview layer while you place or wire.

import { pinPoints } from "../core/doc.js";
import { symbolMarkup, partTransform, labelPlacement, esc, boxOf } from "./symbols.js";
import { valueText } from "./labels.js";

const NS = "http://www.w3.org/2000/svg";

export class Schematic {
  constructor(svg) {
    this.svg = svg;
    this.cam = { x: -2, y: -3, s: 24 };  // world point at the top-left, pixels per grid unit
    svg.innerHTML = `
      <defs>
        <pattern id="sch-grid" patternUnits="userSpaceOnUse" width="1" height="1"><circle class="grid-dot" cx="0" cy="0" r="0.05"/></pattern>
        <pattern id="sch-grid5" patternUnits="userSpaceOnUse" width="5" height="5"><circle class="grid-dot" cx="0" cy="0" r="0.14"/></pattern>
        <filter id="sch-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.18"/></filter>
        <filter id="sch-heat" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.32"/></filter>
      </defs>
      <rect class="grid-bg" fill="url(#sch-grid)"/>
      <g class="layer heat"></g><g class="layer wires"></g><g class="layer dots"></g><g class="layer parts"></g>
      <g class="layer labels"></g><g class="layer overlay"></g><g class="layer sel"></g><g class="layer ghost"></g>`;
    this.layer = Object.fromEntries([...svg.querySelectorAll(".layer")].map((g) => [g.classList[1], g]));
    this.gridBg = svg.querySelector(".grid-bg");
    new ResizeObserver(() => this.applyCamera()).observe(svg);
    this.applyCamera();
  }

  // ---- camera ----
  size() { const r = this.svg.getBoundingClientRect(); return [r.width || 800, r.height || 500]; }

  applyCamera() {
    const [w, h] = this.size(), { x, y, s } = this.cam;
    this.svg.setAttribute("viewBox", `${x} ${y} ${w / s} ${h / s}`);
    const big = s < 9;
    this.gridBg.setAttribute("fill", big ? "url(#sch-grid5)" : "url(#sch-grid)");
    this.gridBg.setAttribute("x", Math.floor(x) - 5); this.gridBg.setAttribute("y", Math.floor(y) - 5);
    this.gridBg.setAttribute("width", w / s + 10); this.gridBg.setAttribute("height", h / s + 10);
    this.svg.style.setProperty("--zoom", s);
    this.onCamera?.(this.cam);
  }

  toWorld(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return [this.cam.x + (clientX - r.left) / this.cam.s, this.cam.y + (clientY - r.top) / this.cam.s];
  }

  toScreen(x, y) {
    const r = this.svg.getBoundingClientRect();
    return [r.left + (x - this.cam.x) * this.cam.s, r.top + (y - this.cam.y) * this.cam.s];
  }

  zoomAt(factor, clientX, clientY) {
    const [wx, wy] = this.toWorld(clientX, clientY);
    const s = Math.min(90, Math.max(5, this.cam.s * factor));
    const r = this.svg.getBoundingClientRect();
    this.cam = { s, x: wx - (clientX - r.left) / s, y: wy - (clientY - r.top) / s };
    this.applyCamera();
  }

  panBy(dx, dy) {
    this.cam = { ...this.cam, x: this.cam.x - dx / this.cam.s, y: this.cam.y - dy / this.cam.s };
    this.applyCamera();
  }

  // frame the circuit (or a default area when it's empty)
  fit(doc, { maxScale = 34 } = {}) {
    const [w, h] = this.size();
    const b = bounds(doc) || [-2, -2, 14, 8];
    // room for the voltage pills and labels that sit outside the parts
    const bw = b[2] - b[0] + 8, bh = b[3] - b[1] + 7;
    const s = Math.max(8, Math.min(maxScale, w / bw, h / bh));
    this.cam = { s, x: (b[0] + b[2]) / 2 - w / s / 2, y: (b[1] + b[3]) / 2 - 0.6 - h / s / 2 };
    this.applyCamera();
  }

  // ---- drawing ----
  draw(doc, net) {
    this.doc = doc; this.net = net;
    this.layer.wires.innerHTML = doc.wires.map((w) =>
      `<g class="w" data-wire="${esc(w.id)}"><line class="halo" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}"/><line class="core" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}"/></g>`).join("");
    const dots = (net?.junctions || []).map(([x, y]) => `<circle class="junction" cx="${x}" cy="${y}" r="0.17"/>`);
    const open = [...(net?.openEnds || []), ...(net?.openPins || [])].map(([x, y]) => `<circle class="open-end" cx="${x}" cy="${y}" r="0.2"/>`);
    this.layer.dots.innerHTML = dots.join("") + open.join("");
    this.layer.parts.innerHTML = doc.parts.map((p) =>
      `<g class="part t-${p.type}" data-part="${esc(p.id)}" transform="${partTransform(p)}" role="img" aria-label="${esc(describe(p))}">${symbolMarkup(p)}</g>`).join("");
    this.layer.labels.innerHTML = doc.parts.filter((p) => p.type !== "GND" && p.type !== "LBL").map((p) => {
      const L = labelPlacement(p), v = valueText(p);
      const dy = L.stack === "up" ? [-0.72, 0] : [0, 0.68];
      return `<g class="plabel" data-part="${esc(p.id)}"><text class="pid" x="${L.x}" y="${L.y + dy[0]}" text-anchor="${L.anchor}">${esc(p.id)}</text>`
        + (v ? `<text class="pval" x="${L.x}" y="${L.y + dy[1]}" text-anchor="${L.anchor}">${esc(v)}</text>` : "") + `</g>`;
    }).join("");
    this.applyState();
  }

  // selection, hover and error marks without redrawing everything
  applyState({ sel = this.sel, hover = this.hover, err = this.err } = {}) {
    this.sel = sel; this.hover = hover; this.err = err;
    for (const g of this.layer.parts.children) {
      const id = g.dataset.part;
      g.classList.toggle("selected", !!sel?.parts.has(id));
      g.classList.toggle("hover", hover?.part?.id === id);
      g.classList.toggle("err", !!err?.has(id));
    }
    for (const g of this.layer.wires.children) g.classList.toggle("selected", !!sel?.wires.has(g.dataset.wire));
    // selection boxes around selected parts
    this.layer.sel.innerHTML = (this.doc?.parts || []).filter((p) => sel?.parts.has(p.id)).map((p) => {
      const [x0, y0, x1, y1] = boxOf(p);
      return `<rect class="sel-box" x="${x0 - 0.35}" y="${y0 - 0.35}" width="${x1 - x0 + 0.7}" height="${y1 - y0 + 0.7}" rx="0.35"/>`;
    }).join("") + (hover?.kind === "pin" || hover?.kind === "end" ? `<circle class="pin-hover" cx="${hover.point[0]}" cy="${hover.point[1]}" r="0.36"/>` : "");
  }

  setGhost(markup) { this.layer.ghost.innerHTML = markup || ""; }

  ghostPart(part) {
    this.setGhost(`<g class="part ghost-part" transform="${partTransform(part)}">${symbolMarkup(part)}</g>`
      + pinPoints(part).map((pp) => `<circle class="ghost-pin" cx="${pp.x}" cy="${pp.y}" r="0.14"/>`).join(""));
  }

  wirePreview(points, target) {
    if (!points) { this.setGhost(""); return; }
    const d = points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
    this.setGhost(`<path class="wire-preview" d="${d}"/>` + `<circle class="wire-start" cx="${points[0][0]}" cy="${points[0][1]}" r="0.22"/>`
      + (target ? `<circle class="wire-target" cx="${target[0]}" cy="${target[1]}" r="0.4"/>` : ""));
  }

  boxPreview(a, b) {
    if (!a) { this.setGhost(""); return; }
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    this.setGhost(`<rect class="box-select" x="${x}" y="${y}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}"/>`);
  }
}

export function bounds(doc) {
  const pts = [];
  for (const p of doc.parts) { const b = boxOf(p); pts.push([b[0], b[1]], [b[2], b[3]]); for (const pp of pinPoints(p)) pts.push([pp.x, pp.y]); }
  for (const w of doc.wires) pts.push(w.a, w.b);
  if (!pts.length) return null;
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

function describe(p) {
  const v = valueText(p);
  return `${p.id}${v ? `, ${v}` : ""}`;
}

export { NS };
