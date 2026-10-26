// The solver's own thread, so long analyses never freeze editing. It receives the document
// (plain JSON), compiles it the same way the page does, and sends back plain results.

import { migrate } from "../core/doc.js";
import { compile } from "../core/compile.js";
import { run } from "./run.js";

self.onmessage = (e) => {
  const { id, kind, doc, opts } = e.data;
  let result;
  try {
    result = run(kind, compile(migrate(doc), { when: opts?.when }), migrate(doc), opts || {});
  } catch (err) {
    result = { ok: false, errors: [{ code: "INTERNAL", message: `The solver hit a problem it couldn't handle: ${err.message}` }], warnings: [] };
  }
  self.postMessage({ id, result });
};
