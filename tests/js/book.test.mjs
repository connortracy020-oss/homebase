// Book exercises on the bench (app/static/circuits/selftest/book.js): the server opens them from
// content/ece201/bench.json, so that file must hold exactly what book.js draws, and every
// drawing must solve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOOK, bookJSON } from "../../app/static/circuits/selftest/book.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import { transient } from "../../app/static/circuits/solver/tran.js";

test("content/ece201/bench.json is up to date (else run node scripts/export_bench_book.mjs)", () => {
  const saved = JSON.parse(readFileSync(new URL("../../content/ece201/bench.json", import.meta.url), "utf8"));
  assert.deepEqual(saved, JSON.parse(JSON.stringify(bookJSON())));
});

for (const [label, { circuit }] of Object.entries(BOOK)) {
  test(`${label} opens in predict-first mode and solves`, () => {
    const doc = bookJSON().circuits[label].doc;
    assert.equal(doc.study.predict, true);
    // chapter 5's are transients (and 5-16's parallel inductors have no single DC answer)
    if (/^Exercise 5-/.test(label)) return assert.ok(transient(circuit(), { tstop: 0.01, dt: 1e-4 }).ok);
    const s = solveDC(compile(circuit()), { flows: false });
    assert.ok(s.ok, s.errors?.map((e) => e.message).join("; "));
  });
}
