// Circuit Bench: the page. Connects the document store to the editor, the solver, the views
// and saving. DC solves run right here (they take a millisecond or two), so every drag and
// every keystroke shows its answer on the same frame; longer analyses use the solver thread.

import { migrate } from "./core/doc.js";
import { compile } from "./core/compile.js";
import { Store } from "./core/store.js";
import { Schematic } from "./editor/canvas.js";
import { Input } from "./editor/input.js";
import { Inspector } from "./editor/inspector.js";
import { Persist } from "./editor/persist.js";
import { paletteMarkup, KEYED } from "./editor/palette.js";
import * as E from "./editor/edit.js";
import { boxOf } from "./editor/symbols.js";
import { run } from "./solver/run.js";
import { SolverClient } from "./solver/api.js";
import { defaultParams } from "./elements/index.js";
import { Overlay } from "./views/overlay.js";
import { CurrentFlow } from "./views/current.js";
import { statusHTML, overviewHTML, solvedHTML, tipHTML, kclHTML } from "./views/panels.js";
import { Study } from "./study/study.js";
import { Transient } from "./study/transient.js";
import { toSpice } from "./io/spice.js";
import { snapshot } from "./views/snapshot.js";
import { fmt } from "./core/units.js";

const $ = (s, r = document) => r.querySelector(s);
const data = JSON.parse($("#circuit-data").textContent);
const store = new Store(migrate(data.doc));
const view = new Schematic($("#schematic"));
const overlay = new Overlay(view, { legend: $("#legend") });
const flow = new CurrentFlow($("#flow"), view);
const prefs = loadPrefs();
const bench = $("#bench"), side = $("#side");
let net = null, sol = null, focusNode = null, lastPointerType = "mouse", tipPos = [0, 0], landscape = null;

const solver = new SolverClient();
const study = new Study({ slug: data.slug, store, getSolution: () => sol, getNet: () => net, refresh: () => refreshAll(), toast, solver, dock: $("#dock") });
const tran = study.tran = new Transient({ store, solver, dock: $("#dock"), refresh: () => refreshAll(), toast });
let playback = false;

// what the views show: the circuit at a moment of a transient run, or its DC solution
function shown() {
  const m = tran.moment();
  return m || { doc: store.doc, net, sol };
}

// ---- solve and draw ----
function recompute() {
  const doc = store.doc;
  net = compile(doc);
  view.draw(doc, net);
  sol = run("op", net, doc, {});
  if (focusNode !== null && focusNode >= net.nodes.length) focusNode = null;
  refreshAll();
}

function errorParts() {
  const s = new Set();
  for (const e of [...(sol?.errors || [])]) for (const p of e.parts || []) s.add(p);
  return s;
}

function refreshAll() {
  const hidden = study.hidden;
  const v = shown(), moment = v.sol !== sol;
  if (moment || playback) view.draw(v.doc, v.net);  // switches drawn where they are at that moment
  playback = moment;
  overlay.render(v.doc, v.net, v.sol, { hidden, focusNode, err: moment ? new Set() : errorParts(), currents: prefs.chips !== false });
  $("#status").innerHTML = moment ? `<span class="ok">▶ t = ${fmt(v.sol.time, "s")}</span><span class="msg">playing back the run</span>` : statusHTML(sol);
  flow.electron = !!prefs.electron;
  flow.setData(v.doc, v.net, study.predicting ? null : v.sol);
  inspector.render();
  study.renderAsk?.();
  landscape?.update();
}

