// Small helpers. Every form still works if this file fails to load.

// Light / dark. base.html picks the starting theme; the moon/sun key flips it
// and remembers your choice. Settings can go back to following the device.
(function theme() {
  const root = document.documentElement;
  const KEY = "homebase.theme";
  const meta = document.querySelector('meta[name="theme-color"]');
  const sun = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  const moon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  function apply(mode) {
    root.dataset.theme = mode;
    if (meta) meta.content = mode === "dark" ? "#1a1916" : "#f2ece0";
    document.querySelectorAll(".theme-toggle").forEach((b) => { b.innerHTML = mode === "dark" ? sun : moon; });
    window.dispatchEvent(new CustomEvent("homebase-theme", { detail: mode }));
  }
  window.homebaseTheme = {
    set(mode) {  // "light", "dark" or "device"
      try { mode === "device" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch {}
      apply(mode === "device" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode);
    },
    saved,
  };
  apply(root.dataset.theme || "light");
  document.querySelectorAll(".theme-toggle").forEach((b) => b.addEventListener("click", () => {
    homebaseTheme.set(root.dataset.theme === "dark" ? "light" : "dark");
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!saved()) apply(e.matches ? "dark" : "light");
  });
})();

// Snap my work / Upload: send as soon as a photo is chosen (no separate Submit step).
document.querySelectorAll("input.auto-submit").forEach((inp) => inp.addEventListener("change", () => {
  if (!inp.files.length) return;
  const form = inp.form;
  form.querySelectorAll("input.auto-submit").forEach((o) => { if (o !== inp) o.disabled = true; });
  form.classList.add("is-sending");
  const sending = form.parentElement.querySelector(".sending");
  if (sending) sending.hidden = false;
  form.submit();
}));

// Toasts: a small note at the bottom that fades out. window.toast("Logged 25 min").
// A toast set just before a page reload survives it (sessionStorage).
window.toast = function (msg, later) {
  if (later) { try { sessionStorage.setItem("homebase.toast", msg); } catch {} return; }
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 2600);
};
try {
  const pending = sessionStorage.getItem("homebase.toast");
  if (pending) { sessionStorage.removeItem("homebase.toast"); addEventListener("load", () => toast(pending)); }
} catch {}

// PDF crops shimmer softly until they've loaded.
document.querySelectorAll("img.pdf-crop").forEach((img) => {
  if (img.complete) return;
  img.classList.add("loading");
  const done = () => img.classList.remove("loading");
  img.addEventListener("load", done); img.addEventListener("error", done);
});

// Phone "More" sheet: close it when you tap anywhere else.
document.addEventListener("click", (e) => {
  document.querySelectorAll("details.tab-more[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

// Tick a checkbox -> save it right away, no page reload.
document.querySelectorAll("form.toggle input[type=checkbox]").forEach((box) => {
  box.addEventListener("change", async () => {
    const form = box.closest("form");
    const row = box.closest(".task");
    const body = new FormData();
    if (box.checked) body.append("done", "on");
    try {
      const res = await fetch(form.action, {
        method: "POST", body, headers: { "x-requested-with": "fetch" },
      });
      if (!res.ok) throw new Error(res.status);
      row?.classList.toggle("done", box.checked);
      if (box.checked) toast("Ticked off. Nice.");
    } catch (err) {
      box.checked = !box.checked; // put it back; the save failed
      alert("Couldn't save that. Is Homebase still running?");
    }
  });
});

// Study timer. The start time lives in localStorage, so the timer survives
// closing the tab or the phone going to sleep.
(function timer() {
  const card = document.getElementById("timer");
  if (!card) return;
  const clock = document.getElementById("timer-clock");
  const button = document.getElementById("timer-toggle");
  const course = document.getElementById("timer-course");
  const status = document.getElementById("timer-status");
  const KEY = "homebase.timer";

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };

  function show() {
    const t = load();
    card.classList.toggle("running", !!t);
    button.textContent = t ? "Stop & log" : "Start";
    course.disabled = !!t;
    if (!t) { clock.textContent = "0:00"; return; }
    course.value = t.course;
    const secs = Math.floor((Date.now() - t.start) / 1000);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    clock.textContent = h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                          : `${m}:${String(s).padStart(2, "0")}`;
  }

  button.addEventListener("click", async () => {
    const t = load();
    if (!t) { save({ start: Date.now(), course: course.value }); show(); return; }
    const minutes = Math.round((Date.now() - t.start) / 60000);
    if (minutes < 1) { save(null); show(); status.textContent = "Under a minute, so nothing was logged."; return; }
    const body = new FormData();
    body.append("course", t.course);
    body.append("minutes", Math.min(minutes, 720));
    body.append("source", "timer");
    try {
      const res = await fetch("/study", { method: "POST", body, headers: { "x-requested-with": "fetch" } });
      if (!res.ok) throw new Error(res.status);
      save(null);
      const name = course.querySelector(`option[value="${t.course}"]`)?.textContent || t.course;
      toast(`Logged ${Math.min(minutes, 720)} min of ${name}`, true);
      location.reload();
    } catch {
      status.textContent = "Couldn't save the time. The timer is still running; try again.";
    }
  });

  show();
  setInterval(show, 1000);
})();
