// Every analysis the bench can ask for, by name. Results are plain JSON (no functions, no
// BigInts) so they can cross from the solver thread to the page.

import { solveDC } from "./op.js";
import { compile } from "../core/compile.js";
import { transient } from "./tran.js";
import { bodeSweep } from "./bode.js";
import { transferFunction } from "./laplace.js";

export function run(kind, net, doc, opts) {
  if (kind === "op") return plain(solveDC(net, opts));
  if (kind === "sweep") return sweep(doc, opts);
  if (kind === "tran") return transient(doc, opts);
  if (kind === "bode") return bodeSweep(net, opts);
  if (kind === "hs") return transferFunction(net, opts);
  throw new Error(`unknown analysis ${kind}`);
}

export function plain(result) {
  const { internal, iso, ...rest } = result;
  return rest;
}

// solve the circuit once per value of one part's parameter (floating point: it's for plots)
function sweep(doc, { part, key, values }) {
  const results = values.map((value) => {
    const d = structuredClone(doc);
    const p = d.parts.find((q) => q.id === part);
    if (!p) return null;
    p.params = { ...p.params, [key]: String(value) };
    const s = solveDC(compile(d), { exact: false, flows: false });
    if (!s.ok) return null;
    return {
      nodes: Object.fromEntries(s.nodes.map((n) => [n.index, n.v])),
      els: Object.fromEntries(Object.entries(s.els).map(([id, e]) => [id, { v: e.v, i: e.i, p: e.p }])),
    };
  });
  return { ok: true, part, key, values, results };
}