// ---- editor ----
const inspector = new Inspector($("#inspector"), {
  store,
  hooks: {
    overview: () => study.panel() + overviewHTML(store.doc, net, sol, { hidden: study.hidden, focusNode }),
    solved: (part) => solvedHTML(part, sol, { hidden: study.hidden }) + study.partTools(part),
    wireNode: (w) => { const n = net?.nodeAt(`${w.a[0]},${w.a[1]}`); return n >= 0 ? `Node ${net.nodes[n].label || net.nodes[n].name}` : "Not connected to a part"; },
    wireSolved: (w) => { const n = net?.nodeAt(`${w.a[0]},${w.a[1]}`); return n >= 0 ? kclHTML(net, sol, n, { hidden: study.hidden }) : ""; },
    rendered: (root) => { if (window.renderMath) window.renderMath(root); },
    toast,
  },
});

const input = new Input({
  svg: $("#schematic"), store, view,
  hooks: {
    hint: (t) => { $("#hint").textContent = t; },
    defaults: (type) => defaultParams(type),
    editPart: (id) => { store.select({ parts: [id] }); openSide(); setTimeout(() => inspector.focusValue(id), 0); },
    placeAtCenter: (type) => placeAtCenter(type),
    paletteType: (i) => KEYED[i],
    hover: (h) => showTip(h),
    pill: (node) => { study.ask({ kind: "v", node }); openSide(); },
    active: () => !$("#v2d").hidden,
  },
});

store.on("doc", () => { tran.invalidate(); recompute(); });
store.on("sel", () => {
  view.applyState({ sel: store.sel });
  const wires = store.selectedWires;
  if (wires.length === 1 && !store.sel.parts.size) {
    const n = net?.nodeAt(`${wires[0].a[0]},${wires[0].a[1]}`);
    focusNode = n >= 0 ? n : null;
  } else if (store.hasSelection) focusNode = null;
  refreshAll();
  if (store.hasSelection && lastPointerType !== "mouse") openSide();
  updateButtons();
});

// node pills and node-table rows focus a node (and show its KCL)
$("#schematic").addEventListener("pointerdown", (e) => {
  lastPointerType = e.pointerType;
  const pill = e.target.closest?.(".node-pill");
  if (!pill) return;
  e.stopImmediatePropagation();
  const node = Number(pill.dataset.node);
  if (pill.classList.contains("ask")) { study.ask({ kind: "v", node }); openSide(); return; }
  focusNode = focusNode === node ? null : node;
  store.clearSelection();
  refreshAll();
}, true);
$("#inspector").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-node]");
  if (row && !e.target.closest("button")) { const n = Number(row.dataset.node); focusNode = focusNode === n ? null : n; refreshAll(); }
  const askN = e.target.closest("[data-ask-node]"), askP = e.target.closest("[data-ask-part]");
  if (askN) study.ask({ kind: "v", node: Number(askN.dataset.askNode) });
  if (askP) study.ask({ kind: "part", part: askP.dataset.askPart });
});

// ---- palette ----
const palette = $("#palette");
palette.innerHTML = paletteMarkup();
palette.addEventListener("pointerdown", (e) => { lastPointerType = e.pointerType; });
palette.addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  b.closest("details")?.removeAttribute("open");
  input.startPlacing(b.dataset.type, { touch: lastPointerType !== "mouse" });
  palette.querySelectorAll("button.pal").forEach((x) => x.setAttribute("aria-pressed", String(x === b && lastPointerType === "mouse")));
});
document.addEventListener("click", (e) => { for (const d of palette.querySelectorAll("details[open]")) if (!d.contains(e.target)) d.removeAttribute("open"); });
// group flyouts float over the stage (the palette itself scrolls, so they can't live inside it)
for (const d of palette.querySelectorAll("details.pal-group")) {
  d.addEventListener("toggle", () => {
    if (!d.open) return;
    for (const o of palette.querySelectorAll("details[open]")) if (o !== d) o.removeAttribute("open");
    const r = d.querySelector("summary").getBoundingClientRect(), fly = d.querySelector(".pal-flyout");
    const phone = innerWidth <= 820;
    fly.style.position = "fixed";
    fly.style.left = `${phone ? Math.max(8, Math.min(r.left, innerWidth - 250)) : r.right + 10}px`;
    fly.style.top = phone ? "" : `${Math.max(8, Math.min(r.top - 6, innerHeight - fly.offsetHeight - 8))}px`;
    fly.style.bottom = phone ? `${innerHeight - r.top + 10}px` : "";
  });
}
$("#schematic").addEventListener("pointerup", () => { if (input.mode !== "place") palette.querySelectorAll("button.pal").forEach((x) => x.setAttribute("aria-pressed", "false")); });

