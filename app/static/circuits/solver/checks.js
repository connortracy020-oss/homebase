// Structural checks before solving, so a broken circuit gets a reason instead of a
// "singular matrix": floating nodes and current-source cut sets (no path that carries
// current back to ground), and loops of zero-impedance branches (sources, ammeters, and
// inductors at DC). Each error names the parts involved so the editor can highlight them.

export function structuralErrors(net, ctx) {
  const errors = [];
  const N = net.nodes.length;
  if (!N) return errors;
  const name = (i) => (i === 0 ? "ground" : net.nodes[i].name);
  const end = (el, i) => (i === "g" ? 0 : el.nodes[i]);

  // 1. every node needs a path that carries current back to ground
  const adj = Array.from({ length: N }, () => []);
  for (const el of net.elements) {
    for (const [i, j] of el.def.dcEdges(el, ctx)) {
      const a = end(el, i), b = end(el, j);
      adj[a].push(b); adj[b].push(a);
    }
  }
  const reached = new Set([0]);
  const queue = [0];
  while (queue.length) for (const m of adj[queue.shift()]) if (!reached.has(m)) { reached.add(m); queue.push(m); }
  const stranded = net.nodes.map((nd) => nd.index).filter((i) => !reached.has(i));
  if (stranded.length) {
    // group stranded nodes that touch the same parts, and explain each group
    const seen = new Set();
    for (const start of stranded) {
      if (seen.has(start)) continue;
      const group = new Set([start]), q = [start];
      while (q.length) {
        const m = q.shift();
        for (const el of net.elements) {
          if (!el.nodes.includes(m)) continue;
          for (const o of el.nodes) if (!reached.has(o) && !group.has(o)) { group.add(o); q.push(o); }
        }
      }
      group.forEach((g) => seen.add(g));
      const touching = net.elements.filter((el) => el.nodes.some((o) => group.has(o)));
      errors.push({ code: "FLOATING", nodes: [...group], parts: touching.map((el) => el.id), message: floatingMessage([...group].map(name), touching, ctx) });
    }
  }

  // 2. loops made only of zero-impedance branches
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const forest = Array.from({ length: N }, () => []);
  for (const el of net.elements) {
    for (const [i, j] of el.def.zEdges(el, ctx)) {
      const a = end(el, i), b = end(el, j);
      if (find(a) === find(b)) {
        const loop = a === b ? [] : path(forest, a, b);
        errors.push({ code: "LOOP", parts: [el.id, ...loop.map((e) => e.id)], nodes: [a, b], message: loopMessage(el, loop, ctx, a === b) });
      } else {
        parent[find(a)] = find(b);
        forest[a].push([b, el]); forest[b].push([a, el]);
      }
    }
  }
  return errors;
}

function path(forest, from, to) {
  const back = new Map([[from, null]]), q = [from];
  while (q.length) {
    const m = q.shift();
    if (m === to) break;
    for (const [o, el] of forest[m]) if (!back.has(o)) { back.set(o, [m, el]); q.push(o); }
  }
  const out = [];
  for (let m = to; back.get(m); m = back.get(m)[0]) out.push(back.get(m)[1]);
  return out;
}

const what = (el, ctx) => {
  if (el.type === "L" && ctx.mode === "dc") return `${el.id} (an inductor acts as a wire at DC)`;
  if (el.type === "C" && ctx.mode === "ic") return `${el.id} (a capacitor's voltage can't jump)`;
  if (el.type === "AM") return `${el.id} (an ammeter is 0 Ω)`;
  if (el.type === "OA") return `${el.id}'s output`;
  return el.id;
};

function loopMessage(el, loop, ctx, shorted) {
  if (shorted) {
    if (el.type === "L" && ctx.mode === "dc") return `${el.id} is shorted at both ends, so at DC its current isn't determined.`;
    if (el.type === "AM") return `${el.id} is shorted (both terminals are the same node), so it reads nothing useful.`;
    return `${what(el, ctx)} is shorted: both of its terminals are the same node.`;
  }
  const names = [el, ...loop].map((e) => what(e, ctx));
  return `${names.join(" and ")} form a loop with no resistance, so the current around it isn't determined (and the voltages may disagree).`;
}

function floatingMessage(nodeNames, touching, ctx) {
  const subject = nodeNames.length === 1 ? `Node ${nodeNames[0]}` : `This part of the circuit (${nodeNames.join(", ")})`;
  const types = new Set(touching.map((el) => el.type));
  const ids = (pred) => touching.filter(pred).map((el) => el.id).join(", ");
  const magnetic = touching.filter((el) => el.type === "K" || el.type === "TR");
  if (magnetic.length) {
    return `${subject} connects to the rest only through ${magnetic.map((el) => el.id).join(", ")}, and a transformer links its two sides by its magnetic field alone, so nothing fixes this side's voltage. Give each side its own ground (⏚).`;
  }
  if (touching.some((el) => el.type === "C") && ctx.mode === "dc") {
    return `${subject} connects only through capacitors (${ids((el) => el.type === "C")}), and at DC a capacitor is an open circuit, so its voltage isn't defined. Add a resistor, or give the capacitor an initial voltage and run a transient.`;
  }
  if ([...types].every((t) => ["I", "G", "F", "VM", "OA", "L"].includes(t)) && touching.some((el) => ["I", "G", "F"].includes(el.type))) {
    return `${subject} connects to the rest only through current sources (${ids((el) => ["I", "G", "F", "L"].includes(el.type))}), so its voltage isn't defined and the currents into it have nowhere to go.`;
  }
  if (types.size && [...types].every((t) => t === "OA" || t === "VM")) {
    return `${subject} only touches ${ids(() => true)}, which ${touching.length > 1 ? "draw" : "draws"} no current, so nothing sets its voltage.`;
  }
  return `${subject} has no path that carries current back to ground, so its voltage isn't defined.`;
}
