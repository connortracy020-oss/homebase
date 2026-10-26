// The equations the bench solved, written the way you'd write them by hand: KCL at each
// node (current leaving through each part) plus one equation per voltage source or
// op-amp, then the same with numbers, then the matrix. They come from the same netlist
// the solver used, so they always match its answer.

import { assemble } from "./assemble.js";
import { EXACT } from "./field.js";
import { parseCtrl } from "../elements/dependent.js";

const tx = (s) => String(s).replace(/([#$%&_{}])/g, "\\$1");

// R1 -> R_{1}, Vs -> V_{s}, RL -> R_{L}, Rth -> R_{th}
export function sym(id) {
  const m = /^([A-Za-z])([A-Za-z0-9]*)$/.exec(String(id));
  if (!m) return `\\mathrm{${tx(id)}}`;
  return m[2] ? `${m[1]}_{${tx(m[2])}}` : m[1];
}

export function nodeSym(net, i) {
  if (i === 0) return "0";
  const nd = net.nodes[i], name = nd.label || nd.name;
  const auto = /^n(\d+)$/.exec(name);
  if (auto) return `v_{${auto[1]}}`;
  return /^[Vv][A-Za-z0-9]{1,5}$/.test(name) ? `v_{\\mathrm{${tx(name.slice(1))}}}` : `v_{\\mathrm{${tx(name)}}}`;
}

const cur = (el) => `i_{${sym(el.id)}}`;

function ctrlSym(el) {
  const name = (el.params.cname?.text || (el.def.controls === "v" ? "vx" : "ix")).trim();
  const m = /^([a-zA-Z])([A-Za-z0-9]*)$/.exec(name);
  return m ? (m[2] ? `${m[1]}_{${m[2]}}` : m[1]) : `\\mathrm{${tx(name)}}`;
}

function diff(net, a, b) {
  const A = nodeSym(net, a), B = nodeSym(net, b);
  if (b === 0) return A;
  if (a === 0) return `-${B}`;
  return `${A} - ${B}`;
}

// number text for TeX, with an SI prefix: 2000 -> 2\,\mathrm{k}
export function texNum(x, unit = "") {
  if (x === null || x === undefined) return "?";
  const ax = Math.abs(x);
  const pre = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "\\mu "], [1e-9, "n"], [1e-12, "p"]].find(([k]) => ax >= k * 0.9995) || [1, ""];
  const v = Number((x / pre[0]).toPrecision(4));
  const u = pre[1] || unit ? `\\,\\mathrm{${pre[1]}${unit === "Ω" ? "\\Omega" : unit}}` : "";
  return `${v}${u}`;
}

// the current leaving node m into part el at pin j, as [symbolic, numeric] TeX (or null for none)
function term(net, el, j, numbers) {
  const p = el.params, [a, b] = el.nodes, other = j === 0 ? b : a, here = el.nodes[j];
  const sign = j === 0 ? "" : "-";
  switch (el.type) {
    case "R": {
      const top = diff(net, here, other);
      return `\\frac{${top}}{${numbers ? texNum(p.R.value, "Ω") : sym(el.id)}}`;
    }
    case "I": {
      const v = numbers ? texNum(srcValue(p, "I"), "A") : sym(el.id);
      return j === 0 ? `-${v}` : v;
    }
    case "V": case "E": case "H": case "AM": return `${sign}${cur(el)}`;
    case "L": return net.mode === "ic" ? null : `${sign}${cur(el)}`;
    case "C": return null;
    case "VM": return null;
    case "G": case "F": {
      const g = numbers ? texNum(p.gain.value, el.type === "G" ? "A/V" : "") : `${el.type === "G" ? "g" : "\\beta"}_{\\mathrm{${tx(el.id)}}}`;
      const k = `${g}\\,${ctrlSym(el)}`;
      return j === 0 ? `-${k}` : k;
    }
    case "OA":
      if (j === 2) return cur(el);
      if (p.model.text === "gain" && !p.rin.empty) {
        const r = numbers ? texNum(p.rin.value, "Ω") : `R_{\\mathrm{in}}`;
        return j === 1 ? `\\frac{${diff(net, el.nodes[1], el.nodes[0])}}{${r}}` : `\\frac{${diff(net, el.nodes[0], el.nodes[1])}}{${r}}`;
      }
      return null;
    default: return null;
  }
}

function srcValue(p, q) {
  const kind = p.wave?.text || "dc";
  if (kind === "dc") return p[q].value;
  return p[`${q}0`].value;
}

function join(terms) {
  if (!terms.length) return "0";
  return terms.map((t, i) => (i === 0 ? t : t.startsWith("-") ? ` - ${t.slice(1)}` : ` + ${t}`)).join("");
}

function constraint(net, el, numbers) {
  const p = el.params, [a, b] = el.nodes;
  const lhs = diff(net, a, b);
  switch (el.type) {
    case "V": return `${lhs} = ${numbers ? texNum(srcValue(p, "V"), "V") : sym(el.id)}`;
    case "E": return `${lhs} = ${numbers ? texNum(p.gain.value) : `\\mu_{${tx(el.id)}}`}\\,${ctrlSym(el)}`;
    case "H": return `${lhs} = ${numbers ? texNum(p.gain.value, "Ω") : `r_{${tx(el.id)}}`}\\,${ctrlSym(el)}`;
    case "AM": return `${lhs} = 0`;
    case "L": return net.mode === "ic" ? null : `${lhs} = 0 \\quad\\text{(${tx(el.id)} is a short at DC)}`;
    case "OA": {
      const [m, pl, out] = el.nodes;
      if (p.model.text !== "gain") return `${nodeSym(net, pl)} = ${nodeSym(net, m)} \\quad\\text{(ideal ${tx(el.id)})}`;
      const A = numbers ? texNum(p.A.value) : "A";
      const r = p.rout.value ? ` + ${numbers ? texNum(p.rout.value, "Ω") : "R_{\\mathrm{out}}"}\\,${cur(el)}` : "";
      return `${nodeSym(net, out)} = ${A}\\,(${diff(net, pl, m)})${r}`;
    }
    default: return null;
  }
}

// how each controlling quantity is defined (v_x = ..., i_x = ...)
function definitions(net) {
  const out = [];
  for (const el of net.elements) {
    if (!el.def.dependent || !el.ctrl) continue;
    const s = el.ctrl.sign < 0 ? "-" : "";
    if (el.ctrl.kind === "v") out.push(`${ctrlSym(el)} = ${s ? `-(${diff(net, el.ctrl.nodes[0], el.ctrl.nodes[1])})` : diff(net, el.ctrl.nodes[0], el.ctrl.nodes[1])}`);
    else {
      const t = el.ctrl.target;
      const rhs = t.type === "R" ? `\\frac{${diff(net, t.nodes[0], t.nodes[1])}}{${sym(t.id)}}` : cur(t);
      out.push(`${ctrlSym(el)} = ${s}${s ? "(" : ""}${rhs}${s ? ")" : ""}`);
    }
  }
  return out;
}

export function equations(net, { mode = "dc" } = {}) {
  const n = { ...net, mode };
  const kcl = [];
  for (const nd of net.nodes) {
    if (nd.index === 0) continue;
    const sy = [], nu = [];
    for (const el of net.elements) {
      el.nodes.forEach((m, j) => {
        if (m !== nd.index) return;
        const s = term(n, el, j, false), u = term(n, el, j, true);
        if (s) { sy.push(s); nu.push(u); }
      });
    }
    if (sy.length) kcl.push({ node: nd.index, name: nd.label || nd.name, sym: `${join(sy)} = 0`, num: `${join(nu)} = 0` });
  }
  const cons = [];
  for (const el of net.elements) {
    const s = constraint(n, el, false), u = constraint(n, el, true);
    if (s) cons.push({ id: el.id, sym: s, num: u });
  }
  return { kcl, cons, defs: definitions(n), unknowns: unknownList(n) };
}

function unknownList(net) {
  const out = net.nodes.filter((nd) => nd.index > 0).map((nd) => nodeSym(net, nd.index));
  for (const el of net.elements) if (["V", "E", "H", "AM", "OA"].includes(el.type) || (el.type === "L" && net.mode !== "ic")) out.push(cur(el));
  return out;
}

// the MNA matrix in exact fractions, for small circuits
export function matrixTeX(net, ctx = { mode: "dc", when: { t: -Infinity, side: -1 }, state: new Map(), off: () => false }) {
  let sys;
  try { sys = assemble(net, EXACT, ctx); } catch { return null; }
  if (sys.size > 9 || !sys.size) return null;
  const q = (a) => (a.d === 1n ? `${a.n}` : `${a.n < 0n ? "-" : ""}\\frac{${a.n < 0n ? -a.n : a.n}}{${a.d}}`);
  const names = unknownList({ ...net, mode: ctx.mode });
  const A = sys.A.map((row) => row.map(q).join(" & ")).join(" \\\\ ");
  const x = names.slice(0, sys.size).join(" \\\\ ");
  const b = sys.b.map(q).join(" \\\\ ");
  return `\\begin{bmatrix} ${A} \\end{bmatrix} \\begin{bmatrix} ${x} \\end{bmatrix} = \\begin{bmatrix} ${b} \\end{bmatrix}`;
}

export { parseCtrl };
