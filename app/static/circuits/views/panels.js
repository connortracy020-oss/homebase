// Text panels: the status pill, the circuit overview (nodes, KCL, power, assumptions), the
// selected part's numbers, and the hover tooltip. Exact fractions first, decimals beside them.

import { fmt } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { exactText } from "./overlay.js";
import { voltageColor } from "./palette.js";
import { defOf } from "../elements/index.js";
import { pinPoints } from "../core/doc.js";

const ex = (x, xs, unit) => {
  const t = exactText(x, xs, unit);
  return t.decimal ? `${esc(t.main)}<small>${esc(t.decimal)}</small>` : esc(t.main);
};

export function statusHTML(sol, { pending = false } = {}) {
  if (!sol) return `<span class="wait">● Solving…</span>`;
  if (sol.empty) return `<span class="wait">Empty</span><span class="msg">Pick a part on the left, then click where it goes.</span>`;
  if (!sol.ok) {
    const e = sol.errors[0];
    return `<span class="bad">● Can't solve yet</span><span class="msg">${esc(e?.message || "")}</span>${sol.errors.length > 1 ? `<span class="more">+${sol.errors.length - 1} more</span>` : ""}`;
  }
  const notes = sol.warnings.filter((w) => w.code !== "OPEN_PIN");
  return `<span class="ok">● Solved</span><span class="msg">${sol.exact ? "exact" : "decimal"}${pending ? " · updating" : ""}</span>`
    + (notes.length ? `<span class="more">${esc(notes[0].message)}${notes.length > 1 ? ` (+${notes.length - 1})` : ""}</span>` : "");
}

// currents into a node, part by part (positive = flowing into the node)
export function kclRows(net, sol, node) {
  const rows = [];
  for (const el of net.elements) {
    el.nodes.forEach((n, j) => {
      if (n !== node) return;
      const i = -sol.els[el.id].pins[j].i;  // entering the part = leaving the node
      if (Math.abs(i) > 1e-15) rows.push({ id: el.id, i });
    });
    if (el.def.groundReturn && node === 0) {
      const total = sol.els[el.id].pins.reduce((s, p) => s + p.i, 0);
      if (Math.abs(total) > 1e-15) rows.push({ id: `${el.id} (supply)`, i: total });
    }
  }
  return rows;
}

export function kclHTML(net, sol, node, { hidden = () => false } = {}) {
  if (!sol?.ok || hidden({ kind: "v", node })) return "";
  const rows = kclRows(net, sol, node);
  if (rows.length < 2) return "";
  const inn = rows.filter((r) => r.i > 0), out = rows.filter((r) => r.i < 0);
  const sum = (rs) => rs.reduce((s, r) => s + Math.abs(r.i), 0);
  return `<div class="kcl"><div class="kcl-head"><strong>KCL at ${esc(net.nodes[node].label || net.nodes[node].name)}</strong> <span class="good">balances ✓</span></div>
    <div class="kcl-cols"><div><span class="k">in</span>${inn.map((r) => `<span>${esc(r.id)} <b>${esc(fmt(r.i, "A"))}</b></span>`).join("")}<span class="tot">${esc(fmt(sum(inn), "A"))}</span></div>
    <div><span class="k">out</span>${out.map((r) => `<span>${esc(r.id)} <b>${esc(fmt(-r.i, "A"))}</b></span>`).join("")}<span class="tot">${esc(fmt(sum(out), "A"))}</span></div></div></div>`;
}