function placeAtCenter(type) {
  const r = view.svg.getBoundingClientRect();
  const [cx, cy] = view.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const rot = E.DEFAULT_ROT[type] ?? 0;
  const boxes = store.doc.parts.map(boxOf);
  const free = (part) => { const b = boxOf(part); return boxes.every((q) => b[2] + 1 < q[0] || b[0] - 1 > q[2] || b[3] + 1 < q[1] || b[1] - 1 > q[3]); };
  let spot = null;
  for (let ring = 0; ring < 8 && !spot; ring++) {
    for (const [dx, dy] of ring ? [[ring * 3, 0], [0, ring * 3], [-ring * 3, 0], [0, -ring * 3], [ring * 3, ring * 3], [-ring * 3, ring * 3]] : [[0, 0]]) {
      const [x, y] = E.originFor(type, rot, false, Math.round(cx) + dx, Math.round(cy) + dy);
      if (free({ type, x, y, rot, flip: false, params: defaultParams(type) })) { spot = [x, y]; break; }
    }
  }
  spot = spot || E.originFor(type, rot, false, Math.round(cx), Math.round(cy));
  let id;
  store.update((d) => { id = E.addPart(d, type, spot[0], spot[1], { rot }); });
  store.select({ parts: [id] });
  $("#hint").textContent = "Drag it into place. Tap a terminal, then another, to wire.";
  setTimeout(() => { if ($("#hint").textContent.startsWith("Drag it")) $("#hint").textContent = ""; }, 4000);
}

// ---- tooltip (mouse) ----
$("#stage").addEventListener("pointermove", (e) => { tipPos = [e.clientX, e.clientY]; if (!$("#tip").hidden) placeTip(); });
function showTip(h) {
  const tip = $("#tip");
  if (!h || h.kind !== "part" || lastPointerType !== "mouse" || input.gesture) { tip.hidden = true; return; }
  tip.innerHTML = tipHTML(h.part, sol, { hidden: study.hidden });
  tip.hidden = false;
  placeTip();
}
function placeTip() {
  const tip = $("#tip"), [x, y] = tipPos;
  tip.style.left = `${Math.min(x + 16, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y + 16, innerHeight - tip.offsetHeight - 8)}px`;
}

// ---- toolbar ----
function updateButtons() {
  $("[data-act=undo]").disabled = !store.past.length;
  $("[data-act=redo]").disabled = !store.future.length;
}
bench.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.closest("#inspector")) return;
  const act = b.dataset.act;
  if (act === "undo") store.undo();
  else if (act === "redo") store.redo();
  else if (act === "fit") view.fit(store.doc);
  else if (act === "zoom-in" || act === "zoom-out") { const r = view.svg.getBoundingClientRect(); view.zoomAt(act === "zoom-in" ? 1.25 : 0.8, r.left + r.width / 2, r.top + r.height / 2); }
  else if (act === "export-spice") download(`${slugName()}.cir`, toSpice(store.doc, net), "text/plain");
  else if (act === "export-json") download(`${slugName()}.json`, JSON.stringify(store.doc, null, 2), "application/json");
  else if (act === "keys") { e.preventDefault(); showKeys(); }
  else if (act === "snapshot") addToNotes();
  else return;
  b.closest("details")?.removeAttribute("open");
  updateButtons();
});
store.on("doc", updateButtons);

