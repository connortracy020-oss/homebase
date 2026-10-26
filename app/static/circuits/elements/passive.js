// Resistor, capacitor, inductor.

import { lin, vdiff } from "../solver/lin.js";
import { TWO_PIN, pair, zeroPair } from "./common.js";

export const R = {
  type: "R", name: "Resistor", prefix: "R", pins: TWO_PIN,
  params: [{ key: "R", label: "Resistance", unit: "Ω", default: "1k", kind: "value", nonzero: true }],
  branchCount: () => 0,
  pinCurrents(el, s) {
    const F = s.F, g = F.div(F.one, s.p(el, "R"));
    return pair(vdiff(s, el.nodes[0], el.nodes[1]).scaled(g));
  },
  dcEdges: () => [[0, 1]],
  zEdges: () => [],
};

// Capacitor: open at DC; in the t=0+ circuit a voltage source at its voltage; in a time step a
// conductance plus a history current (backward Euler or trapezoidal companion model).
export const C = {
  type: "C", name: "Capacitor", prefix: "C", pins: TWO_PIN,
  params: [
    { key: "C", label: "Capacitance", unit: "F", default: "1u", kind: "value", positive: true },
    { key: "v0", label: "Initial voltage", unit: "V", default: "", kind: "value", optional: true,
      hint: "Leave empty to use the circuit's steady state before t = 0." },
  ],
  branchCount: (el, ctx) => (ctx.mode === "ic" ? 1 : 0),
  pinCurrents(el, s, ctx) {
    const F = s.F;
    if (ctx.mode === "dc") return zeroPair(F);
    if (ctx.mode === "ic") return pair(lin(F).add(s.br(el), F.one));
    const st = ctx.state.get(el.id), Cv = s.p(el, "C");
    const geq = F.div(F.mul(F.num(ctx.method === "trap" ? 2 : 1), Cv), F.num(ctx.h));
    // i(n+1) = geq * v(n+1) + J, with J = -geq*v(n) (BE) or -(geq*v(n) + i(n)) (trap)
    let J = F.neg(F.mul(geq, F.num(st.v)));
    if (ctx.method === "trap") J = F.sub(J, F.num(st.i));
    return pair(vdiff(s, el.nodes[0], el.nodes[1]).scaled(geq).addK(J));
  },
  constraints(el, s, ctx) {
    if (ctx.mode !== "ic") return;
    const F = s.F, k = s.br(el), st = ctx.state.get(el.id);
    s.row(k, vdiff(s, el.nodes[0], el.nodes[1]), s.icValue(st.vExact, st.v));
  },
  dcEdges: (el, ctx) => (ctx.mode === "dc" ? [] : [[0, 1]]),
  zEdges: (el, ctx) => (ctx.mode === "ic" ? [[0, 1]] : []),
};

// Inductor: a short at DC (a 0 V branch, so its current is an unknown); in the t=0+ circuit
// a current source at its current; in a time step its companion model on the same branch.
export const L = {
  type: "L", name: "Inductor", prefix: "L", pins: TWO_PIN,
  params: [
    { key: "L", label: "Inductance", unit: "H", default: "1m", kind: "value", positive: true },
    { key: "i0", label: "Initial current", unit: "A", default: "", kind: "value", optional: true,
      hint: "Leave empty to use the circuit's steady state before t = 0." },
  ],
  branchCount: (el, ctx) => (ctx.mode === "ic" ? 0 : 1),
  pinCurrents(el, s, ctx) {
    const F = s.F;
    if (ctx.mode === "ic") {
      const st = ctx.state.get(el.id);
      return pair(lin(F).addK(s.icValue(st.iExact, st.i)));
    }
    return pair(lin(F).add(s.br(el), F.one));
  },
  constraints(el, s, ctx) {
    if (ctx.mode === "ic") return;
    const F = s.F, k = s.br(el), v = vdiff(s, el.nodes[0], el.nodes[1]);
    if (ctx.mode === "dc") { s.row(k, v, F.zero); return; }
    // v(n+1) - req*i(n+1) = -req*i(n) (BE)   or   = -req*i(n) - v(n) (trap)
    const st = ctx.state.get(el.id), Lv = s.p(el, "L");
    const req = F.div(F.mul(F.num(ctx.method === "trap" ? 2 : 1), Lv), F.num(ctx.h));
    let rhs = F.neg(F.mul(req, F.num(st.i)));
    if (ctx.method === "trap") rhs = F.sub(rhs, F.num(st.v));
    s.row(k, v.add(k, F.neg(req)), rhs);
  },
  dcEdges: (el, ctx) => (ctx.mode === "ic" ? [] : [[0, 1]]),
  zEdges: (el, ctx) => (ctx.mode === "dc" ? [[0, 1]] : []),
};
