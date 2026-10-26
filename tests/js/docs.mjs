// Solve drawn circuits (bench documents) and report the voltage at given grid points.
//   node tests/js/docs.mjs cases.json   with cases = [{doc, points: [[x, y], ...]}]
import { readFileSync } from "node:fs";
import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = cases.map(({ doc, points }) => {
  const net = compile(migrate(doc));
  const s = solveDC(net, { flows: false });
  if (!s.ok) return { ok: false, errors: s.errors.map((e) => e.message) };
  return { ok: true, exact: s.exact, v: points.map(([x, y]) => { const n = net.nodeAt(`${x},${y}`); return n >= 0 ? s.nodes[n].v : null; }) };
});
process.stdout.write(JSON.stringify(out));
