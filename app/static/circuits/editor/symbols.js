// Schematic symbols (US style), drawn in grid units at rotation 0. Strokes don't scale
// with zoom (vector-effect), so lines stay crisp at any size. Polarity marks and letters are
// counter-rotated so a "−" never turns into a "|".

import { transform } from "../core/doc.js";

// body boxes at rotation 0 (for hit testing, routing and labels)
export const BOX = {
  R: [0.95, -0.45, 3.05, 0.45], C: [1.5, -0.8, 2.5, 0.8], L: [0.95, -0.4, 3.05, 0.2],
  V: [1.0, -1.0, 3.0, 1.0], I: [1.0, -1.0, 3.0, 1.0], E: [1.0, -1.0, 3.0, 1.0], H: [1.0, -1.0, 3.0, 1.0],
  G: [1.0, -1.0, 3.0, 1.0], F: [1.0, -1.0, 3.0, 1.0], OA: [0.95, -1.95, 4.55, 1.95],
  GND: [-0.75, 0.05, 0.75, 1.3], LBL: [0.3, -0.55, 3, 0.55], SW: [1.05, -1.1, 2.95, 0.3],
  SW2: [1.05, -1.25, 2.95, 1.25], AM: [1.0, -1.0, 3.0, 1.0], VM: [1.0, -1.0, 3.0, 1.0],
};

export const CENTER = { OA: [2.5, 0], GND: [0, 0.6], LBL: [1, 0], SW2: [2, 0] };
export const centerOf = (type) => CENTER[type] || [2, 0];

export function labelWidth(name) { return 0.75 + 0.36 * Math.max(1, String(name || "").length); }

