// Magnetically coupled parts, four terminals each: the primary winding p1–p2 on the left and the
// secondary s1–s2 on the right, with the dots at p1 and (by default) s1. Currents are taken into
// the dotted terminals.
//   K   coupled inductors (a linear transformer): v₁ = L₁ di₁/dt + M di₂/dt,
//       v₂ = M di₁/dt + L₂ di₂/dt, with M = k√(L₁L₂) or given directly
//   TR  ideal transformer, n = N₁/N₂: v₁ = n v₂ and N₁i₁ + N₂i₂ = 0 (so i₂ = −n i₁)
// At DC both windings of K are wires; in AC their impedances are jωL₁, jωL₂ and jωM.

import { lin, vdiff } from "../solver/lin.js";
import { FloatOnly } from "./common.js";
import * as Q from "../core/rational.js";

export const FOUR_PIN = [{ name: "p1", x: 0, y: 0 }, { name: "p2", x: 0, y: 4 }, { name: "s1", x: 4, y: 0 }, { name: "s2", x: 4, y: 4 }];

const dotParam = { key: "dot", label: "Secondary dot", kind: "choice", options: ["top", "bottom"], default: "top",
  labels: { top: "Top (same side as the primary's)", bottom: "Bottom (opposite)" } };

export const K = {
  type: "K", name: "Coupled inductors", prefix: "K", pins: FOUR_PIN, storage: true,
  params: [
    { key: "L1", label: "Primary L₁", unit: "H", default: "10m", kind: "value", positive: true },
    { key: "L2", label: "Secondary L₂", unit: "H", default: "10m", kind: "value", positive: true },
    { key: "spec", label: "Coupling given as", kind: "choice", options: ["k", "M"], default: "k",
      labels: { k: "k (0 to 1)", M: "M (henries)" } },
    { key: "k", label: "Coupling k", unit: "", default: "0.9", kind: "value", nonneg: true, show: (p) => p.spec !== "M",
      hint: "M = k√(L₁L₂); k = 1 is perfect coupling." },
    { key: "M", label: "Mutual inductance M", unit: "H", default: "9m", kind: "value", nonneg: true, show: (p) => p.spec === "M" },
    dotParam,
    { key: "i10", label: "Initial current i₁", unit: "A", default: "", kind: "value", optional: true },
    { key: "i20", label: "Initial current i₂", unit: "A", default: "", kind: "value", optional: true },
  ],
  branchCount: (el, ctx) => (ctx.mode === "ic" ? 0 : 2),
  pinCurrents(el, s, ctx) {
    const F = s.F;
    if (ctx.mode === "ic") {
      const st = ctx.state.get(el.id) || {};
      const i1 = s.icValue(st.i1Exact, st.i1 ?? 0), i2 = s.icValue(st.i2Exact, st.i2 ?? 0);
      return [lin(F).addK(i1), lin(F).addK(F.neg(i1)), lin(F).addK(i2), lin(F).addK(F.neg(i2))];
    }
    const b1 = lin(F).add(s.br(el, 0), F.one), b2 = lin(F).add(s.br(el, 1), F.one);
    return [b1, b1.neg(), b2, b2.neg()];
  },
  constraints(el, s, ctx) {
    if (ctx.mode === "ic") return;
    const F = s.F, k1 = s.br(el, 0), k2 = s.br(el, 1);
    const v1 = vdiff(s, el.nodes[0], el.nodes[1]), v2 = vdiff(s, el.nodes[2], el.nodes[3]);
    if (ctx.mode === "dc") { s.row(k1, v1, F.zero); s.row(k2, v2, F.zero); return; }
    const L1 = s.p(el, "L1"), L2 = s.p(el, "L2"), M = mutual(el, s);
    // v = L di/dt: in AC di/dt = jω i; in a time step di/dt ≈ α i + β
    const a = ctx.mode === "ac" ? ctx.jw : F.num(ctx.alpha);
    const z11 = F.mul(a, L1), z12 = F.mul(a, M), z22 = F.mul(a, L2);
    let r1 = F.zero, r2 = F.zero;
    if (ctx.mode !== "ac") {
      const [b1, b2] = ctx.beta(el).map((b) => F.num(b));
      r1 = F.add(F.mul(L1, b1), F.mul(M, b2));
      r2 = F.add(F.mul(M, b1), F.mul(L2, b2));
    }
    s.row(k1, v1.add(k1, F.neg(z11)).add(k2, F.neg(z12)), r1);
    s.row(k2, v2.add(k1, F.neg(z12)).add(k2, F.neg(z22)), r2);
  },
  dcEdges: (el, ctx) => (ctx.mode === "ic" ? [] : [[0, 1], [2, 3]]),
  zEdges: (el, ctx) => (ctx.mode === "dc" ? [[0, 1], [2, 3]] : []),
};

// M with its sign: negative when the secondary's dot is at the bottom (s2)
export function mutual(el, s) {
  const F = s.F, p = el.params;
  let M;
  if (p.spec?.text === "M") M = s.p(el, "M");
  else if (F.exact) {
    const root = sqrtExact(Q.mul(p.L1.exact, p.L2.exact));
    if (!root || !p.k.exact) throw new FloatOnly();
    M = F.of({ exact: Q.mul(p.k.exact, root), value: 0 });
  } else M = F.num(p.k.value * Math.sqrt(p.L1.value * p.L2.value));
  return p.dot?.text === "bottom" ? F.neg(M) : M;
}

export const mutualValue = (p) => (p.spec?.text === "M" ? p.M.value : p.k.value * Math.sqrt(p.L1.value * p.L2.value)) * (p.dot?.text === "bottom" ? -1 : 1);

// √(a/b) when both are perfect squares, else null
function sqrtExact(q) {
  if (q.n < 0n) return null;
  const rn = isqrt(q.n), rd = isqrt(q.d);
  return rn * rn === q.n && rd * rd === q.d ? Q.frac(rn, rd) : null;
}

// integer square root (Newton's method from above, all in BigInt)
function isqrt(n) {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}

export const TR = {
  type: "TR", name: "Ideal transformer", prefix: "T", pins: FOUR_PIN,
  params: [
    { key: "n", label: "Turns ratio n = N₁/N₂", unit: "", default: "2", kind: "value", nonzero: true,
      hint: "v₁ = n v₂ and i₂ = −n i₁ (currents into the dots). Seen from the primary, a load Z looks like n²Z." },
    dotParam,
  ],
  branchCount: () => 1,
  pinCurrents(el, s) {
    const F = s.F, i1 = lin(F).add(s.br(el), F.one), i2 = i1.scaled(F.neg(turns(el, s)));
    return [i1, i1.neg(), i2, i2.neg()];
  },
  constraints(el, s) {
    const F = s.F;
    const v1 = vdiff(s, el.nodes[0], el.nodes[1]), v2 = vdiff(s, el.nodes[2], el.nodes[3]);
    s.row(s.br(el), v1.plus(v2, F.neg(turns(el, s))), F.zero);
  },
  dcEdges: () => [[0, 1], [2, 3]],
  zEdges: () => [],
};

function turns(el, s) {
  const n = s.p(el, "n");
  return el.params.dot?.text === "bottom" ? s.F.neg(n) : n;
}
