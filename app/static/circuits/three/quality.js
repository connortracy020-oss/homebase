// How much the 3D view draws, so it stays smooth from a phone on battery to the RTX laptop.
// Picked automatically; you can override it in the 3D toolbar. A frame-time governor
// lowers the resolution first (cheapest to lose), then the ambient occlusion.

export const TIERS = {
  battery: { label: "Battery", ratio: 1.25, shadows: false, shadowSize: 0, bloom: false, ao: false, msaa: 0, beads: 400 },
  balanced: { label: "Balanced", ratio: 2, shadows: true, shadowSize: 1024, bloom: true, ao: false, msaa: 4, beads: 1500 },
  cinematic: { label: "Cinematic", ratio: 2.5, shadows: true, shadowSize: 2048, bloom: true, ao: true, msaa: 4, beads: 4000 },
};

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch { return ""; }
}

export function detectTier(renderer) {
  const gpu = gpuName(renderer);
  const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 900;
  if (phone) return "battery";
  if (/RTX|GTX 1[06-9]\d|GTX 16|RX [5-9]\d{3}|Radeon Pro|Arc A[57]|Apple M\d (Pro|Max|Ultra)/i.test(gpu)) return "cinematic";
  return "balanced";
}

// watch frame times; call drop() when frames run long for a second or more
export class Governor {
  constructor(onDrop) { this.onDrop = onDrop; this.samples = []; this.cool = 0; }
  frame(ms) {
    this.samples.push(ms);
    if (this.samples.length < 45) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    if (this.cool > 0) { this.cool -= 1; return; }
    if (avg > 24) { this.onDrop(avg); this.cool = 3; }
  }
  reset() { this.samples = []; this.cool = 2; }
}
