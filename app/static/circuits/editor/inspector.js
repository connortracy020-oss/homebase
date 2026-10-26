// The side panel for the selection: name, values (with how each was read), position buttons,
// and the part's solved numbers. Values commit as you type once they read cleanly.

import { defOf, visibleParams, defaultParams } from "../elements/index.js";
import { parseValue, describeParsed } from "../core/units.js";
import { esc } from "./symbols.js";
import * as E from "./edit.js";

export class Inspector {
  constructor(root, { store, hooks }) {
    Object.assign(this, { root, store, hooks });
    this.timers = new Map();
    root.addEventListener("input", (e) => this.onInput(e));
    root.addEventListener("change", (e) => this.onChange(e));
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input[data-key]")) { e.preventDefault(); this.commit(e.target, true); e.target.blur(); } });
  }

  render() {
    const store = this.store, parts = store.selectedParts, wires = store.selectedWires;
    const selKey = [...store.sel.parts, "|", ...store.sel.wires].join(",");
    const typing = document.activeElement?.matches?.("input") && this.root.contains(document.activeElement);
    if (typing && selKey === this.selKey) { this.refreshSolved(); return; }  // don't disturb the field you're typing in
    this.selKey = selKey;
    const focus = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    if (parts.length === 1 && !wires.length) this.root.innerHTML = this.partPanel(parts[0]);
    else if (parts.length + wires.length > 1) this.root.innerHTML = this.multiPanel(parts, wires);
    else if (wires.length === 1) this.root.innerHTML = this.wirePanel(wires[0]);
    else this.root.innerHTML = this.hooks.overview?.() || "";
    if (focus) this.root.querySelector(`[data-key="${focus}"]`)?.focus();
    this.hooks.rendered?.(this.root);
  }

  partPanel(part) {
    const def = defOf(part.type);
    const fields = visibleParams(part.type, part.params).map((pd) => this.field(part, pd)).join("");
    const turn = def.topological && part.type === "GND" ? "" : `
      <div class="insp-actions">
        <button type="button" class="small" data-act="cw" title="Rotate (R)">⟳ Rotate</button>
        <button type="button" class="small" data-act="mirror" title="Mirror (X)">⇋ Mirror</button>
        ${part.type === "SW" || part.type === "SW2" ? `<button type="button" class="small" data-act="toggle" title="Flip the switch (T, or double-click it)">Flip switch</button>` : ""}
        <button type="button" class="small" data-act="delete" title="Delete (Del)">Delete</button>
      </div>`;
    return `
      <div class="insp-head">
        <span class="eyebrow">${esc(def.name)}</span>
        ${part.type === "GND" || part.type === "LBL" ? "" : `<label class="insp-name">Name <input data-act="rename" value="${esc(part.id)}" spellcheck="false" autocomplete="off"></label>`}
      </div>
      <div class="insp-fields">${fields}</div>
      ${turn}
      <div class="insp-solved" data-solved="${esc(part.id)}">${this.hooks.solved?.(part) || ""}</div>`;
  }

  field(part, pd) {
    const value = part.params?.[pd.key] ?? pd.default;
    if (pd.kind === "choice") {
      return `<div class="insp-field"><span class="lbl">${esc(pd.label)}</span><div class="seg small" role="group">${pd.options.map((o) =>
        `<button type="button" data-choice="${esc(pd.key)}" data-value="${esc(o)}" aria-pressed="${o === value}">${esc(pd.labels?.[o] ?? o)}</button>`).join("")}</div></div>`;
    }
    const reading = pd.kind === "value" ? this.reading(pd, value) : "";
    const ctrlHelp = pd.kind === "ctrl" ? this.ctrlPicker(part, value) : "";
    return `<label class="insp-field"><span class="lbl">${esc(pd.label)}${pd.unit ? ` <span class="unit">${esc(pd.unit)}</span>` : ""}</span>
      <input data-key="${esc(pd.key)}" data-kind="${pd.kind}" value="${esc(value)}" ${pd.kind === "value" ? 'inputmode="decimal"' : ""} spellcheck="false" autocomplete="off" placeholder="${esc(pd.optional ? "empty" : pd.default)}">
      <span class="reading" data-reading="${esc(pd.key)}">${reading}</span>${ctrlHelp}
      ${pd.hint ? `<span class="hint">${esc(pd.hint)}</span>` : ""}</label>`;
  }

  reading(pd, text) {
    if (pd.optional && String(text).trim() === "") return "";
    const p = parseValue(text, pd.unit);
    if (p.ok) return `= ${esc(describeParsed(p, pd.unit))}`;
    if (p.ambiguous) return `<span class="bad">milli or mega?</span> <button type="button" class="link" data-fix="${esc(pd.key)}" data-to="${esc(p.ambiguous.milli)}">${esc(p.ambiguous.milli)}</button> <button type="button" class="link" data-fix="${esc(pd.key)}" data-to="${esc(p.ambiguous.mega)}">${esc(p.ambiguous.mega)}</button>`;
    return `<span class="bad">${esc(p.error)}</span>`;
  }