$("#predict-toggle").setAttribute("aria-pressed", String(study.predicting));  // problem copies open in predict first
$("#predict-toggle").addEventListener("click", (e) => {
  study.setPredicting(!study.predicting);
  e.currentTarget.setAttribute("aria-pressed", String(study.predicting));
  refreshAll();
});

const optCurrent = $("#opt-current"), optElectron = $("#opt-electron");
optCurrent.checked = !!prefs.dots; optElectron.checked = !!prefs.electron;
optCurrent.addEventListener("change", () => { prefs.dots = optCurrent.checked; savePrefs(); flow.setEnabled(prefs.dots); });
optElectron.addEventListener("change", () => { prefs.electron = optElectron.checked; savePrefs(); flow.electron = prefs.electron; flow.draw(); });
flow.setEnabled(!!prefs.dots);

const title = $("#title-input");
title.addEventListener("change", () => {
  const t = title.value.trim() || "Untitled circuit";
  title.value = t;
  store.update((d) => { d.title = t; });
  document.title = `${t} · Circuits · Homebase`;
});
title.addEventListener("keydown", (e) => { if (e.key === "Enter") title.blur(); });

// views: 2D, 3D, split (3D loads the first time it's opened)
async function setView(v) {
  bench.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  $("#stage").classList.toggle("split", v === "split");
  $("#v2d").hidden = v === "3d";
  $("#v3d").hidden = v === "2d";
  prefs.view = v; savePrefs();
  if (v !== "2d" && !landscape) {
    try {
      const { Landscape } = await import("./three/landscape.js");
      landscape = new Landscape($("#v3d"), {
        store, getNet: () => shown().net, getSolution: () => shown().sol, getDoc: () => shown().doc, playing: () => !!tran.moment(),
        hidden: () => study.hidden, prefs, savePrefs,
        getFocusNode: () => focusNode,
        onFocusNode: (n) => { focusNode = focusNode === n ? null : n; store.clearSelection(); refreshAll(); },
      });
    } catch (err) {
      $("#v3d").innerHTML = `<p class="v3d-msg">The 3D view couldn't start: ${err.message}</p>`;
      return;
    }
  }
  landscape?.setVisible(v !== "2d");
  requestAnimationFrame(() => view.applyCamera());
}
bench.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
store.on("doc", () => landscape?.update());
store.on("sel", () => landscape?.update());
const _refresh = refreshAll;

// ---- phone side sheet ----
function openSide() { side.classList.add("open"); }
$("#side-handle").addEventListener("click", () => side.classList.toggle("open"));

// ---- saving ----
const saveState = $("#save-state");
const persist = new Persist({
  store, slug: data.slug, rev: data.rev,
  summary: () => summaryOf(sol),
  onState: (s, info) => {
    const text = { unsaved: "Editing…", saving: "Saving…", saved: "Saved", offline: "Saved on this device", conflict: "Changed elsewhere" }[s] || s;
    saveState.textContent = text;
    saveState.classList.toggle("warn", s === "offline" || s === "conflict");
    if (s === "offline" && info?.error) saveState.title = `Couldn't reach Homebase (${info.error}); it will retry.`;
  },
  onConflict: (current) => banner(`${current.updated_by === "claude" ? "Claude" : "Another tab"} saved a newer version of this circuit.`, [
    ["Load the newer one", () => persist.takeTheirs(current)],
    ["Keep mine", () => persist.keepMine(current.rev)],
  ]),
});

function summaryOf(s) {
  if (!s) return null;
  if (!s.ok) return { ok: false, errors: (s.errors || []).map((e) => e.message).slice(0, 5) };
  return {
    ok: true, exact: s.exact,
    nodes: Object.fromEntries(s.nodes.map((n) => [n.label || n.name, n.vx || n.v])),
    parts: Object.fromEntries(Object.entries(s.els).map(([id, e]) => [id, { v: e.vx || e.v, i: e.ix || e.i, p: e.px || e.p }])),
  };
}

