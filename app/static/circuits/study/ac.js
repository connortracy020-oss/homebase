// AC on the bench: the sinusoidal steady state of a circuit with sine sources. Pills and tables
// show phasors (peak or RMS, always labelled); the 2D and 3D views show the circuit at one
// instant of its cycle, and ▶ runs the cycle in slow motion so the voltages swing. The dock
// holds the phasor diagram beside the waveforms its arrows project.

import { compile, switchState } from "../core/compile.js";
import { defOf } from "../elements/index.js";
import { solveAC, acFrequency, acThevenin, STEADY } from "../solver/ac.js";
import { phasorOf } from "../solver/cfield.js";
import { sinePeak } from "../elements/common.js";
import { wireFlows } from "../solver/flows.js";
import { polarText, rectText, scaleOf, scaleWord, angleText, omegaText } from "../views/phasorfmt.js";
import { BodeDock } from "../views/bode.js";
import { HsDock } from "../views/hs.js";
import { phasorSVG } from "../views/phasor.js";
import { Plot, COLORS } from "../views/plot.js";
import { fmt, sig } from "../core/units.js";
import { esc } from "../editor/symbols.js";
import { voltageColor, niceMax } from "../views/palette.js";

const CYCLE_SECONDS = 4;  // one cycle plays in this many seconds at 1×

// the circuit with every switch where it ends up: the steady state is long after any switching
export function steadyDoc(doc) {
  const d = structuredClone(doc);
  for (const p of d.parts) {
    if (p.type !== "SW" && p.type !== "SW2") continue;
    p.params = { ...p.params, state: switchState(p, defOf(p.type), STEADY), at: "" };
  }
  return d;
}

export class ACView {
  constructor({ store, dock, refresh, toast, prefs, savePrefs, solver }) {
    Object.assign(this, { store, dock, refresh, toast, prefs, savePrefs, solver });
    this.choice = null;     // DC or AC, once chosen; until then AC whenever there's a sine source
    this.res = null; this.t = 0; this.playing = false; this.speed = 1;
    this.preview = null;    // {omega, input}: the Bode cursor's frequency, shown until dismissed
    this.card = null;       // an AC Thevenin card: "port:a,b" or "thev:R1"
    this.picked = null;     // quantities in the dock
  }

  static relevant(doc) {
    return doc.parts.some((p) => ((p.type === "V" || p.type === "I") && p.params.wave === "sine") || p.type === "V3Y" || p.type === "V3D");
  }

  get on() { return this.choice ?? ACView.relevant(this.store.doc); }
  // peak or RMS: your choice once you've made one, else RMS when a source is given in RMS
  get mode() {
    if (this.prefs.acScale === "rms" || this.prefs.acScale === "peak") return this.prefs.acScale;
    return this.store.doc.parts.some((p) => (p.params?.wave === "sine" || p.type === "V3Y" || p.type === "V3D") && (p.params.scale ?? (p.type.startsWith("V3") ? "rms" : "peak")) === "rms") ? "rms" : "peak";
  }
  get scale() { return scaleOf(this.mode); }

  choose(mode) {
    this.choice = mode === "ac";
    if (!this.on) { this.pause(); this.preview = null; }
    this.update();
    this.refresh();
  }

  // ---- solve ----
  update() {
    this.cache = null;
    if (!this.on) { this.res = null; this.refreshDock(); return; }
    const doc = steadyDoc(this.store.doc), net = compile(doc), f = acFrequency(net);
    Object.assign(this, { doc, net, freq: f });
    if (this.preview) {
      this.omega = this.preview.omega;
      this.res = solveAC(net, { omega: this.omega, omegaExact: null, drive: previewDrive(this.preview.input) });
    } else if (f) {
      this.omega = f.omega;
      this.res = solveAC(net, { omega: f.omega, omegaExact: f.exact });
    } else {
      this.omega = null;
      this.res = { ok: false, mode: "ac", errors: [{ code: "NO_AC", parts: [], message: "There's no sine source yet: set a source's waveform to Sine (AC) to see the AC steady state." }], warnings: [] };
    }
    this.T = this.omega ? (2 * Math.PI) / this.omega : null;
    if (this.T && this.t >= this.T) this.t = 0;
    this.refreshDock();
  }

  // the circuit was edited: solve again, and sweep the Bode plot again if it's open
  docChanged() {
    this.update();
    this.bode?.stale();
    if (this.hs?.open) { const doc = steadyDoc(this.store.doc); this.hs.stale(compile(doc), doc); }
  }

  // H(s), poles and zeros (from AC or DC: it only needs a source and an output)
  openHs() {
    if (!this.hs) this.hs = new HsDock({ dock: this.dock, solver: this.solver, acv: this });
    this.pause();
    this.dockOpen = false;
    const doc = steadyDoc(this.store.doc);
    this.hs.show(compile(doc), doc);
  }

