// Claude's drawing tools: the shorthand (expandDrawing in core/doc.js), the checks the solver
// doesn't make (io/lint.js), the picture (io/picture.js), and scripts/bench_solve.mjs, which
// app/mcp_server.py runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrate, expandDrawing, pinPoints } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { lintDrawing } from "../../app/static/circuits/io/lint.js";
import { pictureOf, pathPoints } from "../../app/static/circuits/io/picture.js";
import { BOOK } from "../../app/static/circuits/selftest/book.js";

// Ulaby's Exercise 3-1, drawn in the shorthand
const E31 = {
  title: "Exercise 3-1",
  parts: [
    { id: "R4", type: "R", from: [0, 3], to: [0, 7], params: { R: "4" } },
    { id: "R6", type: "R", from: [2, 0], to: [6, 0], params: { R: "6" } },
    { id: "R10", type: "R", from: [8, 1], to: [8, 5], params: { R: "10" } },
    { id: "V1", type: "V", from: [8, 6], to: [8, 10], params: { V: "24" } },
    { id: "R1", type: "R", from: [14, 3], to: [14, 7], params: { R: "1" } },
    { id: "G", type: "GND", at: [8, 10] },
  ],
  wires: [{ path: [[0, 3], [0, 0], [2, 0]] }, { path: [[6, 0], [14, 0], [14, 3]] }, { path: [[8, 0], [8, 1]] },
    { path: [[8, 5], [8, 6]] }, { path: [[0, 7], [0, 10], [14, 10], [14, 7]] }],
};

test("from/to places a two-terminal part with its pins where they're asked for, any way round", () => {
  for (const [to, rot] of [[[4, 0], 0], [[0, 4], 1], [[-4, 0], 2], [[0, -4], 3]]) {
    const { doc, problems } = expandDrawing({ parts: [{ id: "R1", type: "R", from: [0, 0], to }], wires: [] });
    assert.deepEqual(problems, []);
    const p = migrate(doc).parts[0];
    assert.equal(p.rot, rot);
    assert.deepEqual(pinPoints(p).map((q) => [q.x, q.y]), [[0, 0], to]);
  }
});

test("a path becomes one wire per step, and at places any part", () => {
  const doc = migrate(expandDrawing(E31).doc);
  assert.equal(doc.wires.length, 9);
  assert.deepEqual(doc.wires[0], { id: "w1", a: [0, 3], b: [0, 0] });
  assert.equal(new Set(doc.wires.map((w) => w.id)).size, 9);
  assert.deepEqual([doc.parts[5].x, doc.parts[5].y], [8, 10]);
  assert.ok(doc.parts.every((p) => !("from" in p) && !("to" in p) && !("at" in p)));
  // and it's the book's circuit: I = 2 A through the 1 Ω (the self-test's answer)
  const net = compile(doc);
  assert.equal(net.nodes.length, 4);
  assert.deepEqual(lintDrawing(doc, net), []);
});

test("shorthand mistakes are reported, not guessed at", () => {
  const { problems } = expandDrawing({
    parts: [{ id: "R9", type: "R", from: [0, 0], to: [3, 0] }, { id: "X", type: "RES" }, { id: "U1", type: "OA", from: [0, 0], to: [4, 0] },
      { id: "R8", type: "R", from: [0.5, 0], to: [4.5, 0] }],
    wires: [{ path: [[0, 0]] }],
  });
  assert.equal(problems.length, 5);
  assert.match(problems[0], /R9: its pins are 4 units apart/);
  assert.match(problems[1], /no part type "RES"/);
  assert.match(problems[2], /U1: only two-terminal parts/);
  assert.match(problems[3], /whole grid units/);
  assert.match(problems[4], /path must be a list/);
});

