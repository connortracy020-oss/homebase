// Materials, shaders and procedural textures for the 3D view (no image files to download).
// The colors that mean something come from the bench's solution: a node's voltage (or, in AC,
// its phase), a resistor's heat, a capacitor's field. Each of those materials belongs to one
// node or part and changes in place, so playback never makes new materials. Everything else
// (metals, plastics, the bench) is shared set dressing.

import * as THREE from "three";
import { rampRGB, phaseRGB } from "../views/palette.js";

export function voltageColor3(v, vmax, out = new THREE.Color()) {
  const [r, g, b] = rampRGB(vmax > 0 ? v / vmax : 0);
  return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);  // the palette is sRGB, like the 2D view
}

// a phase angle as a hue, for the AC "|V| and phase" view
export function phaseColor3(angle, strength, out = new THREE.Color()) {
  const [r, g, b] = phaseRGB(angle, strength);
  return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

// one clock for every animated shader (curtain shimmer, field lines, screens)
export const TIME = { value: 0 };

const UNKNOWN = new THREE.Color("#4d4a44");

// ---- a node: its traces, junctions and source leads share one solid material, and its
// curtains one glowing one ----
export class NodeLook {
  constructor() {
    this.color = new THREE.Color("#666");
    this.solid = new THREE.MeshPhysicalMaterial({
      color: this.color.clone(), emissive: new THREE.Color(0), emissiveIntensity: 1,
      roughness: 0.26, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 0.9,
    });
    this.curtain = curtainMaterial();
    this.spill = spillMaterial();
  }

  // color: the node's color; level 0..1 how strongly it glows (|V| over the scale)
  set(color, { level = 1, dim = false, unknown = false } = {}) {
    const s = this.solid, k = dim ? 0.32 : 1;
    if (unknown) {
      s.color.copy(UNKNOWN); s.emissive.setRGB(0, 0, 0);
      this.curtain.uniforms.uOpacity.value = 0;
      this.spill.uniforms.uOpacity.value = 0;
      return;
    }
    this.color.copy(color);
    s.color.copy(color).multiplyScalar(0.55 + 0.45 * k);
    s.emissive.copy(color).multiplyScalar((0.1 + 0.55 * level) * k);
    this.curtain.uniforms.uColor.value.copy(color);
    this.curtain.uniforms.uOpacity.value = dim ? 0.04 : 0.16 + 0.26 * level;
    this.spill.uniforms.uColor.value.copy(color);
    this.spill.uniforms.uOpacity.value = dim ? 0.03 : 0.1 + 0.32 * level;
  }

  dispose() { this.solid.dispose(); this.curtain.dispose(); this.spill.dispose(); }
}

// a light curtain from the bench up to a trace, so heights read at a glance: bright under the
// trace, fading to the floor, with slow bands drifting up and a glowing line where it lands
function curtainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#888") }, uOpacity: { value: 0.3 }, uTime: TIME },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vY;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv; varying float vY;
      void main() {
        float top = clamp(vUv.y, 0.0, 1.0);  // (multisampling reads edge pixels just outside: pow() of a negative is NaN)
        float a = 0.05 + 0.95 * pow(top, 2.4);
        float bands = 0.5 + 0.5 * sin((vY * 1.7 - uTime * 0.55) * 6.2832);
        a *= 0.82 + 0.18 * bands;
        a += 0.9 * smoothstep(0.92, 1.0, top);          // a crisp edge under the trace
        a += 0.55 * (1.0 - smoothstep(0.0, 0.05, top));  // where it meets the bench
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// the glow a trace throws on the bench under it: soft across, rounded at the ends; dimmer and
// wider the higher the trace is (uHeight, set per trace)
function spillMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#888") }, uOpacity: { value: 0.2 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main() {
        float across = (vUv.y - 0.5) * 2.0;
        float along = min(vUv.x, 1.0 - vUv.x) * 2.0;
        float a = exp(-across * across * 4.0) * smoothstep(0.0, 0.35, along);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ---- the bench: a dark mat with a fine grid (a dot every grid unit, like the 2D bench, and a
// line every 5), fading into the fog so it has no edge ----
export function benchMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#22201b"), roughness: 0.74, metalness: 0.0, envMapIntensity: 0.3 });
  const uniforms = { uCenter: { value: new THREE.Vector2() }, uRadius: { value: 30 } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBenchPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBenchPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vBenchPos; uniform vec2 uCenter; uniform float uRadius;
        float gridLine(vec2 p, float w) { vec2 d = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(d.x, d.y) / w, 1.0); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec2 p = vBenchPos.xz;
          float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius * 1.25, length(p - uCenter));
          vec2 cell = fract(p + 0.5) - 0.5;
          float dotv = 1.0 - smoothstep(0.035, 0.07, length(cell));
          float major = gridLine(p / 5.0, 1.2);
          float minor = gridLine(p, 0.8);
          float pool = 1.0 - smoothstep(0.0, uRadius * 0.9, length(p - uCenter));
          diffuseColor.rgb *= 0.78 + 0.32 * pool;
          diffuseColor.rgb += vec3(1.0, 0.9, 0.74) * fade * (dotv * 0.055 + major * 0.026 + minor * 0.008);
        }`);
  };
  return m;
}

// the 0 V level, when some nodes sit below it: a faint glass sheet
export function zeroPlaneMaterial() {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3da"), transparent: true, opacity: 0.016, depthWrite: false, side: THREE.DoubleSide });
}

// ---- a capacitor's field: glowing lines between its plates, as bright as its voltage ----
export function fieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#ffd98a") }, uLevel: { value: 0 }, uTime: TIME },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uLevel; uniform float uTime; varying vec2 vUv;
      void main() {
        float lines = pow(max(0.0, 0.5 + 0.5 * cos(vUv.x * 6.2832 * 7.0)), 6.0);
        float pulse = 0.65 + 0.35 * sin(vUv.y * 9.0 - uTime * 4.0);
        float edge = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float a = uLevel * edge * (0.05 + 0.5 * lines * pulse);
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// ---- an inductor's magnetic field: loops from one end of the coil round to the other, as
// bright as its current, with dashes that move the way the field points (dir = +1 or -1) ----
export function fluxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.55, 0.75, 2.2) }, uLevel: { value: 0 }, uDir: { value: 1 }, uTime: TIME },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uLevel; uniform float uDir; uniform float uTime; varying vec2 vUv;
      void main() {
        float dash = smoothstep(0.25, 0.5, fract(vUv.x * 7.0 + uTime * 0.9 * uDir));
        float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        float a = uLevel * ends * (0.18 + 0.82 * dash) * 0.75;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ---- shared materials ----
const shared = {};
export function mat(name) {
  if (shared[name]) return shared[name];
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const make = {
    tin: () => std({ color: "#bfc3c9", metalness: 1, roughness: 0.46 }),             // tinned leads
    chrome: () => std({ color: "#cfd2d7", metalness: 1, roughness: 0.34 }),
    copper: () => std({ color: "#c47a43", metalness: 1, roughness: 0.34 }),
    brass: () => std({ color: "#c9a052", metalness: 1, roughness: 0.38 }),
    steel: () => std({ color: "#5d636b", metalness: 0.85, roughness: 0.5 }),
    ferrite: () => std({ color: "#2c2b2a", metalness: 0.2, roughness: 0.62 }),
    plate: () => std({ color: "#d3d6db", metalness: 1, roughness: 0.3 }),
    graphite: () => phys({ color: "#24231f", roughness: 0.36, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
    sleeveAC: () => phys({ color: "#173634", roughness: 0.34, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
    sleeveI: () => phys({ color: "#1d2142", roughness: 0.34, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
    acrylic: () => phys({ color: "#121212", roughness: 0.2, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ceramic: () => phys({ color: "#2b2925", roughness: 0.55, metalness: 0.0, clearcoat: 0.3 }),
    housing: () => phys({ color: "#2f3236", roughness: 0.4, metalness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    positive: () => std({ color: "#d8623a", metalness: 0.9, roughness: 0.3 }),
    glyph: () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd98a").multiplyScalar(0.85) }),
    glyphDim: () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#b9ad94") }),
    edge: () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc46b").multiplyScalar(1.8) }),
    hit: () => new THREE.MeshBasicMaterial({ visible: false }),  // invisible picking targets
  };
  shared[name] = make[name]();
  return shared[name];
}

// a resistor's own body material (it glows with the power it takes)
export function resistorMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: "#d4bd92", roughness: 0.46, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: new THREE.Color("#fff2d6") });
}

// black-body-ish color for heat 0..1: dull red, orange, then yellow-white
const HEAT = [[0, [0.55, 0.05, 0.02]], [0.5, [1.0, 0.2, 0.04]], [1, [1.0, 0.46, 0.12]]];  // dull red to orange: hot, never white
export function heatColor(h, out) {
  const x = Math.max(0, Math.min(1, h));
  let k = 0;
  while (k < HEAT.length - 2 && x > HEAT[k + 1][0]) k++;
  const [x0, c0] = HEAT[k], [x1, c1] = HEAT[k + 1], f = (x - x0) / (x1 - x0 || 1);
  return out.setRGB(c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f);
}

// ---- resistor color bands ----
const BAND = ["#151515", "#7a4a22", "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2e6fd8", "#8e44ad", "#8a8a8a", "#f4f4f4"];
const bandCache = new Map();
export function bandMaterial(k) {
  const key = String(k);
  if (!bandCache.has(key)) {
    const color = k === "gold" ? "#c9a24a" : k === "silver" ? "#c0c0c0" : k === "brown1" ? BAND[1] : BAND[k];
    const metal = k === "gold" || k === "silver";
    bandCache.set(key, new THREE.MeshPhysicalMaterial({ color, roughness: metal ? 0.3 : 0.42, metalness: metal ? 0.9 : 0, clearcoat: 0.4 }));
  }
  return bandCache.get(key);
}

// resistor color code for a value: 4 bands for 2 significant digits, 5 for 3; null if the
// value has more digits than bands can say (then the body stays plain: no invented bands)
export function colorBands(ohms) {
  if (!(ohms > 0)) return null;
  for (const digits of [2, 3]) {
    const exp = Math.floor(Math.log10(ohms)) - (digits - 1);
    const sig = Math.round(ohms / 10 ** exp);
    if (Math.abs(sig * 10 ** exp - ohms) > ohms * 1e-9 || exp < -2 || exp > 9) continue;
    const ds = String(sig).padStart(digits, "0").split("").map(Number);
    const mult = exp === -1 ? "gold" : exp === -2 ? "silver" : exp;
    return [...ds, mult, digits === 2 ? "gold" : "brown1"];
  }
  return null;
}

// ---- a meter's screen: a canvas the reading is drawn on when it changes ----
export class Screen {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256; this.canvas.height = 112;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.text = null;
    this.draw("—", "");
  }

  draw(text, unit) {
    const key = `${text}|${unit}`;
    if (key === this.text) return;
    this.text = key;
    const g = this.canvas.getContext("2d"), W = this.canvas.width, H = this.canvas.height;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#1f2b22"); grd.addColorStop(1, "#16201a");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(160,255,190,0.06)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.font = "600 54px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    g.textAlign = "right"; g.textBaseline = "middle";
    g.shadowColor = "rgba(150,255,180,0.8)"; g.shadowBlur = 14;
    g.fillStyle = "#c9ffd8";
    g.fillText(text, W - 16 - (unit ? 64 : 0), H / 2 + 2);
    if (unit) { g.font = "600 34px ui-sans-serif, system-ui, sans-serif"; g.fillText(unit, W - 14, H / 2 + 6); }
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); this.material.dispose(); }
}