  // the Bode cursor's frequency (or null to go back to the sources' own)
  setPreview(p) {
    this.preview = p;
    this.update();
    this.refresh();
  }

  openBode() {
    if (!this.bode) this.bode = new BodeDock({ dock: this.dock, solver: this.solver, acv: this });
    this.pause();
    this.dockOpen = false;
    this.bode.show();
  }

  errorParts() {
    const s = new Set();
    if (this.on && this.res && !this.res.ok) for (const e of this.res.errors) for (const p of e.parts || []) s.add(p);
    return s;
  }

  // ---- the circuit at this instant, for the 2D and 3D views ----
  moment() {
    if (!this.on || !this.res?.ok) return null;
    if (this.cache?.t === this.t) return this.cache.m;
    const m = { doc: this.doc, net: this.net, sol: this.instant(this.t) };
    this.cache = { t: this.t, m };
    return m;
  }

  instant(t) {
    const r = this.res, c = Math.cos(this.omega * t), s = Math.sin(this.omega * t);
    const at = (z) => (z ? z.re * c - z.im * s : null);
    const nodes = r.nodes.map((n) => ({ index: n.index, name: n.name, label: n.label, v: n.v ? at(n.v) : null, vx: null }));
    const els = {};
    let vbig = 0, pbig = 0;
    for (const n of r.nodes) if (n.v) vbig = Math.max(vbig, Math.hypot(n.v.re, n.v.im));
    for (const [id, e] of Object.entries(r.els)) {
      const pins = e.pins.map((p) => ({ node: p.node, i: at(p.i) }));
      const p = pins.reduce((sum, q) => sum + (q.node >= 0 && nodes[q.node]?.v != null ? nodes[q.node].v * q.i : 0), 0);
      const v = at(e.v), i = at(e.i);
      els[id] = { type: e.type, nodes: e.nodes, v, i, p, pins, vx: null, ix: null, px: null };
      if (e.reading) els[id].reading = { kind: e.reading.kind, value: e.reading.kind === "i" ? i : v, exact: null };
      pbig = Math.max(pbig, e.s.re + Math.hypot(e.s.re, e.s.im));  // the most p(t) reaches in a cycle
    }
    const sol = {
      ok: true, exact: false, errors: [], warnings: r.warnings, nodes, els, idle: r.idle, time: t,
      assumptions: ["Steady state: the sources have run long enough that every transient has died away.", "Wires are ideal (0 Ω)."],
      ac: { res: r, scale: this.scale, mode: this.mode, omega: this.omega }, vmax: niceMax(vbig || 1), pmax: pbig || 1e-15,
    };
    sol.flows = wireFlows(this.net, (el, j) => els[el.id]?.pins[j]?.i ?? 0);
    return sol;
  }

  // ---- status line and side panel ----
  statusHTML() {
    const r = this.res;
    if (!r) return "";
    if (!r.ok) return `<span class="bad">● AC: can't solve yet</span><span class="msg">${esc(r.errors[0]?.message || "")}</span>`;
    return `<span class="ok">● AC steady state</span><span class="msg">ω = ${esc(omegaText(this.omega))} · ${r.exact ? "exact" : "decimal"}${this.preview ? " · from the Bode cursor" : ""}</span>`;
  }

  modeSwitchHTML() {
    if (!ACView.relevant(this.store.doc) && this.choice === null) return "";
    return `<div class="seg small mode-seg" role="group" aria-label="Analysis"><button type="button" data-ac-mode="dc" aria-pressed="${!this.on}">DC</button><button type="button" data-ac-mode="ac" aria-pressed="${this.on}">AC</button></div>`;
  }

  panelHTML({ hidden, predicting, ports, tranButton }) {
    const r = this.res;
    const head = `<div class="ac-head"><span class="eyebrow">AC steady state</span>
      <div class="seg small" role="group" aria-label="Amplitudes"><button type="button" data-ac-scale="peak" aria-pressed="${this.mode === "peak"}">Peak</button><button type="button" data-ac-scale="rms" aria-pressed="${this.mode === "rms"}">RMS</button></div>
      ${this.omega ? `<span class="ac-freq">ω = ${esc(omegaText(this.omega))} · f = ${esc(fmt(this.omega / (2 * Math.PI), "Hz"))} · T = ${esc(fmt(this.T, "s"))}</span>` : ""}</div>`;
    const preview = this.preview ? `<div class="ac-preview"><span>Showing ω = ${esc(omegaText(this.omega))} from the Bode cursor, with ${esc(this.preview.input)} as the input.</span>
      <button type="button" class="small" data-ac-preview="apply">Set ${esc(this.preview.input)} to this frequency</button><button type="button" class="link" data-ac-preview="off">back</button></div>` : "";
    const tools = `<div class="tool-row">
      <button type="button" class="small" data-ac-dock="phasors">Phasors and waveforms</button>
      <button type="button" class="small" data-ac-dock="bode">Bode plot</button>
      <button type="button" class="small" data-ac-dock="hs">H(s) and poles</button>
      ${ports.map(([a, b]) => `<button type="button" class="small" data-ac-card="port:${esc(a)},${esc(b)}" aria-pressed="${this.card === `port:${a},${b}`}">Thevenin at ${esc(a)}–${esc(b)}</button>`).join("")}
      ${tranButton}</div>`;
    if (!r?.ok) return `<div class="ac-card">${head}${preview}<ul class="err-list"><li>${esc(r?.errors?.[0]?.message || "")}</li></ul>${tools}</div>`;
    const card = !this.card ? "" : predicting ? `<p class="hint">Turn off Predict first to see the worked answers.</p>` : this.cardHTML();
    return `<div class="ac-card">${head}${preview}${this.notesHTML()}${tools}${card}${this.nodesHTML(hidden)}${this.partsHTML(hidden)}${this.powerHTML(hidden)}</div>`;
  }

