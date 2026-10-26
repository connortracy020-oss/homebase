// Study tools on the bench. Predict first: answers stay hidden until you commit a number,
// then the bench shows the truth and how far off you were (and whether it was the sign or a
// prefix). Every prediction is saved so you and Claude can see patterns.

import { parseValue, fmt } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { exactText } from "../views/overlay.js";
import { pinPoints } from "../core/doc.js";
import { defOf } from "../elements/index.js";

export class Study {
  constructor({ slug, store, getSolution, getNet, refresh, toast }) {
    Object.assign(this, { slug, store, getSolution, getNet, refresh, toast });
    this.predicting = !!store.doc.study?.predict;
    this.revealed = new Set();
    this.asking = null;
    this.last = null;  // last verdict
    this.hidden = (q) => this.predicting && !this.revealed.has(this.key(q)) && q.kind !== "none";
    this.root = document.getElementById("inspector");
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

  panel() { return ""; }
  partTools() { return ""; }
}
