// Solve drawn circuits (bench documents) and report the voltage at given grid points, and
// optionally the Thevenin equivalent between two labelled nodes.
//   node tests/js/docs.mjs cases.json   with cases = [{doc, points: [[x, y], ...], port?: ["a", "b"]}]
import { readFileSync } from "node:fs";
import { migrate } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import { thevenin } from "../../app/static/circuits/solver/theorems.js";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = cases.map(({ doc, points, port }) => {
  const net = compile(migrate(doc));
  const s = solveDC(net, { flows: false });
  if (!s.ok) return { ok: false, errors: s.errors.map((e) => e.message) };
  const res = { ok: true, exact: s.exact, v: (points || []).map(([x, y]) => { const n = net.nodeAt(`${x},${y}`); return n >= 0 ? s.nodes[n].v : null; }) };
  if (port) {
    const t = thevenin(net, { nodes: port.map((name) => net.nodeByName.get(name)) });
    Object.assign(res, t.ok ? { voc: t.voc.x, rth: t.rth?.x ?? null } : { ok: false, errors: [t.why] });
  }
  return res;
});
process.stdout.write(JSON.stringify(out));
