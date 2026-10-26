// Materials and small procedural textures for the 3D view (no image files to download).

import * as THREE from "three";
import { rampRGB, phaseRGB } from "../views/palette.js";

const cache = new Map();

export function voltageColor3(v, vmax) {
  const [r, g, b] = rampRGB(vmax > 0 ? v / vmax : 0);
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);  // the palette is sRGB, like the 2D view
}

// a phase angle as a hue, for the AC "|V| and phase" view
export function phaseColor3(angle, strength) {
  const [r, g, b] = phaseRGB(angle, strength);
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

// glassy, softly lit tiles for a node's wires: the color is the node's voltage
export function plateauMaterial(color, { unknown = false } = {}) {
  const key = `plat:${color.getHexString()}:${unknown}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshPhysicalMaterial({
      color: unknown ? new THREE.Color("#555049") : color,
      emissive: unknown ? new THREE.Color("#000000") : color,
      emissiveIntensity: unknown ? 0 : 0.5,
      roughness: 0.55, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.3,
    }));
  }
  return cache.get(key);
}

// a light curtain from the floor up to a plateau, so heights read at a glance
export function curtainMaterial(color) {
  const key = `curt:${color.getHexString()}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({
      color, alphaMap: gradientTexture(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return cache.get(key);
}

let gradient = null;
function gradientTexture() {
  if (gradient) return gradient;
  const c = document.createElement("canvas");
  c.width = 4; c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, "rgb(170,170,170)");
  grd.addColorStop(0.35, "rgb(60,60,60)");
  grd.addColorStop(1, "rgb(0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  gradient = new THREE.CanvasTexture(c);
  return gradient;
}

// the bench mat: dark, slightly textured, with a dot every grid unit
export function boardMaterial(w, d) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#24221d";
  g.fillRect(0, 0, 128, 128);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = "rgba(239,231,214,0.22)";
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w, d);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 });
}

const shared = {};
export function mat(name) {
  if (shared[name]) return shared[name];
  const M = {
    ceramic: () => new THREE.MeshStandardMaterial({ color: "#dccdab", roughness: 0.42 }),
    lead: () => new THREE.MeshStandardMaterial({ color: "#c2b9a6", roughness: 0.3, metalness: 0.85 }),
    plastic: () => new THREE.MeshPhysicalMaterial({ color: "#2c2a25", roughness: 0.32, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    glass: () => new THREE.MeshPhysicalMaterial({ color: "#d8d3c6", roughness: 0.08, transmission: 0.0, transparent: true, opacity: 0.32, depthWrite: false }),
    plate: () => new THREE.MeshStandardMaterial({ color: "#c9c2b2", roughness: 0.25, metalness: 0.9 }),
    copper: () => new THREE.MeshStandardMaterial({ color: "#c98a52", roughness: 0.3, metalness: 0.95 }),
    bead: () => new THREE.MeshStandardMaterial({ color: "#fff1cf", emissive: "#ffd27a", emissiveIntensity: 1.7, roughness: 0.4 }),
    floor: () => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }),
    mark: () => new THREE.MeshBasicMaterial({ color: "#efe7d6" }),
    arrow: () => new THREE.MeshStandardMaterial({ color: "#ffd98a", emissive: "#ffb84d", emissiveIntensity: 0.6, roughness: 0.4 }),
  }[name];
  shared[name] = M();
  return shared[name];
}

const BAND = ["#151515", "#7a4a22", "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2e6fd8", "#8e44ad", "#8a8a8a", "#f4f4f4"];
export function bandMaterial(k) {
  const key = `band:${k}`;
  if (!cache.has(key)) {
    const color = k === "gold" ? "#c9a24a" : k === "silver" ? "#c0c0c0" : k === "brown1" ? BAND[1] : BAND[k];
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: k === "gold" || k === "silver" ? 0.8 : 0 }));
  }
  return cache.get(key);
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
