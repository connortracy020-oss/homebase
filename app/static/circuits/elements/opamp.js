// Op-amp. Pins: inverting input (−), non-inverting input (+), output. The output is driven
// against ground (the supplies aren't drawn), so its current returns through ground.
//   ideal: no input current and v+ = v− (needs negative feedback; the solver checks)
//   gain:  vout = A (v+ − v−) − rout·i_out, with optional input resistance rin

import { lin, vdiff } from "../solver/lin.js";

export const OA = {
  type: "OA", name: "Op-amp", prefix: "U",
  pins: [{ name: "minus", x: 0, y: -1 }, { name: "plus", x: 0, y: 1 }, { name: "out", x: 5, y: 0 }],
  params: [
    { key: "model", label: "Model", kind: "choice", options: ["ideal", "gain"], default: "ideal",
      labels: { ideal: "Ideal", gain: "Finite gain" } },
    { key: "A", label: "Open-loop gain A", unit: "", default: "100k", kind: "value", positive: true, show: (p) => p.model === "gain" },
    { key: "rin", label: "Input resistance", unit: "Ω", default: "", kind: "value", positive: true, optional: true,
      show: (p) => p.model === "gain", hint: "Empty means infinite." },
    { key: "rout", label: "Output resistance", unit: "Ω", default: "0", kind: "value", nonneg: true, show: (p) => p.model === "gain" },
  ],
  groundReturn: true,
  branchCount: () => 1,
  pinCurrents(el, s) {
    const F = s.F, out = lin(F).add(s.br(el), F.one);
    if (hasRin(el)) {
      const g = F.div(F.one, s.p(el, "rin")), iin = vdiff(s, el.nodes[1], el.nodes[0]).scaled(g);
      return [iin.neg(), iin, out];
    }
    return [lin(F), lin(F), out];
  },
  constraints(el, s) {
    const F = s.F, k = s.br(el), vd = vdiff(s, el.nodes[1], el.nodes[0]);
    if (el.params.model.text !== "gain") { s.row(k, vd, F.zero); return; }
    // v(out) - A*vd - rout*br = 0   (br = current into the output pin)
    const row = lin(F).add(s.n(el.nodes[2]), F.one).plus(vd, F.neg(s.p(el, "A")));
    if (!F.isZero(s.p(el, "rout"))) row.add(k, F.neg(s.p(el, "rout")));
    s.row(k, row, F.zero);
  },
  dcEdges: (el) => [[2, "g"], ...(hasRin(el) ? [[0, 1]] : [])],
  zEdges: (el) => (el.params.model.text === "gain" && el.params.rout.value !== 0 ? [] : [[2, "g"]]),
};

const hasRin = (el) => el.params.model.text === "gain" && !el.params.rin.empty;
