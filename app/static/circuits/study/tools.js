// The study cards in the side panel. Each one is computed from the live circuit, so it
// updates as you edit: the equations, superposition, the Thevenin equivalent, and the
// check-my-work form.

import { equations, matrixTeX } from "../solver/equations.js";
import { thevenin, superposition } from "../solver/theorems.js";
import { fmtExact, fmt } from "../core/units.js";
import * as Q from "../core/rational.js";
import { esc } from "../editor/symbols.js";
import { pinPoints } from "../core/doc.js";

const show = (x, q, unit) => {
  if (x === null || x === undefined) return "—";
  const t = q ? fmtExact(q, unit) : { main: fmt(x, unit), decimal: null };
  return t.decimal ? `${esc(t.main)} <small>${esc(t.decimal)}</small>` : esc(t.main);
};
const fromSol = (n) => (n?.vx ? Q.fromString(n.vx) : null);

export function equationsCard(net, sol) {
  if (!sol?.ok) return card("Equations it solved", `<p class="hint">Fix what's stopping the solve first, then the equations appear here.</p>`);
  const e = equations(net);
  const mat = matrixTeX(net);
  const items = [
    ...e.kcl.map((k) => `<li><span class="eq-label">KCL at ${esc(k.name)}</span>$$${k.sym}$$<details><summary>with numbers</summary>$$${k.num}$$</details></li>`),
    ...e.cons.map((c) => `<li><span class="eq-label">${esc(c.id)}</span>$$${c.sym}$$<details><summary>with numbers</summary>$$${c.num}$$</details></li>`),
    ...e.defs.map((d) => `<li><span class="eq-label">controlling quantity</span>$$${d}$$</li>`),
  ];
  const solved = sol.nodes.filter((n) => n.index > 0 && n.v !== null)
    .map((n) => `<span>${esc(n.label || n.name)} = ${show(n.v, fromSol(n), "V")}</span>`).join("");
  return card("Equations it solved", `
    <p class="hint">KCL at every node (the currents leaving through each part add to zero), plus one equation for each voltage source or op-amp, whose current is an extra unknown.</p>
    <ol class="eqs">${items.join("")}</ol>
    <p class="hint">Unknowns: \\(${e.unknowns.join(",\\ ")}\\)</p>
    ${mat ? `<details><summary>The same equations as a matrix (exact)</summary><div class="eq-matrix">$$${mat}$$</div></details>` : ""}
    <div class="solved-line"><strong>Solution</strong>${solved}</div>`, "eq");
}

export function superpositionCard(net) {
  const s = superposition(net);
  if (!s.ok) return card("Superposition", `<p class="hint">${esc(s.why)}</p>`, "sup");
  const nodes = s.full.nodes.filter((n) => n.index > 0 && n.v !== null);
  const head = `<tr><th>Node</th>${s.sources.map((id) => `<th>${esc(id)} only</th>`).join("")}<th>All on</th></tr>`;
  const rows = nodes.map((n) => `<tr><td>${esc(n.label || n.name)}</td>${s.parts.map((p) => {
    const v = p.nodes[n.index];
    return `<td class="v">${show(v.v, fromSol(v), "V")}</td>`;
  }).join("")}<td class="v"><b>${show(n.v, fromSol(n), "V")}</b></td></tr>`).join("");
  return card("Superposition", `
    <p class="hint">Each independent source on its own, with the others turned off: a voltage source becomes a short (0 V), a current source an open (0 A). Dependent sources stay on.</p>
    <div class="table-scroll"><table class="sup-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    <p class="${s.adds ? "good" : "bad"}">${s.adds ? "The shares add up to the full answer ✓" : "The shares don't add up: this circuit isn't linear."}</p>`, "sup");
}

