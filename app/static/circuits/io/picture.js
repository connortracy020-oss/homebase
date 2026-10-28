// A picture of a drawing as plain shapes (polylines, circles, text, pills) in grid units, for
// Claude's circuit tools: app/circuit_picture.py turns it into a PNG so Claude can see what it
// drew next to the figure it copied. It uses the 2D view's own symbols and labels
// (editor/symbols.js, editor/labels.js) and pill placement (views/overlay.js), plus node names,
// red rings on whatever is unconnected, and room for grid coordinates along the edges.

import { symbolMarkup, partTransform, labelPlacement, boxOf } from "../editor/symbols.js";
import { valueText } from "../editor/labels.js";
import { labelBox, placePill } from "../views/overlay.js";
import { labelRect, openEnds, openPins } from "./lint.js";

export const COLORS = {
  ink: "#26221e", wire: "#3a352f", soft: "#7a6f63", paper: "#ffffff", tag: "#eef1f5",
  red: "#d0392b", nodeBg: "#e2ecf7", nodeInk: "#1b5893",
};

// the 2D view's classes (bench.css), in grid units
const STYLE = {
  lead: { c: COLORS.ink, w: 0.085 }, body: { c: COLORS.ink, w: 0.095 }, fill: { fill: COLORS.paper },
  plate: { w: 0.15 }, lever: { w: 0.09 }, tag: { fill: COLORS.tag }, meter: { fill: COLORS.paper },
  mark: { c: COLORS.ink, w: 0.07 }, thin: { w: 0.055 }, contact: { c: COLORS.ink, w: 0.06, fill: COLORS.paper },
  "pol-dot": { fill: COLORS.ink }, "sym-text": { c: COLORS.ink, size: 0.62, bold: true }, small: { size: 0.46, bold: false },
};
const styleOf = (cls) => Object.assign({}, ...String(cls || "").split(/\s+/).map((k) => STYLE[k] || {}));

// ---- a small SVG reader: just what editor/symbols.js writes ----

const ident = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(s) {
  let m = ident;
  for (const [, fn, args] of String(s || "").matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args.trim().split(/[\s,]+/).map(Number);
    if (fn === "translate") m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    else if (fn === "rotate") { const t = ((a[0] || 0) * Math.PI) / 180; m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); }
    else if (fn === "scale") m = mul(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
  }
  return m;
}

// an elliptical arc (SVG's endpoint form) as points after the start, up to the end
function arc(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  if (!rx || !ry) return [[x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  pts[pts.length - 1] = [x2, y2];
  return pts;
}

const cubic = (p0, p1, p2, p3) => Array.from({ length: 10 }, (_, i) => {
  const t = (i + 1) / 10, u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
});

// path data as subpaths of points: [{pts, closed}]
export function pathPoints(d) {
  const tok = String(d).match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let i = 0, cmd = "", cur = [0, 0], start = [0, 0], lastCtrl = null, sub = null;
  const num = () => Number(tok[i++]);
  const begin = (p) => { sub = { pts: [p], closed: false }; subs.push(sub); start = p; };
  const to = (pts) => { if (!sub) begin(cur); sub.pts.push(...pts); cur = pts[pts.length - 1]; };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const P = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "M") { const p = P(num(), num()); cur = p; begin(p); cmd = rel ? "l" : "L"; lastCtrl = null; }
    else if (C === "L") { to([P(num(), num())]); lastCtrl = null; }
    else if (C === "H") { const x = num(); to([[rel ? cur[0] + x : x, cur[1]]]); lastCtrl = null; }
    else if (C === "V") { const y = num(); to([[cur[0], rel ? cur[1] + y : y]]); lastCtrl = null; }
    else if (C === "Z") { if (sub) { sub.closed = true; cur = start; } sub = null; lastCtrl = null; }
    else if (C === "A") {
      const rx = num(), ry = num(), phi = num(), large = num(), sweep = num(), end = P(num(), num());
      to(arc(cur[0], cur[1], rx, ry, phi, large, sweep, end[0], end[1])); lastCtrl = null;
    } else if (C === "C") {
      const c1 = P(num(), num()), c2 = P(num(), num()), end = P(num(), num());
      to(cubic(cur, c1, c2, end)); lastCtrl = c2;
    } else if (C === "S") {
      const c1 = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const c2 = P(num(), num()), end = P(num(), num());
      to(cubic(cur, c1, c2, end)); lastCtrl = c2;
    } else i++;  // anything else isn't drawn by the bench
  }
  return subs;
}

