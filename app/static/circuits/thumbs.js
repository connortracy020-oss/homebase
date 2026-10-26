// Small previews of each circuit on the list page.

import { migrate } from "./core/doc.js";
import { symbolMarkup, partTransform } from "./editor/symbols.js";
import { bounds } from "./editor/canvas.js";

for (const svg of document.querySelectorAll("svg.circuit-thumb[data-doc]")) {
  try {
    const doc = migrate(JSON.parse(svg.dataset.doc));
    const b = bounds(doc);
    if (!b) continue;
    const pad = 1.2, w = b[2] - b[0] + 2 * pad, h = b[3] - b[1] + 2 * pad;
    const s = Math.max(w / 92, h / 56);
    svg.setAttribute("viewBox", `${(b[0] + b[2]) / 2 - 46 * s} ${(b[1] + b[3]) / 2 - 28 * s} ${92 * s} ${56 * s}`);
    svg.innerHTML = doc.wires.map((x) => `<line x1="${x.a[0]}" y1="${x.a[1]}" x2="${x.b[0]}" y2="${x.b[1]}"/>`).join("")
      + doc.parts.map((p) => `<g transform="${partTransform(p)}">${symbolMarkup(p)}</g>`).join("");
  } catch { /* a preview is never worth an error */ }
}
