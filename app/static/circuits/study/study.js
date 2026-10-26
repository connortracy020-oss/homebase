// Study tools on the bench. Predict first: answers stay hidden until you commit a number,
// then the bench shows the truth and how far off you were (and whether it was the sign or a
// prefix). Every prediction is saved so you and Claude can see patterns.

import { parseValue, fmt } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { exactText } from "../views/overlay.js";
import { pinPoints } from "../core/doc.js";
import { defOf } from "../elements/index.js";
import { equationsCard, superpositionCard, theveninCard, theveninPortCard, ports, checkCard } from "./tools.js";
import { checkWork } from "./check.js";
import { Plot } from "../views/plot.js";
import { Transient } from "./transient.js";

export class Study {
  constructor({ slug, store, getSolution, getNet, refresh, toast, solver, dock }) {
    Object.assign(this, { slug, store, getSolution, getNet, refresh, toast, solver, dock });
    this.predicting = !!store.doc.study?.predict;
    this.revealed = new Set();
    this.asking = null;
    this.last = null;  // last verdict
    this.card = null;  // "eq" | "sup" | "check" | "thev:R4"
    this.check = { inputs: {}, result: null };
    this.hidden = (q) => this.predicting && !this.revealed.has(this.key(q)) && q.kind !== "none";
    this.root = document.getElementById("inspector");
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("input", (e) => { const k = e.target.dataset?.check; if (k !== undefined) this.check.inputs[k] = e.target.value; });
    this.root.addEventListener("submit", (e) => { if (e.target.matches("[data-check-form]")) { e.preventDefault(); this.runCheck(); } });
  }

