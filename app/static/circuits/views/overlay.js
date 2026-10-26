// What the solution adds to the schematic: wires colored by their node's voltage, a voltage
// pill per node, each part's current, meter readings, warm glow on parts absorbing power,
// and red marks on whatever an error points at. In predict mode the numbers become "?".

import { voltageColor, niceMax, legendGradient } from "./palette.js";
import { fmt, fmtExact } from "../core/units.js";
import { fromString } from "../core/rational.js";
import { boxOf, labelPlacement, esc } from "../editor/symbols.js";
import { pinPoints } from "../core/doc.js";
import { polarText } from "./phasorfmt.js";

// the color scale: the largest node voltage, or for AC the largest amplitude (fixed through the cycle)
export function vScale(sol) {
  if (!sol?.ok) return 1;
  if (sol.vmax) return sol.vmax;
  return niceMax(Math.max(...sol.nodes.map((n) => Math.abs(n.v ?? 0)), 1e-9));
}

export function exactText(x, xs, unit) {
  if (xs) return fmtExact(fromString(xs), unit);
  return { main: fmt(x, unit), decimal: null };
}

export class Overlay {
  constructor(view, { legend }) {
    this.view = view; this.legend = legend;
  }

  render(doc, net, sol, { hidden = () => false, focusNode = null, err = new Set(), currents = true } = {}) {
    const idle = new Set(sol?.idle || []);
    const L = this.view.layer;
    const ok = sol?.ok && net;
    const vmax = vScale(sol);
    this.vmax = vmax;
    // wires take their node's color; a focused node stays bright and the rest dims
    for (const g of L.wires.children) {
      const w = doc.wires.find((x) => x.id === g.dataset.wire);
      const node = w ? net?.nodeAt(`${w.a[0]},${w.a[1]}`) : -1;
      const v = ok && node >= 0 ? sol.nodes[node]?.v : null;
      g.style.setProperty("--wire", v === null || v === undefined || hidden({ kind: "v", node }) ? "" : voltageColor(v, vmax));
      g.classList.toggle("dim", focusNode !== null && node !== focusNode);
      g.dataset.node = node;
    }
    for (const c of L.dots.querySelectorAll(".junction")) {
      const node = net?.nodeAt(`${c.getAttribute("cx")},${c.getAttribute("cy")}`);
      const v = ok && node >= 0 ? sol.nodes[node]?.v : null;
      c.style.setProperty("--wire", v === null || v === undefined ? "" : voltageColor(v, vmax));
    }
    for (const g of L.parts.children) {
      g.classList.toggle("dim", focusNode !== null && !partTouches(net, g.dataset.part, focusNode));
      g.classList.toggle("idle", idle.has(g.dataset.part));
    }
    this.view.applyState({ err });

    // power glow on resistors (and anything else absorbing power), relative to the largest
    const heat = [];
    if (ok) {
      const pmax = sol.pmax ?? Math.max(1e-15, ...Object.values(sol.els).map((e) => Math.max(0, e.p)));
      for (const part of doc.parts) {
        const e = sol.els[part.id];
        if (!e || part.type !== "R" || !(e.p > 0) || hidden({ kind: "p", part: part.id })) continue;
        const f = Math.sqrt(e.p / pmax);
        const [x0, y0, x1, y1] = boxOf(part);
        heat.push(`<rect class="heat-glow" x="${x0 - 0.3}" y="${y0 - 0.3}" width="${x1 - x0 + 0.6}" height="${y1 - y0 + 0.6}" rx="0.6" fill="rgb(255 138 61)" opacity="${(0.12 + 0.42 * f).toFixed(3)}" filter="url(#sch-heat)"/>`);
      }
    }
    L.heat.innerHTML = heat.join("");

    // node pills and part readouts
    const out = [];
    if (ok) {
      const taken = [...doc.parts.map((p) => boxOf(p)), ...doc.parts.filter((p) => p.type !== "GND" && p.type !== "LBL").map(labelBox)];
      for (const nd of sol.nodes) {
        const meta = net.nodes[nd.index];
        if (!meta?.at || nd.index === 0 || nd.v === null) continue;  // ground is 0 V by definition
        const hide = hidden({ kind: "v", node: nd.index });
        const txt = hide ? "?" : sol.ac ? polarText(sol.ac.res.nodes[nd.index]?.v, "V", sol.ac.scale) : exactText(nd.v, nd.vx, "V").main;
        const name = nd.index === 0 ? "⏚" : meta.label || nd.name;
        const label = `${name}  ${txt}`;
        const w = 0.55 + label.length * 0.33, h = 0.82;
        const spot = placePill(piecesOf(net, nd.index), meta.at, w, h, taken);
        taken.push([spot[0], spot[1], spot[0] + w, spot[1] + h]);
        const color = hide ? "var(--mat-soft)" : voltageColor(nd.v, vmax);
        out.push(`<g class="node-pill${hide ? " ask" : ""}${focusNode === nd.index ? " focus" : ""}" data-node="${nd.index}" transform="translate(${spot[0]} ${spot[1]})">
          <rect width="${w}" height="${h}" rx="${h / 2}"/><circle cx="${h / 2}" cy="${h / 2}" r="0.17" fill="${color}"/>
          <text x="${h / 2 + 0.32}" y="${h / 2 + 0.2}"><tspan class="nm">${esc(name)}</tspan> ${esc(txt)}</text></g>`);
      }
      if (currents) {
        for (const part of doc.parts) {
          const e = sol.els[part.id];
          if (!e || ["GND", "LBL", "VM", "AM", "SW", "SW2"].includes(part.type)) continue;
          if (hidden({ kind: "i", part: part.id })) continue;
          const L2 = labelPlacement(part);
          const dy = L2.stack === "up" ? -1.42 : 1.36;
          const t = sol.ac ? acCurrentText(part, sol.ac.res.els[part.id], sol.ac.scale) : currentText(part, e);
          if (t) out.push(`<text class="pcur" x="${L2.x}" y="${L2.y + dy}" text-anchor="${L2.anchor}">${esc(t)}</text>`);
        }
      }
      for (const part of doc.parts) {
        const e = sol.els[part.id];
        if (!e?.reading) continue;
        const hide = hidden({ kind: e.reading.kind, part: part.id });
        const unit = e.reading.kind === "i" ? "A" : "V";
        const r = hide ? "?" : sol.ac ? polarText(sol.ac.res.els[part.id]?.reading?.value, unit, sol.ac.scale) : exactText(e.reading.value, e.reading.exact, unit).main;
        const [x0, y0, x1, y1] = boxOf(part);
        out.push(`<g class="meter-read" transform="translate(${(x0 + x1) / 2} ${y1 + 0.95})"><rect x="${-(0.5 + r.length * 0.17)}" y="-0.55" width="${1 + r.length * 0.34}" height="0.8" rx="0.4"/><text y="0.05" text-anchor="middle">${esc(r)}</text></g>`);
      }
    }
    L.overlay.innerHTML = out.join("");

    if (this.legend) {
      this.legend.hidden = !ok;
      if (ok) {
        const signed = sol.nodes.some((n) => n.v !== null && n.v < -1e-12);
        this.legend.innerHTML = `<span>${signed ? `−${fmt(vmax, "V")}` : "0 V"}</span><span class="ramp" style="background:${legendGradient("90deg", signed)}"></span><span>${fmt(vmax, "V")}</span>`;
      }
    }
  }
}