// ---- add to notes: a picture of the schematic, saved in the course notebook ----
async function addToNotes() {
  const targets = data.notes, dlg = $("#snap-dialog");
  if (!targets) { toast("Give the circuit a course first: notes are kept per course."); return; }
  let blob;  // always of the schematic, even from the 3D view
  try { blob = await snapshot(view, store.doc); }
  catch (err) { toast(err.message || "Couldn't make the picture."); return; }
  const url = URL.createObjectURL(blob);
  $("#snap-preview").src = url;
  const unit = $("#snap-unit"), part = $("#snap-part");
  unit.innerHTML = targets.units.map((u) => `<option value="${u.id}">${escHTML(u.title)}</option>`).join("");
  unit.value = String(targets.default);
  part.innerHTML = targets.parts.map(([k, name]) => `<option value="${k}">${escHTML(name)}</option>`).join("");
  part.value = "ideas";
  $("#snap-caption").value = "";
  dlg.returnValue = "";
  dlg.showModal();
  dlg.addEventListener("close", async () => {
    URL.revokeObjectURL(url);
    if (dlg.returnValue !== "save") return;
    const form = new FormData();
    form.append("file", blob, "circuit.png");
    form.append("caption", $("#snap-caption").value);
    form.append("unit_id", unit.value);
    form.append("part", part.value);
    try {
      const r = await fetch(`/api/circuits/${data.slug}/snapshot`, { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || r.statusText);
      banner(`Added to your notes: ${escHTML(j.unit)} · ${escHTML(j.part)}.`, [["Open the notes", () => { location.href = j.url; }], ["OK", () => {}]]);
    } catch (err) {
      toast(`Couldn't add it to your notes (${err.message}).`);
    }
  }, { once: true });
}

const escHTML = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function banner(text, actions) {
  const b = $("#banner");
  b.innerHTML = `<span>${text}</span>` + actions.map(([label], i) => `<button type="button" class="small${i ? "" : " primary"}" data-b="${i}">${label}</button>`).join("");
  b.hidden = false;
  b.onclick = (e) => { const k = e.target.closest("[data-b]")?.dataset.b; if (k === undefined) return; b.hidden = true; actions[Number(k)][1](); };
}

function toast(text) {
  const h = $("#hint");
  h.textContent = text;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { if (h.textContent === text) h.textContent = ""; }, 3500);
}

function showKeys() {
  banner(`<b>Keys</b>: 1–8 parts · drag from a terminal to wire · W wire · R rotate · X mirror · Del delete · Ctrl+Z / Ctrl+Y undo / redo ·
    Ctrl+D duplicate · arrows nudge · T flip a switch · F fit · Esc cancel · wheel or pinch to zoom · Space+drag to pan`, [["Got it", () => {}]]);
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function slugName() { return (store.doc.title || "circuit").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "circuit"; }

function loadPrefs() { try { return JSON.parse(localStorage.getItem("homebase.bench") || "{}"); } catch { return {}; } }
function savePrefs() { try { localStorage.setItem("homebase.bench", JSON.stringify(prefs)); } catch {} }

// ---- start ----
const draft = persist.draft();
if (draft && JSON.stringify(draft.doc) !== JSON.stringify(store.doc)) {
  banner(`You have changes from ${new Date(draft.at).toLocaleString()} that didn't reach Homebase.`, [
    ["Restore them", () => store.replace(migrate(draft.doc), { label: "restore" })],
    ["Discard", () => persist.dropDraft()],
  ]);
}
recompute();
view.fit(store.doc);
updateButtons();
document.addEventListener("homebase-theme", () => { refreshAll(); landscape?.update(); });
if (prefs.view && prefs.view !== "2d" && innerWidth > 820) setView(prefs.view);
window.bench = { store, view, get net() { return net; }, get sol() { return sol; }, get landscape() { return landscape; }, study, _refresh };
