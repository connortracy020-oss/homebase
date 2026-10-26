// Solve netlists in AC (complex floats) with the bench's solver and print each node's phasor.
// Used by tests/test_circuits_ac.py to compare against an independent NumPy solve.
//   node tests/js/acvectors.mjs vectors.json   with vectors = [{omega, elements}]
import { readFileSync } from "node:fs";
import { netFromList } from "../../app/static/circuits/solver/netlist.js";
import { solveAC } from "../../app/static/circuits/solver/ac.js";

const vectors = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = vectors.map((vec) => {
  const s = solveAC(netFromList({ elements: vec.elements }), { omega: vec.omega, omegaExact: null, exact: false });
  if (!s.ok) return { ok: false, codes: s.errors.map((e) => e.code) };
  return { ok: true, v: Object.fromEntries(s.nodes.map((n) => [n.name, [n.v.re, n.v.im]])) };
});
process.stdout.write(JSON.stringify(results));
