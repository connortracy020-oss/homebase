// Solve a Circuit Bench document with the bench's own code, for Claude's circuit tools
// (app/mcp_server.py), so Claude sees exactly what the bench shows: the nodes it found in the
// drawing, the SPICE netlist, the DC solution, and any errors or warnings.
//   node scripts/bench_solve.mjs circuit.json
import { readFileSync } from "node:fs";
import { migrate } from "../app/static/circuits/core/doc.js";
import { compile } from "../app/static/circuits/core/compile.js";
import { solveDC } from "../app/static/circuits/solver/op.js";
import { toSpice } from "../app/static/circuits/io/spice.js";

const doc = migrate(JSON.parse(readFileSync(process.argv[2], "utf8")));
const net = compile(doc);
const s = solveDC(net, { flows: false });

const nodes = net.nodes.map((n) => ({ name: n.label || n.name, ground: !!n.ground, at: n.at, pins: [] }));
for (const el of net.elements) {
  el.nodes.forEach((nd, j) => { if (nd >= 0) nodes[nd].pins.push(`${el.id}.${el.def.pins[j].name}`); });
}
const out = {
  ok: s.ok, exact: !!s.exact,
  errors: s.errors.map((e) => e.message), warnings: s.warnings.map((w) => w.message),
  idle: s.idle || [], nodes, parts: {}, netlist: null,
};
if (s.ok) {
  s.nodes.forEach((n, k) => { Object.assign(nodes[k], { v: n.v, vx: n.vx }); });
  for (const [id, e] of Object.entries(s.els)) out.parts[id] = { v: e.v, i: e.i, p: e.p, vx: e.vx, ix: e.ix, px: e.px };
}
try { out.netlist = toSpice(doc, net); } catch (err) { out.netlist = null; }
process.stdout.write(JSON.stringify(out));
