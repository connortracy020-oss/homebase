// The Bode plot in the dock: |H| in dB over the phase in degrees, against a log frequency
// axis, with the −3 dB corners, the peak and Q marked. Drag across either plot and the cursor
// frequency drives the rest of the bench: the AC panel, the phasors and the 3D landscape
// show the circuit at that frequency until you close the plot.

import { Plot } from "./plot.js";
import { fmt, sig } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { omegaText } from "./phasorfmt.js";

const TWO_PI = 2 * Math.PI;

export class BodeDock {
  constructor({ dock, solver, acv }) {
    Object.assign(this, { dock, solver, acv });
    this.res = null; this.cursor = null; this.inUnit = "rad/s"; this.input = null; this.output = null;
  }

  get open() { return !this.dock.hidden && this.dock.classList.contains("bode"); }

  // inputs: the independent sources; outputs: node voltages, part voltages and currents
  choices() {
    const net = this.acv.net;
    const inputs = net.elements.filter((el) => el.def.independent && !el.def.threePhase).map((el) => el.id);
    const outputs = [];
    for (const n of net.nodes) if (n.index > 0) outputs.push({ key: `v:${n.index}`, label: `v(${n.label || n.name})`, spec: { kind: "v", node: n.index } });
    for (const el of net.elements) {
      if (el.def.meter === "v" || ["R", "C", "L"].includes(el.type)) outputs.push({ key: `vp:${el.id}`, label: `v(${el.id})`, spec: { kind: "vp", part: el.id } });
      if (!el.def.meter || el.def.meter === "i") outputs.push({ key: `i:${el.id}`, label: `i(${el.id})`, spec: { kind: "i", part: el.id } });
    }
    return { inputs, outputs };
  }

  defaults() {
    const { inputs, outputs } = this.choices(), net = this.acv.net;
    const sine = net.elements.find((el) => el.def.independent && el.params.wave?.text === "sine");
    if (!inputs.includes(this.input)) this.input = sine?.id || inputs[0] || null;
    if (!outputs.some((o) => o.key === this.output)) {
      const named = net.nodes.find((n) => n.index > 0 && /^(v?o(ut)?|vout|out|output)$/i.test(n.label || ""));
      const opOut = net.elements.find((el) => el.type === "OA")?.nodes[2];
      const last = [...net.nodes].reverse().find((n) => n.index > 0 && !net.elements.some((el) => el.id === this.input && el.nodes.includes(n.index)));
      this.output = named ? `v:${named.index}` : opOut > 0 ? `v:${opOut}` : last ? `v:${last.index}` : outputs[0]?.key || null;
    }
    const src = net.byId.get(this.input);
    this.inUnit = src?.params.funit?.text === "Hz" ? "Hz" : "rad/s";
  }

  async show() {
    this.dock.hidden = false;
    this.dock.classList.remove("tran", "ac");
    this.dock.classList.add("bode");
    this.defaults();
    this.render();
    await this.run();
  }