  // pick the controlling quantity of a dependent source without typing the syntax
  ctrlPicker(part, value) {
    const others = this.store.doc.parts.filter((p) => p.id !== part.id && !defOf(p.type).topological);
    const kind = defOf(part.type).controls;
    return `<span class="ctrl-pick">${others.map((p) => `<button type="button" class="chip" data-ctrl="${kind}(${esc(p.id)})">${kind}(${esc(p.id)})</button>`).join("")}
      <button type="button" class="chip" data-ctrl="flip" title="Flip the sign">±</button></span>`;
  }

  multiPanel(parts, wires) {
    const n = parts.length, m = wires.length;
    return `<div class="insp-head"><span class="eyebrow">Selection</span><strong>${n ? `${n} part${n > 1 ? "s" : ""}` : ""}${n && m ? " and " : ""}${m ? `${m} wire${m > 1 ? "s" : ""}` : ""}</strong></div>
      <div class="insp-actions"><button type="button" class="small" data-act="cw">⟳ Rotate</button><button type="button" class="small" data-act="mirror">⇋ Mirror</button>
      <button type="button" class="small" data-act="delete">Delete</button></div>
      <p class="hint">Drag any of them to move the whole selection. Ctrl+D duplicates.</p>`;
  }

  wirePanel(w) {
    return `<div class="insp-head"><span class="eyebrow">Wire</span><strong>${esc(this.hooks.wireNode?.(w) || "")}</strong></div>
      <div class="insp-solved">${this.hooks.wireSolved?.(w) || ""}</div>
      <div class="insp-actions"><button type="button" class="small" data-act="delete">Delete</button></div>
      <p class="hint">Drag a wire to slide it; the wires it meets stretch to follow.</p>`;
  }

  // ---- events ----
  onInput(e) {
    const input = e.target;
    if (input.dataset.act === "rename") return;
    if (!input.dataset.key) return;
    const part = this.store.selectedParts[0];
    if (!part) return;
    const pd = defOf(part.type).params.find((p) => p.key === input.dataset.key);
    if (pd?.kind === "value") {
      const r = this.root.querySelector(`[data-reading="${input.dataset.key}"]`);
      if (r) r.innerHTML = this.reading(pd, input.value);
    }
    clearTimeout(this.timers.get(input.dataset.key));
    this.timers.set(input.dataset.key, setTimeout(() => this.commit(input, false), 250));
  }

  onChange(e) {
    const input = e.target;
    if (input.dataset.act === "rename") { this.rename(input); return; }
    if (input.dataset.key) this.commit(input, true);
  }

  commit(input, final) {
    const part = this.store.selectedParts[0];
    if (!part) return;
    const k = input.dataset.key, pd = defOf(part.type).params.find((p) => p.key === k);
    if (!pd) return;
    const text = input.value.trim();
    if (!final && pd.kind === "value" && !(pd.optional && text === "") && !parseValue(text, pd.unit).ok) return;
    if ((part.params?.[k] ?? "") === text) return;
    this.store.update((d) => E.setParam(d, part.id, k, text), { coalesce: `param:${part.id}:${k}` });
  }

  rename(input) {
    const part = this.store.selectedParts[0];
    if (!part) return;
    let problem = null, next = input.value.trim();
    if (next === part.id) return;
    this.store.update((d) => { problem = E.renamePart(d, part.id, next); });
    if (problem) { this.store.undo(); this.hooks.toast?.(problem); input.value = part.id; return; }
    this.store.select({ parts: [next] });
  }

  onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const store = this.store, part = store.selectedParts[0];
    if (b.dataset.act === "cw" || b.dataset.act === "mirror") {
      const next = E.turnSelection(store.doc, store.sel, b.dataset.act);
      if (next === store.doc) this.hooks.toast?.("No room to turn it there: it would touch another terminal. Move it first.");
      else store.replace(next, { label: "turn" });
    } else if (b.dataset.act === "delete") {
      store.update((d) => E.deleteSelection(d, store.sel), { label: "delete" });
    } else if (b.dataset.act === "toggle" && part) {
      store.update((d) => E.toggleSwitch(d, part.id), { label: "switch" });
    } else if (b.dataset.choice && part) {
      store.update((d) => E.setParam(d, part.id, b.dataset.choice, b.dataset.value));
    } else if (b.dataset.fix && part) {
      store.update((d) => E.setParam(d, part.id, b.dataset.fix, b.dataset.to));
    } else if (b.dataset.ctrl && part) {
      const cur = part.params.ctrl || "";
      const next = b.dataset.ctrl === "flip" ? (cur.trim().startsWith("-") ? cur.trim().slice(1) : `-${cur.trim()}`) : b.dataset.ctrl;
      store.update((d) => E.setParam(d, part.id, "ctrl", next));
    } else return;
    this.render();
  }

  refreshSolved() {
    const part = this.store.selectedParts[0];
    const box = part && this.root.querySelector(`[data-solved="${CSS.escape(part.id)}"]`);
    if (box) box.innerHTML = this.hooks.solved?.(part) || "";
    if (!part && !this.store.hasSelection) { const o = this.root.querySelector(".overview"); if (o) this.root.innerHTML = this.hooks.overview?.() || ""; }
  }

  focusValue(id) {
    const input = this.root.querySelector('input[data-kind="value"], input[data-key="name"]');
    if (input) { input.focus(); input.select(); }
  }
}

export { defaultParams };
