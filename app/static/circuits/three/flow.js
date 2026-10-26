// Current as glowing particles. Paths that carry the same current (a trace, a resistor, the
// next trace round a corner) are joined into one chain, so a particle flows on through corners
// and parts instead of jumping, and a loop with no junctions is one closed stream. Each chain
// moves at a speed that grows with its current (log scale, so small currents still crawl) and
// eases when the current changes; its position is integrated, not computed from the clock, so
// nothing jumps when the solution does. Particles fade in and out where chains meet at a
// junction (where the current splits), and each one trails a short comet tail.

import * as THREE from "three";

const AT = new THREE.Vector3();
const SPACING = 1.1, MAX_SPEED = 2.4, TRAIL = 4, TRAIL_STEP = 0.07, END_FADE = 0.3;

export class Flow {
  constructor(parent, budget) {
    this.budget = budget;
    this.capacity = budget * (1 + TRAIL);
    this.pos = new Float32Array(this.capacity * 3);
    this.size = new Float32Array(this.capacity);
    this.alpha = new Float32Array(this.capacity);
    const g = this.geometry = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1.9, 1.32, 0.62) }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / -mv.z);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float a = (exp(-r2 * 18.0) * 1.2 + exp(-r2 * 4.5) * 0.22) * vAlpha;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    parent.add(this.points);
    this.chains = [];
    this.visible = true;
  }

  // the particles' size in pixels per world unit at distance 1
  setScale(px) { this.material.uniforms.uScale.value = px; }

  // edges: [{a, b, pts: [{x, z, node | avg, dy}], current(sol, flowOf)}], from every model.
  // anchored: the points current can leave the drawing through (part terminals, grounds,
  // labels shared with another). Wire stubs that end anywhere else carry no current and are
  // dropped, so they don't break a loop into pieces. Then the rest are joined into chains
  // through every point where exactly two meet.
  build(all, anchored = null) {
    let edges = all;
    if (anchored) {
      const count = new Map();
      for (const e of edges) for (const k of [e.a, e.b]) count.set(k, (count.get(k) || 0) + 1);
      const alive = new Set(edges.map((_, i) => i));
      let changed = true;
      while (changed) {
        changed = false;
        for (const i of alive) {
          const e = edges[i];
          const dead = [e.a, e.b].some((k) => count.get(k) === 1 && !anchored.has(k));
          if (!dead) continue;
          alive.delete(i);
          for (const k of [e.a, e.b]) count.set(k, count.get(k) - 1);
          changed = true;
        }
      }
      edges = edges.filter((_, i) => alive.has(i));
    }
    const deg = new Map(), adj = new Map();
    edges.forEach((e, i) => {
      for (const k of [e.a, e.b]) {
        deg.set(k, (deg.get(k) || 0) + 1);
        if (!adj.has(k)) adj.set(k, []);
        adj.get(k).push(i);
      }
    });
    const used = new Array(edges.length).fill(false);
    const walk = (start, first) => {
      const parts = [];
      let k = start, i = first;
      while (i !== undefined && !used[i]) {
        used[i] = true;
        const e = edges[i], fwd = e.a === k;
        parts.push({ e, fwd });
        k = fwd ? e.b : e.a;
        if (deg.get(k) !== 2) break;
        i = adj.get(k).find((j) => !used[j]);
      }
      return parts;
    };
    const chains = [];
    for (const [k, d] of deg) if (d !== 2) for (const i of adj.get(k)) if (!used[i]) chains.push(this.chain(walk(k, i), false));
    for (let i = 0; i < edges.length; i++) if (!used[i]) chains.push(this.chain(walk(edges[i].a, i), true));
    this.chains = chains.filter((c) => c.spec.length >= 2);
    this.layoutDirty = true;
  }

  chain(parts, closed) {
    // the chain's points in order, each a layout point at some node's height
    const spec = [];
    for (const { e, fwd } of parts) {
      const pts = fwd ? e.pts : [...e.pts].reverse();
      for (const p of pts) {
        const last = spec[spec.length - 1];
        if (last && !p.at && !last.at && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.z - p.z) < 1e-6 && last.node === p.node && last.dy === p.dy) continue;
        spec.push(p);
      }
    }
    if (closed && spec.length > 2) {
      const a = spec[0], b = spec[spec.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) spec.pop();
    }
    const n = spec.length + (closed ? 1 : 0);
    return {
      parts, closed, spec,
      xyz: new Float32Array(n * 3), cum: new Float32Array(n), length: 0,
      phase: Math.random() * SPACING, speed: 0, goal: 0, fade: 0, fadeGoal: 0, count: 0,
    };
  }

  // the chains' currents from a new solution: each chain's current is the average of its
  // parts' (they're in series, so they agree), signed along the chain. scale: the current that
  // moves at full speed, fixed through an AC cycle or a run (else this solution's largest)
  setCurrents(sol, flowOf, { electron = false, hidden = false, scale = 0 } = {}) {
    let imax = 0;
    for (const c of this.chains) {
      let sum = 0, cnt = 0;
      for (const { e, fwd } of c.parts) {
        const i = sol?.ok ? e.current(sol, flowOf) || 0 : 0;
        if (Math.abs(i) > 0) { sum += fwd ? i : -i; cnt++; }
      }
      c.i = cnt ? sum / cnt : 0;
      imax = Math.max(imax, Math.abs(c.i));
    }
    const norm = this.imax = scale > 0 ? Math.max(scale, imax) : imax;
    const dir = electron ? -1 : 1;
    for (const c of this.chains) {
      const rel = norm > 0 ? Math.abs(c.i) / norm : 0;
      const on = !hidden && rel > 1e-4;
      c.goal = on ? dir * Math.sign(c.i) * MAX_SPEED * Math.log10(1 + 9 * rel) : 0;
      c.fadeGoal = on ? 1 : 0;
    }
  }

  // positions along every chain for the current heights
  layout(H) {
    for (const c of this.chains) {
      const { spec, xyz, cum } = c;
      const n = spec.length + (c.closed ? 1 : 0);
      let total = 0;
      for (let k = 0; k < n; k++) {
        const p = spec[k % spec.length];
        if (p.at) { p.at(H, AT); xyz[k * 3] = AT.x; xyz[k * 3 + 1] = AT.y; xyz[k * 3 + 2] = AT.z; }
        else {
          const y = p.avg ? p.avg.reduce((s, x) => s + H(x), 0) / p.avg.length + p.dy : H(p.node) + p.dy;
          xyz[k * 3] = p.x; xyz[k * 3 + 1] = y; xyz[k * 3 + 2] = p.z;
        }
        if (k) total += Math.hypot(xyz[k * 3] - xyz[k * 3 - 3], xyz[k * 3 + 1] - xyz[k * 3 - 2], xyz[k * 3 + 2] - xyz[k * 3 - 1]);
        cum[k] = total;
      }
      c.length = total;
      if (c.closed && !c.count) c.count = Math.max(1, Math.round(total / SPACING));
    }
    // spread the particles thinner on a big circuit so the budget holds
    const want = this.chains.reduce((s, c) => s + c.length / SPACING, 0);
    this.spacing = Math.max(SPACING, (want * SPACING) / this.budget);
  }

  // a point at arc length s along chain c
  at(c, s, out, k0 = 1) {
    const { cum, xyz } = c;
    const n = cum.length;
    let k = Math.max(1, Math.min(n - 1, k0));
    while (k < n - 1 && cum[k] < s) k++;
    while (k > 1 && cum[k - 1] > s) k--;
    const seg = cum[k] - cum[k - 1], f = seg > 1e-9 ? (s - cum[k - 1]) / seg : 0;
    out[0] = xyz[k * 3 - 3] + (xyz[k * 3] - xyz[k * 3 - 3]) * f;
    out[1] = xyz[k * 3 - 2] + (xyz[k * 3 + 1] - xyz[k * 3 - 2]) * f;
    out[2] = xyz[k * 3 - 1] + (xyz[k * 3 + 2] - xyz[k * 3 - 1]) * f;
    return k;
  }

  // advance and draw; true while anything is moving or fading
  update(dt, H, heightsMoved) {
    if (heightsMoved || this.layoutDirty) { this.layout(H); this.layoutDirty = false; }
    const pos = this.pos, size = this.size, alpha = this.alpha, p = [0, 0, 0];
    let w = 0, active = false;
    const kv = 1 - Math.exp(-dt * 5), kf = 1 - Math.exp(-dt * 4);
    for (const c of this.chains) {
      c.speed += (c.goal - c.speed) * kv;
      c.fade += (c.fadeGoal - c.fade) * kf;
      if (Math.abs(c.goal - c.speed) > 1e-3 || Math.abs(c.fadeGoal - c.fade) > 1e-3) active = true;
      if (Math.abs(c.speed) > 1e-4) active = true;
      if (!this.visible || c.fade < 0.01 || c.length < 1e-3) continue;
      c.phase += c.speed * dt;
      const L = c.length;
      const space = c.closed ? L / c.count : this.spacing;
      const trail = Math.min(1, Math.abs(c.speed) / (MAX_SPEED * 0.35));
      const back = c.speed >= 0 ? -1 : 1;
      let s = ((c.phase % space) + space) % space;
      let k = 1;
      for (; s < L && w + 1 + TRAIL <= this.capacity; s += space) {
        let a = c.fade;
        if (!c.closed) a *= Math.min(1, s / END_FADE, (L - s) / END_FADE);
        if (a <= 0.01) continue;
        k = this.at(c, s, p, k);
        pos[w * 3] = p[0]; pos[w * 3 + 1] = p[1]; pos[w * 3 + 2] = p[2];
        size[w] = 0.24; alpha[w] = a; w++;
        for (let j = 1; j <= TRAIL && trail > 0.05; j++) {
          let st = s + back * j * TRAIL_STEP;
          if (c.closed) st = ((st % L) + L) % L; else if (st < 0 || st > L) break;
          this.at(c, st, p, k);
          pos[w * 3] = p[0]; pos[w * 3 + 1] = p[1]; pos[w * 3 + 2] = p[2];
          size[w] = 0.22 * (1 - j / (TRAIL + 1.5)); alpha[w] = a * trail * 0.38 * (1 - j / (TRAIL + 1)); w++;
        }
      }
    }
    this.geometry.setDrawRange(0, w);
    for (const name of ["position", "aSize", "aAlpha"]) {
      const attr = this.geometry.getAttribute(name);
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, w * (name === "position" ? 3 : 1));
      attr.needsUpdate = true;
    }
    return active;
  }

  dispose() { this.points.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
