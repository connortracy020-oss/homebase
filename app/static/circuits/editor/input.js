// Mouse, touch and keyboard on the schematic.
//   select: tap a part to select, drag to move (wires stay attached), drag empty space to box-select
//           (mouse) or pan (touch), wheel or pinch to zoom
//   wire:   drag from a terminal to another, or tap a terminal and then where it should go;
//           a wire to another terminal routes itself around parts
//   place:  a part follows the pointer until you click (touch: it lands in the middle)

import { hitTest, inBox } from "./hit.js";
import { route, elbow } from "./route.js";
import * as E from "./edit.js";

const TAP_PX = 6, DOUBLE_MS = 320;

export class Input {
  constructor({ svg, store, view, hooks }) {
    Object.assign(this, { svg, store, view, hooks });
    this.mode = "idle";        // idle | place | wire
    this.gesture = null;
    this.pointers = new Map();
    this.place = null;         // {type, rot, flip}
    this.wire = null;          // {points: [[x, y], ...], hf: bool}
    this.lastTap = null;
    this.clip = null;
    this.lastType = null;
    this.spaceDown = false;
    this.hoverPoint = null;
    svg.addEventListener("pointerdown", (e) => this.down(e));
    svg.addEventListener("pointermove", (e) => this.move(e));
    svg.addEventListener("pointerup", (e) => this.up(e));
    svg.addEventListener("pointercancel", (e) => this.cancelPointer(e));
    svg.addEventListener("pointerleave", () => { if (!this.gesture && this.mode === "idle") this.setHover(null); });
    svg.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    svg.addEventListener("dblclick", (e) => this.double(e));
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.key(e));
    window.addEventListener("keyup", (e) => { if (e.code === "Space") this.spaceDown = false; });
  }

  get doc() { return this.store.doc; }
  world(e) { return this.view.toWorld(e.clientX, e.clientY); }
  snap([x, y]) { return [Math.round(x), Math.round(y)]; }
  hint(text) { this.hooks.hint?.(text); }

  // ---- modes ----
  startPlacing(type, { touch = false } = {}) {
    this.cancel();
    this.lastType = type;
    if (touch) { this.hooks.placeAtCenter?.(type); return; }
    this.mode = "place";
    this.place = { type, rot: E.DEFAULT_ROT[type] ?? 0, flip: false };
    this.hint("Click to place. R rotates, X mirrors, Esc cancels.");
    if (this.hoverPoint) this.showGhost(this.hoverPoint);
  }

  startWire(point) {
    this.mode = "wire";
    this.wire = { points: [point], hf: true };
    this.hint("Tap where the wire goes: another terminal, a wire, or empty grid for a corner. Esc cancels.");
    this.view.wirePreview([point]);
  }

  cancel() {
    if (this.gesture?.kind === "move" && this.gesture.moved) this.store.replace(this.gesture.base, { coalesce: "move" });
    this.gesture = null;
    this.mode = "idle"; this.place = null; this.wire = null;
    this.view.setGhost("");
    this.hint("");
  }

  showGhost(pt) {
    const { type, rot, flip } = this.place;
    const [x, y] = E.originFor(type, rot, flip, pt[0], pt[1]);
    this.view.ghostPart({ id: "ghost", type, x, y, rot, flip, params: this.hooks.defaults?.(type) || {} });
  }

  setHover(h) { this.hover = h; this.view.applyState({ hover: h }); this.hooks.hover?.(h); }

  // ---- pointer ----
  down(e) {
    if (e.button === 2) return;
    try { this.svg.setPointerCapture(e.pointerId); } catch { /* synthetic or finished pointer */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const touch = e.pointerType !== "mouse";
    if (this.pointers.size === 2) {
      // second finger: pinch-zoom and pan; undo any move the first finger started
      if (this.gesture?.kind === "move" && this.gesture.moved) this.store.replace(this.gesture.base, { coalesce: "move" });
      const [p, q] = [...this.pointers.values()];
      this.gesture = { kind: "pinch", d: Math.hypot(p.x - q.x, p.y - q.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
      return;
    }
    if (this.pointers.size > 2) return;
    const w = this.world(e), s = this.snap(w);
    const base = { x: e.clientX, y: e.clientY, touch, shift: e.shiftKey || e.metaKey || e.ctrlKey };
    if (e.button === 1 || this.spaceDown) { this.gesture = { kind: "pan", ...base, lx: e.clientX, ly: e.clientY }; return; }
    if (this.mode === "place" || this.mode === "wire") { this.gesture = { kind: "click", ...base }; return; }
    const hit = hitTest(this.doc, w[0], w[1], { touch });
    if (hit.kind === "pin" || hit.kind === "end") {
      this.gesture = { kind: "wire", ...base, start: hit.point, hit };
    } else if (hit.kind === "part" || hit.kind === "wire") {
      const kind = hit.kind, id = kind === "part" ? hit.part.id : hit.wire.id;
      const selected = kind === "part" ? this.store.sel.parts.has(id) : this.store.sel.wires.has(id);
      if (base.shift) this.store.toggle(kind, id);
      else if (!selected) this.store.select(kind === "part" ? { parts: [id] } : { wires: [id] });
      this.gesture = { kind: "move", ...base, start: s, base: this.doc, moved: false, hit, wasSelected: selected };
    } else if (touch) {
      this.gesture = { kind: "pan", ...base, lx: e.clientX, ly: e.clientY, tapEmpty: true };
    } else {
      this.gesture = { kind: "box", ...base, start: w };
    }
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture, w = this.world(e), s = this.snap(w);
    this.hoverPoint = s;
    if (g?.kind === "pinch" && this.pointers.size === 2) {
      const [p, q] = [...this.pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y), cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      this.view.panBy(cx - g.cx, cy - g.cy);
      if (g.d > 0) this.view.zoomAt(d / g.d, cx, cy);
      Object.assign(g, { d, cx, cy });
      return;
    }
    const far = g && Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_PX;
    if (!g) {
      if (this.mode === "place") { this.showGhost(s); return; }
      if (this.mode === "wire") { this.previewWire(w, s, e.pointerType !== "mouse"); return; }
      if (e.pointerType === "mouse") {
        const h = hitTest(this.doc, w[0], w[1]);
        if (h.kind !== this.hover?.kind || h.part !== this.hover?.part || h.wire !== this.hover?.wire || `${h.point}` !== `${this.hover?.point}`) this.setHover(h);
        this.svg.style.cursor = h.kind === "pin" || h.kind === "end" ? "crosshair" : h.kind === "part" || h.kind === "wire" ? "grab" : "default";
      }
      return;
    }
    if (g.kind === "pan") { this.view.panBy(e.clientX - g.lx, e.clientY - g.ly); g.lx = e.clientX; g.ly = e.clientY; if (far) g.tapEmpty = false; return; }
    if (g.kind === "box") { if (far) this.view.boxPreview(g.start, w); return; }
    if (g.kind === "move") {
      if (!far && !g.moved) return;
      g.moved = true;
      const dx = s[0] - g.start[0], dy = s[1] - g.start[1];
      if (dx === g.dx && dy === g.dy) return;
      g.dx = dx; g.dy = dy;
      this.store.replace(E.moveSelection(g.base, this.store.sel, dx, dy), { coalesce: "move" });
      this.svg.style.cursor = "grabbing";
      return;
    }
    if (g.kind === "wire" && far) {
      g.dragging = true;
      if (g.hf === undefined) g.hf = Math.abs(e.clientX - g.x) >= Math.abs(e.clientY - g.y);
      const target = this.targetAt(w, e.pointerType !== "mouse");
      const pts = target && target.point ? (route(this.doc, g.start, target.point) || elbow(g.start, target.point, g.hf)) : elbow(g.start, s, g.hf);
      this.view.wirePreview(pts, target?.point);
    }
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === "pinch") { if (this.pointers.size === 0) this.gesture = null; return; }
    this.gesture = null;
    const w = this.world(e), s = this.snap(w);
    const tap = Math.hypot(e.clientX - g.x, e.clientY - g.y) <= TAP_PX;
    if (g.kind === "pan") { if (g.tapEmpty && tap) this.store.clearSelection(); return; }
    if (g.kind === "box") {
      this.view.setGhost("");
      if (tap) { if (!g.shift) this.store.clearSelection(); return; }
      this.store.select(inBox(this.doc, g.start, w), { add: g.shift });
      return;
    }
    if (g.kind === "move") {
      this.svg.style.cursor = "";
      if (g.moved) { this.store.update((d) => E.tidy(d), { coalesce: "move" }); this.store.endGesture(); }
      else if (tap && this.isDoubleTap(e)) this.double(e);
      return;
    }
    if (g.kind === "wire") {
      if (!g.dragging) { this.startWire(g.start); return; }
      const target = this.targetAt(w, g.touch);
      const end = target?.point || s;
      const pts = target?.point ? (route(this.doc, g.start, end) || elbow(g.start, end, g.hf)) : elbow(g.start, end, g.hf);
      this.commitWire(pts);
      return;
    }
    if (g.kind === "click") {
      if (!tap) return;
      if (this.mode === "place") {
        const { type, rot, flip } = this.place;
        const [x, y] = E.originFor(type, rot, flip, s[0], s[1]);
        let id;
        this.store.update((d) => { id = E.addPart(d, type, x, y, { rot, flip }); });
        this.store.select({ parts: [id] });
        if (!g.shift) this.cancel();
        return;
      }
      if (this.mode === "wire") this.wireClick(w, s, g.touch, e);
    }
  }

  cancelPointer(e) {
    this.pointers.delete(e.pointerId);
    if (this.gesture?.kind === "move" && this.gesture.moved) { this.store.update((d) => E.tidy(d), { coalesce: "move" }); this.store.endGesture(); }
    this.gesture = null;
  }

  isDoubleTap(e) {
    const t = performance.now(), last = this.lastTap;
    this.lastTap = { t, x: e.clientX, y: e.clientY };
    return !!last && t - last.t < DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 20;
  }

  wheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.view.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    else this.view.panBy(-e.deltaX, -e.deltaY);
  }

  double(e) {
    if (this.mode === "wire") { this.commitWire(this.wire.points.concat([this.snap(this.world(e))])); return; }
    const w = this.world(e), hit = hitTest(this.doc, w[0], w[1], { touch: e.pointerType !== "mouse" });
    if (hit.kind !== "part") return;
    if (hit.part.type === "SW" || hit.part.type === "SW2") {
      this.store.update((d) => E.toggleSwitch(d, hit.part.id), { label: "switch" });
    } else this.hooks.editPart?.(hit.part.id);
  }

  // ---- wiring ----
  targetAt(w, touch) {
    const h = hitTest(this.doc, w[0], w[1], { touch });
    if (h.kind === "pin" || h.kind === "end" || h.kind === "wire") return h;
    return null;
  }

  previewWire(w, s, touch) {
    const pts = this.wire.points, last = pts[pts.length - 1];
    const target = this.targetAt(w, touch);
    let tail;
    if (target) tail = (pts.length === 1 && route(this.doc, last, target.point)) || elbow(last, target.point, this.wire.hf);
    else tail = elbow(last, s, this.wire.hf);
    this.view.wirePreview(pts.slice(0, -1).concat(tail), target?.point);
  }

  wireClick(w, s, touch, e) {
    const pts = this.wire.points, last = pts[pts.length - 1];
    const target = this.targetAt(w, touch);
    if (target && `${target.point}` === `${pts[0]}` && pts.length === 1) { this.cancel(); return; }
    if (target) {
      const tail = (pts.length === 1 && route(this.doc, last, target.point)) || elbow(last, target.point, this.wire.hf);
      this.commitWire(pts.slice(0, -1).concat(tail));
      return;
    }
    if (this.isDoubleTap(e) && pts.length > 1) { this.commitWire(pts); return; }
    if (`${s}` === `${last}`) return;
    this.wire.points = pts.slice(0, -1).concat(elbow(last, s, this.wire.hf));
    this.previewWire(w, s, touch);
  }

  commitWire(points) {
    const clean = points.filter((p, i) => i === 0 || `${p}` !== `${points[i - 1]}`);
    this.mode = "idle"; this.wire = null;
    this.view.setGhost(""); this.hint("");
    if (clean.length < 2) return;
    let ids = [];
    this.store.update((d) => { ids = E.addWirePath(d, clean); }, { label: "wire" });
    this.store.endGesture();
  }

  // ---- keyboard ----
  key(e) {
    const t = e.target;
    if (t && (t.closest?.("input, textarea, select, [contenteditable]"))) return;
    if (this.hooks.active && !this.hooks.active()) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, store = this.store;
    if (e.code === "Space" && !mod) { this.spaceDown = true; e.preventDefault(); return; }
    if (k === "Escape") { if (this.mode !== "idle" || this.gesture) this.cancel(); else store.clearSelection(); return; }
    if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && (k === "y" || k === "Y")) { e.preventDefault(); store.redo(); return; }
    if (mod && (k === "a" || k === "A")) { e.preventDefault(); store.select({ parts: this.doc.parts.map((p) => p.id), wires: this.doc.wires.map((w) => w.id) }); return; }
    if (mod && (k === "c" || k === "C")) { if (store.hasSelection) { this.clip = E.copySelection(this.doc, store.sel); e.preventDefault(); } return; }
    if (mod && (k === "v" || k === "V")) { if (this.clip) { e.preventDefault(); this.pasteClip(2, 2); } return; }
    if (mod && (k === "d" || k === "D")) { e.preventDefault(); if (store.hasSelection) { this.clip = E.copySelection(this.doc, store.sel); this.pasteClip(2, 2); } return; }
    if (mod) return;
    if (k === "Delete" || k === "Backspace") { if (store.hasSelection) { e.preventDefault(); store.update((d) => E.deleteSelection(d, store.sel), { label: "delete" }); } return; }
    if (k === "r" || k === "R" || k === "x" || k === "X" || k === "y" || k === "Y") {
      const how = (k === "r" || k === "R") ? (e.shiftKey ? "ccw" : "cw") : "mirror";
      if (this.mode === "place") {
        const p = this.place;
        if (how === "cw") p.rot = (p.rot + 1) % 4; else if (how === "ccw") p.rot = (p.rot + 3) % 4;
        else { p.flip = !p.flip; if (p.rot % 2) p.rot = (p.rot + 2) % 4; }
        if (k === "y" || k === "Y") p.rot = (p.rot + 2) % 4;
        if (this.hoverPoint) this.showGhost(this.hoverPoint);
        return;
      }
      if (!store.hasSelection) return;
      let next = E.turnSelection(this.doc, store.sel, how);
      if (k === "y" || k === "Y") next = E.turnSelection(E.turnSelection(next, store.sel, "cw"), store.sel, "cw");
      if (next === this.doc) this.hint("No room to turn it there: it would touch another terminal. Move it first.");
      else store.replace(next, { label: "turn" });
      return;
    }
    if (k === "w" || k === "W") { if (this.hoverPoint && this.mode === "idle") this.startWire(this.hover?.point || this.hoverPoint); return; }
    if (k === "f" || k === "F") { this.view.fit(this.doc); return; }
    if (k === "t" || k === "T") {
      const sw = store.selectedParts.filter((p) => p.type === "SW" || p.type === "SW2");
      if (sw.length) store.update((d) => sw.forEach((p) => E.toggleSwitch(d, p.id)), { label: "switch" });
      return;
    }
    if (k === "Insert" && this.lastType) { this.startPlacing(this.lastType); return; }
    if ((k === "e" || k === "E" || k === "Enter") && store.sel.parts.size === 1) { e.preventDefault(); this.hooks.editPart?.([...store.sel.parts][0]); return; }
    if (k.startsWith("Arrow") && store.hasSelection) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1, dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
      store.replace(E.moveSelection(this.doc, store.sel, dx, dy), { coalesce: "nudge" });
      store.update((d) => E.tidy(d), { coalesce: "nudge" });
      return;
    }
    if (/^[1-9]$/.test(k)) { const type = this.hooks.paletteType?.(Number(k) - 1); if (type) this.startPlacing(type); }
  }

  pasteClip(dx, dy) {
    let sel;
    this.store.update((d) => { sel = E.paste(d, this.clip, dx, dy); }, { label: "paste" });
    this.store.select(sel);
    this.clip = { parts: this.clip.parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })), wires: this.clip.wires.map((w) => ({ ...w, a: [w.a[0] + dx, w.a[1] + dy], b: [w.b[0] + dx, w.b[1] + dy] })) };
  }
}
