// Local AI on the problem and submission pages: Ask, "Check my final answer",
// Snap my work, and the quick-check progress card. The server runs one job at a
// time (app/local_ai.py); this file posts a job and polls it until it's done.

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // the same tiny markdown as the server's mdlite: paragraphs, "- " bullets, **bold**
  function md(text) {
    return esc(text).trim().split(/\n\s*\n/).map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) return "<ul>" + lines.map((l) => `<li>${l.replace(/^\s*[-*] /, "")}</li>`).join("") + "</ul>";
      return `<p>${lines.join("<br>")}</p>`;
    }).join("").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  const math = (el) => { try { window.renderMath && window.renderMath(el); } catch {} };

  async function post(url, data) {
    const body = new FormData();
    Object.entries(data || {}).forEach(([k, v]) => body.append(k, v));
    const res = await fetch(url, { method: "POST", body, headers: { "x-requested-with": "fetch" } });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  // Poll a job until it finishes. onUpdate gets the job view each time.
  function poll(id, onUpdate) {
    let stopped = false;
    (async function loop() {
      while (!stopped) {
        let job;
        try { job = await (await fetch(`/local/jobs/${id}`)).json(); }
        catch { await new Promise((r) => setTimeout(r, 3000)); continue; }
        onUpdate(job);
        if (["done", "error", "cancelled"].includes(job.status)) return;
        await new Promise((r) => setTimeout(r, job.status === "running" ? 700 : 2500));
      }
    })();
    return () => { stopped = true; };
  }

  // "Another app is using the local AI" box with Run anyway / Cancel
  function busyBox(box, job) {
    if (!box) return;
    const waiting = job.status === "waiting";
    box.hidden = !waiting;
    if (!waiting) return;
    $(".busy-note", box).innerHTML = `<strong>${esc(job.wait_note)}</strong> Yours is next and will start when it's done. ` +
      `"Run anyway" pushes that model off the GPU, so only use it if the other app is idle.`;
    box.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = async () => { b.disabled = true; try { await post(`/local/jobs/${job.id}/${b.dataset.act}`); } catch {} b.disabled = false; };
    });
  }

  const statusText = (job) => job.status === "running" ? "Thinking…" :
    job.status === "waiting" ? "Waiting for the GPU…" :
    job.position > 1 ? `In line (${job.position - 1} ahead)…` : "Starting…";

  // ---- Ask ------------------------------------------------------------------------------
  const panel = $("#ask");
  if (panel && panel.dataset.ready === "1") {
    const slug = panel.dataset.slug;
    const log = $(".ask-log", panel);
    const busy = $(".ask-busy", panel);
    const input = $(".composer input", panel);
    const revealKey = `homebase.revealed.${slug}`;
    let revealed = false;
    try { revealed = sessionStorage.getItem(revealKey) === "1"; } catch {}

    function setRevealed(on) {
      revealed = on;
      try { on && sessionStorage.setItem(revealKey, "1"); } catch {}
      panel.querySelectorAll(".needs-reveal").forEach((b) => {
        b.disabled = !on;
        b.title = on ? "" : "Reveal the solution first";
      });
    }
    setRevealed(revealed);
    document.querySelectorAll("details.solution").forEach((d) => d.addEventListener("toggle", () => d.open && setRevealed(true)));

    function follow(bubble, id) {
      const body = $(".msg-body", bubble);
      poll(id, (job) => {
        busyBox(busy, job);
        if (job.status === "done") {
          bubble.classList.remove("pending");
          body.innerHTML = md(job.text); math(body);
        } else if (job.status === "error" || job.status === "cancelled") {
          bubble.classList.remove("pending"); bubble.classList.add("err");
          body.textContent = job.status === "cancelled" ? "Cancelled." : job.error;
        } else {
          body.innerHTML = job.text ? md(job.text) : `<span class="spinner"></span> ${esc(statusText(job))}`;
        }
        log.scrollTop = log.scrollHeight;
      });
    }

    async function ask(question, mode) {
      if (!question.trim()) return;
      const me = document.createElement("p");
      me.className = "msg me"; me.textContent = question;
      const ai = document.createElement("div");
      ai.className = "msg ai pending";
      ai.innerHTML = `<span class="who">${esc(mode)}</span><div class="msg-body"><span class="spinner"></span> Starting…</div>`;
      log.append(me, ai);
      log.scrollTop = log.scrollHeight;
      try {
        const job = await post(`/problem/${slug}/ask`, { question, mode });
        follow(ai, job.id);
      } catch (e) {
        ai.classList.remove("pending"); ai.classList.add("err");
        $(".msg-body", ai).textContent = e.message;
      }
    }

    $(".composer", panel).addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value; input.value = "";
      ask(q, revealed ? "explain" : "hint");
    });
    panel.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q, b.dataset.mode)));
    panel.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
      const target = document.getElementById(b.dataset.goto);
      document.body.classList.remove("ask-open");
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.querySelector("input")?.focus({ preventScroll: true }); }
    }));
    log.querySelectorAll(".msg.pending[data-job]").forEach((b) => follow(b, b.dataset.job));
    log.querySelectorAll(".msg-body").forEach(math);
    log.scrollTop = log.scrollHeight;

    $(".ask-clear", panel)?.addEventListener("click", async (e) => {
      try { await post(`/problem/${slug}/ask/clear`); log.innerHTML = ""; e.target.remove(); } catch {}
    });
  }

  // phone: Ask opens as a bottom sheet
  $(".ask-fab")?.addEventListener("click", () => {
    document.body.classList.add("ask-open");
    setTimeout(() => $("#ask .composer input")?.focus(), 250);
  });
  $(".ask-close")?.addEventListener("click", () => document.body.classList.remove("ask-open"));

  // ---- Check my final answer ---------------------------------------------------------------
  const check = $("#answer-check");
  const checkForm = check && $(".answer-check-form", check);
  if (checkForm) {
    const out = $(".check-result", check);
    const slug = check.dataset.slug;
    const VERDICT = { correct: "Matches the key", partial: "Partly right", incorrect: "Doesn't match the key", unclear: "Couldn't tell" };
    const RATE = { correct: ["solid", "Log as solid"], partial: ["shaky", "Log as shaky"], incorrect: ["miss", "Log as missed"] };

    function show(job, answer) {
      out.hidden = false;
      if (job.status === "waiting" || job.status === "queued" || job.status === "running") {
        out.innerHTML = `<p class="check-wait"><span class="spinner"></span> ${job.status === "running" ? "Comparing with the key…" : esc(statusText(job))}</p><div class="ask-busy" hidden><p class="busy-note"></p><div class="inline-form"><button type="button" class="small" data-act="run-anyway">Run anyway</button><button type="button" class="small" data-act="cancel">Cancel</button></div></div>`;
        busyBox($(".ask-busy", out), job);
        return;
      }
      if (job.status !== "done") { out.innerHTML = `<p class="tag warn">${esc(job.status === "cancelled" ? "Cancelled." : job.error)}</p>`; return; }
      const r = job.result || {};
      const rows = (r.parts || []).map((p) => `<tr><td>${esc(p.label)}</td><td>${esc(p.student)}</td><td class="key-cell">${esc(p.key)}</td>` +
        `<td>${p.match === "yes" ? '<span class="mark ok">✓</span>' : p.match === "no" ? '<span class="mark bad">✗</span>' : "?"}</td></tr>`).join("");
      const rate = RATE[r.verdict];
      out.innerHTML = `
        <p class="check-verdict"><span class="result result-${esc(r.verdict)}">${esc(VERDICT[r.verdict] || r.verdict)}</span>
          ${r.confidence === "low" ? '<span class="tag warn">low confidence</span>' : ""}</p>
        ${r.nudge ? (r.nudge_shows_key
          ? `<p class="small muted nudge-note">Its tip quotes the key, so it's hidden with the key's values. Try again first?</p><div class="feedback-text small nudge" hidden>${md(r.nudge)}</div>`
          : `<div class="feedback-text small">${md(r.nudge)}</div>`) : ""}
        ${rows ? `<table class="answers-table check-table hide-key"><thead><tr><th>Part</th><th>You</th><th class="key-cell">Key</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : ""}
        ${rows || r.nudge_shows_key ? `<button type="button" class="link small show-key">Show the key's values</button>` : ""}
        ${rate ? `<form method="post" action="/problem/${esc(slug)}/rate" class="inline-form">
          <input type="hidden" name="result" value="${rate[0]}"><input type="hidden" name="note" value="typed answer: ${esc(answer)}">
          <input type="hidden" name="log" value="on"><button type="submit" class="small ${rate[0]}">${rate[1]}</button>
          <span class="small muted">Qwen can be wrong. If it is, rate it yourself below.</span></form>` : ""}`;
      $(".show-key", out)?.addEventListener("click", (e) => {
        $(".check-table", out)?.classList.remove("hide-key");
        const nudge = $(".nudge", out);
        if (nudge) { nudge.hidden = false; $(".nudge-note", out)?.remove(); }
        e.target.remove();
      });
      math(out);
    }

    checkForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const answer = checkForm.answer.value;
      const button = $("button", checkForm);
      button.disabled = true;
      try {
        const job = await post(`/problem/${slug}/answer-check`, { answer });
        show(job, answer);
        poll(job.id, (j) => { show(j, answer); if (["done", "error", "cancelled"].includes(j.status)) button.disabled = false; });
      } catch (err) {
        out.hidden = false; out.innerHTML = `<p class="tag warn">${esc(err.message)}</p>`; button.disabled = false;
      }
    });
  }

  // ---- submission page: quick-check progress ----------------------------------------------------
  const progress = $("#local-progress");
  if (progress) {
    const text = $(".local-text", progress);
    const box = $(".local-wait", progress);
    (async function loop() {
      for (;;) {
        try {
          const s = await (await fetch(`/submission/${progress.dataset.sub}/local.json`)).json();
          if (!["queued", "waiting", "running"].includes(s.local_status)) { location.reload(); return; }
          if (s.job) {
            text.textContent = s.job.status === "running" ? "Reading your work and comparing it with the key…" : statusText(s.job);
            busyBox(box, s.job);
            if (box && s.job.status === "waiting") {
              box.querySelector('[data-act="cancel"]').onclick = async () => { await post(`/local/jobs/${s.job.id}/cancel`); location.reload(); };
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
  }
})();
