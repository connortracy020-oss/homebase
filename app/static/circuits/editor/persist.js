// Saving: every change is kept on this device at once and sent to Homebase a second later.
// If the Wi-Fi drops, the device copy waits and goes up when it can. If someone else (another
// tab, or Claude) saved in between, you choose whose version to keep; nothing is overwritten
// silently.

const DRAFT = (slug) => `homebase.circuit.${slug}`;

export class Persist {
  constructor({ store, slug, rev, onState, onConflict, summary }) {
    Object.assign(this, { store, slug, rev, onState, onConflict, summary });
    this.timer = null; this.saving = false; this.dirty = false; this.failures = 0;
    store.on("doc", (d) => { if (d?.label !== "load") this.changed(); });
    addEventListener("pagehide", () => this.flush(true));
    addEventListener("online", () => { if (this.dirty) this.schedule(200); });
  }

  // a newer unsaved copy on this device from last time?
  draft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT(this.slug)) || "null");
      return d && d.rev === this.rev && d.doc ? d : null;
    } catch { return null; }
  }

  dropDraft() { try { localStorage.removeItem(DRAFT(this.slug)); } catch {} }

  changed() {
    this.dirty = true;
    try { localStorage.setItem(DRAFT(this.slug), JSON.stringify({ rev: this.rev, at: Date.now(), doc: this.store.doc })); } catch {}
    this.onState?.("unsaved");
    this.schedule(900);
  }

  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(false), ms); }

  async flush(leaving) {
    if (!this.dirty || (this.saving && !leaving)) return;
    this.saving = true;
    const body = JSON.stringify({ doc: this.store.doc, rev: this.rev, summary: this.summary?.() ?? null });
    this.dirty = false;
    this.onState?.("saving");
    try {
      const res = await fetch(`/api/circuits/${this.slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body, keepalive: leaving && body.length < 60000 });
      if (res.status === 409) {
        const data = await res.json();
        this.dirty = true;
        this.onState?.("conflict");
        this.onConflict?.(data.current);
      } else if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      } else {
        const data = await res.json();
        this.rev = data.rev;
        this.failures = 0;
        if (!this.dirty) this.dropDraft();
        else this.changed();
        this.onState?.(this.dirty ? "unsaved" : "saved", data);
      }
    } catch (err) {
      this.dirty = true;
      this.failures += 1;
      this.onState?.("offline", { error: String(err.message || err) });
      if (!leaving) this.schedule(Math.min(30000, 1500 * 2 ** this.failures));
    } finally {
      this.saving = false;
      if (this.dirty && !leaving && this.failures === 0) this.schedule(600);
    }
  }

  // after a conflict: keep yours (overwrite) or take theirs
  keepMine(currentRev) { this.rev = currentRev; this.dirty = true; this.flush(false); }

  takeTheirs(current) {
    this.rev = current.rev;
    this.dirty = false;
    this.dropDraft();
    this.store.replace(current.doc, { label: "load" });
    this.onState?.("saved");
  }
}