  // ---- study cards ----
  onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.study) {
      this.card = this.card === b.dataset.study ? null : b.dataset.study;
      this.check.result = null;
      if (this.card === "tran") this.tran.run();
      this.refresh();
    }
    else if (b.hasAttribute("data-study-close")) { this.card = null; this.refresh(); }
    else if (b.hasAttribute("data-check-clear")) { this.check = { inputs: {}, result: null }; this.refresh(); }
    else if (b.dataset.sweep) this.sweep(b.dataset.sweep);
  }

  runCheck() {
    const net = this.getNet(), sol = this.getSolution();
    if (!sol?.ok) return;
    const guesses = new Map();
    for (const [k, text] of Object.entries(this.check.inputs)) {
      if (!String(text).trim()) continue;
      const p = parseValue(text, "V");
      if (!p.ok) { this.toast?.(`${net.nodes[k]?.name}: ${p.error}`); return; }
      guesses.set(Number(k), p.value);
    }
    if (!guesses.size) { this.toast?.("Type at least one node voltage first."); return; }
    this.check.result = checkWork(net, sol, guesses);
    for (const r of this.check.result.rows) {
      fetch(`/api/circuits/${this.slug}/attempts`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "check", quantity: `v(${r.name})`, guess: r.guess, truth: r.truth, correct: r.ok, tags: r.ok ? [] : r.tags }),
      }).catch(() => {});
    }
    this.refresh();
  }

  cardHTML() {
    const net = this.getNet(), sol = this.getSolution();
    if (!net || !this.card) return "";
    if (this.predicting && this.card !== "check" && this.card !== "tran") return `<p class="hint">Turn off Predict first to see the worked answers.</p>`;
    if (this.card === "eq") return equationsCard(net, sol);
    if (this.card === "sup") return superpositionCard(net);
    if (this.card === "check") return checkCard(net, sol, this.check);
    if (this.card === "tran") return this.tran.cardHTML();
    if (this.card.startsWith("port:")) return theveninPortCard(net, this.card.slice(5).split(","));
    return "";
  }

  key(q) {
    const net = this.getNet();
    if (q.kind === "v") return `v:${net?.nodes[q.node]?.label || net?.nodes[q.node]?.name}`;
    if (q.part) return `${q.kind}:${q.part}`;
    return q.kind;
  }

  setPredicting(on) {
    this.predicting = on;
    this.revealed.clear();
    this.asking = null; this.last = null;
    if (on) this.toast?.("Predict first: tap any ? to commit a value before you see it.");
  }

  ask(q) {
    if (!this.predicting) return;
    if (q.kind === "part") {
      const part = this.store.doc.parts.find((p) => p.id === q.part);
      q = { kind: defOf(part?.type)?.meter === "v" ? "vp" : "i", part: q.part };
    }
    this.asking = q; this.last = null;
    this.refresh();
    setTimeout(() => document.getElementById("ask-input")?.focus(), 0);
  }

  // the question, in words, with the reference direction made explicit
  question(q) {
    const net = this.getNet(), part = q.part && this.store.doc.parts.find((p) => p.id === q.part);
    if (q.kind === "v") return { text: `Voltage at ${net.nodes[q.node].label || net.nodes[q.node].name} (from ground)`, unit: "V" };
    if (!part) return null;
    const [a, b] = pinPoints(part);
    const way = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? (b.x > a.x ? "left to right" : "right to left") : (b.y > a.y ? "top to bottom" : "bottom to top");
    const plus = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? (a.x < b.x ? "left" : "right") : (a.y < b.y ? "top" : "bottom");
    if (q.kind === "i") {
      if (["V", "E", "H"].includes(part.type)) return { text: `Current out of ${part.id}'s + terminal`, unit: "A" };
      if (part.type === "AM") return { text: `What ${part.id} reads`, unit: "A" };
      return { text: `Current through ${part.id}, flowing ${way} (negative if it really flows the other way)`, unit: "A" };
    }
    if (q.kind === "vp") return { text: part.type === "VM" ? `What ${part.id} reads` : `Voltage across ${part.id}, + at the ${plus}`, unit: "V" };
    if (q.kind === "p") return { text: `Power ${part.id} absorbs (negative if it delivers)`, unit: "W" };
    return null;
  }

  truth(q) {
    const sol = this.getSolution();
    if (!sol?.ok) return null;
    if (q.kind === "v") return sol.nodes[q.node].v === null ? null : { x: sol.nodes[q.node].v, xs: sol.nodes[q.node].vx };
    const e = sol.els[q.part];
    if (!e) return null;
    const part = this.store.doc.parts.find((p) => p.id === q.part);
    if (q.kind === "i") {
      if (["V", "E", "H"].includes(part.type)) return { x: -e.i, xs: e.ix && (e.ix.startsWith("-") ? e.ix.slice(1) : `-${e.ix}`) };
      return { x: e.i, xs: e.ix };
    }
    if (q.kind === "vp") return { x: e.v, xs: e.vx };
    if (q.kind === "p") return { x: e.p, xs: e.px };
    return null;
  }

  renderAsk() {
    let box = document.getElementById("ask");
    if (!this.predicting || (!this.asking && !this.last)) { box?.remove(); return; }
    if (!box) {
      box = document.createElement("div");
      box.id = "ask";
      box.className = "ask-card";
      this.root.prepend(box);
    } else if (box.parentElement !== this.root || this.root.firstElementChild !== box) this.root.prepend(box);
    if (this.last) {
      const v = this.last;
      box.innerHTML = `<div class="verdict ${v.correct ? "good" : "bad"}"><strong>${v.correct ? "Right" : v.tags.includes("sign") ? "Right size, wrong sign" : v.tags.includes("units") ? "Off by a factor of 1000" : "Not quite"}</strong>
        <span>${esc(v.q)}: you said ${esc(v.guessText)}, it's ${esc(v.truthText)}.</span>
        ${v.correct ? "" : `<span class="hint">${esc(v.tip)}</span>`}</div>
        <div class="ask-actions"><button type="button" class="small" data-ask-done>Done</button></div>`;
    } else {
      const q = this.question(this.asking);
      if (!q) { box.remove(); return; }
      box.innerHTML = `<form class="ask-form"><span class="eyebrow">Predict</span><label>${esc(q.text)}
        <span class="ask-row"><input id="ask-input" inputmode="decimal" autocomplete="off" placeholder="e.g. 4.5 or 2.2m" aria-label="${esc(q.text)}"><span class="unit">${esc(q.unit)}</span></span></label>
        <span class="reading" id="ask-reading"></span>
        <span class="ask-actions"><button type="submit" class="small primary">Check</button><button type="button" class="small" data-ask-skip>Just show me</button></span></form>`;
      const form = box.querySelector("form"), field = box.querySelector("input");
      field.addEventListener("input", () => {
        const p = parseValue(field.value, q.unit);
        box.querySelector("#ask-reading").textContent = field.value.trim() ? (p.ok ? `= ${fmt(p.value, q.unit)}` : p.error) : "";
      });
      form.addEventListener("submit", (e) => { e.preventDefault(); this.check(field.value); });
    }
    box.querySelector("[data-ask-skip]")?.addEventListener("click", () => { this.revealed.add(this.key(this.asking)); this.asking = null; this.refresh(); });
    box.querySelector("[data-ask-done]")?.addEventListener("click", () => { this.last = null; this.refresh(); });
  }

  check(text) {
    const q = this.asking, info = this.question(q), t = this.truth(q);
    if (!info || !t) return;
    const p = parseValue(text, info.unit);
    if (!p.ok) { this.toast?.(p.error); return; }
    const g = p.value, tol = Math.max(0.01 * Math.abs(t.x), 1e-12);
    const correct = Math.abs(g - t.x) <= tol;
    const tags = [];
    if (!correct && Math.abs(t.x) > 1e-15 && Math.abs(g + t.x) <= tol) tags.push("sign");
    if (!correct && [1e3, 1e-3, 1e6, 1e-6].some((k) => Math.abs(g - t.x * k) <= tol * k)) tags.push("units");
    const truthText = exactText(t.x, t.xs, info.unit);
    this.last = {
      correct, tags, q: info.text.replace(/ \(.*\)$/, ""),
      guessText: fmt(g, info.unit), truthText: truthText.decimal ? `${truthText.main} (${truthText.decimal})` : truthText.main,
      tip: tags.includes("sign") ? "Check the reference direction or polarity the question uses." : tags.includes("units") ? "Check the prefix: m is 10⁻³, k is 10³, µ is 10⁻⁶." : "Try writing KCL at the node, or check which parts are in series and which are in parallel.",
    };
    this.revealed.add(this.key(q));
    this.asking = null;
    const quantity = q.kind === "v" ? `v(${this.getNet().nodes[q.node].label || this.getNet().nodes[q.node].name})` : `${q.kind === "vp" ? "v" : q.kind}(${q.part})`;
    fetch(`/api/circuits/${this.slug}/attempts`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "predict", quantity, guess: g, truth: t.x, correct, tags }),
    }).catch(() => {});
    this.refresh();
  }

  panel() {
    const pressed = (k) => `aria-pressed="${this.card === k}"`;
    return `<div class="study-tools"><span class="eyebrow">Study</span><div class="tool-row">
      <button type="button" class="small" data-study="eq" ${pressed("eq")}>Equations</button>
      <button type="button" class="small" data-study="sup" ${pressed("sup")}>Superposition</button>
      <button type="button" class="small" data-study="check" ${pressed("check")}>Check my work</button>
      ${Transient.relevant(this.store.doc) ? `<button type="button" class="small" data-study="tran" ${pressed("tran")}>Over time</button>` : ""}
      ${(this.getNet() ? ports(this.getNet()) : []).map(([a, b]) => `<button type="button" class="small" data-study="port:${esc(a)},${esc(b)}" ${pressed(`port:${a},${b}`)}>Thevenin at ${esc(a)}–${esc(b)}</button>`).join("")}</div>${this.cardHTML()}</div>`;
  }

  partTools(part) {
    const def = defOf(part.type);
    if (def.topological || def.pins.length !== 2 || def.meter) return "";
    const key = `thev:${part.id}`;
    const sweepable = sweepKey(part);
    const card = this.card === key && !this.predicting ? theveninCard(this.getNet(), this.getSolution(), part.id) : "";
    return `<div class="tool-row"><button type="button" class="small" data-study="${key}" aria-pressed="${this.card === key}">Thevenin seen by ${esc(part.id)}</button>
      ${sweepable ? `<button type="button" class="small" data-sweep="${esc(part.id)}">Sweep ${esc(part.id)}</button>` : ""}</div>${card}`;
  }

  // ---- sweeps: solve for a range of one part's value, plot it in the dock ----
  async sweep(id) {
    const part = this.store.doc.parts.find((p) => p.id === id);
    const key = part && sweepKey(part);
    if (!key) return;
    const base = parseValue(part.params[key], unitOf(key)).value;
    const log = key === "R";
    const n = 81;
    const values = [];
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1);
      values.push(log ? base * 10 ** (2 * f - 1) : base === 0 ? (2 * f - 1) * 10 : base * 2 * f);
    }
    this.openDock(`Sweeping ${id}...`);
    const res = await this.solver.request("sweep", this.store.doc, { part: id, key, values });
    if (!res.ok) { this.openDock(`Couldn't sweep ${id}.`); return; }
    const net = this.getNet();
    const series = [];
    const markers = [{ x: base, label: `now ${fmt(base, unitOf(key))}` }];
    if (key === "R") {
      const I = res.results.map((r) => r?.els[id]?.i ?? null), P = res.results.map((r) => r?.els[id]?.p ?? null);
      series.push({ name: `current in ${id}`, unit: "A", y: I.map((v) => (v === null ? null : Math.abs(v))), axis: 0 });
      series.push({ name: `power into ${id}`, unit: "W", y: P, axis: 1 });
      const k = P.reduce((best, v, i) => (v !== null && (best < 0 || v > P[best]) ? i : best), -1);
      if (k > 0 && k < n - 1) markers.push({ x: values[k], label: `most power at ${fmt(values[k], "Ω")}`, color: "#a9c48f" });
    } else {
      for (const nd of net.nodes) {
        if (nd.index === 0) continue;
        series.push({ name: nd.label || nd.name, unit: "V", y: res.results.map((r) => r?.nodes[nd.index] ?? null), axis: 0 });
      }
    }
    this.openDock(`${id}: ${labelOf(key)} from ${fmt(values[0], unitOf(key))} to ${fmt(values[n - 1], unitOf(key))}`, {
      x: values, xLabel: id, xUnit: unitOf(key), xLog: log, series: series.slice(0, 5), markers,
    });
  }

  openDock(title, data) {
    const dock = this.dock;
    dock.hidden = false;
    if (!dock.querySelector("canvas")) {
      dock.innerHTML = `<div class="dock-head"><strong class="dock-title"></strong><span class="dock-read"></span><button type="button" class="link" data-dock-close>close</button></div><canvas class="dock-plot"></canvas>`;
      dock.querySelector("[data-dock-close]").addEventListener("click", () => { dock.hidden = true; });
      this.plot = new Plot(dock.querySelector("canvas"), dock.querySelector(".dock-read"));
    }
    dock.querySelector(".dock-title").textContent = title;
    if (data) this.plot.set(data);
  }
}

function sweepKey(part) {
  if (part.type === "R") return "R";
  if ((part.type === "V" || part.type === "I") && (!part.params.wave || part.params.wave === "dc")) return part.type;
  if (["E", "F", "G", "H"].includes(part.type)) return "gain";
  return null;
}

const unitOf = (key) => ({ R: "Ω", V: "V", I: "A" }[key] || "");
const labelOf = (key) => ({ R: "resistance", V: "voltage", I: "current", gain: "gain" }[key]);
