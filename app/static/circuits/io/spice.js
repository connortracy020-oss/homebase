// SPICE netlist export, ready to paste into LTspice or ngspice for a second opinion.
// Ground is node 0; labelled nodes keep their names. Current-controlled sources get the 0 V
// "sense" source SPICE needs; an ideal op-amp becomes a gain-of-a-million VCVS.

import { spiceNumber } from "../core/units.js";

const clean = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_");

export function toSpice(doc, net) {
  const lines = [`* ${doc.title || "Circuit"} (exported from Homebase Circuit Bench)`];
  const name = (i) => (i === 0 ? "0" : clean(net.nodes[i].label || net.nodes[i].name));
  const num = (p) => spiceNumber(p.value);
  const ref = (el, prefix) => (el.id.toUpperCase().startsWith(prefix) ? clean(el.id) : `${prefix}${clean(el.id)}`);
  const vName = (el) => (el.type === "AM" ? `V${clean(el.id)}` : ref(el, "V"));
  const sense = new Map();  // part id -> the voltage source whose current SPICE reads
  const nodeOverride = new Map();
  for (const el of net.elements) {
    if (el.ctrl?.kind !== "i") continue;
    const t = el.ctrl.target;
    if (t.type === "V" || t.type === "AM") { sense.set(t.id, vName(t)); continue; }
    if (!sense.has(t.id)) {
      const mid = `${clean(t.id)}_sense`;
      sense.set(t.id, `Vsense_${clean(t.id)}`);
      nodeOverride.set(t.id, mid);
      lines.push(`Vsense_${clean(t.id)} ${name(t.nodes[0])} ${mid} 0`);
    }
  }
  const pinA = (el) => nodeOverride.get(el.id) || name(el.nodes[0]);
  for (const el of net.elements) {
    const p = el.params, a = pinA(el), b = name(el.nodes[1] ?? 0);
    switch (el.type) {
      case "R": lines.push(`${ref(el, "R")} ${a} ${b} ${num(p.R)}`); break;
      case "C": lines.push(`${ref(el, "C")} ${a} ${b} ${num(p.C)}${p.v0.empty ? "" : ` IC=${num(p.v0)}`}`); break;
      case "L": lines.push(`${ref(el, "L")} ${a} ${b} ${num(p.L)}${p.i0.empty ? "" : ` IC=${num(p.i0)}`}`); break;
      case "V": lines.push(`${vName(el)} ${a} ${b} ${wave(p, "V")}`); break;
      // SPICE: current flows from n+ through the source to n-; ours leaves at pin a
      case "I": lines.push(`${ref(el, "I")} ${b} ${a} ${wave(p, "I")}`); break;
      case "E": case "G": {
        const g = (el.ctrl.sign < 0 ? -1 : 1) * p.gain.value;
        const [cp, cn] = el.ctrl.nodes.map(name);
        lines.push(el.type === "E" ? `${ref(el, "E")} ${a} ${b} ${cp} ${cn} ${spiceNumber(g)}` : `${ref(el, "G")} ${b} ${a} ${cp} ${cn} ${spiceNumber(g)}`);
        break;
      }
      case "H": case "F": {
        const g = (el.ctrl.sign < 0 ? -1 : 1) * p.gain.value, src = sense.get(el.ctrl.target.id);
        lines.push(el.type === "H" ? `${ref(el, "H")} ${a} ${b} ${src} ${spiceNumber(g)}` : `${ref(el, "F")} ${b} ${a} ${src} ${spiceNumber(g)}`);
        break;
      }
      case "OA": {
        const [minus, plus, out] = el.nodes.map(name), id = clean(el.id);
        if (p.model.text === "ideal") {
          lines.push(`* ${el.id}: ideal op-amp, modelled as a very high gain`, `E${id} ${out} 0 ${plus} ${minus} 1e6`);
        } else {
          const o = p.rout.value ? `${id}_int` : out;
          lines.push(`E${id} ${o} 0 ${plus} ${minus} ${num(p.A)}`);
          if (p.rout.value) lines.push(`R${id}_out ${o} ${out} ${num(p.rout)}`);
          if (!p.rin.empty) lines.push(`R${id}_in ${plus} ${minus} ${num(p.rin)}`);
        }
        break;
      }
      case "AM": lines.push(`V${clean(el.id)} ${a} ${b} 0`); break;
      case "VM": lines.push(`* ${el.id} measures V(${a}) - V(${b})`); break;
      default: break;
    }
  }
  for (const part of doc.parts) {
    if ((part.type === "SW" || part.type === "SW2") && (part.params.at || "").trim()) {
      lines.push(`* ${part.id} flips at t = ${part.params.at} (not exported: it's drawn in its starting position)`);
    }
  }
  lines.push(".op", ".end");
  return lines.join("\n") + "\n";
}

function wave(p, q) {
  const kind = p.wave?.text || "dc";
  if (kind === "dc") return `DC ${spiceNumber(p[q].value)}`;
  const lo = spiceNumber(p[`${q}0`].value), hi = spiceNumber(p[`${q}1`].value);
  if (kind === "step") {
    const t = p.at.value;
    return `PWL(0 ${lo} ${spiceNumber(t)} ${lo} ${spiceNumber(t + 1e-9)} ${hi})`;
  }
  const tr = p.tr.value || 1e-9, tf = p.tf.value || 1e-9;
  return `PULSE(${lo} ${hi} ${spiceNumber(p.td.value)} ${spiceNumber(tr)} ${spiceNumber(tf)} ${spiceNumber(p.pw.value)} ${spiceNumber(p.per.value)})`;
}
