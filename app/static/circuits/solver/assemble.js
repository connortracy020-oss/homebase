// Build the modified-nodal-analysis system A x = b. Unknowns: node voltages (ground left
// out), then one current per branch element. KCL rows come from each part's pin currents;
// branch rows come from each part's own constraint (v(+) − v(−) = V for a source, ...).

import { lin } from "./lin.js";
import { FloatOnly } from "../elements/common.js";

export class ControlLoop extends Error {
  constructor(el) { super(`${el.id}: dependent sources control each other in a loop`); this.name = "ControlLoop"; this.el = el; }
}

export function paramValue(F, p) {
  if (!p || p.empty) throw new Error("missing value");
  if (F.exact) {
    if (!p.exact) throw new FloatOnly();
    return p.exact;
  }
  return p.value;
}

export function assemble(net, F, ctx) {
  const nv = net.nodes.length - 1;
  const brIndex = new Map();
  let size = nv;
  for (const el of net.elements) {
    const c = el.def.branchCount(el, ctx);
    if (c) { brIndex.set(el, size); size += c; }
  }
  const A = Array.from({ length: size }, () => new Array(size).fill(F.zero));
  const b = new Array(size).fill(F.zero);
  const meta = Array.from({ length: size }, (_, r) => (r < nv ? { kind: "kcl", node: r + 1, terms: [] } : { kind: "branch", el: null }));
  const memo = new Map(), visiting = new Set();
  let current = null;

  const s = {
    F, nv, size,
    n: (node) => (node > 0 ? node - 1 : null),
    br(el, k = 0) {
      const i = brIndex.get(el);
      if (i === undefined) throw new Error(`${el.id} has no branch unknown`);
      return i + k;
    },
    p: (el, k) => paramValue(F, el.params[k]),
    icValue(exact, value) {
      if (!F.exact) return value;
      if (!exact) throw new FloatOnly();
      return exact;
    },
    row(r, expr, rhs) {
      for (const [c, v] of expr.t) A[r][c] = F.add(A[r][c], v);
      b[r] = F.add(b[r], F.sub(rhs, expr.k));
      meta[r] = { kind: "branch", el: current, expr, rhs };
    },
    ctrl: (el) => controlExpr(el),
  };

  function pinCurrentsOf(el) {
    if (memo.has(el)) return memo.get(el);
    if (visiting.has(el)) throw new ControlLoop(el);
    visiting.add(el);
    const exprs = el.def.pinCurrents(el, s, ctx);
    visiting.delete(el);
    memo.set(el, exprs);
    return exprs;
  }

  function controlExpr(el) {
    const c = el.ctrl, sign = F.num(c.sign);
    if (c.kind === "v") return lin(F).add(s.n(c.nodes[0]), F.one).add(s.n(c.nodes[1]), F.neg(F.one)).scaled(sign);
    return pinCurrentsOf(c.target)[0].scaled(sign);
  }

  for (const el of net.elements) {
    const exprs = pinCurrentsOf(el);
    el.nodes.forEach((node, j) => {
      if (node <= 0) return;
      const r = node - 1;
      for (const [c, v] of exprs[j].t) A[r][c] = F.add(A[r][c], v);
      b[r] = F.sub(b[r], exprs[j].k);
      meta[r].terms.push({ el, pin: j });
    });
  }
  for (const el of net.elements) {
    if (!el.def.constraints) continue;
    current = el;
    el.def.constraints(el, s, ctx);
  }
  current = null;
  return { A, b, nv, size, brIndex, meta, pinI: memo, s, F };
}