export function theveninCard(net, sol, partId) {
  const t = thevenin(net, { part: partId });
  if (!t.ok) return card(`Thevenin seen by ${esc(partId)}`, `<p class="hint">${esc(t.why)}</p>`, `thev:${partId}`);
  // V_th as a size with its + terminal named, so the part's orientation doesn't matter
  const flip = t.voc.x < 0;
  const mag = (v) => (v ? { x: Math.abs(v.x), q: v.q ? (v.q.n < 0n ? Q.neg(v.q) : v.q) : null } : null);
  const vth = mag(t.voc), inorton = mag(t.isc);
  const pins = pinPoints(net.byId.get(partId).part);
  const side = (p, q) => (Math.abs(p.x - q.x) >= Math.abs(p.y - q.y) ? (p.x < q.x ? "left" : "right") : (p.y < q.y ? "top" : "bottom"));
  const plus = flip ? side(pins[1], pins[0]) : side(pins[0], pins[1]);
  const voc = `${show(vth.x, vth.q, "V")}${vth.x > 1e-15 ? `<small>+ at ${esc(partId)}'s ${plus} terminal</small>` : ""}`;
  const rth = t.infinite ? "∞ (the rest acts as a current source)" : t.rth ? show(t.rth.x, t.rth.q, "Ω") : "—";
  const isc = inorton ? show(inorton.x, inorton.q, "A") : "—";
  const steps = `<ol class="steps">
    <li>Take ${esc(partId)} out and find the open-circuit voltage across its terminals: \\(V_{th} = V_{oc}\\) = ${voc}.</li>
    <li>Turn every independent source off (voltage source → short, current source → open), push a 1 A test current in, and read the voltage: \\(R_{th}\\) = ${rth}.${net.elements.some((e) => e.def.dependent) ? " (A test source is needed here because of the dependent source.)" : ""}</li>
    <li>Short the terminals for the Norton current: \\(I_N\\) = ${isc}${t.rth && t.rth.x && t.isc ? ` = \\(V_{th}/R_{th}\\)` : ""}.</li></ol>`;
  let extra = "";
  if (t.load) {
    const i = t.load.i, full = sol?.els?.[partId]?.i;
    extra += `<p class="hint">With ${esc(partId)} back in, the equivalent gives \\(I = V_{th}/(R_{th}+R_L)\\) = ${esc(fmt(Math.abs(i), "A"))}${full !== undefined && Math.abs(i - full) < 1e-9 * (1 + Math.abs(full)) ? ", the same as the full circuit ✓" : ""}.</p>`;
  }
  if (t.maxPower) {
    extra += `<p class="hint">Maximum power transfer: ${esc(partId)} would get the most power, ${show(t.maxPower.p, t.maxPower.q, "W")}, when \\(R_L = R_{th}\\) = ${esc(fmt(t.maxPower.R, "Ω"))}.</p>`;
  }
  return card(`Thevenin seen by ${esc(partId)}`, `
    <div class="thev-grid">${equivalentSVG(t)}<div class="readout"><span class="k">V<sub>th</sub></span><span class="v">${voc}</span>
      <span class="k">R<sub>th</sub></span><span class="v">${rth}</span><span class="k">I<sub>N</sub></span><span class="v">${isc}</span></div></div>
    ${steps}${extra}`, `thev:${partId}`);
}

// the same, at two labelled terminals left open on purpose (a and b of a port)
export function theveninPortCard(net, [a, b]) {
  const na = net.nodeByName.get(a), nb = net.nodeByName.get(b), key = `port:${a},${b}`;
  const title = `Thevenin at ${esc(a)}–${esc(b)}`;
  if (na === undefined || nb === undefined) return card(title, `<p class="hint">There are no terminals called ${esc(a)} and ${esc(b)} any more.</p>`, key);
  const t = thevenin(net, { nodes: [na, nb] });
  if (!t.ok) return card(title, `<p class="hint">${esc(t.why)}</p>`, key);
  const flip = t.voc.x < 0;
  const mag = (v) => (v ? { x: Math.abs(v.x), q: v.q ? (v.q.n < 0n ? Q.neg(v.q) : v.q) : null } : null);
  const vth = mag(t.voc), inorton = mag(t.isc);
  const voc = `${show(vth.x, vth.q, "V")}${vth.x > 1e-15 ? `<small>+ at ${esc(flip ? b : a)}</small>` : ""}`;
  const rth = t.infinite ? "∞ (the rest acts as a current source)" : t.rth ? show(t.rth.x, t.rth.q, "Ω") : "—";
  const isc = inorton ? `${show(inorton.x, inorton.q, "A")}${inorton.x > 1e-15 ? `<small>${esc(t.isc.x < 0 ? b : a)} → ${esc(t.isc.x < 0 ? a : b)} through the short</small>` : ""}` : "—";
  const steps = `<ol class="steps">
    <li>With ${esc(a)} and ${esc(b)} open, the open-circuit voltage is \\(V_{th} = v_{${esc(a)}} - v_{${esc(b)}}\\) = ${show(t.voc.x, t.voc.q, "V")}.</li>
    <li>Turn every independent source off (voltage source → short, current source → open), push a 1 A test current into ${esc(a)}, and read the voltage: \\(R_{th}\\) = ${rth}.${net.elements.some((e) => e.def.dependent) ? " (A test source is needed here because of the dependent source.)" : ""}</li>
    <li>Short ${esc(a)} to ${esc(b)} for the Norton current: \\(I_N\\) = ${isc}${t.rth && t.rth.x && t.isc ? ` = \\(V_{th}/R_{th}\\)` : ""}.</li></ol>`;
  const power = t.rth && !t.infinite && t.rth.x > 0
    ? `<p class="hint">Maximum power transfer: a load across ${esc(a)}–${esc(b)} gets the most power, ${esc(fmt((t.voc.x * t.voc.x) / (4 * t.rth.x), "W"))}, when \\(R_L = R_{th}\\).</p>` : "";
  return card(title, `
    <div class="thev-grid">${equivalentSVG(t)}<div class="readout"><span class="k">V<sub>th</sub></span><span class="v">${voc}</span>
      <span class="k">R<sub>th</sub></span><span class="v">${rth}</span><span class="k">I<sub>N</sub></span><span class="v">${isc}</span></div></div>
    ${steps}${power}`, key);
}