  notesHTML() {
    const notes = [], f = this.freq;
    if (f?.mixed && !this.preview) {
      const off = f.sources.filter((s) => Math.abs(s.omega - this.omega) > 1e-9 * this.omega).map((s) => `${s.el.id} (${omegaText(s.omega)})`);
      notes.push(`${off.join(", ")} ${off.length > 1 ? "run" : "runs"} at another frequency, so ${off.length > 1 ? "they're" : "it's"} off in this solution: phasors work at one frequency at a time. Add the solutions in time (superposition) for the whole response.`);
    }
    const dcParts = this.net.elements.filter((el) => el.def.independent && ((el.params.wave?.text || "dc") === "dc" ? Math.abs(el.params[el.type]?.value || 0) > 0 : el.params.wave?.text === "sine" && Math.abs(el.params[`${el.type}dc`]?.value || 0) > 0));
    if (dcParts.length) notes.push(`DC values (${dcParts.map((el) => el.id).join(", ")}) only shift the average and aren't in a phasor solution. Switch to DC to see them.`);
    for (const w of this.res.warnings || []) if (w.code !== "OPEN_PIN") notes.push(w.message);
    return notes.length ? `<ul class="err-list">${notes.map((n) => `<li class="warn">${esc(n)}</li>`).join("")}</ul>` : "";
  }

  nodesHTML(hidden) {
    const r = this.res, vbig = Math.max(1e-9, ...r.nodes.map((n) => (n.v ? Math.hypot(n.v.re, n.v.im) : 0)));
    const rows = r.nodes.filter((n) => n.index > 0 && n.v).map((n) => {
      const hide = hidden({ kind: "v", node: n.index });
      return `<tr data-node="${n.index}"><td><i style="background:${hide ? "var(--line)" : voltageColor(Math.hypot(n.v.re, n.v.im), vbig)}"></i></td><td>${esc(n.label || n.name)}</td>
        ${hide ? `<td class="v" colspan="2"><button type="button" class="chip ask" data-ask-node="${n.index}">? predict</button></td>`
          : `<td class="v">${esc(polarText(n.v, "V", this.scale))}</td><td class="v rect">${esc(rectText(n.v, n.vx, "V", this.scale))}</td>`}</tr>`;
    }).join("");
    return `<div><h3>Node voltages <small>phasors, ${scaleWord(this.mode)}, from ground</small></h3><table class="node-table ac-table"><tbody>${rows}</tbody></table></div>`;
  }

  partsHTML(hidden) {
    const r = this.res, rows = [];
    for (const el of this.net.elements) {
      const e = r.els[el.id];
      if (!e) continue;
      const hv = hidden({ kind: "vp", part: el.id }), hi = hidden({ kind: "i", part: el.id });
      if (el.def.threePhase) {
        for (const [label, v, i] of phases(this.res, el, e)) {
          rows.push(`<tr><td>${esc(el.id)} <small>${label}</small></td><td class="v">${hv ? "?" : esc(polarText(v, "V", this.scale))}</td><td class="v">${hi ? "?" : esc(polarText(i, "A", this.scale))}</td><td></td></tr>`);
        }
        continue;
      }
      if (el.type === "K" || el.type === "TR") {
        // a transformer's two windings, each with its own voltage and current (into its dot)
        for (const [label, v, i] of windings(this.res, e)) {
          rows.push(`<tr><td>${esc(el.id)} <small>${label}</small></td><td class="v">${hv ? "?" : esc(polarText(v, "V", this.scale))}</td><td class="v">${hi ? "?" : esc(polarText(i, "A", this.scale))}</td><td></td></tr>`);
        }
        continue;
      }
      const z = impedance(el, this.omega);
      rows.push(`<tr><td>${esc(el.id)}</td><td class="v">${hv ? "?" : esc(polarText(e.v, "V", this.scale))}</td><td class="v">${hi ? "?" : esc(polarText(currentOf(el, e), "A", this.scale))}</td><td class="v">${z ? esc(rectText(z, null, "Ω")) : ""}</td></tr>`);
    }
    return `<div><h3>Parts <small>V: pin a − pin b · I: a → b, or what a source supplies · Z = V/I</small></h3><div class="table-scroll"><table class="ac-table"><thead><tr><th></th><th>V</th><th>I</th><th>Z</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></div>`;
  }

