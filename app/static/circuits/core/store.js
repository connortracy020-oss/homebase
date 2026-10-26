// The one place the document lives while you edit. Every change goes through update() or
// replace(), so undo/redo always works; a drag or a slider is one undo step (coalesce).

const LIMIT = 300;

export class Store extends EventTarget {
  constructor(doc) {
    super();
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.coalesceKey = null;
    this.sel = { parts: new Set(), wires: new Set() };
    this.solution = null;
    this.net = null;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); }

  // change a copy of the document; fn mutates it
  update(fn, { coalesce = null, label = "" } = {}) {
    const next = structuredClone(this.doc);
    const out = fn(next);
    this.replace(next, { coalesce, label });
    return out;
  }

  replace(next, { coalesce = null, label = "" } = {}) {
    if (!(coalesce && coalesce === this.coalesceKey)) {
      this.past.push(this.doc);
      if (this.past.length > LIMIT) this.past.shift();
      this.future = [];
    }
    this.coalesceKey = coalesce;
    this.doc = next;
    this.pruneSelection();
    this.emit("doc", { label });
  }

  endGesture() { this.coalesceKey = null; }

  undo() {
    if (!this.past.length) return false;
    this.future.push(this.doc);
    this.doc = this.past.pop();
    this.coalesceKey = null;
    this.pruneSelection();
    this.emit("doc", { label: "undo" });
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(this.doc);
    this.doc = this.future.pop();
    this.coalesceKey = null;
    this.pruneSelection();
    this.emit("doc", { label: "redo" });
    return true;
  }

  // ---- selection ----
  select({ parts = [], wires = [] } = {}, { add = false } = {}) {
    if (!add) { this.sel.parts.clear(); this.sel.wires.clear(); }
    for (const id of parts) this.sel.parts.add(id);
    for (const id of wires) this.sel.wires.add(id);
    this.emit("sel");
  }

  toggle(kind, id) {
    const set = kind === "part" ? this.sel.parts : this.sel.wires;
    if (set.has(id)) set.delete(id); else set.add(id);
    this.emit("sel");
  }

  clearSelection() {
    if (!this.sel.parts.size && !this.sel.wires.size) return;
    this.sel.parts.clear(); this.sel.wires.clear();
    this.emit("sel");
  }

  get selectedParts() { return this.doc.parts.filter((p) => this.sel.parts.has(p.id)); }
  get selectedWires() { return this.doc.wires.filter((w) => this.sel.wires.has(w.id)); }
  get hasSelection() { return this.sel.parts.size + this.sel.wires.size > 0; }

  pruneSelection() {
    const parts = new Set(this.doc.parts.map((p) => p.id)), wires = new Set(this.doc.wires.map((w) => w.id));
    let changed = false;
    for (const id of [...this.sel.parts]) if (!parts.has(id)) { this.sel.parts.delete(id); changed = true; }
    for (const id of [...this.sel.wires]) if (!wires.has(id)) { this.sel.wires.delete(id); changed = true; }
    if (changed) this.emit("sel");
  }
}