export function boxOf(part) {
  const b = part.type === "LBL" ? [0.3, -0.55, 0.3 + labelWidth(part.params?.name), 0.55] : BOX[part.type];
  const pts = [transform(part, b[0], b[1]), transform(part, b[2], b[1]), transform(part, b[0], b[3]), transform(part, b[2], b[3])];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function partTransform(part) {
  return `translate(${part.x} ${part.y}) rotate(${90 * (part.rot || 0)})${part.flip ? " scale(-1 1)" : ""}`;
}

// an upright mark at local (x, y): undo the part's rotation and mirror for the mark itself
function upright(part, x, y, inner) {
  return `<g transform="translate(${x} ${y})${part.flip ? " scale(-1 1)" : ""} rotate(${-90 * (part.rot || 0)})">${inner}</g>`;
}

const PLUS = `<path class="mark" d="M-0.17 0H0.17M0 -0.17V0.17"/>`;
const MINUS = `<path class="mark" d="M-0.17 0H0.17"/>`;
const text = (s, cls = "sym-text") => `<text class="${cls}" x="0" y="0.2" text-anchor="middle">${s}</text>`;
const lead = (d) => `<path class="lead" d="${d}"/>`;
const body = (d, cls = "body") => `<path class="${cls}" d="${d}"/>`;
const circle = `<circle class="body fill" cx="2" cy="0" r="0.95"/>`;
const diamond = `<path class="body fill" d="M2 -0.98L2.98 0L2 0.98L1.02 0Z"/>`;
const arrowLeft = `<path class="body" d="M2.55 0H1.5M1.78 -0.26L1.46 0L1.78 0.26"/>`;

// the waveform of a source that isn't constant, drawn small beside it: a step, a pulse, a sine
function waveGlyph(part) {
  const w = part.params?.wave;
  if (!w || w === "dc") return "";
  const d = w === "step" ? "M-0.35 0.12H0V-0.12H0.35" : w === "pulse" ? "M-0.4 0.12H-0.2V-0.12H0.1V0.12H0.4" : "M-0.42 0C-0.32 -0.3 -0.11 -0.3 0 0S0.32 0.3 0.42 0";
  return upright(part, 2, -1.35, `<path class="mark thin" d="${d}"/>`);
}

export function symbolMarkup(part) {
  const p = part.params || {};
  switch (part.type) {
    case "R":
      return lead("M0 0H1M3 0H4") + body("M1 0L1.17 -0.36L1.5 0.36L1.83 -0.36L2.17 0.36L2.5 -0.36L2.83 0.36L3 0");
    case "C":
      return lead("M0 0H1.78M2.22 0H4") + body("M1.78 -0.75V0.75M2.22 -0.75V0.75", "body plate")
        + (p.v0 ? upright(part, 1.45, -0.55, PLUS) : "");
    case "L":
      return lead("M0 0H1M3 0H4") + body("M1 0a0.25 0.25 0 0 1 0.5 0a0.25 0.25 0 0 1 0.5 0a0.25 0.25 0 0 1 0.5 0a0.25 0.25 0 0 1 0.5 0");
    case "V":
      return lead("M0 0H1.05M2.95 0H4") + circle + upright(part, 1.5, 0, PLUS) + upright(part, 2.5, 0, MINUS) + waveGlyph(part);
    case "I":
      return lead("M0 0H1.05M2.95 0H4") + circle + arrowLeft + waveGlyph(part);
    case "E": case "H":
      return lead("M0 0H1.02M2.98 0H4") + diamond + upright(part, 1.55, 0, PLUS) + upright(part, 2.45, 0, MINUS);
    case "G": case "F":
      return lead("M0 0H1.02M2.98 0H4") + diamond + arrowLeft;
    case "OA":
      return lead("M0 -1H1M0 1H1M4.5 0H5") + body("M1 -1.9V1.9L4.5 0Z", "body fill")
        + upright(part, 1.4, -1, MINUS) + upright(part, 1.4, 1, PLUS)
        + (p.model === "gain" ? upright(part, 2.3, 0.05, text("A", "sym-text small"))
          : upright(part, 2.25, 0.05, `<path class="mark thin" d="M-0.28 0.1L0 -0.22L0.28 0.1"/>`));
    case "GND":
      return lead("M0 0V0.6") + body("M-0.72 0.6H0.72M-0.45 0.92H0.45M-0.2 1.24H0.2");
    case "LBL": {
      const w = labelWidth(p.name);
      return lead("M0 0H0.3") + body(`M0.3 0L0.62 -0.5H${0.3 + w}V0.5H0.62Z`, "body fill tag")
        + upright(part, 0.62 + (w - 0.32) / 2, 0, `<text class="sym-text" x="0" y="0.19" text-anchor="middle">${esc(p.name || "?")}</text>`);
    }
    case "SW": {
      const closed = (p.state || "closed") === "closed";
      return lead("M0 0H1.2M2.8 0H4") + `<circle class="contact" cx="1.2" cy="0" r="0.12"/><circle class="contact" cx="2.8" cy="0" r="0.12"/>`
        + body(closed ? "M1.2 0L2.78 -0.16" : "M1.2 0L2.55 -0.95", "body lever") + timing(part);
    }
    case "SW2": {
      const to2 = p.state === "2";
      return lead("M0 0H1.2M4 -1H2.8M4 1H2.8")
        + `<circle class="contact" cx="1.2" cy="0" r="0.12"/><circle class="contact" cx="2.8" cy="-1" r="0.12"/><circle class="contact" cx="2.8" cy="1" r="0.12"/>`
        + body(to2 ? "M1.2 0L2.72 0.86" : "M1.2 0L2.72 -0.86", "body lever")
        + upright(part, 3.25, -1.45, `<text class="sym-text small" x="0" y="0.15" text-anchor="middle">1</text>`)
        + upright(part, 3.25, 1.6, `<text class="sym-text small" x="0" y="0.15" text-anchor="middle">2</text>`) + timing(part);
    }
    case "AM": case "VM":
      return lead("M0 0H1.05M2.95 0H4") + `<circle class="body fill meter" cx="2" cy="0" r="0.95"/>`
        + upright(part, 2, 0, text(part.type === "AM" ? "A" : "V")) + upright(part, 0.75, -0.42, PLUS);
    default:
      return "";
  }
}

// "t = 0" and a curved arrow when a switch moves during a transient
function timing(part) {
  const at = (part.params?.at || "").trim();
  if (!at) return "";
  return `<path class="mark thin" d="M1.55 -1.25a1 1 0 0 1 1.1 0.55"/><path class="mark thin" d="M2.48 -0.86l0.17 0.16l0.06 -0.22"/>`
    + upright(part, 2, -1.75, `<text class="sym-text small" x="0" y="0" text-anchor="middle">t = ${esc(at)}</text>`);
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// where a part's name and value go: beside the body, on the side away from its leads
export function labelPlacement(part) {
  const [x0, y0, x1, y1] = boxOf(part);
  const vertical = (part.rot || 0) % 2 === 1;
  if (part.type === "OA") return { x: (x0 + x1) / 2, y: y0 - 0.25, anchor: "middle", stack: "up" };
  if (vertical) return { x: x1 + 0.35, y: (y0 + y1) / 2 - 0.15, anchor: "start", stack: "down" };
  return { x: (x0 + x1) / 2, y: y0 - 0.25, anchor: "middle", stack: "up" };
}
