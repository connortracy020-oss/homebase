// The transfer function in the dock: H(s) typeset exactly, its poles (×) and zeros (○) on the
// s-plane, and the step or impulse response beside them. Poles on the left decay, the farther
// left the faster; poles off the axis oscillate at their height. ω₀, ζ and Q for second order.

import { Plot } from "./plot.js";
import { fmt, sig } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { choicesFor, defaultIO } from "./bode.js";
import * as Q from "../core/rational.js";

export class HsDock {
  constructor({ dock, solver, acv }) {
    Object.assign(this, { dock, solver, acv });
    this.res = null; this.input = null; this.output = null; this.which = "step";
  }

  get open() { return !this.dock.hidden && this.dock.classList.contains("hs"); }

  async show(net, doc) {
    this.net = net; this.doc = doc;
    this.dock.hidden = false;
    this.dock.classList.remove("tran", "ac", "bode");
    this.dock.classList.add("hs");
    [this.input, this.output] = defaultIO(net, this.input, this.output);
    this.render();
    await this.run();
  }

  render() {
    const { inputs, outputs } = choicesFor(this.net);
    this.dock.innerHTML = `<div class="dock-head"><strong class="dock-title">Transfer function</strong><span class="dock-read"></span><button type="button" class="link" data-hs-close>close</button></div>
      <div class="tran-controls bode-controls">
        <label>H(s) = <select data-hs-out aria-label="Output">${outputs.map((o) => `<option value="${esc(o.key)}" ${o.key === this.output ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
        <label>/ <select data-hs-in aria-label="Input">${inputs.map((id) => `<option value="${esc(id)}" ${id === this.input ? "selected" : ""}>${esc(id)}</option>`).join("")}</select></label>
        <div class="seg small" role="group" aria-label="Response"><button type="button" data-hs-which="step" aria-pressed="${this.which === "step"}">Step</button><button type="button" data-hs-which="impulse" aria-pressed="${this.which === "impulse"}">Impulse</button></div></div>
      <div class="hs-body"><div class="hs-left"><div class="hs-formula"></div><div class="hs-pz"></div></div><canvas class="dock-plot"></canvas></div>`;
    this.plot = new Plot(this.dock.querySelector("canvas"), this.dock.querySelector(".dock-read"));
    this.dock.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-hs-close")) this.close();
      else if (b.dataset.hsWhich) { this.which = b.dataset.hsWhich; this.dock.querySelectorAll("[data-hs-which]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); this.drawResponse(); }
    };
    this.dock.onchange = (e) => {
      if (e.target.matches("[data-hs-out]")) { this.output = e.target.value; this.run(); }
      if (e.target.matches("[data-hs-in]")) { this.input = e.target.value; this.run(); }
    };
  }

  async run() {
    const spec = choicesFor(this.net).outputs.find((o) => o.key === this.output)?.spec;
    if (!this.input || !spec) { this.message("The circuit needs a voltage or current source as the input."); return; }
    this.res = await this.solver.request("hs", this.doc, { input: this.input, output: spec });
    if (!this.open) return;
    if (!this.res.ok) { this.message(this.res.why); return; }
    this.draw();
  }

  message(text) {
    this.dock.querySelector(".hs-formula").innerHTML = `<p class="hint">${esc(text)}</p>`;
    this.dock.querySelector(".hs-pz").innerHTML = "";
    this.plot?.set(null);
  }

  draw() {
    const h = this.res;
    const outLabel = choicesFor(this.net).outputs.find((o) => o.key === this.output)?.label || "out";
    const facts = [];
    if (h.dcGain !== null && Number.isFinite(h.dcGain)) facts.push(`H(0) = ${sig(h.dcGain, 4)}`);
    if (h.hfGain) facts.push(`H(∞) = ${sig(h.hfGain, 4)}`);
    if (h.w0) facts.push(`ω₀ = ${fmt(h.w0, "rad/s")}`, `ζ = ${sig(h.zeta, 3)}`, `Q = ${Number.isFinite(h.Q) ? sig(h.Q, 3) : "∞"}`);
    const kind = h.zeta === undefined ? "" : h.zeta < 0 ? "unstable" : h.zeta < 1 ? "underdamped" : h.zeta === 1 ? "critically damped" : "overdamped";
    this.dock.querySelector(".dock-title").textContent = `H(s) = ${outLabel} / ${this.input}${h.exact ? " (exact)" : ""}`;
    this.dock.querySelector(".hs-formula").innerHTML = `<div class="hs-tex">$$H(s) = ${fracTeX(h)}$$</div>
      <p class="small hs-facts">${esc(facts.join(" · "))}${kind ? ` · ${esc(kind)}` : ""}</p>
      <ul class="small hs-roots">${h.poles.map((p) => `<li><span class="pz-x">×</span> pole ${esc(rootText(p))}</li>`).join("")}${h.zeros.map((z) => `<li><span class="pz-o">○</span> zero ${esc(rootText(z))}</li>`).join("")}</ul>`;
    this.dock.querySelector(".hs-pz").innerHTML = pzSVG(h);
    try { window.renderMath?.(this.dock.querySelector(".hs-formula")); } catch { /* no KaTeX here */ }
    this.drawResponse();
  }

  drawResponse() {
    const r = this.res?.responses;
    if (!r || !this.plot) return;
    if (!r.t) { this.plot.set(null); this.dock.querySelector(".dock-read").textContent = r.note || ""; return; }
    const y = this.which === "step" ? r.step : r.impulse;
    this.plot.set({ x: r.t, xLabel: "t", xUnit: "s", series: [{ name: this.which === "step" ? "step response" : "impulse response", unit: this.which === "step" ? "" : "/s", y }], markers: [] });
    if (r.note && this.which === "impulse") this.dock.querySelector(".dock-read").textContent = r.note;
  }

  stale(net, doc) {
    if (!this.open) return;
    this.net = net; this.doc = doc;
    clearTimeout(this.again);
    this.again = setTimeout(() => { [this.input, this.output] = defaultIO(net, this.input, this.output); this.render(); this.run(); }, 250);
  }

  close() { this.dock.hidden = true; this.dock.classList.remove("hs"); }
}

// ---- formatting ----

function rootText(z) {
  if (!z.im) return fmt(z.re, "") || "0";
  return `${fmt(z.re, "")} ${z.im < 0 ? "−" : "+"} j${fmt(Math.abs(z.im), "")}`;
}

// H(s) as a fraction of two polynomials: exact coefficients when there are some
function fracTeX(h) {
  const num = polyTeX(h.numText || h.num, !!h.numText), den = polyTeX(h.denText || h.den, !!h.denText);
  return den === "1" ? num : `\\dfrac{${num}}{${den}}`;
}

function polyTeX(coeffs, exact) {
  const terms = [];
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = exact ? Q.fromString(coeffs[k]) : coeffs[k];
    const v = exact ? Q.toNumber(c) : c;
    if (v === 0) continue;
    const neg = v < 0, abs = exact ? (neg ? Q.neg(c) : c) : Math.abs(c);
    let mag = exact ? coefTeX(abs) : numTeX(abs);
    if (k > 0 && (mag === "1")) mag = "";
    const pow = k === 0 ? "" : k === 1 ? "s" : `s^{${k}}`;
    terms.push({ neg, body: `${mag}${mag && pow ? "\\," : ""}${pow}` || "1" });
  }
  if (!terms.length) return "0";
  return terms.map((t, i) => (i === 0 ? (t.neg ? "-" : "") + t.body : `${t.neg ? " - " : " + "}${t.body}`)).join("");
}

function coefTeX(q) {
  if (q.d === 1n) return q.n.toString().length > 9 ? numTeX(Q.toNumber(q)) : q.n.toString();
  if (q.n.toString().length + q.d.toString().length > 12) return numTeX(Q.toNumber(q));
  return `\\tfrac{${q.n}}{${q.d}}`;
}

function numTeX(x) {
  if (x === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -3 && e < 6) return String(Number(x.toPrecision(5)));
  const m = Number((x / 10 ** e).toPrecision(4));
  return `${m === 1 ? "" : `${m}\\times`}10^{${e}}`;
}

// the s-plane: σ across, jω up, poles as ×, zeros as ○
function pzSVG(h) {
  const pts = [...h.poles, ...h.zeros];
  const R = Math.max(1e-12, ...pts.map((z) => Math.max(Math.abs(z.re), Math.abs(z.im)))) * 1.25;
  const C = 100, S = 80 / R;
  const X = (z) => C + z.re * S, Y = (z) => C - z.im * S;
  const out = [`<svg class="pz-svg" viewBox="0 0 200 200" role="img" aria-label="Pole-zero plot: ${esc(`${h.poles.length} poles, ${h.zeros.length} zeros`)}">`,
    `<rect x="0" y="0" width="${C}" height="200" class="pz-stable"/>`,
    `<line class="ph-axis" x1="8" y1="${C}" x2="192" y2="${C}"/><line class="ph-axis" x1="${C}" y1="8" x2="${C}" y2="192"/>`,
    `<text class="ph-ax" x="190" y="${C - 5}" text-anchor="end">σ</text><text class="ph-ax" x="${C + 5}" y="16">jω</text>`,
    `<text class="ph-ax" x="${C + 4}" y="${C + 13}">${esc(fmt(R / 1.25, ""))}</text>`];
  for (const p of h.poles) out.push(`<g class="pz-x"><title>pole ${esc(rootText(p))}</title><path d="M${X(p) - 5} ${Y(p) - 5}L${X(p) + 5} ${Y(p) + 5}M${X(p) - 5} ${Y(p) + 5}L${X(p) + 5} ${Y(p) - 5}"/></g>`);
  for (const z of h.zeros) out.push(`<g class="pz-o"><title>zero ${esc(rootText(z))}</title><circle cx="${X(z)}" cy="${Y(z)}" r="5"/></g>`);
  out.push("</svg>");
  return out.join("");
}
