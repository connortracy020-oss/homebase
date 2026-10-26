// Check my work: you type the node voltages you got by hand; the bench marks each one and,
// for a wrong one, names an equation your numbers break (KCL at a node, or a source's
// voltage), with the numbers, so you can find the slip yourself.

import { fmt } from "../core/units.js";

const VOLTAGE_DETERMINED = new Set(["R", "I", "C", "VM"]);

export function checkWork(net, sol, guesses) {
  const rows = [];
  const u = sol.nodes.map((n) => n.v);
  for (const [node, g] of guesses) {
    const t = sol.nodes[node].v;
    if (t === null) continue;
    const tol = Math.max(0.01 * Math.abs(t), 1e-9);
    const ok = Math.abs(g - t) <= tol;
    const tags = [];
    if (!ok && Math.abs(t) > 1e-12 && Math.abs(g + t) <= tol) tags.push("sign");
    if (!ok && [1e3, 1e-3].some((k) => Math.abs(g - t * k) <= tol * k)) tags.push("units");
    if (!ok && !tags.length) tags.push("kcl");
    rows.push({ node, name: net.nodes[node].label || net.nodes[node].name, guess: g, truth: t, ok, tags });
    u[node] = g;
  }
  const wrong = new Set(rows.filter((r) => !r.ok).map((r) => r.node));
  return { rows, violation: wrong.size ? findViolation(net, sol, u, wrong) : null };
}

// an equation your values break, preferring one at a node you got wrong
function findViolation(net, sol, u, wrong) {
  const name = (i) => (i === 0 ? "ground" : net.nodes[i].label || net.nodes[i].name);
  // a voltage source or op-amp that fixes a difference you have wrong
  for (const el of net.elements) {
    const [a, b] = el.nodes;
    if (el.type === "V" && (wrong.has(a) || wrong.has(b))) {
      const want = sol.els[el.id].v, got = u[a] - u[b];
      if (Math.abs(got - want) > 1e-6 * (1 + Math.abs(want))) {
        return { kind: "source", text: `${el.id} holds ${name(a)} − ${name(b)} at ${fmt(want, "V")}, but your values give ${fmt(got, "V")}.` };
      }
    }
    if (el.type === "OA" && el.params.model.text === "ideal") {
      const [m, p] = el.nodes;
      if ((wrong.has(m) || wrong.has(p)) && Math.abs(u[p] - u[m]) > 1e-6) {
        return { kind: "opamp", text: `${el.id} is ideal with feedback, so v₊ = v₋, but your values give v₊ − v₋ = ${fmt(u[p] - u[m], "V")}.` };
      }
    }
  }
  // KCL at a node whose currents all follow from voltages (resistors and current sources)
  const order = [...wrong, ...net.nodes.map((n) => n.index).filter((i) => i > 0 && !wrong.has(i))];
  for (const m of order) {
    const touching = net.elements.filter((el) => el.nodes.includes(m));
    if (!touching.length || !touching.every((el) => VOLTAGE_DETERMINED.has(el.type))) continue;
    if (!touching.some((el) => el.nodes.some((n) => wrong.has(n)))) continue;
    const parts = [];
    let net0 = 0, scale = 0;
    for (const el of touching) {
      el.nodes.forEach((n, j) => {
        if (n !== m) return;
        let leave = 0;
        if (el.type === "R") { const o = el.nodes[1 - j]; leave = (u[m] - u[o]) / el.params.R.value; }
        else if (el.type === "I") { const I = sol.els[el.id].pins[j].i; leave = I; }
        net0 += leave; scale = Math.max(scale, Math.abs(leave));
        if (Math.abs(leave) > 1e-15) parts.push(`${el.id} ${leave > 0 ? "takes out" : "brings in"} ${fmt(Math.abs(leave), "A")}`);
      });
    }
    if (Math.abs(net0) > 1e-6 * (1 + scale)) {
      return { kind: "kcl", node: m, text: `KCL at ${name(m)} doesn't balance with your values: ${parts.join(", ")}, so ${fmt(Math.abs(net0), "A")} more ${net0 > 0 ? "leaves than arrives" : "arrives than leaves"}.` };
    }
  }
  return { kind: "other", text: "Your values don't satisfy the circuit's equations. Try writing KCL at the node you got wrong." };
}
