// Every analysis the bench can ask for, by name. Results are plain JSON (no functions, no
// BigInts) so they can cross from the solver thread to the page.

import { solveDC } from "./op.js";

export function run(kind, net, doc, opts) {
  if (kind === "op") return plain(solveDC(net, opts));
  throw new Error(`unknown analysis ${kind}`);
}

export function plain(result) {
  const { internal, ...rest } = result;
  return rest;
}
