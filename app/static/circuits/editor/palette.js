// The parts palette: common parts one tap away, the rest in two small groups.

import { symbolMarkup, BOX, esc } from "./symbols.js";
import { defOf, defaultParams } from "../elements/index.js";

export const PALETTE = [
  { type: "R", key: "1" }, { type: "C", key: "2" }, { type: "L", key: "3" }, { sep: true },
  { type: "V", key: "4" }, { type: "I", key: "5" },
  { group: "Dependent sources", icon: "E", items: ["E", "G", "H", "F"] }, { sep: true },
  { type: "OA", key: "6" }, { type: "SW", key: "7" }, { type: "GND", key: "8" }, { sep: true },
  { group: "More parts", icon: "VM", items: ["LBL", "SW2", "VM", "AM"] },
];

// part types reachable from the number keys, in order
export const KEYED = PALETTE.filter((p) => p.key).map((p) => p.type);
KEYED.push("LBL");

export function icon(type) {
  const b = BOX[type] || [0, -1, 4, 1];
  const pad = 0.5, x = Math.min(b[0], 0) - pad, y = Math.min(b[1], -1) - pad;
  const w = Math.max(b[2], type === "OA" ? 5 : 4) - x + pad, h = Math.max(b[3], 1) - y + pad, s = Math.max(w, h);
  const part = { id: type, type, x: 0, y: 0, rot: 0, flip: false, params: { ...defaultParams(type), name: "V" } };
  return `<svg viewBox="${x - (s - w) / 2} ${y - (s - h) / 2} ${s} ${s}" class="pal-sym" aria-hidden="true">${symbolMarkup(part)}</svg>`;
}

export function paletteMarkup() {
  return PALETTE.map((p) => {
    if (p.sep) return `<span class="pal-sep"></span>`;
    if (p.group) {
      return `<details class="pal-group"><summary class="button pal" title="${esc(p.group)}" aria-label="${esc(p.group)}">${icon(p.icon)}<span class="key-hint">▸</span></summary>
        <div class="pal-flyout" role="menu">${p.items.map((t) => `<button type="button" class="pal-item" data-type="${t}" role="menuitem">${icon(t)}<span>${esc(defOf(t).name)}</span></button>`).join("")}</div></details>`;
    }
    const def = defOf(p.type);
    return `<button type="button" class="pal" data-type="${p.type}" title="${esc(def.name)}${p.key ? ` (${p.key})` : ""}" aria-label="${esc(def.name)}">${icon(p.type)}${p.key ? `<span class="key-hint">${p.key}</span>` : ""}</button>`;
  }).join("");
}
