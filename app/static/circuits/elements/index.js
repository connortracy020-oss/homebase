// Every part type the bench knows, by type code.

import { R, C, L } from "./passive.js";
import { V, I } from "./sources.js";
import { E, G, H, F } from "./dependent.js";
import { OA } from "./opamp.js";
import { GND, LBL, SW, SW2, AM, VM } from "./misc.js";

export const DEFS = Object.freeze({ R, C, L, V, I, E, G, H, F, OA, GND, LBL, SW, SW2, AM, VM });

export function defOf(type) {
  return DEFS[type] || null;
}

// default parameter texts for a new part
export function defaultParams(type) {
  const out = {};
  for (const p of defOf(type)?.params || []) out[p.key] = p.default;
  return out;
}

// which parameters apply right now (some only show for a waveform or a model)
export function visibleParams(type, params) {
  const texts = { ...defaultParams(type), ...params };
  return (defOf(type)?.params || []).filter((p) => !p.show || p.show(texts));
}
