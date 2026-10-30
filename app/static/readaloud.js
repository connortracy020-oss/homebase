// Read aloud: the page as an image, each sentence's boxes on top, the one being
// spoken highlighted. Speech comes from Chatterbox through /speech/say (cached by
// text, so replays are instant). Chatterbox makes speech a little slower than it plays, so while
// you listen the next ~2 minutes of sentences are kept in preparation (across page ends too), and
// "Prepare the next 10 pages now" gets pages ready before you start.

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
  const ready = new Map(); // spoken text -> { promise, prio, ok }
  // "epoch" names your place in the reading. It changes whenever you jump (click a sentence, skip,
  // change page), so the server can drop look-ahead it queued for the place you left.
  let epoch = Date.now();
  const newPlace = () => { epoch = Math.max(epoch + 1, Date.now()); };
  const LOOKAHEAD_SECONDS = 120, CHARS_PER_SECOND = 17; // about how much speech a character makes
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
  const pageCache = new Map(); // "page|options" -> Promise<page data or null>
  async function pageSentences(p) {
    const key = `${p}|${q()}`;
    if (!pageCache.has(key)) {
      pageCache.set(key, fetch(`/speech/doc/${resId}/page/${p}.json?${q()}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    const d = await pageCache.get(key);
    if (!d) pageCache.delete(key);
    return d;
  }
  // natural = the voice reached the end of a page by itself (not you jumping somewhere)
  async function openPage(p, at = 0, keepPlaying = false, natural = false) {
    p = Math.max(1, Math.min(pages, p));
    const my = ++token;
    if (!natural) newPlace();
    page = p; pageInput.value = p;
    status(`Loading page ${p}…`);
    const d = await pageSentences(p);
    if (my !== token) return;
    if (!d) { status("Couldn't read this page's text."); return; }
    data = d;
    img.src = `/speech/doc/${resId}/page/${p}.png`;
    drawBoxes();
    cur = Math.max(0, Math.min(at, data.sentences.length - 1));
    status(data.sentences.length ? "" : "No readable text on this page (it may be a figure or a scan).");
    highlight();
    if (keepPlaying) {
      if (data.sentences.length) speakCurrent();
      else openPage(p + 1, 0, true, true);  // skip empty pages while playing
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
    newPlace();
    cur = Number(b.dataset.i); highlight();
    play();
  });

  // ---- speech --------------------------------------------------------------------------------
  function status(msg, busy = false, retry = false) {
    statusEl.innerHTML = msg ? `<span>${msg}</span>${busy ? ' <button type="button" class="small" data-act="force">Try anyway</button>' : ""}`
      + `${retry ? ' <button type="button" class="small" data-act="chatterbox">Try Chatterbox again</button>' : ""}` : "";
    const f = $("[data-act=force]", statusEl);
    if (f) f.onclick = () => { force = true; backup = false; ready.clear(); stopSound(); play(); };
    const c = $("[data-act=chatterbox]", statusEl);
    if (c) c.onclick = () => { backup = false; firstStart = true; ready.clear(); stopSound(); play(); };
  }

  // ---- the backup voice ------------------------------------------------------------------------
  // When Chatterbox can't run (its NVIDIA GPU is switched off, another app has it, or it isn't on
  // this laptop), reading carries on in the browser's own voice: a natural one when Edge has it
  // (online), else Windows' built-in one. It stays on for this visit; "Try Chatterbox again" goes back.
  const synth = window.speechSynthesis || null;
  let backup = !!synth && root.dataset.voice !== "1", backupVoice = null, utter = null;
  function pickVoice() {
    const score = (v) => (/natural/i.test(v.name) ? 8 : 0) + (/online/i.test(v.name) ? 4 : 0) + (/^en-US/i.test(v.lang) ? 2 : 0)
      + (/aria|jenny|ava|andrew|emma|guy/i.test(v.name) ? 1 : 0);
    const voices = synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
    return voices.sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (synth) synth.addEventListener("voiceschanged", () => { backupVoice = pickVoice(); });
  const backupName = () => { const v = backupVoice || pickVoice(); return v ? v.name.replace(/^Microsoft\s+/, "").replace(/\s*-.*$/, "") : "browser"; };
  function stopSound() {
    audio.pause();
    if (synth) { utter = null; synth.cancel(); }
  }
  function speakBackup(s, my) {
    backupVoice = backupVoice || pickVoice();
    const u = utter = new SpeechSynthesisUtterance(s.spoken);
    if (backupVoice) { u.voice = backupVoice; u.lang = backupVoice.lang; }
    u.rate = speed;
    u.onend = () => { if (utter === u && playing && my === token) advance(); };
    u.onerror = (e) => {
      if (utter !== u || e.error === "interrupted" || e.error === "canceled") return;
      pause(); status(`The backup voice couldn't read this either (${e.error}).`);
    };
    synth.cancel();
    synth.speak(u);
    savePosition();
  }
  // prio 0 = needed now, 1 = look-ahead. A look-ahead that's still waiting its turn gets a second,
  // urgent request when it becomes the sentence to play (the server won't speak it twice).
  function speechUrl(text, prio = 1) {
    const have = ready.get(text);
    if (have && (have.ok || prio >= have.prio)) return have.promise;
    const entry = { prio, ok: false };
    entry.promise = fetch("/speech/say", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, force, priority: prio, epoch }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(d.detail || `HTTP ${r.status}`); e.busy = !!d.busy; e.stale = !!d.stale; throw e; }
        entry.ok = true;
        return d.url;
      });
    entry.promise.catch(() => { if (ready.get(text) === entry) ready.delete(text); });
    ready.set(text, entry);
    return entry.promise;
  }
  // the sentences after the current one, running on into the next pages
  async function* upcoming() {
    let p = page, i = cur + 1, d = data;
    while (d) {
      while (i < d.sentences.length) yield d.sentences[i++];
      if (p >= pages) return;
      p++; i = 0; d = await pageSentences(p);
    }
  }
  // Keep about LOOKAHEAD_SECONDS of upcoming speech prepared, one sentence at a time and in order.
  let pumping = false, pumpAgain = false;
  async function pump() {
    if (!playing || backup) return;
    if (pumping) { pumpAgain = true; return; }
    pumping = true;
    const my = epoch;
    try {
      let seconds = 0;
      for await (const s of upcoming()) {
        if (!playing || my !== epoch) break;
        seconds += s.spoken.length / CHARS_PER_SECOND / speed;
        if (seconds > LOOKAHEAD_SECONDS) break;
        try { await speechUrl(s.spoken, 1); } catch (e) { if (!e.stale) break; }
      }
    } catch { /* the sentence being played reports any problem */ }
    pumping = false;
    if (pumpAgain) { pumpAgain = false; pump(); }
  }
  let firstStart = true;
  async function speakCurrent() {
    const s = data.sentences[cur];
    if (!s) return;
    const my = token;
    playing = true; playBtn.textContent = "❚❚ Pause";
    if (backup) { speakBackup(s, my); return; }
    const urgent = speechUrl(s.spoken, 0); // asked first, so the look-ahead below waits behind it
    pump();
    const wait = setTimeout(() => status(firstStart ? "Starting the Chatterbox voice… (about half a minute the first time)" : "Preparing…"), 400);
    let url;
    try { url = await urgent; }
    catch (e) {
      clearTimeout(wait);
      if (my !== token || e.stale) return;
      if (!synth) { pause(); status(e.message, e.busy); return; }
      backup = true;  // never leave you without a voice
      status(`${e.message} Reading with the ${backupName()} voice instead.`, e.busy, !e.busy);
      if (playing && data.sentences[cur] === s) speakBackup(s, my);
      return;
    }
    clearTimeout(wait);
    if (!playing || my !== token || data.sentences[cur] !== s) return;
    firstStart = false; status("");
    audio.src = url; audio.playbackRate = speed; audio.preservesPitch = true;
    try { await audio.play(); } catch { pause(); return; }
    pump();
    savePosition();
  }
  function advance() {
    if (cur + 1 < data.sentences.length) { cur++; highlight(); speakCurrent(); }
    else if (page < pages) openPage(page + 1, 0, true, true);
    else { pause(); status("End of the document."); }
  }
  audio.addEventListener("ended", () => { if (playing) advance(); });
  function play() { playing = true; speakCurrent(); }
  function pause() { playing = false; stopSound(); playBtn.textContent = "▶ Play"; savePosition(); }
  function step(d) {
    if (!data) return;
    const n = cur + d;
    if (n < 0) { if (page > 1) openPage(page - 1, 9999, playing); return; }
    if (n >= data.sentences.length) { if (page < pages) openPage(page + 1, 0, playing); return; }
    newPlace();
    cur = n; highlight();
    stopSound();
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
  $("[data-act=pgprev]", view).addEventListener("click", () => { stopSound(); openPage(page - 1, 0, playing); });
  $("[data-act=pgnext]", view).addEventListener("click", () => { stopSound(); openPage(page + 1, 0, playing); });
  pageInput.addEventListener("change", () => { stopSound(); openPage(Number(pageInput.value), 0, playing); });
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
      stopSound(); openPage(page, 0, playing);
    });
  });
  // ---- prepare pages ahead of time (so playing them has no waiting at all) ---------------------
  const prepBtn = $("[data-act=prepare]", view), prepEl = $(".listen-prep", view);
  function showPrep(r) {
    const mine = r.res_id === Number(resId);
    const running = r.running && mine;
    prepBtn.textContent = running ? "Stop preparing" : "Prepare the next 10 pages now";
    prepEl.textContent = !mine || (!r.running && !r.total && !r.message) ? ""
      : r.message ? r.message
      : r.running ? `Preparing pages ${r.first}–${r.last}: on page ${r.page}, ${r.done} sentences done…`
      : r.stop ? `Stopped after ${r.done} sentences. Those are ready to play.`
      : `Pages ${r.first}–${r.last} are ready to play.`;
    if (running) setTimeout(prepPoll, 3000);
  }
  async function prepPoll() {
    const r = await fetch("/speech/prepare").then((x) => x.json()).catch(() => null);
    if (r) showPrep(r);
  }
  prepBtn.addEventListener("click", async () => {
    if (prepBtn.textContent === "Stop preparing") {
      await fetch("/speech/prepare-stop", { method: "POST" });
    } else {
      const res = await fetch(`/speech/prepare/${resId}`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ first_page: page, pages: 10, opts }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); prepEl.textContent = d.detail || "Couldn't start preparing."; return; }
    }
    prepPoll();
  });
  prepPoll();
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
    else if (e.key === "PageDown") { e.preventDefault(); stopSound(); openPage(page + 1, 0, playing); }
    else if (e.key === "PageUp") { e.preventDefault(); stopSound(); openPage(page - 1, 0, playing); }
  });
  addEventListener("pagehide", () => pause());

  if (root.dataset.voice !== "1") {
    const tab = $('.reader-modes a[data-mode="listen"]');
    if (tab) { tab.title = "Lecture Desk's Chatterbox voice isn't on this laptop"; }
  }
  if (prefs.mode === "listen") setMode("listen");
})();