  powerHTML(hidden) {
    if (hidden({ kind: "p" })) return "";
    const r = this.res, rows = [];
    let P = 0, Qr = 0, scaleP = 0;
    for (const [id, e] of Object.entries(r.els)) {
      const s = e.s;
      if (Math.hypot(s.re, s.im) < 1e-15) continue;
      P += s.re; Qr += s.im; scaleP += Math.hypot(s.re, s.im);
      const el = this.net.byId.get(id);
      const pf = el?.def.independent && s.re < 0 ? powerFactor(s) : "";
      rows.push(`<tr><td>${esc(id)}</td><td class="v">${esc(fmt(s.re, "W"))}</td><td class="v">${esc(fmt(s.im, "VAR"))}</td><td class="v small">${esc(pf)}</td></tr>`);
    }
    const ok = (x) => (Math.abs(x) <= 1e-9 * (1 + scaleP) ? "0 ✓" : fmt(x, ""));
    return `<div><h3>Power <small>average P and reactive Q each part absorbs</small></h3><table class="pow-table ac-table"><thead><tr><th></th><th>P</th><th>Q</th><th></th></tr></thead><tbody>${rows.join("")}
      <tr class="sum"><td>Total</td><td class="v">${ok(P)}</td><td class="v">${ok(Qr)}</td><td></td></tr></tbody></table>
      ${this.sourcePowerHTML()}
      <p class="hint">P = Re(S) and Q = Im(S) with S = ½ V I* (peak values), which is V<sub>rms</sub> I<sub>rms</sub>*. A negative P means the part delivers power. Capacitors absorb negative Q, inductors positive Q.</p></div>`;
  }

  // what each voltage source delivers, its power factor, and the capacitor that would correct it
  sourcePowerHTML() {
    const out = [];
    for (const el of this.net.elements) {
      const e = this.res.els[el.id];
      if (el.def.threePhase && e) { out.push(this.threePhaseHTML(el, e)); continue; }
      if (el.type !== "V" || !e || !(Math.hypot(e.s.re, e.s.im) > 1e-15)) continue;
      const S = { re: -e.s.re, im: -e.s.im }, mag = Math.hypot(S.re, S.im);
      let line = `${esc(el.id)} delivers S = ${esc(fmt(S.re, "W"))} ${S.im < 0 ? "−" : "+"} j${esc(fmt(Math.abs(S.im), "VAR"))}, |S| = ${esc(fmt(mag, "VA"))}, ${esc(powerFactor(e.s))}`;
      line += S.im > 0 ? " (the current lags the voltage)" : S.im < 0 ? " (the current leads the voltage)" : "";
      const V = Math.hypot(e.v.re, e.v.im);
      if (S.im > 1e-12 * mag && V > 0 && S.re > 0) {
        // a capacitor across the source supplying Q itself: Q_C = ω C V_rms² = ω C |V|²/2
        out.push(`<p class="hint">${line}. A capacitor of ${esc(fmt((2 * S.im) / (this.omega * V * V), "F"))} straight across ${esc(el.id)} would supply that reactive power itself and bring the power factor to 1.</p>`);
      } else out.push(`<p class="hint">${line}.</p>`);
    }
    return out.join("");
  }

  // a three-phase source: what it delivers, its line voltages and currents, and the balance
  threePhaseHTML(el, e) {
    const v = (k) => this.res.nodes[e.nodes[k]]?.v || { re: 0, im: 0 };
    const m = (z) => Math.hypot(z.re, z.im) * this.scale, sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
    const VL = [sub(v(0), v(1)), sub(v(1), v(2)), sub(v(2), v(0))].map(m), IL = [0, 1, 2].map((k) => m(e.pins[k].i));
    const S = { re: -e.s.re, im: -e.s.im }, mag = Math.hypot(S.re, S.im);
    const balanced = Math.max(...IL) - Math.min(...IL) <= 0.005 * Math.max(...IL, 1e-15);
    const fmtList = (xs, u) => xs.map((x) => fmt(x, u)).join(", ");
    let text = `${esc(el.id)} delivers P = ${esc(fmt(S.re, "W"))} and Q = ${esc(fmt(S.im, "VAR"))} in all (|S| = ${esc(fmt(mag, "VA"))}${mag ? `, ${esc(powerFactor(e.s))}` : ""}).
      Line voltages ${esc(fmtList(VL, "V"))}; line currents ${esc(fmtList(IL, "A"))} (${scaleWord(this.mode)}).`;
    if (el.type === "V3Y") {
      const In = m(e.pins[3].i);
      text += balanced ? " The load is balanced, so the neutral carries no current." : ` Unbalanced: the neutral carries ${esc(fmt(In, "A"))}${In < 1e-12 ? " (there's no neutral wire, so the load's star point shifts instead)" : ""}.`;
    } else if (!balanced) text += " The line currents differ: the load is unbalanced.";
    return `<p class="hint">${text}</p>`;
  }

