// The renderer and its post-processing. The scene renders into a multisampled HDR target;
// whatever glows (current particles, hot resistors, bright traces) blooms; then one last pass
// tone-maps it and adds a soft vignette and a whisper of animated grain (which also hides
// banding in the dark). Folding those into the tone-mapping pass saves a full-screen pass.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// the vignette and grain, added at the end of the tone-mapping shader
function finishing(pass) {
  const m = pass.material;
  Object.assign(m.uniforms, { uVignette: { value: 0.42 }, uGrain: { value: 0.016 }, uTime: { value: 0 }, uAspect: { value: 1 } });
  let fs = m.fragmentShader.replace("varying vec2 vUv;", `varying vec2 vUv;
    uniform float uVignette; uniform float uGrain; uniform float uTime; uniform float uAspect;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`);
  const end = fs.lastIndexOf("}");
  fs = `${fs.slice(0, end)}
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      gl_FragColor.rgb *= mix(1.0 - uVignette, 1.0, 1.0 - smoothstep(0.2, 1.05, length(q)));  // (smoothstep needs edge0 < edge1)
      gl_FragColor.rgb += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * uGrain;
    }`;
  m.fragmentShader = fs;
  m.needsUpdate = true;
  return m.uniforms;
}

export class Pipeline {
  constructor() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
    r.setClearColor("#100f0d");
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;  // keeps the voltage colors true
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;  // shadows only change when heights do: redrawn on request
    this.ratio = 1; this.w = 1; this.h = 1;
    this.composer = null;
  }

  // (re)build the post chain for a quality tier
  setTier(tier, scene, camera) {
    this.tier = tier;
    this.composer?.dispose?.();
    const gl = this.renderer.getContext();
    const samples = Math.min(tier.msaa, gl.getParameter(gl.MAX_SAMPLES) || 4);
    const rt = new THREE.WebGLRenderTarget(this.w * this.ratio, this.h * this.ratio, { samples, type: THREE.HalfFloatType });
    const c = this.composer = new EffectComposer(this.renderer, rt);
    c.setPixelRatio(this.ratio);
    c.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w * tier.bloom, this.h * tier.bloom), 0.42, 0.45, 0.86);
    c.addPass(this.bloom);
    const out = new OutputPass();
    this.finish = finishing(out);
    this.finish.uAspect.value = this.w / this.h;
    c.addPass(out);
    c.setSize(this.w, this.h);
  }

  setPixelRatio(ratio) {
    this.ratio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(this.w, this.h);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.finish) this.finish.uAspect.value = w / h;
  }

  render(time, shadows) {
    if (shadows) this.renderer.shadowMap.needsUpdate = true;
    this.finish.uTime.value = time;
    this.composer.render();
  }

  dispose() { this.composer?.dispose?.(); this.renderer.dispose(); }
}
