// Read aloud: the page as an image, each sentence's boxes on top, the one being
// spoken highlighted. Speech comes from Chatterbox through /speech/say (cached by
// text, so replays are instant); the next two sentences are prepared while one plays.

(function () {
  const root = document.getElementById("reader");
  if (!root) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const slug = root.dataset.slug, resId = root.dataset.res, pages = Number(root.dataset.pages);
  const view = $("#listen-view"), pdfView = $("#pdf-view");
  const statusEl = $(".listen-status", view), nowEl = $(".listen-now", view);
  const img = $(".listen-sheet img", view), boxes = $(".listen-boxes", view), audio = $("audio", view);
  const playBtn = $("[data-act=play]", view), pageInput = $("[data-act=page]", view);
  const KEY = "homebase.readaloud";
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

  let page = 0, data = null, cur = 0, playing = false, token = 0, force = false;
  const ready = new Map(); // spoken text -> Promise<url>
  const saved = JSON.parse(root.dataset.saved || "null");
  const opts = { headers: 1, footnotes: 1, captions: 1, refs: 1, math: 1, ...(prefs.opts || {}) };
  let speed = prefs.speed || 1, follow = prefs.follow !== false;

  // ---- modes ---------------------------------------------------------------------------
  function setMode(mode) {
    $$(".reader-modes a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.mode === mode));
    $$(".reader-modes a").forEach((a) => { if (a.dataset.mode === mode) a.setAttribute("aria-current", "page"); });
    view.hidden = mode !== "listen";
    pdfView.hidden = mode === "listen";
    prefs.mode = mode; savePrefs();
    if (mode === "listen" && !data) openPage(saved && saved.page ? saved.page : Number(root.dataset.start), saved ? saved.i : 0);
    if (mode !== "listen") pause();
  }
  $$(".reader-modes a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); setMode(a.dataset.mode); }));

  // ---- pages -----------------------------------------------------------------------------
  const q = () => Object.entries(opts).map(([k, v]) => `${k}=${v ? 1 : 0}`).join("&");
  async function openPage(p, at = 0, keepPlaying = false) {
    p = Math.max(1, Math.min(pages, p));
    const my = ++token;
    page = p; pageInput.value = p;
    status(`Loading page ${p}…`);
    const res = await fetch(`/speech/doc/${resId}/page/${p}.json?${q()}`);
    if (my !== token) return;
    if (!res.ok) { status("Couldn't read this page's text."); return; }
    data = await res.json();
    img.src = `/speech/doc/${resId}/page/${p}.png`;
    drawBoxes();
    cur = Math.max(0, Math.min(at, data.sentences.length - 1));
    status(data.sentences.length ? "" : "No readable text on this page (it may be a figure or a scan).");
    highlight();
    if (keepPlaying) {
      if (data.sentences.length) speakCurrent();
      else openPage(p + 1, 0, true);  // skip empty pages while playing
    }
  }
  function drawBoxes() {
    boxes.innerHTML = "";
    for (const s of data.sentences) {
      for (const [x0, y0, x1, y1] of s.boxes) {
        const b = document.createElement("span");
        b.className = "lbox"; b.dataset.i = s.i;
        Object.assign(b.style, { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` });
        b.title = "Read from here";
        boxes.append(b);
      }
    }
  }
  function highlight() {
    $$(".lbox", boxes).forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === cur));
    const s = data && data.sentences[cur];
    nowEl.textContent = s ? s.text : "";
    if (s && follow) {
      const first = $(`.lbox[data-i="${cur}"]`, boxes);
      first && first.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
  boxes.addEventListener("click", (e) => {
    const b = e.target.closest(".lbox");
    if (!b) return;
    cur = Number(b.dataset.i); highlight();
    play();
  });

  // ---- speech --------------------------------------------------------------------------------
  function status(msg, busy = false) {
    statusEl.innerHTML = msg ? `<span>${msg}</span>${busy ? ' <button type="button" class="small" data-act="force">Try anyway</button>' : ""}` : "";
    const f = $("[data-act=force]", statusEl);
    if (f) f.onclick = () => { force = true; ready.clear(); play(); };
  }
  function speechUrl(text) {
    if (ready.has(text)) return ready.get(text);
    const p = fetch("/speech/say", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, force }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(d.detail || `HTTP ${r.status}`); e.busy = !!d.busy; throw e; }
        return d.url;
      });
    p.catch(() => ready.delete(text));
    ready.set(text, p);
    return p;
  }
  function prefetch() {
    // the next two sentences (and the first of the next page) while this one plays
    const next = data.sentences.slice(cur + 1, cur + 3);
    next.reduce((chain, s) => chain.then(() => speechUrl(s.spoken).catch(() => {})), Promise.resolve());
  }
  let firstStart = true;
  async function speakCurrent() {
    const s = data.sentences[cur];
    if (!s) return;
    const my = token;
    playing = true; playBtn.textContent = "❚❚ Pause";
    const wait = setTimeout(() => status(firstStart ? "Starting the Chatterbox voice… (about half a minute the first time)" : "Preparing…"), 400);
    let url;
    try { url = await speechUrl(s.spoken); }
    catch (e) {
      clearTimeout(wait);
      if (my === token) { pause(); status(e.message, e.busy); }
      return;
    }
    clearTimeout(wait);
    if (!playing || my !== token || data.sentences[cur] !== s) return;
    firstStart = false; status("");
    audio.src = url; audio.playbackRate = speed; audio.preservesPitch = true;
    try { await audio.play(); } catch { pause(); return; }
    prefetch();
    savePosition();
  }
  audio.addEventListener("ended", () => {
    if (!playing) return;
    if (cur + 1 < data.sentences.length) { cur++; highlight(); speakCurrent(); }
    else if (page < pages) openPage(page + 1, 0, true);
    else { pause(); status("End of the document."); }
  });
  function play() { playing = true; speakCurrent(); }
  function pause() { playing = false; audio.pause(); playBtn.textContent = "▶ Play"; savePosition(); }
  function step(d) {
    if (!data) return;
    const n = cur + d;
    if (n < 0) { if (page > 1) openPage(page - 1, 9999, playing); return; }
    if (n >= data.sentences.length) { if (page < pages) openPage(page + 1, 0, playing); return; }
    cur = n; highlight();
    audio.pause();
    if (playing) speakCurrent();
  }

  let posTimer = null;
  function savePosition() {
    clearTimeout(posTimer);
    posTimer = setTimeout(() => fetch(`/reading/${slug}/position`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page, i: cur }) }).catch(() => {}), 800);
  }

  // ---- controls ------------------------------------------------------------------------------
  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  $("[data-act=prev]", view).addEventListener("click", () => step(-1));
  $("[data-act=next]", view).addEventListener("click", () => step(1));
  $("[data-act=pgprev]", view).addEventListener("click", () => { audio.pause(); openPage(page - 1, 0, playing); });
  $("[data-act=pgnext]", view).addEventListener("click", () => { audio.pause(); openPage(page + 1, 0, playing); });
  pageInput.addEventListener("change", () => { audio.pause(); openPage(Number(pageInput.value), 0, playing); });
  const speedSel = $("[data-act=speed]", view);
  speedSel.value = String(speed);
  speedSel.addEventListener("change", () => { speed = Number(speedSel.value); audio.playbackRate = speed; prefs.speed = speed; savePrefs(); });
  const followBox = $("[data-act=follow]", view);
  followBox.checked = follow;
  followBox.addEventListener("change", () => { follow = followBox.checked; prefs.follow = follow; savePrefs(); });
  $$("[data-opt]", view).forEach((box) => {
    box.checked = !!opts[box.dataset.opt];
    box.addEventListener("change", () => {
      opts[box.dataset.opt] = box.checked ? 1 : 0; prefs.opts = opts; savePrefs();
      audio.pause(); openPage(page, 0, playing);
    });
  });
  $("[data-act=stopvoice]", view).addEventListener("click", async () => {
    pause(); await fetch("/speech/stop", { method: "POST" }); firstStart = true; status("Voice stopped. The GPU is free.");
  });
  // full screen: the page fills the screen, controls stay on top (F or Esc)
  const fullBtn = $("[data-act=full]", view);
  const isFull = () => document.fullscreenElement === view || view.classList.contains("pseudo-full");
  function showFull() {
    const on = isFull();
    fullBtn.textContent = on ? "✕" : "⛶";
    fullBtn.title = on ? "Exit full screen (Esc)" : "Full screen (F)";
    document.body.style.overflow = view.classList.contains("pseudo-full") ? "hidden" : "";
    setTimeout(highlight, 150);
  }
  function toggleFull() {
    if (view.classList.contains("pseudo-full")) { view.classList.remove("pseudo-full"); showFull(); return; }
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    // real full screen where the browser allows it; otherwise fill the window
    const fallback = () => { if (document.fullscreenElement !== view) { view.classList.add("pseudo-full"); showFull(); } };
    try { view.requestFullscreen().catch(fallback); } catch { fallback(); }
    setTimeout(fallback, 500);
  }
  fullBtn.addEventListener("click", toggleFull);
  document.addEventListener("fullscreenchange", showFull);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && view.classList.contains("pseudo-full")) toggleFull(); });
  document.addEventListener("keydown", (e) => {
    if (view.hidden || e.target.closest("input, textarea, select")) return;
    if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFull(); return; }
    if (e.key === " ") { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "PageDown") { e.preventDefault(); audio.pause(); openPage(page + 1, 0, playing); }
    else if (e.key === "PageUp") { e.preventDefault(); audio.pause(); openPage(page - 1, 0, playing); }
  });
  addEventListener("pagehide", () => pause());

  if (root.dataset.voice !== "1") {
    const tab = $('.reader-modes a[data-mode="listen"]');
    if (tab) { tab.title = "Lecture Desk's Chatterbox voice isn't on this laptop"; }
  }
  if (prefs.mode === "listen") setMode("listen");
})();