  // the AC Thevenin card for a port (two labelled terminals) or a part
  cardHTML() {
    const [kind, arg] = [this.card.slice(0, this.card.indexOf(":")), this.card.slice(this.card.indexOf(":") + 1)];
    const opts = this.preview ? { omega: this.omega, omegaExact: null, drive: previewDrive(this.preview.input) } : { omega: this.omega, omegaExact: this.freq?.exact };
    let t, title;
    if (kind === "port") {
      const [a, b] = arg.split(",");
      title = `Thevenin at ${esc(a)}–${esc(b)} (AC)`;
      t = acThevenin(this.net, { nodes: [this.net.nodeByName.get(a), this.net.nodeByName.get(b)] }, opts);
    } else {
      title = `Thevenin seen by ${esc(arg)} (AC)`;
      t = acThevenin(this.net, { part: arg }, opts);
    }
    const close = `<button type="button" class="link" data-ac-card="">close</button>`;
    if (!t.ok) return `<section class="study-card"><div class="card-title"><strong>${title}</strong>${close}</div><p class="hint">${esc(t.why)}</p></section>`;
    const zText = t.zth ? `${rectText(t.zth, null, "Ω")} <small>${esc(polarText(t.zth, "Ω"))}${esc(likeText(t.zth, this.omega))}</small>` : t.infinite ? "∞" : "—";
    const power = t.maxPower ? `<p class="hint">Maximum average power goes to a load Z<sub>L</sub> = Z<sub>th</sub>* = ${esc(rectText(t.maxPower.zl, null, "Ω"))}${esc(likeText(t.maxPower.zl, this.omega))}: P = |V<sub>th</sub>|²/(8R<sub>th</sub>) = ${esc(fmt(t.maxPower.p, "W"))}.</p>` : "";
    return `<section class="study-card"><div class="card-title"><strong>${title}</strong>${close}</div>
      <div class="readout"><span class="k">V<sub>th</sub></span><span class="v">${esc(polarText(t.voc, "V", this.scale))} <small>${esc(rectText(t.voc, null, "V", this.scale))}</small></span>
      <span class="k">Z<sub>th</sub></span><span class="v">${zText}</span>
      <span class="k">I<sub>N</sub></span><span class="v">${t.isc ? esc(polarText(t.isc, "A", this.scale)) : "—"}</span></div>
      <p class="hint">Found like DC, with phasors: the open-circuit voltage, then every independent source off and a 1∠0° A test current for Z<sub>th</sub>, then the short-circuit current.</p>${power}</section>`;
  }

  // ---- a part's AC values, for the inspector ----
  solvedHTML(part, hidden) {
    const e = this.res?.ok && this.res.els[part.id];
    if (!e) return "";
    const el = this.net.byId.get(part.id), z = el && impedance(el, this.omega);
    const hv = hidden({ kind: "vp", part: part.id }), hi = hidden({ kind: "i", part: part.id });
    return `<div class="solved ac-solved"><h3>AC <small>${scaleWord(this.mode)}</small></h3><div class="readout">
      <span class="k">V</span><span class="v">${hv ? "?" : `${esc(polarText(e.v, "V", this.scale))} <small>${esc(rectText(e.v, e.vx, "V", this.scale))}</small>`}</span>
      <span class="k">I</span><span class="v">${hi ? "?" : `${esc(polarText(currentOf(el, e), "A", this.scale))} <small>${esc(rectText(currentOf(el, e), el && SOURCE_TYPES.includes(el.type) ? null : e.ix, "A", this.scale))}</small>`}</span>
      ${z ? `<span class="k">Z</span><span class="v">${esc(rectText(z, null, "Ω"))} <small>${esc(polarText(z, "Ω"))}</small></span>` : ""}
      ${hidden({ kind: "p" }) ? "" : `<span class="k">S</span><span class="v">${esc(fmt(e.s.re, "W"))} ${e.s.im < 0 ? "−" : "+"} j${esc(fmt(Math.abs(e.s.im), "VAR"))}</span>`}</div></div>`;
  }