  render() {
    const { inputs, outputs } = this.choices();
    this.dock.innerHTML = `<div class="dock-head"><strong class="dock-title">Bode plot</strong><span class="dock-read"></span><button type="button" class="link" data-bode-close>close</button></div>
      <div class="tran-controls bode-controls">
        <label>H = <select data-bode-out aria-label="Output">${outputs.map((o) => `<option value="${esc(o.key)}" ${o.key === this.output ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
        <label>/ <select data-bode-in aria-label="Input">${inputs.map((id) => `<option value="${esc(id)}" ${id === this.input ? "selected" : ""}>${esc(id)}</option>`).join("")}</select></label>
        <div class="seg small" role="group" aria-label="Frequency axis"><button type="button" data-bode-unit="rad/s" aria-pressed="${this.inUnit === "rad/s"}">ω</button><button type="button" data-bode-unit="Hz" aria-pressed="${this.inUnit === "Hz"}">f</button></div>
        <span class="tran-base bode-note">drag across a plot to see the circuit at that frequency</span></div>
      <div class="bode-plots"><canvas class="dock-plot bode-mag"></canvas><canvas class="dock-plot bode-phase"></canvas></div>`;
    this.magPlot = new Plot(this.dock.querySelector(".bode-mag"), this.dock.querySelector(".dock-read"));
    this.phPlot = new Plot(this.dock.querySelector(".bode-phase"), null);
    const pick = (x) => this.pick(this.inUnit === "Hz" ? x * TWO_PI : x);
    this.magPlot.onPick = pick; this.phPlot.onPick = pick;
    this.dock.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-bode-close")) this.close();
      else if (b.dataset.bodeUnit) { this.inUnit = b.dataset.bodeUnit; this.render(); this.draw(); }
    };
    this.dock.onchange = (e) => {
      if (e.target.matches("[data-bode-out]")) { this.output = e.target.value; this.run(); }
      if (e.target.matches("[data-bode-in]")) { this.input = e.target.value; this.run(); }
    };
  }

  async run() {
    const spec = this.choices().outputs.find((o) => o.key === this.output)?.spec;
    if (!this.input || !spec) { this.message("There's nothing to sweep: the circuit needs an independent source as the input."); return; }
    const doc = this.acv.doc;  // the steady-state circuit (switches where they end up)
    this.res = await this.solver.request("bode", doc, { input: this.input, output: spec });
    if (!this.open) return;
    if (!this.res.ok) { this.message(this.res.why || "Couldn't sweep this circuit."); return; }
    this.draw();
  }

  message(text) {
    const t = this.dock.querySelector(".dock-title");
    if (t) t.textContent = `Bode plot: ${text}`;
    this.magPlot?.set(null); this.phPlot?.set(null);
  }

  draw() {
    const r = this.res;
    if (!r?.ok || !this.magPlot) return;
    const hz = this.inUnit === "Hz", xs = hz ? r.omega.map((w) => w / TWO_PI) : r.omega, unit = hz ? "Hz" : "rad/s", xl = hz ? "f" : "ω";
    const X = (w) => (hz ? w / TWO_PI : w);
    const m = r.markers, marks = [];
    for (const w of m.corners || []) marks.push({ x: X(w), label: `−3 dB at ${fmt(X(w), unit)}`, color: "#a9c48f" });
    if (m.peak) marks.push({ x: X(m.peak.omega), label: `peak ${sig(m.peak.db, 3)} dB${m.Q ? `, Q = ${sig(m.Q, 3)}` : ""}`, color: "#f0b955" });
    const cur = this.cursor ? [{ x: X(this.cursor), label: `${xl} = ${fmt(X(this.cursor), unit)}`, color: "#efe7d6", low: true }] : [];
    const outLabel = this.choices().outputs.find((o) => o.key === this.output)?.label || "out";
    this.magPlot.set({ x: xs, xLog: true, xLabel: xl, xUnit: unit, series: [{ name: `|H|`, unit: "dB", y: r.db }], markers: [...marks, ...cur] });
    this.phPlot.set({ x: xs, xLog: true, xLabel: xl, xUnit: unit, series: [{ name: "∠H", unit: "°", y: r.phase, color: "#8fb4d6" }], markers: cur });
    const shape = { "low-pass": "a low-pass", "high-pass": "a high-pass", "band-pass": "a band-pass", flat: "flat" }[m.shape] || "";
    this.dock.querySelector(".dock-title").textContent = `Bode plot of H = ${outLabel} / ${this.input}${shape ? `: ${shape}` : ""}${m.corners?.length === 1 && m.shape !== "band-pass" ? `, corner ${fmt(X(m.corners[0]), unit)}` : ""}`;
    if (this.cursor) this.readout();
  }

  // the cursor: |H| and ∠H at a frequency, and the rest of the bench shown there
  pick(w) {
    if (!w || !this.res?.ok) return;
    this.cursor = Math.min(Math.max(w, this.res.omega[0]), this.res.omega.at(-1));
    this.draw();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.acv.setPreview({ omega: this.cursor, input: this.input }));
  }

  readout() {
    const r = this.res, w = this.cursor;
    let k = r.omega.findIndex((x) => x >= w);
    if (k <= 0) k = Math.max(0, k);
    const a = Math.max(0, k - 1), f = r.omega[k] === r.omega[a] ? 0 : Math.log(w / r.omega[a]) / Math.log(r.omega[k] / r.omega[a]);
    const lerp = (arr) => arr[a] + (arr[k] - arr[a]) * f;
    const dB = lerp(r.db), ph = lerp(r.phase);
    const read = this.dock.querySelector(".dock-read");
    if (read) read.innerHTML = `<b>ω = ${esc(omegaText(w))}</b> <span>f = ${esc(fmt(w / TWO_PI, "Hz"))}</span> <span style="color:#f0b955">|H| = ${esc(sig(dB, 4))} dB (${esc(sig(10 ** (dB / 20), 4))}×)</span> <span style="color:#8fb4d6">∠H = ${esc(sig(ph, 4))}°</span>`;
  }

  // the circuit changed: sweep again (it's quick)
  stale() {
    if (!this.open) return;
    clearTimeout(this.again);
    this.again = setTimeout(() => { this.defaults(); this.render(); this.run(); }, 250);
  }

  close() {
    this.dock.hidden = true;
    this.dock.classList.remove("bode");
    this.cursor = null;
    this.acv.setPreview(null);
  }
}
