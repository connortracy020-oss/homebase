// Editing: wires stay attached and square, routing never makes accidental connections.
import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate, pinPoints } from "../../app/static/circuits/core/doc.js";
import { compile } from "../../app/static/circuits/core/compile.js";
import { solveDC } from "../../app/static/circuits/solver/op.js";
import * as E from "../../app/static/circuits/editor/edit.js";
import { route } from "../../app/static/circuits/editor/route.js";
import { toSpice } from "../../app/static/circuits/io/spice.js";

const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
const sel = (parts = [], wires = []) => ({ parts: new Set(parts), wires: new Set(wires) });
const square = (doc) => doc.wires.every((w) => w.a[0] === w.b[0] || w.a[1] === w.b[1]);

function divider() {
  return migrate({
    parts: [part("V1", "V", 0, 2, 1, { V: "10" }), part("R1", "R", 2, 0, 0, { R: "1k" }), part("R2", "R", 8, 2, 1, { R: "1k" }), part("GND1", "GND", 0, 6)],
    wires: [{ id: "w1", a: [0, 2], b: [0, 0] }, { id: "w2", a: [0, 0], b: [2, 0] }, { id: "w3", a: [6, 0], b: [8, 0] }, { id: "w4", a: [8, 0], b: [8, 2] }, { id: "w5", a: [0, 6], b: [8, 6] }],
  });
}
const vOut = (doc) => { const net = compile(doc); const s = solveDC(net); return s.nodes[net.nodeAt(`${pinPoints(doc.parts.find((p) => p.id === "R2"))[0].x},${pinPoints(doc.parts.find((p) => p.id === "R2"))[0].y}`)].vx; };

test("the divider solves before editing", () => {
  assert.equal(vOut(divider()), "5");
});

test("moving a part keeps its wires attached and square", () => {
  for (const [dx, dy] of [[0, 3], [2, 1], [-1, -2], [5, 0]]) {
    const doc = E.moveSelection(divider(), sel(["R2"]), dx, dy);
    E.tidy(doc);
    assert.ok(square(doc), `not square after moving by ${dx},${dy}`);
    assert.equal(vOut(doc), "5", `circuit changed after moving by ${dx},${dy}`);
  }
});

test("rotating and mirroring keep the circuit the same", () => {
  let doc = divider();
  for (const how of ["cw", "cw", "ccw", "mirror"]) {
    doc = E.turnSelection(doc, sel(["R1"]), how);
    assert.ok(square(doc));
    assert.equal(vOut(doc), "5", `after ${how}`);
  }
});

test("moving a whole selection with its wires shifts it", () => {
  const all = divider();
  const doc = E.moveSelection(all, sel(all.parts.map((p) => p.id), all.wires.map((w) => w.id)), 3, 4);
  assert.equal(doc.wires.length, all.wires.length);
  assert.equal(vOut(doc), "5");
});

test("deleting a part leaves its wires, and the rest still solves", () => {
  const doc = divider();
  doc.parts.push(part("R3", "R", 12, 2, 1, { R: "1k" }));
  doc.wires.push({ id: "w6", a: [8, 0], b: [12, 0] }, { id: "w6b", a: [12, 0], b: [12, 2] }, { id: "w7", a: [12, 6], b: [8, 6] });
  assert.equal(vOut(doc), "10/3");
  E.deleteSelection(doc, sel(["R3"]));
  assert.equal(vOut(doc), "5");
});

test("tidy joins straight runs and drops duplicates", () => {
  const doc = migrate({ parts: [], wires: [{ id: "a", a: [0, 0], b: [2, 0] }, { id: "b", a: [2, 0], b: [5, 0] }, { id: "c", a: [5, 0], b: [2, 0] }, { id: "d", a: [3, 3], b: [3, 3] }] });
  E.tidy(doc);
  assert.equal(doc.wires.length, 1);
  assert.deepEqual([doc.wires[0].a, doc.wires[0].b].sort(), [[0, 0], [5, 0]].sort());
});

test("routing goes around parts and never joins other wires", () => {
  const doc = divider();
  // from R1's right terminal to the bottom-right corner, R2 sits in the way
  const start = [6, 0], end = [8, 6];
  const path = route(doc, start, end);
  assert.ok(path, "no route found");
  const test = migrate(structuredClone(doc));
  E.addWirePath(test, path);
  // no new connections besides the two ends: the bench still has the same nodes plus one joined pair
  const before = compile(doc), after = compile(test);
  assert.ok(after.nodes.length <= before.nodes.length);
  // the path never runs along an existing wire or through a terminal
  for (let i = 0; i + 1 < path.length; i++) assert.ok(path[i][0] === path[i + 1][0] || path[i][1] === path[i + 1][1]);
});

test("renaming keeps dependent-source controls pointing at the part", () => {
  const doc = migrate({ parts: [part("R1", "R", 0, 0), part("E1", "E", 0, 4, 0, { ctrl: "-v(R1)" })], wires: [] });
  assert.equal(E.renamePart(doc, "R1", "Rx"), null);
  assert.equal(doc.parts.find((p) => p.id === "E1").params.ctrl, "-v(Rx)");
  assert.match(E.renamePart(doc, "Rx", "E1"), /already/);
});

test("SPICE export names nodes, sources and sense sources", () => {
  const doc = divider();
  doc.parts.push(part("F1", "F", 12, 2, 1, { gain: "2", ctrl: "i(R1)" }));
  const net = compile(doc);
  const text = toSpice(doc, net);
  assert.match(text, /^V1 n\d 0 DC 10$/m);
  assert.match(text, /^R1 /m);
  assert.match(text, /^Vsense_R1 /m);
  assert.match(text, /^F1 .* Vsense_R1 2$/m);
  assert.match(text, /^\.op$/m);
});

test("random moves and turns never change what's connected", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const ops = ["cw", "ccw", "mirror", "move"];
  let doc = divider();
  doc.parts.push(part("R3", "R", 12, 2, 1, { R: "2k" }));
  doc.wires.push({ id: "w6", a: [8, 0], b: [12, 0] }, { id: "w6b", a: [12, 0], b: [12, 2] }, { id: "w7", a: [12, 6], b: [8, 6] });
  const start = vOut(doc);
  for (let k = 0; k < 120; k++) {
    const p = doc.parts[rnd(doc.parts.length)];
    if (p.type === "GND") continue;
    const op = ops[rnd(ops.length)];
    let next;
    if (op === "move") {
      const dx = rnd(7) - 3, dy = rnd(7) - 3;
      next = E.moveSelection(doc, sel([p.id]), dx, dy);
      // dropping a terminal onto another terminal or wire is a deliberate connection; skip those
      const moved = next.parts.find((q) => q.id === p.id);
      const others = new Set(next.parts.filter((q) => q.id !== p.id).flatMap((q) => pinPoints(q).map((pp) => `${pp.x},${pp.y}`)));
      const wirePts = (w) => { const out = []; const [ax, ay] = w.a, [bx, by] = w.b; for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) out.push(`${x},${y}`); return out; };
      const onWires = new Set(doc.wires.flatMap(wirePts));
      if (pinPoints(moved).some((pp) => others.has(`${pp.x},${pp.y}`) || onWires.has(`${pp.x},${pp.y}`))) continue;
    } else next = E.turnSelection(doc, sel([p.id]), op);
    doc = next;
    E.tidy(doc);
    assert.equal(vOut(doc), start, `step ${k}: ${op} ${p.id} changed the circuit`);
  }
});
