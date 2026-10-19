// Small helpers. Every form still works if this file fails to load.

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
      location.reload();
    } catch {
      status.textContent = "Couldn't save the time. The timer is still running; try again.";
    }
  });

  show();
  setInterval(show, 1000);
})();
