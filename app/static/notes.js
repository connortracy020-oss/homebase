// The notebook editor: edit blocks in place, add, move (drag or menu), star,
// delete with undo, rename units, search, and add screenshots.
// The page is rendered by the server; every change goes through /notes/... and
// the server sends back the block's new HTML, so what you see is what's saved.

(function () {
  const layout = document.querySelector(".notes-layout");
  if (!layout) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const unitId = Number(layout.dataset.unit);
  if (matchMedia("(max-width: 900px)").matches) { const o = document.querySelector(".nb-outline"); if (o) o.open = false; }
  const course = layout.dataset.course;
  const PARTS = JSON.parse($("#nb-parts").textContent);
  const TARGETS = JSON.parse($("#nb-move-targets").textContent);
  const math = (el) => { try { window.renderMath && window.renderMath(el); } catch {} };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(url, method = "POST", data = null, form = false) {
    const opts = { method, headers: {} };
    if (data && form) { const f = new FormData(); Object.entries(data).forEach(([k, v]) => f.append(k, v)); opts.body = f; }
    else if (data) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(data); }
    const res = await fetch(url, opts);
    if (!res.ok) { let m = `HTTP ${res.status}`; try { m = (await res.json()).detail || m; } catch {} throw new Error(m); }
    const type = res.headers.get("content-type") || "";
    return type.includes("json") ? res.json() : res.text();
  }

  // ---- parts: make sure a part section exists on the page --------------------------------------
  function partList(part) {
    let list = $(`.nb-list[data-part="${part}"]`);
    if (list) return list;
    const tpl = $("#nb-part-tpl").content.firstElementChild.cloneNode(true);
    tpl.dataset.part = part; tpl.id = `part-${part}`;
    $("h2", tpl).textContent = PARTS.find(([k]) => k === part)[1];
    const add = $(".nb-add", tpl); add.dataset.part = part;
    add.dataset.kind = { ideas: "text", definitions: "definition", formulas: "formula", examples: "example", tips: "tip" }[part];
    list = $(".nb-list", tpl); list.dataset.part = part;
    // keep the five parts in their fixed order
    const order = PARTS.map(([k]) => k);
    const after = $$(".nb-part").find((s) => order.indexOf(s.dataset.part) > order.indexOf(part));
    const main = $(".nb-main");
    after ? main.insertBefore(tpl, after) : main.insertBefore(tpl, $(".nb-empty-parts") || null);
    $(`.nb-empty-parts .nb-add[data-part="${part}"]`)?.remove();
    if ($(".nb-empty-parts") && !$$(".nb-empty-parts .nb-add").length) $(".nb-empty-parts").remove();
    bindAdd(add); bindDrop(list);
    return list;
  }
  const recount = () => $$(".nb-part").forEach((s) => { const c = $(".nb-part-head .c", s); if (c) c.textContent = $$(".nblock", s).length; });

  // ---- one block -------------------------------------------------------------------------------
  function swap(article, html) {
    const tmp = document.createElement("div"); tmp.innerHTML = html.trim();
    const fresh = tmp.firstElementChild;
    article.replaceWith(fresh);
    bindBlock(fresh); math(fresh);
    return fresh;
  }

  const LABELS = {
    formula: ["Name (optional)", "Equation in LaTeX, e.g. p = vi or \\frac{dv}{dt}"],
    definition: ["Term", "What it means"],
    example: ["Example title", "Problem, then the steps (Markdown, math in \\( \\))"],
    text: ["Heading (optional)", "Write in Markdown. Math: \\( v = iR \\) inline, $$ … $$ on its own line"],
    tip: ["Heading (optional)", "The pitfall or trick"],
    image: ["", "Caption"],
  };

  function openEditor(article) {
    if (article.classList.contains("editing")) return;
    const data = JSON.parse($(".nb-data", article).textContent);
    const id = article.dataset.id;
    article.classList.add("editing");
    article.draggable = false;
    const ed = document.createElement("div");
    ed.className = "nb-editor";
    const kindSel = data.kind === "image" ? "" : `<select class="nb-kind" aria-label="Kind">${["text", "formula", "definition", "example", "tip"]
      .map((k) => `<option value="${k}" ${k === data.kind ? "selected" : ""}>${k}</option>`).join("")}</select>`;
    ed.innerHTML = `
      <div class="nb-ed-row">${kindSel}<input class="nb-f-title" type="text" autocomplete="off"></div>
      <textarea class="nb-f-body" rows="4"></textarea>
      <div class="nb-ed-extra"></div>
      <div class="nb-preview" aria-live="polite"></div>
      <div class="nb-ed-actions"><span class="small muted nb-saved"></span><button type="button" class="small" data-ed="cancel">Cancel</button><button type="button" class="small primary" data-ed="done">Done</button></div>`;
    $(".nb-view", article).hidden = true;
    $(".nb-tools", article).hidden = true;
    article.insertBefore(ed, $(".nb-meta", article) || $(".nb-data", article));
    const title = $(".nb-f-title", ed), body = $(".nb-f-body", ed), extra = $(".nb-ed-extra", ed), kindEl = $(".nb-kind", ed);
    title.value = data.title || ""; body.value = data.body || "";

    function drawExtra(kind) {
      const [t, b] = LABELS[kind] || LABELS.text;
      title.placeholder = t; title.hidden = !t; body.placeholder = b;
      body.classList.toggle("mono", kind === "formula");
      extra.innerHTML = kind === "formula"
        ? `<input class="nb-x-where" placeholder="where: p = power (W), v = voltage (V), i = current (A)"><input class="nb-x-when" placeholder="use when: passive sign convention, i into the + terminal">`
        : kind === "example" ? `<input class="nb-x-answer" placeholder="Answer (optional)">` : "";
      const ex = data.extra || {};
      if ($(".nb-x-where", extra)) { $(".nb-x-where", extra).value = ex.where || ""; $(".nb-x-when", extra).value = ex.when || ""; }
      if ($(".nb-x-answer", extra)) $(".nb-x-answer", extra).value = ex.answer || "";
      $$("input", extra).forEach((i) => i.addEventListener("input", schedule));
    }
    drawExtra(data.kind);
    kindEl?.addEventListener("change", () => { drawExtra(kindEl.value); schedule(); });

    const values = () => {
      const kind = kindEl ? kindEl.value : data.kind;
      const ex = {};
      if ($(".nb-x-where", extra)) { ex.where = $(".nb-x-where", extra).value; ex.when = $(".nb-x-when", extra).value; }
      if ($(".nb-x-answer", extra)) ex.answer = $(".nb-x-answer", extra).value;
      return { kind, title: title.value, body: body.value, extra: ex };
    };
    let timer = null, previewTimer = null, lastSaved = JSON.stringify(values());
    async function save() {
      clearTimeout(timer);
      const v = values(), s = JSON.stringify(v);
      if (s === lastSaved) return null;
      const out = await api(`/notes/blocks/${id}`, "PUT", v);
      lastSaved = s; $(".nb-saved", ed).textContent = "Saved";
      return out;
    }
    function schedule() {
      $(".nb-saved", ed).textContent = "";
      clearTimeout(timer); timer = setTimeout(() => save().catch((e) => { $(".nb-saved", ed).textContent = e.message; }), 1200);
      clearTimeout(previewTimer); previewTimer = setTimeout(preview, 250);
    }
    async function preview() {
      const v = values();
      let text = v.body;
      if (v.kind === "formula" && text && !/\\\(|\$/.test(text)) text = `$$${text}$$`;
      const p = $(".nb-preview", ed);
      if (!text.trim()) { p.innerHTML = ""; return; }
      p.innerHTML = await api("/notes/render", "POST", { text, kind: v.kind }, true);
      math(p);
    }
    [title, body].forEach((el) => el.addEventListener("input", schedule));
    body.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) close(true); if (e.key === "Escape") close(false); });
    title.addEventListener("keydown", (e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") { e.preventDefault(); body.focus(); } });
    async function close(keep) {
      try {
        if (keep) await save();
        const fresh = await api(`/notes/blocks/${id}`, "PUT", {});
        swap(article, fresh.html);
      } catch (e) { $(".nb-saved", ed).textContent = e.message; }
    }
    ed.addEventListener("click", (e) => { const a = e.target.dataset.ed; if (a === "done") close(true); if (a === "cancel") close(false); });
    preview();
    (data.kind === "definition" || data.kind === "example") && !data.title ? title.focus() : body.focus();
  }

  function moveMenu(article) {
    $(".nb-move-menu")?.remove();
    const m = document.createElement("div");
    m.className = "nb-move-menu card";
    m.innerHTML = `<label class="small muted">Move to</label>
      <select class="mm-unit">${TARGETS.map((t) => `<option value="${t.id}" ${t.id === unitId ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select>
      <select class="mm-part">${PARTS.map(([k, n]) => `<option value="${k}" ${k === article.dataset.part ? "selected" : ""}>${n}</option>`).join("")}</select>
      <div class="inline-form" style="margin:6px 0 0"><button type="button" class="small primary mm-go">Move</button><button type="button" class="small mm-x">Cancel</button></div>`;
    article.append(m);
    $(".mm-x", m).onclick = () => m.remove();
    $(".mm-go", m).onclick = () => doMove(article, Number($(".mm-unit", m).value), $(".mm-part", m).value);
  }

  async function doMove(article, toUnit, part, beforeId = null) {
    try {
      const out = await api(`/notes/blocks/${article.dataset.id}/move`, "POST", { unit_id: toUnit, part, before_id: beforeId });
      if (toUnit !== unitId) {
        article.remove(); recount();
        const t = TARGETS.find((x) => x.id === toUnit);
        toast(`Moved to ${t ? t.title : "another unit"}`);
        return;
      }
      const list = partList(part);
      const before = beforeId && list.querySelector(`#b${beforeId}`);
      const fresh = swap(article, out.html);
      before ? list.insertBefore(fresh, before) : list.append(fresh);
      recount();
    } catch (e) { toast(e.message); }
  }

  function undoToast(msg, fn) {
    const el = document.createElement("div");
    el.className = "toast in"; el.setAttribute("role", "status");
    el.innerHTML = `${esc(msg)} <button type="button" class="link" style="color:inherit">Undo</button>`;
    document.body.append(el);
    $("button", el).onclick = async () => { el.remove(); await fn(); };
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 6000);
  }

  function bindBlock(article) {
    article.addEventListener("dblclick", (e) => { if (!e.target.closest("a,button,details summary")) openEditor(article); });
    $$("[data-act]", article).forEach((btn) => btn.addEventListener("click", async () => {
      const act = btn.dataset.act, id = article.dataset.id;
      try {
        if (act === "edit") openEditor(article);
        else if (act === "move") moveMenu(article);
        else if (act === "accept") doMove(article, Number(btn.dataset.unit), btn.dataset.part);
        else if (act === "draft") draftFrom(article, btn);
        else if (act === "star") {
          const on = btn.getAttribute("aria-pressed") !== "true";
          const out = await api(`/notes/blocks/${id}/star`, "POST", { starred: on }, true);
          swap(article, out.html);
          toast(on ? "On the exam formula sheet" : "Off the formula sheet");
        } else if (act === "delete") {
          const list = article.parentElement, next = article.nextElementSibling;
          await api(`/notes/blocks/${id}/delete`);
          article.remove(); recount();
          undoToast("Deleted.", async () => {
            const out = await api(`/notes/blocks/${id}/restore`);
            const tmp = document.createElement("div"); tmp.innerHTML = out.html.trim();
            const fresh = tmp.firstElementChild;
            next && next.parentElement === list ? list.insertBefore(fresh, next) : list.append(fresh);
            bindBlock(fresh); math(fresh); recount();
          });
        }
      } catch (e) { toast(e.message); }
    }));
    article.addEventListener("dragstart", (e) => { article.classList.add("dragging"); e.dataTransfer.setData("text/nb-block", article.dataset.id); e.dataTransfer.effectAllowed = "move"; });
    article.addEventListener("dragend", () => article.classList.remove("dragging"));
  }

  // ---- Qwen drafts notes from a screenshot; you approve each block ----------------------------
  async function draftFrom(article, btn) {
    let panel = $(".nb-drafts", article.parentElement) && article.nextElementSibling?.classList.contains("nb-drafts")
      ? article.nextElementSibling : null;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "nb-drafts";
      article.after(panel);
    }
    btn.disabled = true;
    panel.innerHTML = `<p class="small muted"><span class="spinner"></span> Qwen is reading the screenshot…</p>`;
    let job;
    try { job = await api(`/notes/blocks/${article.dataset.id}/draft`); }
    catch (e) { panel.innerHTML = `<p class="tag warn">${esc(e.message)}</p>`; btn.disabled = false; return; }
    for (;;) {
      if (job.status === "waiting") {
        panel.innerHTML = `<p class="small"><strong>${esc(job.wait_note)}</strong> Waiting for the GPU… <button type="button" class="small" data-x="run">Run anyway</button> <button type="button" class="small" data-x="cancel">Cancel</button></p>`;
        $("[data-x=run]", panel).onclick = () => api(`/local/jobs/${job.id}/run-anyway`);
        $("[data-x=cancel]", panel).onclick = async () => { await api(`/local/jobs/${job.id}/cancel`); panel.remove(); btn.disabled = false; };
      } else if (job.status === "running") {
        panel.innerHTML = `<p class="small muted"><span class="spinner"></span> Qwen is reading the screenshot… (about a minute)</p>`;
      }
      if (["done", "error", "cancelled"].includes(job.status)) break;
      await new Promise((r) => setTimeout(r, 2000));
      job = await api(`/local/jobs/${job.id}`, "GET");
    }
    btn.disabled = false;
    if (job.status !== "done") { panel.innerHTML = job.status === "error" ? `<p class="tag warn">${esc(job.error)}</p>` : ""; return; }
    const drafts = job.result.blocks || [];
    if (!drafts.length) { panel.innerHTML = `<p class="small muted">Qwen couldn't find notes in this screenshot.</p>`; return; }
    const partName = Object.fromEntries(PARTS);
    panel.innerHTML = `<div class="nb-drafts-head"><strong>${drafts.length} draft${drafts.length > 1 ? "s" : ""} from Qwen</strong>
      <span class="small muted">Check each one, then add it. Nothing is saved until you do.</span>
      <button type="button" class="small primary" data-x="all">Add all</button></div>`;
    drafts.forEach((d, i) => {
      const card = document.createElement("div");
      card.className = "nb-draft";
      card.dataset.i = i;
      card.innerHTML = `<div class="nb-draft-top"><span class="kind">${esc(d.kind)}</span>
          <select class="d-unit">${TARGETS.map((t) => `<option value="${t.id}" ${t.id === d.unit_id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select>
          <select class="d-part">${PARTS.map(([k, n]) => `<option value="${k}" ${k === d.part ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        ${d.title ? `<div class="nb-title">${esc(d.title)}</div>` : ""}<div class="nb-preview"></div>
        <div class="nb-ed-actions"><button type="button" class="small" data-x="skip">Skip</button><button type="button" class="small primary" data-x="add">Add</button></div>`;
      panel.append(card);
      const text = d.kind === "formula" && !/\\\(|\$/.test(d.body) ? `$$${d.body}$$` : d.body;
      api("/notes/render", "POST", { text, kind: d.kind }, true).then((h) => { $(".nb-preview", card).innerHTML = h; math(card); });
      card.addEventListener("click", async (e) => {
        const x = e.target.dataset.x;
        if (x === "skip") card.remove();
        if (x === "add") await addDraft(d, card);
        if (!$(".nb-draft", panel)) panel.remove();
      });
    });
    $("[data-x=all]", panel).onclick = async () => {
      for (const card of $$(".nb-draft", panel)) await addDraft(drafts[Number(card.dataset.i)], card);
      panel.remove();
    };
    async function addDraft(d, card) {
      if (!d) return;
      const to = Number($(".d-unit", card).value), part = $(".d-part", card).value;
      const out = await api("/notes/blocks", "POST", { unit_id: to, part, kind: d.kind, title: d.title, body: d.body, extra: d.extra, actor: "local" });
      card.remove();
      if (to === unitId) {
        const list = partList(part);
        const tmp = document.createElement("div"); tmp.innerHTML = out.html.trim();
        const fresh = tmp.firstElementChild; list.append(fresh); bindBlock(fresh); math(fresh); recount();
      } else toast(`Added to ${TARGETS.find((t) => t.id === to)?.title || "another unit"}`);
    }
  }

  // ---- drag and drop between and within parts --------------------------------------------------
  function bindDrop(list) {
    list.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("text/nb-block")) return;
      e.preventDefault();
      list.classList.add("drop-target");
    });
    list.addEventListener("dragleave", () => list.classList.remove("drop-target"));
    list.addEventListener("drop", (e) => {
      const id = e.dataTransfer.getData("text/nb-block");
      list.classList.remove("drop-target");
      if (!id) return;
      e.preventDefault();
      const article = $(`#b${id}`);
      const before = $$(".nblock:not(.dragging)", list).find((b) => e.clientY < b.getBoundingClientRect().top + b.offsetHeight / 2);
      doMove(article, unitId, list.dataset.part, before ? Number(before.dataset.id) : null);
    });
  }

  // ---- adding ----------------------------------------------------------------------------------
  function bindAdd(btn) {
    btn.addEventListener("click", async () => {
      try {
        const out = await api("/notes/blocks", "POST", { unit_id: unitId, part: btn.dataset.part, kind: btn.dataset.kind });
        const list = partList(btn.dataset.part);
        const tmp = document.createElement("div"); tmp.innerHTML = out.html.trim();
        const fresh = tmp.firstElementChild;
        list.append(fresh); bindBlock(fresh); recount();
        fresh.scrollIntoView({ block: "center", behavior: "smooth" });
        openEditor(fresh);
      } catch (e) { toast(e.message); }
    });
  }

  $$(".nblock").forEach(bindBlock);
  $$(".nb-list").forEach(bindDrop);
  $$(".nb-add").forEach(bindAdd);

  // ---- rename the unit -------------------------------------------------------------------------
  const h1 = $(".nb-unit-title");
  h1?.addEventListener("click", () => {
    if (h1.isContentEditable) return;
    const old = h1.textContent;
    h1.contentEditable = "true"; h1.focus();
    document.getSelection().selectAllChildren(h1);
    const finish = async (keep) => {
      h1.contentEditable = "false";
      const title = h1.textContent.trim();
      if (!keep || !title || title === old) { h1.textContent = old; return; }
      try { await api(`/notes/units/${h1.dataset.unit}/rename`, "POST", { title }, true); toast("Renamed"); }
      catch (e) { h1.textContent = old; toast(e.message); }
    };
    h1.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); h1.blur(); } if (e.key === "Escape") { h1.dataset.cancel = "1"; h1.blur(); } };
    h1.onblur = () => { finish(!h1.dataset.cancel); delete h1.dataset.cancel; };
  });

  // ---- search ----------------------------------------------------------------------------------
  const sInput = $("#nb-search"), sOut = $(".nb-results");
  let sTimer = null;
  sInput?.addEventListener("input", () => {
    clearTimeout(sTimer);
    sTimer = setTimeout(async () => {
      const q = sInput.value.trim();
      if (q.length < 2) { sOut.hidden = true; return; }
      const rows = await api(`/notes-search?q=${encodeURIComponent(q)}&course=${course}`, "GET");
      sOut.hidden = false;
      sOut.innerHTML = rows.length ? rows.map((r) => `<a href="${r.url}"><span class="t">${esc(r.title)}</span><span class="m">${esc(r.unit)} · ${esc(r.part)}</span></a>`).join("")
        : `<p class="small muted">Nothing found.</p>`;
      math(sOut);
    }, 220);
  });

  // ---- screenshots: pick, paste or drop ----------------------------------------------------------
  async function addImage(file) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const f = new FormData();
      f.append("unit_id", unitId); f.append("part", "ideas"); f.append("file", file, file.name || "screenshot.png");
      const res = await fetch("/notes/assets", { method: "POST", body: f });
      if (!res.ok) throw new Error((await res.json()).detail || res.status);
      const out = await res.json();
      const list = partList("ideas");
      const tmp = document.createElement("div"); tmp.innerHTML = out.html.trim();
      const fresh = tmp.firstElementChild;
      list.append(fresh); bindBlock(fresh); recount();
      fresh.scrollIntoView({ block: "center", behavior: "smooth" });
      window.dispatchEvent(new CustomEvent("nb-image-added", { detail: { block: out, article: fresh } }));
      toast("Screenshot added to Key ideas");
    } catch (e) { toast(String(e.message || e)); }
  }
  $("#nb-file")?.addEventListener("change", (e) => { addImage(e.target.files[0]); e.target.value = ""; });
  document.addEventListener("paste", (e) => {
    if (e.target.closest("textarea,input,[contenteditable=true]")) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); addImage(item.getAsFile()); }
  });
  document.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); $(".nb-drop").hidden = false; } });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $(".nb-drop").hidden = true; });
  document.addEventListener("drop", (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); $(".nb-drop").hidden = true;
    addImage(e.dataTransfer.files[0]);
  });

  // ---- arriving at #b123: show it ----------------------------------------------------------------
  const hit = location.hash.startsWith("#b") && $(location.hash);
  if (hit) { hit.classList.add("flash"); setTimeout(() => hit.classList.remove("flash"), 2200); }
})();