test("the checks find open wire ends, parts on top of each other, wires through symbols and crowded labels", () => {
  const doc = migrate(expandDrawing({
    parts: [{ id: "V1", type: "V", from: [0, 3], to: [0, 7], params: { V: "5" } }, { id: "R1", type: "R", from: [1, 0], to: [5, 0] },
      { id: "R2", type: "R", from: [2, 0], to: [6, 0] }, { id: "R3", type: "R", from: [9, 3], to: [9, 7] }, { id: "G", type: "GND", at: [0, 7] }],
    wires: [{ path: [[0, 3], [0, 0], [1, 0]] }, { path: [[5, 0], [9, 0], [9, 3]] }, { path: [[3, -1], [3, 1]] }, { path: [[9, 7], [12, 4]] },
      { path: [[9, 3], [9, 7]] }],
  }).doc);
  const codes = lintDrawing(doc, compile(doc)).map((c) => c.code);
  for (const code of ["OPEN_END", "OVERLAP", "THROUGH", "LABEL", "DIAGONAL", "SHORTED"]) assert.ok(codes.includes(code), code);
});

test("every book drawing passes the checks (they're the bench's own reference drawings)", () => {
  for (const [label, { circuit }] of Object.entries(BOOK)) {
    const doc = circuit();
    assert.deepEqual(lintDrawing(doc, compile(doc)).map((c) => c.message), [], label);
  }
});

test("path data turns into points: lines, arcs and curves", () => {
  const [zig] = pathPoints("M1 0L1.17 -0.36L1.5 0.36");
  assert.deepEqual(zig.pts, [[1, 0], [1.17, -0.36], [1.5, 0.36]]);
  const [bump] = pathPoints("M1 0a0.25 0.25 0 0 1 0.5 0");
  assert.deepEqual(bump.pts.at(-1), [1.5, 0]);
  assert.ok(Math.min(...bump.pts.map((p) => p[1])) < -0.24);  // an inductor's bump goes up
  const [tag] = pathPoints("M0.3 0L0.62 -0.5H2V0.5H0.62Z");
  assert.ok(tag.closed);
  assert.equal(pathPoints("M0 0H1M3 0H4").length, 2);
});

test("the picture has every wire, part, label and node name, inside its bounds", () => {
  const doc = migrate(expandDrawing(E31).doc), net = compile(doc);
  const pic = pictureOf(doc, net);
  const texts = pic.items.filter((i) => i.k === "text").map((i) => i.s);
  for (const s of ["R4", "4 Ω", "R10", "10 Ω", "V1", "24 V", "R1", "1 Ω"]) assert.ok(texts.includes(s), s);
  assert.deepEqual(pic.items.filter((i) => i.k === "pill").map((i) => i.s).sort(), ["n1", "n2", "n3"]);
  assert.equal(pic.items.filter((i) => i.k === "circle" && i.c === "#d0392b").length, 0);  // nothing open
  const [x0, y0, x1, y1] = pic.bounds;
  for (const w of doc.wires) for (const [x, y] of [w.a, w.b]) assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1);
});

test("bench_solve.mjs expands the shorthand and returns the checks and, with --draw, the picture", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-"));
  const file = join(dir, "c.json");
  writeFileSync(file, JSON.stringify(E31));
  const script = new URL("../../scripts/bench_solve.mjs", import.meta.url);
  const plain = JSON.parse(execFileSync(process.execPath, [script.pathname.replace(/^\/(\w:)/, "$1"), file], { encoding: "utf8" }));
  assert.ok(plain.ok && !plain.picture);
  assert.deepEqual(plain.problems, []);
  assert.deepEqual(plain.checks, []);
  assert.equal(plain.doc.parts.find((p) => p.id === "R1").rot, 1);
  assert.ok(Math.abs(plain.parts.R1.i - 2) < 1e-9);  // the book's I = 2 A
  const drawn = JSON.parse(execFileSync(process.execPath, [script.pathname.replace(/^\/(\w:)/, "$1"), file, "--draw"], { encoding: "utf8" }));
  assert.ok(drawn.picture.items.length > 20);
});
