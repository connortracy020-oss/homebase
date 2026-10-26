// Transients on the bench: run the circuit through time, show it on the scope in the dock,
// and play it back so the schematic and the 3D landscape show the circuit at each moment.
// The time base is stated on screen ("1 ms of circuit time = 1.6 s"), so the animation
// never pretends to be real time.

import { compile } from "../core/compile.js";
import { niceMax } from "../views/palette.js";
import { pinPoints, key } from "../core/doc.js";
import { switchState } from "../core/compile.js";
import { defOf } from "../elements/index.js";
import { wireFlows } from "../solver/flows.js";
import { Plot } from "../views/plot.js";
import { spectrum } from "../solver/fft.js";
import { fmt, fmtExact } from "../core/units.js";
import { fromString } from "../core/rational.js";
import { esc } from "../editor/symbols.js";
import { texNum, sym } from "../solver/equations.js";

const PLAY_SECONDS = 8;  // the whole run plays in this many seconds at 1x

export class Transient {
  constructor({ store, solver, dock, refresh, toast }) {
    Object.assign(this, { store, solver, dock, refresh, toast });
    this.result = null; this.k = null; this.playing = false; this.speed = 1; this.traces = null;
  }

  // does this circuit change in time at all?
  static relevant(doc) {
    return doc.parts.some((p) => p.type === "C" || p.type === "L" || ((p.type === "SW" || p.type === "SW2") && (p.params.at || "").trim())
      || ((p.type === "V" || p.type === "I") && p.params.wave && p.params.wave !== "dc"));
  }

  async run() {
    this.stop();
    this.openDock("Running the circuit through time…");
    const res = await this.solver.request("tran", this.store.doc, {});
    if (!res.ok) { this.result = null; this.openDock(res.why || "Couldn't run it."); this.refresh(); return; }
    this.result = res;
    this.stale = false;
    this.cache = null;
    this.doc = structuredClone(this.store.doc);
    this.net0 = compile(this.doc, { when: { t: 0, side: -1 } });
    this.traces = this.traces?.filter((t) => this.available().some((a) => a.key === t)) || this.defaultTraces();
    if (!this.traces.length) this.traces = this.defaultTraces();
    this.k = null;
    this.openDock();
    this.draw();
    this.refresh();
  }

  available() {
    const r = this.result, out = [];
    if (!r) return out;
    r.nodeNames.forEach((name, i) => { if (i > 0) out.push({ key: `v:${i}`, label: `v(${name})`, unit: "V" }); });
    for (const id of Object.keys(r.els)) {
      const el = this.net0.byId.get(id);
      if (!el) continue;
      out.push({ key: `i:${id}`, label: `i(${id})`, unit: "A" });
      if (el.type === "C" || el.type === "L") out.push({ key: `vp:${id}`, label: `v(${id})`, unit: "V" });
    }
    return out;
  }

  defaultTraces() {
    const els = this.net0.elements;
    const out = [];
    for (const el of els) { if (el.type === "C") out.push(`vp:${el.id}`); if (el.type === "L") out.push(`i:${el.id}`); }
    if (!out.length) this.result.nodeNames.forEach((_, i) => { if (i > 0 && out.length < 3) out.push(`v:${i}`); });
    return out.slice(0, 4);
  }

  series(keyName) {
    const r = this.result, [kind, id] = keyName.split(":");
    if (kind === "v") return r.nodes[id];
    if (kind === "i") return r.els[id]?.i;
    if (kind === "vp") return r.els[id]?.v;
    return null;
  }

  openDock(message) {
    const dock = this.dock;
    dock.hidden = false;
    dock.classList.add("tran");
    dock.innerHTML = `<div class="dock-head"><strong class="dock-title">${esc(message || "Over time")}</strong><span class="dock-read"></span>
      <button type="button" class="link" data-tran-close>close</button></div>
      ${this.result && !message ? `<div class="tran-controls">
        <button type="button" class="small" data-tran-play>${this.playing ? "❚❚ Pause" : "▶ Play"}</button>
        <input type="range" class="tran-time" data-tran-scrub min="0" max="${this.result.t.length - 1}" value="${this.k ?? 0}" aria-label="Time">
        <span class="tran-t"></span>
        <select data-tran-speed aria-label="Playback speed">${[0.25, 0.5, 1, 2, 4].map((s) => `<option value="${s}" ${s === this.speed ? "selected" : ""}>${s}×</option>`).join("")}</select>
        <span class="tran-base"></span>
        <button type="button" class="small" data-tran-fft aria-pressed="${!!this.fftOn}" title="The frequencies in each trace (FFT)">Spectrum</button>
        <button type="button" class="link" data-tran-dc>back to DC</button></div>
      <div class="tran-traces">${this.available().map((a) => `<button type="button" class="chip" data-tran-trace="${esc(a.key)}" aria-pressed="${this.traces.includes(a.key)}">${esc(a.label)}</button>`).join("")}</div>` : ""}
      <canvas class="dock-plot"></canvas>`;
    this.plot = new Plot(dock.querySelector("canvas"), dock.querySelector(".dock-read"));
    dock.onclick = (e) => this.onClick(e);
    dock.oninput = (e) => { if (e.target.matches("[data-tran-scrub]")) { this.pause(); this.seek(Number(e.target.value)); } };
    dock.onchange = (e) => { if (e.target.matches("[data-tran-speed]")) { this.speed = Number(e.target.value); this.showBase(); } };
    this.showBase();
  }

  onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-tran-close")) { this.stop(); this.dock.hidden = true; this.dock.classList.remove("tran"); this.k = null; this.refresh(); }
    else if (b.hasAttribute("data-tran-dc")) { this.stop(); this.k = null; this.refresh(); this.draw(); }
    else if (b.hasAttribute("data-tran-play")) (this.playing ? this.pause() : this.play());
    else if (b.hasAttribute("data-tran-fft")) { this.fftOn = !this.fftOn; b.setAttribute("aria-pressed", String(this.fftOn)); this.draw(); }
    else if (b.dataset.tranTrace) {
      const k = b.dataset.tranTrace;
      this.traces = this.traces.includes(k) ? this.traces.filter((x) => x !== k) : [...this.traces, k].slice(-5);
      b.setAttribute("aria-pressed", String(this.traces.includes(k)));
      this.draw();
    }
  }

  draw() {
    const r = this.result;
    if (!r || !this.plot) return;
    if (this.fftOn) { this.drawSpectrum(); return; }
    const avail = new Map(this.available().map((a) => [a.key, a]));
    const units = [...new Set(this.traces.map((t) => avail.get(t)?.unit))];
    const series = this.traces.filter((t) => avail.has(t)).map((t) => {
      const a = avail.get(t);
      return { name: a.label, unit: a.unit, y: this.series(t), axis: units.indexOf(a.unit) > 0 ? 1 : 0 };
    });
    const markers = r.marks.map((m) => ({ x: m.t, label: m.label }));
    if (r.firstOrder) markers.push({ x: r.firstOrder.t0 + r.firstOrder.tau, label: "τ", color: "#a9c48f" });
    if (this.k !== null) markers.push({ x: r.t[this.k], label: `t = ${fmt(r.t[this.k], "s")}`, color: "#efe7d6", low: true });
    this.dock.querySelector(".dock-title").textContent = `Over time: 0 to ${fmt(r.tstop, "s")}${r.firstOrder ? `, τ = ${fmt(r.firstOrder.tau, "s")}` : ""}`;
    this.plot.set({ x: r.t, xLabel: "t", xUnit: "s", series, markers });
  }

  // each trace's spectrum, over whole periods of the steady state when the run has a period
  drawSpectrum() {
    const r = this.result, avail = new Map(this.available().map((a) => [a.key, a]));
    const keys = this.traces.filter((t) => avail.has(t));
    if (!keys.length) return;
    const specs = keys.map((k) => ({ k, s: spectrum(r.t, this.series(k), { period: r.period }) }));
    const f0 = r.period ? 1 / r.period : null, top = specs[0].s.f.at(-1);
    const fmax = Math.min(top, f0 ? 20 * f0 : top / 8);
    const n = specs[0].s.f.findIndex((f) => f > fmax);
    const cut = (arr) => arr.slice(0, n > 0 ? n : arr.length);
    const units = [...new Set(keys.map((k) => avail.get(k).unit))];
    const series = specs.map(({ k, s }) => ({ name: `|${avail.get(k).label}|`, unit: avail.get(k).unit, y: cut(s.amp), axis: units.indexOf(avail.get(k).unit) > 0 ? 1 : 0 }));
    const markers = f0 ? [1, 2, 3, 5].filter((h) => h * f0 <= fmax).map((h) => ({ x: h * f0, label: h === 1 ? `f₀ = ${fmt(f0, "Hz")}` : `${h}f₀`, color: "#7d7567" })) : [];
    const s0 = specs[0].s;
    this.dock.querySelector(".dock-title").textContent = `Spectrum (peak amplitude per frequency) from ${fmt(s0.from, "s")} to ${fmt(s0.to, "s")}, ${s0.window === "Hann" ? "Hann window" : "whole periods"}`;
    this.plot.set({ x: cut(s0.f), xLabel: "f", xUnit: "Hz", series, markers });
  }

  showBase() {
    const el = this.dock.querySelector(".tran-base");
    if (!el || !this.result) return;
    const perSecond = this.result.tstop / PLAY_SECONDS * this.speed;
    el.textContent = `${fmt(perSecond, "s")} of circuit time per second`;
  }

  // ---- playback ----
  seek(k) {
    this.k = Math.max(0, Math.min(this.result.t.length - 1, k));
    const s = this.dock.querySelector("[data-tran-scrub]");
    if (s) s.value = this.k;
    const t = this.dock.querySelector(".tran-t");
    if (t) t.textContent = `t = ${fmt(this.result.t[this.k], "s")}`;
    this.draw();
    this.refresh();
  }

  play() {
    if (!this.result) return;
    this.playing = true;
    if (this.k === null || this.k >= this.result.t.length - 1) this.k = 0;
    const btn = this.dock.querySelector("[data-tran-play]");
    if (btn) btn.textContent = "❚❚ Pause";
    let last = performance.now(), tNow = this.result.t[this.k];
    const step = (now) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      tNow += dt * this.speed * this.result.tstop / PLAY_SECONDS;
      const T = this.result.t;
      let k = this.k;
      while (k < T.length - 1 && T[k + 1] <= tNow) k++;
      this.seek(k);
      if (k >= T.length - 1) { this.pause(); return; }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    const btn = this.dock.querySelector("[data-tran-play]");
    if (btn) btn.textContent = "▶ Play";
  }

  stop() { this.pause(); }

  // the circuit changed: the run no longer describes it
  invalidate() {
    if (!this.result) return;
    this.pause();
    this.k = null;
    this.stale = true;
    const title = this.dock.querySelector(".dock-title");
    if (title && !this.dock.hidden) title.textContent = "The circuit changed: run it again to update";
  }

  // ---- the circuit at the chosen moment, for the 2D and 3D views ----
  // -> {doc, net, sol} or null when not playing back
  moment() {
    if (!this.result || this.k === null) return null;
    if (this.cache?.k === this.k) return this.cache.m;
    const m = this.build(this.k);
    this.cache = { k: this.k, m };
    return m;
  }

  build(k) {
    const r = this.result, t = r.t[k];
    // switches drawn in their position at time t
    const doc = structuredClone(this.doc);
    for (const p of doc.parts) {
      if (p.type !== "SW" && p.type !== "SW2") continue;
      const side = k + 1 < r.t.length && r.t[k + 1] === t ? -1 : +1;
      p.params = { ...p.params, state: switchState(p, defOf(p.type), { t, side }) , at: "" };
    }
    const net = compile(doc);
    // node voltages: each node of this drawing looks up the matching node of the run
    const nodeOfRun = net.nodes.map((nd) => {
      const pin = net.pins.find((p) => net.nodeAt(p.key) === nd.index);
      return pin ? this.net0.nodeAt(pin.key) : -1;
    });
    const at = (x) => (Number.isFinite(x) ? x : null);  // a gap: the run had no value there
    const nodes = net.nodes.map((nd, i) => ({ index: i, name: nd.name, label: nd.label, v: nodeOfRun[i] >= 0 ? at(r.nodes[nodeOfRun[i]][k]) : null, vx: null }));
    const els = {};
    for (const el of net.elements) {
      const s = r.els[el.id];
      if (!s || !Number.isFinite(s.i[k])) continue;
      const i = s.i[k], v = s.v[k], p = s.p[k];
      const pins = el.type === "OA" ? [{ i: 0 }, { i: 0 }, { i: -i }] : [{ i }, { i: -i }];
      els[el.id] = { type: el.type, nodes: el.nodes, i, v, p, pins: pins.map((q, j) => ({ ...q, node: el.nodes[j] })), ix: null, vx: null, px: null };
      if (el.def.meter) els[el.id].reading = el.def.meter === "i" ? { kind: "i", value: i, exact: null } : { kind: "v", value: v, exact: null };
    }
    const sol = { ok: true, exact: false, errors: [], warnings: [], nodes, els, assumptions: [], idle: [], time: t, ...this.scales() };
    sol.flows = wireFlows(net, (el, j) => els[el.id]?.pins[j]?.i ?? 0);
    return { doc, net, sol };
  }

  // the run's largest voltage, current and power, so playback keeps one scale throughout
  scales() {
    const r = this.result;
    if (!r.scales) {
      const big = (xs) => xs.reduce((m, x) => (Number.isFinite(x) ? Math.max(m, Math.abs(x)) : m), 0);
      const vbig = Math.max(0, ...Object.values(r.nodes).map(big));
      const ibig = Math.max(0, ...Object.values(r.els).map((s) => big(s.i)));
      const pbig = Math.max(0, ...Object.values(r.els).map((s) => big(s.p)));
      r.scales = { vmax: niceMax(vbig || 1), imax: ibig, pmax: pbig || 1e-15 };
    }
    return r.scales;
  }

  // the first-order summary, the way ECE 201 writes it
  cardHTML() {
    const r = this.result;
    if (!r) return "";
    const f = r.firstOrder;
    let body = "";
    if (f) {
      const unit = f.q === "v" ? "V" : "A", name = `${f.q}_{${sym(f.id)}}`;
      const show = (x, xs) => (xs ? fmtExact(fromString(xs), unit).main : fmt(x, unit));
      const tauFor = f.kind === "C" ? `R_{th} C = ${texNum(f.R, "Ω")} \\times ${texNum(this.net0.byId.get(f.id)?.params.C.value, "F")}` : `L / R_{th} = ${texNum(this.net0.byId.get(f.id)?.params.L.value, "H")} / ${texNum(f.R, "Ω")}`;
      const expo = f.t0 > 0 ? `e^{-(t - ${texNum(f.t0, "s")})/\\tau}` : `e^{-t/\\tau}`;
      body = `<p class="hint">One ${f.kind === "C" ? "capacitor" : "inductor"} after the switching, so it's first order:</p>
        <div class="readout"><span class="k">Start (t = ${esc(fmt(f.t0, "s"))}⁺)</span><span class="v">${esc(show(f.x0, f.x0x))}</span>
        <span class="k">Final (t → ∞)</span><span class="v">${esc(show(f.xinf, f.xinfx))}</span>
        <span class="k">Time constant</span><span class="v">${esc(fmt(f.tau, "s"))}</span></div>
        <div class="eqs-inline">$$\\tau = ${tauFor} = ${texNum(f.tau, "s")}$$
        $$${name}(t) = ${texNum(f.xinf, unit)} + \\left(${texNum(f.x0, unit)} - ${texNum(f.xinf, unit)}\\right) ${expo}$$</div>`;
    } else {
      const m = r.modes;
      body = m?.taus.length === 1 && !m.periods.length
        ? `<p class="hint">More than one capacitor or inductor, but they act together: every quantity settles with one time constant, τ = ${esc(fmt(m.taus[0], "s"))}. The scope shows the curves.</p>`
        : m?.taus.length > 1
          ? `<p class="hint">More than one capacitor or inductor, so the response mixes ${m.taus.length} exponentials (τ = ${m.taus.map((t) => esc(fmt(t, "s"))).join(", ")}); the scope shows the full curves.</p>`
          : `<p class="hint">${r.taus.length > 1 ? "More than one capacitor or inductor, so the response isn't a single exponential; the scope shows the full curves." : "The scope shows each quantity over time."}</p>`;
    }
    const warn = r.warnings.length ? `<ul class="err-list">${r.warnings.map((w) => `<li class="warn">${esc(w)}</li>`).join("")}</ul>` : "";
    return `<section class="study-card" data-card="tran"><div class="card-title"><strong>Over time</strong><button type="button" class="link" data-study-close>close</button></div>${body}${warn}
      <p class="hint">${r.method === "TR-BDF2" ? `Stepped with TR-BDF2${r.fixed ? ` every ${esc(fmt(r.h, "s"))}` : `, with the step (${esc(fmt(r.hmin, "s"))} to ${esc(fmt(r.hmaxUsed, "s"))}) set by its own error estimate`}, which can't ring after a switch.` : `Stepped with the trapezoidal rule every ${esc(fmt(r.h, "s"))} (backward Euler right after each switch).`}${exactnessText(r)}</p></section>`;
  }
}

// which ends of the run were solved in exact fractions (a sine start or a periodic end isn't)
function exactnessText(r) {
  const exact = (sol) => !!sol && Object.values(sol.els).some((e) => e.vx || e.ix);
  const start = exact(r.post), end = exact(r.final);
  return start && end ? " Start and final values are exact." : start ? " Start values are exact." : end ? " Final values are exact." : "";
}
