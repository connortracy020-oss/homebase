// Parts that can't affect the rest of the circuit are set aside instead of blocking the
// whole solve, so a half-built circuit still shows its answers:
//   - islands: parts not connected to ground at all (the resistor you just placed)
//   - nodes reached only through capacitors (at DC) or voltmeters: no current can flow
//     into them, so the rest of the circuit doesn't care what their voltage is
// Anything that would change the answer (a current source with nowhere to go, ...) is left
// in, and the structural checks explain it.

export function isolate(net, ctx) {
  const N = net.nodes.length, warnings = [];
  const keepAll = { net, toOld: null, toNew: null, dropNodes: new Set(), dropEls: new Set(), warnings };
  if (!N) return keepAll;
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const el of net.elements) {
    const ns = el.nodes.filter((n) => n >= 0);
    for (let k = 1; k < ns.length; k++) parent[find(ns[k])] = find(ns[0]);
    if (el.def.groundReturn && ns.length) parent[find(ns[0])] = find(0);
  }
  const dropNodes = new Set(), dropEls = new Set();
  for (let i = 1; i < N; i++) if (find(i) !== find(0)) dropNodes.add(i);
  const islandEls = net.elements.filter((el) => el.nodes.every((n) => n < 0 || dropNodes.has(n)));
  islandEls.forEach((el) => dropEls.add(el));
  if (islandEls.length) {
    const ids = islandEls.map((el) => el.id);
    warnings.push({ code: "ISLAND", parts: ids, message: `${list(ids)} ${ids.length > 1 ? "aren't" : "isn't"} connected to the rest of the circuit yet, so ${ids.length > 1 ? "they're" : "it's"} left out of the solution.` });
  }

  // nodes the solve can't reach through current-carrying parts
  if (ctx.mode === "dc") {
    const adj = Array.from({ length: N }, () => []);
    for (const el of net.elements) {
      if (dropEls.has(el)) continue;
      for (const [i, j] of el.def.dcEdges(el, ctx)) {
        const a = i === "g" ? 0 : el.nodes[i], b = j === "g" ? 0 : el.nodes[j];
        if (a >= 0 && b >= 0) { adj[a].push(b); adj[b].push(a); }
      }
    }
    const reached = new Set([0]), q = [0];
    while (q.length) for (const m of adj[q.shift()]) if (!reached.has(m)) { reached.add(m); q.push(m); }
    const stranded = new Set();
    for (let i = 1; i < N; i++) if (!reached.has(i) && !dropNodes.has(i)) stranded.add(i);
    const seen = new Set();
    for (const start of stranded) {
      if (seen.has(start)) continue;
      const group = new Set([start]), queue = [start];
      while (queue.length) {
        const m = queue.shift();
        for (const el of net.elements) {
          if (dropEls.has(el) || !el.nodes.includes(m)) continue;
          for (const o of el.nodes) if (stranded.has(o) && !group.has(o)) { group.add(o); queue.push(o); }
        }
      }
      group.forEach((g) => seen.add(g));
      const touching = net.elements.filter((el) => !dropEls.has(el) && el.nodes.some((n) => group.has(n)));
      const bridging = touching.filter((el) => el.nodes.some((n) => n >= 0 && !group.has(n)));
      const safe = bridging.length > 0 && bridging.every((el) => el.type === "C" || el.type === "VM");
      if (!safe) continue;
      group.forEach((g) => dropNodes.add(g));
      touching.filter((el) => !bridging.includes(el)).forEach((el) => dropEls.add(el));
      const names = [...group].map((g) => net.nodes[g].label || net.nodes[g].name);
      const caps = bridging.filter((el) => el.type === "C").map((el) => el.id);
      warnings.push({
        code: "UNDEFINED_DC", parts: bridging.map((el) => el.id), nodes: [...group],
        message: caps.length
          ? `At DC a capacitor is an open circuit, so ${list(names)} (beyond ${list(caps)}) ${names.length > 1 ? "have" : "has"} no defined voltage. The rest of the circuit doesn't depend on it.`
          : `${list(names)} ${names.length > 1 ? "are" : "is"} only touched by a voltmeter, so nothing sets ${names.length > 1 ? "their" : "its"} voltage.`,
      });
    }
  }
  if (!dropNodes.size && !dropEls.size) return keepAll;

  // the reduced circuit, with nodes renumbered and parts pointing at copies
  const toNew = new Map(), toOld = [];
  net.nodes.forEach((nd, i) => { if (!dropNodes.has(i)) { toNew.set(i, toOld.length); toOld.push(i); } });
  const copies = new Map();
  for (const el of net.elements) {
    if (dropEls.has(el)) continue;
    copies.set(el, { ...el, nodes: el.nodes.map((n) => (n >= 0 && toNew.has(n) ? toNew.get(n) : -1)) });
  }
  for (const c of copies.values()) {
    if (!c.ctrl) continue;
    if (c.ctrl.kind === "i") {
      const target = copies.get(c.ctrl.target);
      c.ctrl = target ? { ...c.ctrl, target } : null;
    } else {
      const ns = c.ctrl.nodes.map((n) => (toNew.has(n) ? toNew.get(n) : -1));
      c.ctrl = ns.includes(-1) ? null : { ...c.ctrl, nodes: ns };
    }
    if (!c.ctrl) c.badCtrl = true;
  }
  const reduced = {
    ...net,
    nodes: toOld.map((i, k) => ({ ...net.nodes[i], index: k })),
    elements: [...copies.values()],
    errors: [...net.errors],
  };
  for (const c of reduced.elements) {
    if (c.badCtrl) reduced.errors.push({ code: "CTRL", parts: [c.id], message: `${c.id} is controlled by something that isn't connected to the circuit.` });
  }
  return { net: reduced, toOld, toNew, dropNodes, dropEls, warnings, copies };
}

const list = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
