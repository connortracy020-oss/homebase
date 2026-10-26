// Golden problems (app/static/circuits/selftest/cases.js): the bench must reproduce the
// published answers of ECE 201 exercises whose worked solutions are Homebase answer keys.
// The same cases run in any browser at /circuits/selftest.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CASES, runAll } from "../../app/static/circuits/selftest/cases.js";

for (const c of CASES) {
  test(`${c.name}: ${c.answer}`, () => {
    const checks = c.run();
    assert.ok(checks.length > 0);
    for (const k of checks) assert.ok(k.ok, `${k.label}: bench ${k.got}, book ${k.want}`);
  });
}

test("the self-test page's runner reports every case passing", () => {
  const results = runAll();
  assert.equal(results.length, CASES.length);
  for (const r of results) assert.ok(r.ok, `${r.name}: ${r.error || r.checks.filter((k) => !k.ok).map((k) => k.label).join(", ")}`);
});

test("Thevenin at a port: the card finds labelled terminals a and b and gives V_th, R_th and I_N", async () => {
  const { theveninPortCard, ports } = await import("../../app/static/circuits/study/tools.js");
  const { migrate } = await import("../../app/static/circuits/core/doc.js");
  const { compile } = await import("../../app/static/circuits/core/compile.js");
  const part = (id, type, x, y, rot = 0, params = {}) => ({ id, type, x, y, rot, params });
  // 10 V behind two 1 kΩ resistors in a divider, a at the middle, b at ground
  const net = compile(migrate({
    parts: [part("V1", "V", 0, 2, 1, { V: "10" }), part("R1", "R", 0, 0, 0, { R: "1k" }), part("R2", "R", 6, 2, 1, { R: "1k" }),
      part("Ta", "LBL", 8, 0, 0, { name: "a" }), part("Tb", "LBL", 8, 6, 0, { name: "b" }), part("G", "GND", 0, 6)],
    wires: [{ id: "w1", a: [0, 2], b: [0, 0] }, { id: "w2", a: [4, 0], b: [8, 0] }, { id: "w3", a: [6, 0], b: [6, 2] },
      { id: "w4", a: [0, 6], b: [8, 6] }],
  }));
  assert.deepEqual(ports(net), [["a", "b"]]);
  const html = theveninPortCard(net, ["a", "b"]);
  assert.match(html, /5 V<small>\+ at a/);
  assert.match(html, /500 Ω/);
  assert.match(html, /10 mA<small>a → b through the short/);
  assert.match(theveninPortCard(net, ["a", "c"]), /no terminals called a and c/);
});
