// Solve a Circuit Bench document with the bench's own code, for Claude's circuit tools
// (app/mcp_server.py), so Claude sees exactly what the bench shows: the nodes it found in the
// drawing, the SPICE netlist, the DC solution, the AC steady state when there are sine sources,
// and any errors or warnings.
//   node scripts/bench_solve.mjs circuit.json
import { readFileSync } from "node:fs";
import { migrate } from "../app/static/circuits/core/doc.js";
import { compile } from "../app/static/circuits/core/compile.js";
import { solveDC } from "../app/static/circuits/solver/op.js";
import { toSpice } from "../app/static/circuits/io/spice.js";
import { solveAC, acFrequency, STEADY } from "../app/static/circuits/solver/ac.js";

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
// with sine sources, the AC steady state too (every switch where it ends up): peak phasors with
// a cosine reference, as [re, im], and exact parts as fraction strings when the solve was exact
const steady = compile(doc, { when: STEADY });
const f = acFrequency(steady);
if (f) {
  const a = solveAC(steady, { omega: f.omega, omegaExact: f.exact });
  const z = (c) => (c ? [c.re, c.im] : null);
  out.ac = {
    ok: a.ok, omega: f.omega, exact: !!a.exact, errors: a.errors.map((e) => e.message), warnings: a.warnings.map((w) => w.message),
    off: f.mixed ? f.sources.filter((src) => Math.abs(src.omega - f.omega) > 1e-9 * f.omega).map((src) => src.el.id) : [],
    nodes: [], parts: {},
  };
  if (a.ok) {
    out.ac.nodes = a.nodes.map((n) => ({ index: n.index, name: n.label || n.name, v: z(n.v), vx: n.vx }));
    for (const [id, e] of Object.entries(a.els)) {
      out.ac.parts[id] = { v: z(e.v), i: z(e.i), s: z(e.s), vx: e.vx, ix: e.ix };
      if (e.pins.length > 2) out.ac.parts[id].pins = e.pins.map((p, j) => ({ pin: steady.byId.get(id).def.pins[j].name, i: z(p.i) }));
    }
  }
}
try { out.netlist = toSpice(doc, net); } catch (err) { out.netlist = null; }
process.stdout.write(JSON.stringify(out));
