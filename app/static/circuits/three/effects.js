// Heat as embers: a resistor taking power gives off glowing motes that drift up, sway and fade,
// more and brighter the hotter it runs (its share of the most power any resistor takes). Purely
// a picture of where the power goes; the numbers are in the panel.

import * as THREE from "three";

export class Embers {
  constructor(parent, capacity = 420) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1);
    this.life = new Float32Array(capacity).fill(1);
    this.seed = new Float32Array(capacity);
    this.heat = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.draw = new Float32Array(capacity * 3);
    const g = this.geometry = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.draw, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(2.2, 0.72, 0.2) }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, aSize * uScale / -mv.z);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float a = (exp(-r2 * 9.0) + exp(-r2 * 2.5) * 0.25) * vAlpha;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    parent.add(this.points);
    this.next = 0;
    this.acc = new Map();
  }

  setScale(px) { this.material.uniforms.uScale.value = px; }

  // emitters: [{id, center, dir, len, heat}] (world space); true while any ember is alive
  update(dt, emitters) {
    for (const e of emitters) {
      if (!(e.heat > 0.12)) { this.acc.delete(e.id); continue; }
      let acc = (this.acc.get(e.id) || 0) + dt * 30 * e.heat * e.heat;
      while (acc >= 1) { this.spawn(e); acc -= 1; }
      this.acc.set(e.id, acc);
    }
    let w = 0;
    const { pos, vel, age, life, seed, heat, size, alpha, draw } = this;
    for (let i = 0; i < this.capacity; i++) {
      if (age[i] >= life[i]) continue;
      age[i] += dt;
      const t = age[i] / life[i];
      if (t >= 1) continue;
      const k = i * 3;
      vel[k] += Math.sin(age[i] * 3.1 + seed[i]) * 0.35 * dt;
      vel[k + 2] += Math.cos(age[i] * 2.7 + seed[i] * 1.7) * 0.35 * dt;
      vel[k + 1] *= 1 - 0.25 * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      draw[w * 3] = pos[k]; draw[w * 3 + 1] = pos[k + 1]; draw[w * 3 + 2] = pos[k + 2];
      size[w] = 0.11 * (1 - 0.55 * t) * (0.7 + 0.5 * heat[i]);
      alpha[w] = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) * (0.45 + 0.55 * heat[i]);
      w++;
    }
    this.geometry.setDrawRange(0, w);
    for (const name of ["position", "aSize", "aAlpha"]) {
      const attr = this.geometry.getAttribute(name);
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, w * (name === "position" ? 3 : 1));
      attr.needsUpdate = true;
    }
    return w > 0 || this.acc.size > 0;
  }

  spawn(e) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const k = i * 3, along = (Math.random() - 0.5) * e.len * 0.8, ang = Math.random() * Math.PI * 2;
    this.pos[k] = e.center.x + e.dir.x * along + Math.cos(ang) * 0.12;
    this.pos[k + 1] = e.center.y + e.dir.y * along + 0.18;
    this.pos[k + 2] = e.center.z + e.dir.z * along + Math.sin(ang) * 0.12;
    this.vel[k] = (Math.random() - 0.5) * 0.12;
    this.vel[k + 1] = 0.45 + Math.random() * 0.45;
    this.vel[k + 2] = (Math.random() - 0.5) * 0.12;
    this.age[i] = 0;
    this.life[i] = 1.3 + Math.random() * 0.9;
    this.seed[i] = Math.random() * 10;
    this.heat[i] = e.heat;
  }

  clear() { this.age.fill(1); this.life.fill(1); this.acc.clear(); this.geometry.setDrawRange(0, 0); }

  dispose() { this.points.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
