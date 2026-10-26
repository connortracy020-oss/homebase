// "Add to notes": a picture of the schematic as it looks right now (voltage colors, pills,
// values, currents), cropped to the circuit. bench.css styles the SVG, so every element's
// computed style is copied onto a clone first; the clone then renders on its own as a PNG.

import { bounds, NS } from "../editor/canvas.js";

const PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-linecap", "stroke-linejoin", "opacity", "paint-order", "filter", "visibility", "display",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "text-anchor", "dominant-baseline"];
const DROP = [".grid-bg", ".layer.sel", ".layer.ghost"];  // the grid, selection and previews stay behind

// -> a PNG Blob, at most maxWidth pixels wide
export async function snapshot(view, doc, { maxWidth = 1800, background } = {}) {
  const box = frame(view, doc);
  if (!box) throw new Error("There's nothing to take a picture of yet.");
  const [x0, y0, x1, y1] = box, wu = x1 - x0, hu = y1 - y0;
  // on screen, lines are drawn in screen pixels (non-scaling strokes); in the picture they
  // become grid units at the on-screen zoom, so lines, text and parts keep their proportions
  // while the whole picture is drawn k times sharper
  const s = view.cam.s, k = Math.max(1, Math.min(3, maxWidth / (wu * s)));
  const w = Math.round(wu * s * k), h = Math.round(hu * s * k);

  const src = view.svg, clone = src.cloneNode(true);
  const from = src.querySelectorAll("*"), to = clone.querySelectorAll("*");
  from.forEach((el, i) => {
    if (el.closest("defs")) return;
    const cs = getComputedStyle(el);
    const style = PROPS.map((p) => {
      let v = cs.getPropertyValue(p);
      if (p === "stroke-width" && cs.getPropertyValue("vector-effect") === "non-scaling-stroke") v = `${parseFloat(v) / s}px`;
      return `${p}:${v}`;
    });
    to[i].setAttribute("style", style.join(";"));
  });
  for (const sel of DROP) clone.querySelector(sel)?.remove();
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", NS);
  clone.setAttribute("viewBox", `${x0} ${y0} ${wu} ${hu}`);
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  const bg = document.createElementNS(NS, "rect");
  Object.entries({ x: x0, y: y0, width: wu, height: hu, fill: background || matColor(src) }).forEach(([a, v]) => bg.setAttribute(a, v));
  clone.insertBefore(bg, clone.querySelector("defs")?.nextSibling || clone.firstChild);

  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture."))), "image/png"));
}

// the drawing's extent in grid units: what's drawn (labels and pills included) when the
// schematic is on screen, else the parts and wires with room for their labels
function frame(view, doc) {
  let box = null;
  for (const name of ["wires", "dots", "parts", "labels", "overlay"]) {
    const g = view.layer[name];
    if (!g?.firstChild) continue;
    const b = g.getBBox();
    if (!b.width && !b.height) continue;
    box = box ? [Math.min(box[0], b.x), Math.min(box[1], b.y), Math.max(box[2], b.x + b.width), Math.max(box[3], b.y + b.height)]
      : [b.x, b.y, b.x + b.width, b.y + b.height];
  }
  if (box) return [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1];
  const b = bounds(doc);
  return b && [b[0] - 3, b[1] - 2.5, b[2] + 3, b[3] + 2.5];
}

function matColor(svg) {
  for (let el = svg; el; el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return "#1c1b18";
}