// labelled terminals that look like a port: a and b, the way textbooks name them
export function ports(net) {
  const names = new Set(net.nodes.map((n) => n.label).filter(Boolean));
  return names.has("a") && names.has("b") ? [["a", "b"]] : [];
}

function equivalentSVG(t) {
  return `<svg class="thev-svg" viewBox="-0.6 -2.2 9.4 5.6" aria-hidden="true">
    <path class="lead" d="M0 -1.5V-0.95M0 0.95V2.5H7.2M0 -1.5H1.2M3.8 -1.5H7.2"/>
    <circle class="body fill" cx="0" cy="0" r="0.95"/><path class="mark" d="M-0.17 -0.45H0.17M0 -0.62V-0.28M-0.17 0.45H0.17"/>
    <path class="body" d="M1.2 -1.5L1.42 -1.85L1.85 -1.15L2.28 -1.85L2.71 -1.15L3.14 -1.85L3.57 -1.15L3.8 -1.5"/>
    <circle class="term" cx="7.2" cy="-1.5" r="0.18"/><circle class="term" cx="7.2" cy="2.5" r="0.18"/>
    <text x="-1.2" y="-1.2" class="t">V</text><text x="2.5" y="-2.0" class="t">R</text>
    <text x="7.6" y="-1.3" class="t">a</text><text x="7.6" y="2.7" class="t">b</text></svg>`;
}

export function checkCard(net, sol, state) {
  if (!sol?.ok) return card("Check my work", `<p class="hint">The circuit needs to solve first.</p>`, "check");
  const nodes = sol.nodes.filter((n) => n.index > 0 && n.v !== null);
  const result = state.result;
  const rows = nodes.map((n) => {
    const r = result?.rows.find((x) => x.node === n.index);
    const mark = r ? (r.ok ? `<span class="good">✓</span>` : `<span class="bad">✗ ${esc(fmt(r.truth, "V"))}</span>`) : "";
    return `<label class="check-row"><span>${esc(n.label || n.name)}</span><input data-check="${n.index}" inputmode="decimal" autocomplete="off" placeholder="V" value="${esc(state.inputs[n.index] ?? "")}"><span class="mark">${mark}</span></label>`;
  }).join("");
  return card("Check my work", `
    <p class="hint">Type the node voltages you got by hand (from ground). Leave any blank. The bench marks each one, and if one is off it names an equation your numbers break.</p>
    <form class="check-form" data-check-form>${rows}<div class="ask-actions"><button type="submit" class="small primary">Check</button><button type="button" class="small" data-check-clear>Clear</button></div></form>
    ${result?.violation ? `<p class="verdict bad"><span>${esc(result.violation.text)}</span></p>` : result && result.rows.length && result.rows.every((r) => r.ok) ? `<p class="verdict good"><strong>All right.</strong></p>` : ""}`, "check");
}

function card(title, body, kind = "") {
  return `<section class="study-card" data-card="${esc(kind)}"><div class="card-title"><strong>${title}</strong><button type="button" class="link" data-study-close>close</button></div>${body}</section>`;
}