  // Thevenin as the selected part sees it, in AC (the card opens right under the button)
  partToolsHTML(part, predicting) {
    const def = defOf(part.type);
    if (def.topological || def.pins.length !== 2 || def.meter) return "";
    const key = `thev:${part.id}`, open = this.card === key;
    return `<div class="tool-row"><button type="button" class="small" data-ac-card="${esc(key)}" aria-pressed="${open}">Thevenin seen by ${esc(part.id)} (AC)</button></div>`
      + (open ? (predicting ? `<p class="hint">Turn off Predict first to see the worked answers.</p>` : this.cardHTML()) : "");
  }

  tipHTML(part, hidden) {
    const e = this.res?.els[part.id];
    if (!e) return `<strong>${esc(part.id)}</strong>`;
    const hv = hidden({ kind: "vp", part: part.id }), hi = hidden({ kind: "i", part: part.id });
    const el = this.net.byId.get(part.id);
    return `<strong>${esc(part.id)}</strong> · V ${hv ? "?" : esc(polarText(e.v, "V", this.scale))} · I ${hi ? "?" : esc(polarText(currentOf(el, e), "A", this.scale))} <span class="muted">(${scaleWord(this.mode)})</span>`;
  }

  // phasor KCL at a node: the currents in add to zero, as arrows do
  kclHTML(node, hidden) {
    if (!this.res?.ok) return "";
    const rows = [];
    for (const el of this.net.elements) {
      el.nodes.forEach((n, j) => {
        if (n !== node) return;
        const p = this.res.els[el.id].pins[j].i, into = { re: -p.re, im: -p.im };
        if (Math.hypot(into.re, into.im) > 1e-15) rows.push([el.id, into]);
      });
    }
    if (hidden({ kind: "v", node })) return "";
    const nm = this.net.nodes[node]?.label || this.net.nodes[node]?.name;
    return `<div class="kcl"><h3>KCL at ${esc(nm)} <small>phasor currents into the node</small></h3><table class="ac-table"><tbody>${rows.map(([id, z]) => `<tr><td>${esc(id)}</td><td class="v">${esc(polarText(z, "A", this.scale))}</td><td class="v rect">${esc(rectText(z, null, "A", this.scale))}</td></tr>`).join("")}
      <tr class="sum"><td>Sum</td><td class="v">0 ✓</td><td></td></tr></tbody></table><p class="hint">Complex currents add like arrows, head to tail, and close up: that's KCL with phasors.</p></div>`;
  }

  // ---- the dock: phasor diagram + waveforms, with a time cursor ----
  openDock() {
    const dock = this.dock;
    this.dockOpen = true;
    dock.hidden = false;
    dock.classList.remove("tran", "bode");
    dock.classList.add("ac");
    this.picked = this.picked?.filter((k) => this.available().some((a) => a.key === k)) || null;
    if (!this.picked?.length) this.picked = this.defaults();
    dock.innerHTML = `<div class="dock-head"><strong class="dock-title">Phasors and waveforms</strong><span class="dock-read"></span><button type="button" class="link" data-ac-close>close</button></div>
      <div class="tran-controls"><button type="button" class="small" data-ac-play>${this.playing ? "❚❚ Pause" : "▶ Play"}</button>
        <input type="range" class="tran-time" data-ac-scrub min="0" max="1000" value="0" aria-label="Time in the cycle">
        <span class="tran-t ac-t"></span>
        <select data-ac-speed aria-label="Playback speed">${[0.25, 0.5, 1, 2].map((s) => `<option value="${s}" ${s === this.speed ? "selected" : ""}>${s}×</option>`).join("")}</select>
        <span class="tran-base"></span></div>
      <div class="tran-traces">${this.available().map((a) => `<button type="button" class="chip" data-ac-trace="${esc(a.key)}" aria-pressed="${this.picked.includes(a.key)}">${esc(a.label)}</button>`).join("")}</div>
      <div class="ac-dock-body"><div class="ac-diagram"></div><canvas class="dock-plot"></canvas></div>`;
    this.plot = new Plot(dock.querySelector("canvas"), dock.querySelector(".dock-read"));
    this.plot.onPick = (x) => { this.pause(); this.seek(x); };
    dock.onclick = (e) => this.onDockClick(e);
    dock.oninput = (e) => { if (e.target.matches("[data-ac-scrub]") && this.T) { this.pause(); this.seek((Number(e.target.value) / 1000) * this.T); } };
    dock.onchange = (e) => { if (e.target.matches("[data-ac-speed]")) { this.speed = Number(e.target.value); this.drawDock(); } };
    this.drawDock();
  }

  closeDock() {
    this.pause();
    this.dockOpen = false;
    this.dock.hidden = true;
    this.dock.classList.remove("ac");
  }

  refreshDock() {
    if (!this.dockOpen || this.dock.hidden || !this.dock.classList.contains("ac")) return;
    if (!this.on || !this.res?.ok) { this.closeDock(); return; }
    this.drawDock();
  }

  onDockClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-ac-close")) { this.closeDock(); this.refresh(); }
    else if (b.hasAttribute("data-ac-play")) (this.playing ? this.pause() : this.play());
    else if (b.dataset.acTrace) {
      const k = b.dataset.acTrace;
      this.picked = this.picked.includes(k) ? this.picked.filter((x) => x !== k) : [...this.picked, k].slice(-5);
      b.setAttribute("aria-pressed", String(this.picked.includes(k)));
      this.drawDock();
    }
  }

  available() {
    const out = [];
    if (!this.res?.ok) return out;
    for (const n of this.res.nodes) if (n.index > 0 && n.v) out.push({ key: `v:${n.index}`, label: `v(${n.label || n.name})`, unit: "V" });
    for (const el of this.net.elements) {
      if (!this.res.els[el.id] || el.type === "VM") continue;
      if (["R", "C", "L"].includes(el.type)) out.push({ key: `vp:${el.id}`, label: `v(${el.id})`, unit: "V" });
      out.push({ key: `i:${el.id}`, label: `i(${el.id})`, unit: "A" });
    }
    return out;
  }

  defaults() {
    const out = [];
    const src = this.net.elements.find((el) => el.def.independent && el.params.wave?.text === "sine");
    if (src?.type === "V" && src.nodes[0] > 0) out.push(`v:${src.nodes[0]}`);
    const labelled = this.res.nodes.filter((n) => n.index > 0 && n.label && n.v).map((n) => `v:${n.index}`);
    out.push(...labelled.slice(0, 2));
    if (out.length < 2) for (const n of [...this.res.nodes].reverse()) if (n.index > 0 && n.v && !out.includes(`v:${n.index}`) && out.length < 2) out.push(`v:${n.index}`);
    if (src) out.push(`i:${src.id}`);
    return [...new Set(out)].filter((k) => this.available().some((a) => a.key === k)).slice(0, 4);
  }

  phasorFor(keyName) {
    const [kind, id] = keyName.split(":");
    if (kind === "v") return this.res.nodes[Number(id)]?.v;
    const e = this.res.els[id];
    return kind === "i" ? e && currentOf(this.net.byId.get(id), e) : e?.v;
  }

  drawDock() {
    if (!this.plot || !this.res?.ok || !this.T) return;
    const avail = new Map(this.available().map((a) => [a.key, a]));
    const items = this.picked.filter((k) => avail.has(k)).map((k, i) => ({ name: avail.get(k).label, unit: avail.get(k).unit, z: this.phasorFor(k), color: COLORS[i % COLORS.length] }));
    this.dock.querySelector(".ac-diagram").innerHTML = phasorSVG(items, { omega: this.omega, t: this.t, scale: this.scale });
    const N = 241, xs = Array.from({ length: N }, (_, k) => (2 * this.T * k) / (N - 1));
    const units = [...new Set(items.map((it) => it.unit))];
    const series = items.map((it) => ({ name: it.name, unit: it.unit, color: it.color, axis: units.indexOf(it.unit) > 0 ? 1 : 0,
      y: xs.map((t) => it.z.re * Math.cos(this.omega * t) - it.z.im * Math.sin(this.omega * t)) }));
    this.plot.set({ x: xs, xLabel: "t", xUnit: "s", series, markers: [{ x: this.t, label: `t = ${fmt(this.t, "s")}`, color: "#efe7d6", low: true }, { x: this.T, label: "T", color: "#7d7567" }] });
    const deg = ((this.t / this.T) * 360) % 360;
    const lab = this.dock.querySelector(".ac-t");
    if (lab) lab.textContent = `t = ${fmt(this.t, "s")} (${Math.round(deg)}° into the cycle)`;
    const scrub = this.dock.querySelector("[data-ac-scrub]");
    if (scrub) scrub.value = String(Math.round((this.t / this.T) * 1000) % 1001);
    const base = this.dock.querySelector(".tran-base");
    if (base) base.textContent = `one cycle (T = ${fmt(this.T, "s")}) every ${fmt(CYCLE_SECONDS / this.speed, "s")}`;
    this.dock.querySelector(".dock-title").textContent = `Phasors and waveforms at ω = ${omegaText(this.omega)}`;
    const read = this.dock.querySelector(".dock-read");
    if (read && this.plot.cursor === null) read.innerHTML = items.map((it) => `<span style="color:${it.color}">${esc(it.name)} = ${esc(polarText(it.z, it.unit, this.scale))}</span>`).join(" ") + ` <span class="muted">(${scaleWord(this.mode)})</span>`;
  }

  // ---- playback ----
  seek(t) {
    if (!this.T) return;
    this.t = ((t % this.T) + this.T) % this.T;
    this.cache = null;
    this.drawDock();
    this.refresh({ light: true });
  }

  play() {
    if (!this.T) return;
    this.playing = true;
    const btn = this.dock.querySelector("[data-ac-play]");
    if (btn) btn.textContent = "❚❚ Pause";
    let last = performance.now();
    const step = (now) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.seek(this.t + (dt * this.speed * this.T) / CYCLE_SECONDS);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    const btn = this.dock?.querySelector("[data-ac-play]");
    if (btn) btn.textContent = "▶ Play";
  }

  // ---- clicks in the side panel ----
  onPanelClick(b) {
    if (b.dataset.acMode) { this.choose(b.dataset.acMode); return true; }
    if (b.dataset.acScale) { this.prefs.acScale = b.dataset.acScale; this.savePrefs(); this.cache = null; this.drawDock(); this.refresh(); return true; }
    if (b.dataset.acDock === "phasors") { this.openDock(); return true; }
    if (b.dataset.acDock === "bode") { this.openBode(); return true; }
    if (b.dataset.acDock === "hs") { this.openHs(); return true; }
    if (b.dataset.acCard !== undefined) { this.card = this.card === b.dataset.acCard || !b.dataset.acCard ? null : b.dataset.acCard; this.refresh(); return true; }
    if (b.dataset.acPreview === "off") { this.preview = null; this.update(); this.refresh(); return true; }
    if (b.dataset.acPreview === "apply") { this.applyPreview(); return true; }
    return false;
  }

  // the Bode cursor's frequency becomes the input source's own
  applyPreview() {
    const p = this.preview;
    if (!p) return;
    const w = Number(p.omega.toPrecision(4));
    this.preview = null;  // before the edit, so the re-solve uses the source's new frequency
    this.store.update((d) => {
      const part = d.parts.find((q) => q.id === p.input);
      if (part) part.params = { ...part.params, wave: "sine", funit: "rad/s", w: String(w) };
    });
    this.toast?.(`${p.input} now runs at ω = ${omegaText(w)}.`);
  }
}

