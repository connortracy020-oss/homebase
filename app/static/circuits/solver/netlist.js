// A netlist without a drawing: [{id, type, nodes: [...], params: {...}}] with node 0 = ground.
// Used by tests, by test vectors written from Homebase's Python solver, and (later) by SPICE
// import. Gives the same structure core/compile.js makes from a drawing.

import { defOf } from "../elements/index.js";
import { parseCtrl } from "../elements/dependent.js";
import { parseParam } from "../core/compile.js";

export function netFromList({ nodes: names = null, elements: list }) {
  const errors = [];
  const nameOf = new Map(), nodes = [];
  const nodeIndex = (n) => {
    if (typeof n === "number") return n;
    if (n === "0" || n === "gnd" || n === "ground") return 0;
    if (!nameOf.has(n)) { nameOf.set(n, nameOf.size + 1); }
    return nameOf.get(n);
  };
  const raw = list.map((e) => ({ ...e, nodes: e.nodes.map(nodeIndex) }));
  const count = Math.max(0, ...raw.flatMap((e) => e.nodes)) + 1;
  for (let i = 0; i < count; i++) {
    const given = names?.[i] ?? [...nameOf].find(([, k]) => k === i)?.[0];
    nodes.push({ index: i, name: i === 0 ? "ground" : given || `n${i}`, label: i === 0 ? null : given || null, ground: i === 0 });
  }
  const elements = [], byId = new Map();
  for (const e of raw) {
    const def = defOf(e.type);
    if (!def || def.topological) { errors.push({ code: "TYPE", message: `unknown part type ${e.type}` }); continue; }
    const params = {};
    for (const pd of def.params) {
      params[pd.key] = parseParam(pd, e.params?.[pd.key], true, (msg) => errors.push({ code: "PARAM", message: `${e.id}: ${msg}`, parts: [e.id] }));
    }
    const el = { id: e.id, type: def.type, def, part: null, nodes: e.nodes, params, ctrl: null };
    elements.push(el); byId.set(el.id, el);
  }
  const byName = new Map(nodes.map((n) => [n.name, n.index]));
  for (const el of elements) {
    if (!el.def.dependent) continue;
    const c = parseCtrl(el.params.ctrl.text);
    if (c.error) { errors.push({ code: "CTRL", message: `${el.id}: ${c.error}`, parts: [el.id] }); continue; }
    if (c.kind === "i") {
      const target = byId.get(c.part);
      if (!target) { errors.push({ code: "CTRL", message: `${el.id}: there's no part ${c.part}.` }); continue; }
      el.ctrl = { kind: "i", sign: c.sign, target };
    } else if (c.ref && byId.has(c.ref)) {
      el.ctrl = { kind: "v", sign: c.sign, nodes: byId.get(c.ref).nodes.slice(0, 2), across: c.ref };
    } else {
      const ns = c.ref ? [c.ref, "0"] : c.nodes;
      const idx = ns.map((nm) => (nm === "0" ? 0 : byName.get(nm)));
      if (idx.includes(undefined)) { errors.push({ code: "CTRL", message: `${el.id}: unknown node in ${el.params.ctrl.text}` }); continue; }
      el.ctrl = { kind: "v", sign: c.sign, nodes: idx };
    }
  }
  return {
    nodes, elements, byId, pins: [], pieces: [], switchEdges: [], junctions: [], openEnds: [], openPins: [],
    nodeAt: () => -1, nodeByName: byName, errors, warnings: [], autoGround: false,
    when: { t: -Infinity, side: -1 }, labelOf: (i) => nodes[i]?.label || null,
  };
}