export function overviewHTML(doc, net, sol, { hidden = () => false, focusNode = null } = {}) {
  if (!doc.parts.length) {
    return `<div class="overview"><h3>Start a circuit</h3><ol class="tips">
      <li>Pick a part on the left (or press 1 for a resistor, 4 for a voltage source), then click where it goes.</li>
      <li>Drag from one terminal to another to wire them, or tap a terminal and then another. Wires route themselves.</li>
      <li>Add a ground (8) to set the 0 V reference.</li>
      <li>It solves as you build: exact node voltages, currents, and power.</li></ol>
      <p class="hint"><span class="kbd">R</span> rotate · <span class="kbd">Del</span> delete · <span class="kbd">Ctrl Z</span> undo · <span class="kbd">F</span> fit · double-click a switch to flip it</p></div>`;
  }
  const parts = [];
  if (sol && !sol.ok && !sol.empty) {
    parts.push(`<div><h3>What's stopping it</h3><ul class="err-list">${sol.errors.map((e) => `<li>${esc(e.message)}</li>`).join("")}</ul></div>`);
  }
  if (sol?.ok) {
    const vmax = Math.max(1e-9, ...sol.nodes.map((n) => Math.abs(n.v ?? 0)));
    parts.push(`<div><h3>Node voltages</h3><table class="node-table"><tbody>${sol.nodes.filter((n) => n.index > 0 && n.v !== null).map((n) => {
      const hide = hidden({ kind: "v", node: n.index });
      return `<tr data-node="${n.index}" class="${focusNode === n.index ? "focus" : ""}"><td><i style="background:${hide ? "var(--line)" : voltageColor(n.v, vmax)}"></i></td>
        <td>${esc(n.label || n.name)}</td><td class="v">${hide ? `<button type="button" class="chip ask" data-ask-node="${n.index}">? predict</button>` : ex(n.v, n.vx, "V")}</td></tr>`;
    }).join("")}</tbody></table><p class="hint">Voltages are measured from ground. Tap a node to see its KCL.</p></div>`);
    if (focusNode !== null) parts.push(kclHTML(net, sol, focusNode, { hidden }));
    const pw = Object.entries(sol.els).filter(([, e]) => Math.abs(e.p) > 1e-15);
    if (pw.length && !hidden({ kind: "p" })) {
      const total = pw.reduce((s, [, e]) => s + e.p, 0);
      parts.push(`<div><h3>Power</h3><table class="pow-table"><tbody>${pw.map(([id, e]) =>
        `<tr><td>${esc(id)}</td><td>${e.p < 0 ? "delivers" : "absorbs"}</td><td class="v">${ex(Math.abs(e.p), e.px?.replace(/^-/, ""), "W")}</td></tr>`).join("")}
        <tr class="sum"><td>Total</td><td></td><td class="v">${Math.abs(total) < 1e-12 ? "0 ✓" : esc(fmt(total, "W"))}</td></tr></tbody></table>
        <p class="hint">Passive sign convention: a part absorbs power when current enters its + terminal. Everything delivered is absorbed somewhere.</p></div>`);
    }
  }
  const notes = (sol?.warnings || []);
  if (notes.length) parts.push(`<ul class="err-list">${notes.map((w) => `<li class="warn">${esc(w.message)}</li>`).join("")}</ul>`);
  if (sol?.assumptions?.length) parts.push(`<details class="assume"><summary>Assumptions</summary><ul class="tips">${sol.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>`);
  return `<div class="overview">${parts.join("")}</div>`;
}

// the numbers for one selected part
export function solvedHTML(part, sol, { hidden = () => false } = {}) {
  const e = sol?.ok ? sol.els[part.id] : null;
  if (!e) return "";
  const rows = [];
  const hideI = hidden({ kind: "i", part: part.id }), hideV = hidden({ kind: "vp", part: part.id }), hideP = hidden({ kind: "p", part: part.id });
  const q = (h, html) => (h ? `<button type="button" class="chip ask" data-ask-part="${esc(part.id)}">? predict</button>` : html);
  const def = defOf(part.type);
  if (part.type === "OA") {
    rows.push(["Output voltage", q(hideV, ex(e.v, e.vx, "V"))], ["Output current", q(hideI, ex(e.i, e.ix, "A"))]);
    rows.push(["v₊ − v₋", ex(sol.nodes[e.nodes[1]].v - sol.nodes[e.nodes[0]].v, null, "V")]);
  } else if (def.meter) {
    rows.push([def.meter === "i" ? "Reads" : "Reads", q(def.meter === "i" ? hideI : hideV, ex(e.reading.value, e.reading.exact, def.meter === "i" ? "A" : "V"))]);
  } else {
    const [a, b] = pinPoints(part);
    const side = (p, q) => (Math.abs(p.x - q.x) >= Math.abs(p.y - q.y) ? (p.x < q.x ? "left" : "right") : (p.y < q.y ? "top" : "bottom"));
    const way = (p, q) => (Math.abs(p.x - q.x) >= Math.abs(p.y - q.y) ? (q.x > p.x ? "→ right" : "← left") : (q.y > p.y ? "↓ down" : "↑ up"));
    const mag = (x, xs) => [Math.abs(x), xs?.replace(/^-/, "")];
    const [vm, vmx] = mag(e.v, e.vx), [im, imx] = mag(e.i, e.ix);
    const plus = e.v >= 0 ? side(a, b) : side(b, a);
    rows.push(["Voltage across", e.v === null ? "not defined at DC" : q(hideV, `${ex(vm, vmx, "V")}${vm > 1e-15 ? `<small>+ at the ${plus}</small>` : ""}`)]);
    if (["V", "E", "H"].includes(part.type)) rows.push(["Current out of +", q(hideI, ex(-e.i, negx(e.ix), "A"))]);
    else if (["I", "G", "F"].includes(part.type)) rows.push(["Current (arrow way)", q(hideI, ex(-e.i, negx(e.ix), "A"))]);
    else rows.push(["Current", q(hideI, `${ex(im, imx, "A")}${im > 1e-15 ? `<small>${e.i >= 0 ? way(a, b) : way(b, a)}</small>` : ""}`)]);
    rows.push([e.p < 0 ? "Delivers" : "Absorbs", q(hideP, ex(Math.abs(e.p), e.px?.replace(/^-/, ""), "W"))]);
  }
  return `<div class="readout">${rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v}</span>`).join("")}</div>`;
}

const negx = (s) => (s ? (s.startsWith("-") ? s.slice(1) : `-${s}`) : s);

export function tipHTML(part, sol, opts) {
  const e = sol?.ok ? sol.els[part.id] : null;
  const head = `<div class="t">${esc(part.id)} · ${esc(defOf(part.type).name)}</div>`;
  if (!e) return head;
  const body = solvedHTML(part, sol, opts).replace('class="readout"', 'class="readout tipgrid"');
  return head + body;
}