function previewDrive(input) {
  return (el, F) => {
    if (el.id !== input) return null;
    const p = el.params;
    return p.wave?.text === "sine" ? phasorOf(F, sinePeak(p, el.type === "I" ? "I" : "V"), p.ph.value) : F.one;
  };
}

// the current to show: through a passive part from pin a to pin b; for a source, the current it
// supplies (out of its + terminal, or along its arrow), which is the reverse
const SOURCE_TYPES = ["V", "I", "E", "F", "G", "H"];
function currentOf(el, e) {
  return el && SOURCE_TYPES.includes(el.type) ? { re: -e.i.re, im: -e.i.im } : e.i;
}

// a three-phase source's windings: [label, V, I out of the terminal]: phase voltages for a Y,
// line voltages (ab, bc) for a Δ
function phases(res, el, e) {
  const v = (k) => res.nodes[e.nodes[k]]?.v || { re: 0, im: 0 };
  const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im }), out = (k) => ({ re: -e.pins[k].i.re, im: -e.pins[k].i.im });
  if (el.type === "V3Y") return ["a", "b", "c"].map((ph, k) => [`${ph}n`, sub(v(k), v(3)), out(k)]);
  return [["ab", sub(v(0), v(1)), out(0)], ["bc", sub(v(1), v(2)), out(1)], ["ca", sub(v(2), v(0)), out(2)]];
}

// a transformer's windings: [label, V, I] for the primary (p1 − p2) and secondary (s1 − s2)
function windings(res, e) {
  const v = (k) => res.nodes[e.nodes[k]]?.v || { re: 0, im: 0 };
  const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  return [["primary", sub(v(0), v(1)), e.pins[0].i], ["secondary", sub(v(2), v(3)), e.pins[2].i]];
}

// a passive part's impedance at ω (null for everything else)
export function impedance(el, omega) {
  if (el.type === "R") return { re: el.params.R.value, im: 0 };
  if (el.type === "C") return { re: 0, im: -1 / (omega * el.params.C.value) };
  if (el.type === "L") return { re: 0, im: omega * el.params.L.value };
  return null;
}

// " (R = 3 Ω with L = 4 mH)": what an impedance looks like at this frequency
function likeText(z, omega) {
  if (Math.abs(z.im) <= 1e-12 * (1 + Math.abs(z.re))) return "";
  const part = z.im > 0 ? `L = ${fmt(z.im / omega, "H")}` : `C = ${fmt(-1 / (omega * z.im), "F")}`;
  return ` (like R = ${fmt(z.re, "Ω")} in series with ${part})`;
}

// a source's power factor as the load sees it: lagging when the load is inductive
function powerFactor(sAbsorbed) {
  const s = { re: -sAbsorbed.re, im: -sAbsorbed.im }, mag = Math.hypot(s.re, s.im);
  if (!mag) return "";
  const pf = s.re / mag;
  return `pf ${sig(pf, 3)}${Math.abs(s.im) > 1e-12 * mag ? (s.im > 0 ? " lagging" : " leading") : ""}`;
}

export { angleText, omegaText };
