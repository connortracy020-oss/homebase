// Solve a file of netlist test vectors with the bench's solver and print the results as JSON.
// Used by tests/test_circuits_solver.py to compare against Homebase's Python solver.
//   node tests/js/vectors.mjs vectors.json
import { readFileSync } from "node:fs";
import { netFromList } from "../../app/static/circuits/solver/netlist.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";

const vectors = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = vectors.map((vec) => {
  const s = solveDC(netFromList({ elements: vec.elements }), { flows: false });
  if (!s.ok) return { ok: false, codes: s.errors.map((e) => e.code) };
  return {
    ok: true, exact: s.exact,
    v: Object.fromEntries(s.nodes.map((n) => [n.name, n.v])),
    vx: Object.fromEntries(s.nodes.map((n) => [n.name, n.vx])),
    i: Object.fromEntries(Object.entries(s.els).map(([id, e]) => [id, e.i])),
    warnings: s.warnings.map((w) => w.code),
  };
});
process.stdout.write(JSON.stringify(results));