const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// symbol markup under a transform, as shapes
function shapes(markup, m0, items) {
  const stack = [m0];
  let text = null;
  for (const [, close, tag, attrs, selfClose, txt] of markup.matchAll(/<(\/?)([a-z]+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
    if (txt !== undefined) { if (text) text.s += unescape(txt); continue; }
    const m = stack[stack.length - 1];
    if (close) {
      if (tag === "g") stack.pop();
      if (tag === "text" && text) { items.push(text); text = null; }
      continue;
    }
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    const st = styleOf(a.class);
    if (tag === "g") { if (!selfClose) stack.push(mul(m, parseTransform(a.transform))); }
    else if (tag === "path") {
      for (const s of pathPoints(a.d)) items.push({ k: "poly", pts: s.pts.map((p) => apply(m, p)), closed: s.closed, c: st.c, w: st.w, fill: st.fill });
    } else if (tag === "circle") {
      const r = +a.r * Math.hypot(m[0], m[1]);
      items.push({ k: "circle", at: apply(m, [+a.cx, +a.cy]), r, c: st.c, w: st.w, fill: st.fill });
    } else if (tag === "line") {
      items.push({ k: "poly", pts: [apply(m, [+a.x1, +a.y1]), apply(m, [+a.x2, +a.y2])], c: st.c, w: st.w });
    } else if (tag === "text") {
      text = { k: "text", s: "", at: apply(m, [+a.x || 0, +a.y || 0]), size: st.size || 0.6, c: st.c || COLORS.ink,
        bold: !!st.bold, anchor: a["text-anchor"] || "start" };
      if (selfClose) { items.push(text); text = null; }
    }
  }
  return items;
}

const textWidth = (s, size) => String(s).length * size * 0.56;

// the picture: {bounds: [x0, y0, x1, y1], items}
export function pictureOf(doc, net) {
  const items = [];
  for (const w of doc.wires) items.push({ k: "poly", pts: [w.a, w.b], c: COLORS.wire, w: 0.085 });
  for (const [x, y] of net?.junctions || []) items.push({ k: "circle", at: [x, y], r: 0.16, fill: COLORS.wire });
  for (const p of doc.parts) shapes(symbolMarkup(p), parseTransform(partTransform(p)), items);
  for (const p of doc.parts.filter((q) => q.type !== "GND" && q.type !== "LBL")) {
    const L = labelPlacement(p), v = valueText(p);
    const dy = L.stack === "up" ? [-0.72, 0] : [0, 0.68];
    items.push({ k: "text", s: p.id, at: [L.x, L.y + dy[0]], size: 0.5, c: COLORS.soft, anchor: L.anchor });
    if (v) items.push({ k: "text", s: v, at: [L.x, L.y + dy[1]], size: 0.58, c: COLORS.ink, bold: true, anchor: L.anchor });
  }
  // node names where the 2D view puts its voltage pills
  if (net) {
    const taken = [...doc.parts.map((p) => boxOf(p)), ...doc.parts.filter((p) => p.type !== "GND" && p.type !== "LBL").map(labelBox)];
    for (const nd of net.nodes) {
      if (nd.ground || !nd.at) continue;
      const name = nd.label || nd.name, h = 0.7, w = 0.5 + textWidth(name, 0.46);
      const spot = placePill(net.pieces.filter((pc) => pc.node === nd.index), nd.at, w, h, taken);
      taken.push([spot[0], spot[1], spot[0] + w, spot[1] + h]);
      items.push({ k: "pill", s: name, at: spot, w, h, size: 0.46, c: COLORS.nodeInk, fill: COLORS.nodeBg });
    }
    const open = [...openEnds(net), ...openPins(net)];
    for (const [x, y] of open) items.push({ k: "circle", at: [x, y], r: 0.3, c: COLORS.red, w: 0.09 });
  }
  // what everything covers, text included
  const xs = [], ys = [];
  for (const it of items) {
    if (it.k === "poly") for (const [x, y] of it.pts) { xs.push(x); ys.push(y); }
    else if (it.k === "circle") { xs.push(it.at[0] - it.r, it.at[0] + it.r); ys.push(it.at[1] - it.r, it.at[1] + it.r); }
    else if (it.k === "pill") { xs.push(it.at[0], it.at[0] + it.w); ys.push(it.at[1], it.at[1] + it.h); }
    else if (it.k === "text") {
      const w = textWidth(it.s, it.size), x0 = it.anchor === "middle" ? it.at[0] - w / 2 : it.anchor === "end" ? it.at[0] - w : it.at[0];
      xs.push(x0, x0 + w); ys.push(it.at[1] - it.size * 0.8, it.at[1] + it.size * 0.25);
    }
  }
  for (const p of doc.parts) {
    if (p.type === "GND" || p.type === "LBL") continue;
    const r = labelRect(p);
    xs.push(r[0], r[2]); ys.push(r[1], r[3]);
  }
  const bounds = xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 10, 6];
  return { bounds, items };
}
