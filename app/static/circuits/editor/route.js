// Automatic wire routing for tap-to-tap wiring: shortest square path on the grid with few bends
// that never makes a connection you didn't ask for. It won't run along another wire, pass
// through a terminal or wire end, cut through a part, or bend on top of another wire.

import { pinPoints, key } from "../core/doc.js";
import { BOX } from "./symbols.js";
import { transform } from "../core/doc.js";

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const BEND = 3;

class Heap {
  constructor() { this.a = []; }
  push(item) {
    const a = this.a; a.push(item);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

function obstacles(doc, ends) {
  const blocked = new Set(), noBend = new Set(), onWire = [];
  const endKeys = new Set(ends.map((p) => key(...p)));
  for (const part of doc.parts) {
    const b = BOX[part.type];
    if (b && part.type !== "LBL") {
      const corners = [transform(part, b[0], b[1]), transform(part, b[2], b[3])];
      const x0 = Math.min(corners[0][0], corners[1][0]), x1 = Math.max(corners[0][0], corners[1][0]);
      const y0 = Math.min(corners[0][1], corners[1][1]), y1 = Math.max(corners[0][1], corners[1][1]);
      for (let x = Math.ceil(x0 - 0.2); x <= Math.floor(x1 + 0.2); x++) {
        for (let y = Math.ceil(y0 - 0.2); y <= Math.floor(y1 + 0.2); y++) blocked.add(key(x, y));
      }
    }
    for (const p of pinPoints(part)) blocked.add(key(p.x, p.y));
  }
  for (const w of doc.wires) {
    blocked.add(key(...w.a)); blocked.add(key(...w.b));
    onWire.push(w);
    const [ax, ay] = w.a, [bx, by] = w.b;
    if (ax === bx || ay === by) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) noBend.add(key(x, y));
    }
  }
  for (const k of endKeys) { blocked.delete(k); noBend.delete(k); }
  return { blocked, noBend, onWire };
}

// both points lie on the same existing wire: walking between them would overlap it
function alongWire(onWire, x1, y1, x2, y2) {
  for (const w of onWire) {
    const [ax, ay] = w.a, [bx, by] = w.b;
    const on = (x, y) => (bx - ax) * (y - ay) === (by - ay) * (x - ax) && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
    if (on(x1, y1) && on(x2, y2)) return true;
  }
  return false;
}

// -> [[x, y], ...] corner points from `from` to `to`, or null
export function route(doc, from, to) {
  if (from[0] === to[0] && from[1] === to[1]) return null;
  const { blocked, noBend, onWire } = obstacles(doc, [from, to]);
  const xs = [from[0], to[0], ...doc.parts.map((p) => p.x), ...doc.wires.flatMap((w) => [w.a[0], w.b[0]])];
  const ys = [from[1], to[1], ...doc.parts.map((p) => p.y), ...doc.wires.flatMap((w) => [w.a[1], w.b[1]])];
  const X0 = Math.min(...xs) - 8, X1 = Math.max(...xs) + 8, Y0 = Math.min(...ys) - 8, Y1 = Math.max(...ys) + 8;
  const h = (x, y) => Math.abs(x - to[0]) + Math.abs(y - to[1]) + (x !== to[0] && y !== to[1] ? BEND : 0);
  const best = new Map(), back = new Map();
  const heap = new Heap();
  const sk = (x, y, d) => `${x},${y},${d}`;
  heap.push([h(...from), 0, from[0], from[1], -1]);
  best.set(sk(from[0], from[1], -1), 0);
  let found = null, budget = 60000;
  while (heap.size && budget-- > 0) {
    const [, g, x, y, d] = heap.pop();
    if (x === to[0] && y === to[1]) { found = sk(x, y, d); break; }
    if (g > (best.get(sk(x, y, d)) ?? Infinity)) continue;
    for (let nd = 0; nd < 4; nd++) {
      if (d >= 0 && (nd + 2) % 4 === d) continue;  // no U-turns
      const turning = d >= 0 && nd !== d;
      if (turning && noBend.has(key(x, y)) && !(x === from[0] && y === from[1])) continue;
      const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1];
      if (nx < X0 || nx > X1 || ny < Y0 || ny > Y1) continue;
      const nk = key(nx, ny);
      if (blocked.has(nk)) continue;
      if (alongWire(onWire, x, y, nx, ny)) continue;
      const ng = g + 1 + (turning ? BEND : 0);
      const s = sk(nx, ny, nd);
      if (ng >= (best.get(s) ?? Infinity)) continue;
      best.set(s, ng);
      back.set(s, sk(x, y, d));
      heap.push([ng + h(nx, ny), ng, nx, ny, nd]);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let s = found; s; s = back.get(s)) { const [x, y] = s.split(",").map(Number); cells.push([x, y]); }
  cells.reverse();
  // keep only the corners
  const out = [cells[0]];
  for (let i = 1; i + 1 < cells.length; i++) {
    const [px, py] = cells[i - 1], [x, y] = cells[i], [nx, ny] = cells[i + 1];
    if ((x - px) !== (nx - x) || (y - py) !== (ny - y)) out.push([x, y]);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

// the simple L-shaped path, used while dragging a wire by hand
export function elbow(from, to, horizontalFirst = true) {
  if (from[0] === to[0] || from[1] === to[1]) return [from, to];
  const corner = horizontalFirst ? [to[0], from[1]] : [from[0], to[1]];
  return [from, corner, to];
}
