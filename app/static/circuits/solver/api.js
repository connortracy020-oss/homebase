// The page's door to the solver. Work goes to a Web Worker when the browser allows it, and
// runs in the page otherwise. Only the newest request per channel matters: while one solve
// runs, newer edits replace the waiting request instead of queueing up behind it.

import { migrate } from "../core/doc.js";
import { compile } from "../core/compile.js";
import { run } from "./run.js";

export class SolverClient {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.channels = new Map();  // name -> {busy, next}
    try {
      this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => {
        const p = this.pending.get(e.data.id);
        if (p) { this.pending.delete(e.data.id); p.resolve(e.data.result); }
      };
      this.worker.onerror = () => { this.worker = null; for (const p of this.pending.values()) p.resolve(this.inline(p.req)); this.pending.clear(); };
    } catch {
      this.worker = null;
    }
  }

  inline({ kind, doc, opts }) {
    try {
      const d = migrate(doc);
      return run(kind, compile(d, { when: opts?.when }), d, opts || {});
    } catch (err) {
      return { ok: false, errors: [{ code: "INTERNAL", message: `The solver hit a problem it couldn't handle: ${err.message}` }], warnings: [] };
    }
  }

  request(kind, doc, opts = {}) {
    const req = { kind, doc, opts };
    if (!this.worker) return Promise.resolve(this.inline(req));
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, req });
      this.worker.postMessage({ id, kind, doc, opts });
    });
  }

  // latest-wins: callback gets only results for the newest request on this channel
  latest(channel, kind, doc, opts, callback) {
    let ch = this.channels.get(channel);
    if (!ch) { ch = { busy: false, next: null }; this.channels.set(channel, ch); }
    ch.next = { kind, doc, opts, callback };
    if (!ch.busy) this.pump(ch);
  }

  async pump(ch) {
    while (ch.next) {
      const job = ch.next;
      ch.next = null;
      ch.busy = true;
      const result = await this.request(job.kind, job.doc, job.opts);
      if (!ch.next) job.callback(result);
    }
    ch.busy = false;
  }
}
