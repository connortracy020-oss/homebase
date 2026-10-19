// Video page: YouTube player, clickable chapters, notes pinned to times,
// and remembering where you stopped.
(function () {
  const app = document.getElementById("video-app");
  if (!app) return;
  const slug = app.dataset.slug;
  const ytId = app.dataset.yt;
  let player = null;
  let pinnedAt = null; // video time when you started typing a note

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
  };
  const now = () => (player && player.getCurrentTime ? player.getCurrentTime() : 0);
  const seek = (t) => { if (player && player.seekTo) { player.seekTo(t, true); player.playVideo(); } };

  // ---- player ----
  if (ytId) {
    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player("player", {
        host: "https://www.youtube-nocookie.com",
        videoId: ytId,
        playerVars: { start: Number(app.dataset.start) || 0, rel: 0, modestbranding: 1 },
      });
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  // save the position every 10 s while playing
  let lastSaved = -1;
  setInterval(() => {
    if (!player || !player.getPlayerState || player.getPlayerState() !== 1) return;
    const t = Math.floor(now());
    if (Math.abs(t - lastSaved) < 5) return;
    lastSaved = t;
    fetch(`/api/videos/${slug}/position`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds: t }),
    }).catch(() => {});
  }, 10000);

  // ---- chapters ----
  const chapterButtons = [...document.querySelectorAll(".chapter")];
  chapterButtons.forEach((b) => b.addEventListener("click", () => seek(Number(b.dataset.t))));
  const timeOut = document.getElementById("note-time");
  setInterval(() => {
    const t = now();
    timeOut.textContent = fmt(pinnedAt ?? t);
    let current = null;
    for (const b of chapterButtons) if (Number(b.dataset.t) <= t) current = b;
    chapterButtons.forEach((b) => b.classList.toggle("current", b === current));
  }, 1000);

  // ---- watched ----
  const watched = document.getElementById("watched");
  watched.addEventListener("change", async () => {
    const body = new FormData();
    if (watched.checked) body.append("watched", "on");
    const res = await fetch(`/video/${slug}/watched`, { method: "POST", body, headers: { "x-requested-with": "fetch" } });
    if (!res.ok) { watched.checked = !watched.checked; alert("Couldn't save that."); }
  });

  // ---- notes ----
  const list = document.getElementById("note-list");
  const empty = document.getElementById("notes-empty");
  let notes = JSON.parse(document.getElementById("notes-data").textContent);

  function draw() {
    notes.sort((a, b) => (a.t_sec ?? 1e9) - (b.t_sec ?? 1e9));
    list.innerHTML = "";
    empty.hidden = notes.length > 0;
    for (const n of notes) {
      const li = document.createElement("li");
      li.className = "note";
      const time = document.createElement(n.t_sec == null ? "span" : "button");
      time.className = "t";
      time.textContent = n.t_sec == null ? "·" : fmt(n.t_sec);
      if (n.t_sec != null) { time.type = "button"; time.title = "Jump here"; time.onclick = () => seek(n.t_sec); }
      const body = document.createElement("div");
      body.className = "note-body";
      body.textContent = n.body; // plain text; math is rendered below
      const tools = document.createElement("span");
      tools.className = "note-tools";
      const edit = Object.assign(document.createElement("button"), { type: "button", className: "link small", textContent: "edit" });
      const del = Object.assign(document.createElement("button"), { type: "button", className: "link small", textContent: "delete" });
      edit.onclick = async () => {
        const text = prompt("Edit note", n.body);
        if (text == null || !text.trim()) return;
        const res = await fetch(`/api/notes/${n.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) });
        if (res.ok) { n.body = (await res.json()).body; draw(); }
      };
      del.onclick = async () => {
        if (!confirm("Delete this note?")) return;
        const res = await fetch(`/api/notes/${n.id}`, { method: "DELETE" });
        if (res.ok) { notes = notes.filter((x) => x.id !== n.id); draw(); }
      };
      tools.append(edit, del);
      li.append(time, body, tools);
      list.append(li);
    }
    if (window.renderMath) window.renderMath(list);
  }
  draw();

  const form = document.getElementById("note-form");
  const textarea = document.getElementById("note-body");
  textarea.addEventListener("focus", () => { if (pinnedAt == null) pinnedAt = Math.floor(now()); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    const pin = document.getElementById("note-pin").checked;
    const t = pin ? (pinnedAt ?? Math.floor(now())) : null;
    const res = await fetch(`/api/videos/${slug}/notes`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, t_sec: t }),
    });
    if (!res.ok) { alert("Couldn't save the note."); return; }
    notes.push(await res.json());
    textarea.value = "";
    pinnedAt = null;
    draw();
  });
  // Ctrl/Cmd+Enter saves
  textarea.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
})();