// the current through a part, with an arrow along its axis showing the direction
function currentText(part, e) {
  if (Math.abs(e.i) < 1e-15) return "0 A";
  const along = e.i > 0 ? 1 : -1;  // + means from pin a to pin b inside the part
  const pins = pinPoints(part);
  const a = pins[0], b = pins[part.type === "OA" ? 2 : 1];
  let dx = b.x - a.x, dy = b.y - a.y;
  if (part.type === "OA") { dx = 1; dy = 0; }
  const dir = Math.abs(dx) >= Math.abs(dy) ? (dx * along > 0 ? "→" : "←") : (dy * along > 0 ? "↓" : "↑");
  return `${dir} ${fmt(Math.abs(e.i), "A")}`;
}

// an AC current: the phasor, with an arrow for its reference direction (through a passive part
// from pin a to pin b; out of a source's + terminal, or along its arrow)
const SOURCES = ["V", "I", "E", "F", "G", "H"];
function acCurrentText(part, e, scale) {
  if (!e?.i) return "";
  const pins = pinPoints(part), source = SOURCES.includes(part.type);
  const a = pins[0], b = pins[part.type === "OA" ? 2 : 1];
  let dx = b.x - a.x, dy = b.y - a.y;
  if (part.type === "OA") { dx = 1; dy = 0; }
  if (source) { dx = -dx; dy = -dy; }
  const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "→" : "←") : (dy > 0 ? "↓" : "↑");
  return `${dir} ${polarText(source ? { re: -e.i.re, im: -e.i.im } : e.i, "A", scale)}`;
}

function partTouches(net, id, node) {
  const el = net?.byId?.get(id);
  if (el) return el.nodes.includes(node) || (el.ctrl?.nodes || []).includes(node);
  const pins = net?.pins?.filter((p) => p.part.id === id) || [];
  return pins.some((p) => net.nodeAt(p.key) === node);
}

function piecesOf(net, node) {
  return net.pieces.filter((pc) => pc.node === node);
}

// put a pill on its node's wire: centred above a horizontal run or beside a vertical one,
// longest runs first, never over a part, a label or another pill
function placePill(pieces, fallback, w, h, taken) {
  const runs = [...pieces].sort((p, q) => len(q) - len(p));
  const candidates = [];
  for (const pc of runs.slice(0, 8)) {
    const [ax, ay] = pc.a, [bx, by] = pc.b, mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (ay === by) candidates.push([mx - w / 2, ay - h - 0.38], [mx - w / 2, ay + 0.38]);
    else candidates.push([ax + 0.4, my - h / 2], [ax - w - 0.4, my - h / 2]);
    candidates.push([ax + 0.3, ay - h - 0.3], [bx + 0.3, by - h - 0.3]);
  }
  if (fallback) candidates.push([fallback[0] + 0.35, fallback[1] - h - 0.3], [fallback[0] + 0.35, fallback[1] + 0.3]);
  const clear = ([x, y]) => taken.every(([a, b, c, d]) => x + w < a - 0.12 || x > c + 0.12 || y + h < b - 0.12 || y > d + 0.12);
  return candidates.find(clear) || candidates[0] || [0, 0];
}

const len = (pc) => Math.abs(pc.a[0] - pc.b[0]) + Math.abs(pc.a[1] - pc.b[1]);

// the space a part's name, value and current take up beside it
export function labelBox(part) {
  const L = labelPlacement(part), w = 3.2, h = 2.1;
  if (L.stack === "up") return [L.x - (L.anchor === "middle" ? w / 2 : 0), L.y - h, L.x + (L.anchor === "middle" ? w / 2 : w), L.y + 0.2];
  return [L.x, L.y - 0.6, L.x + w, L.y + 1.6];
}
