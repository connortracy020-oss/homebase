// How much the 3D view draws, so it stays smooth from a phone on battery to a gaming laptop.
// Picked automatically; you can override it in the 3D toolbar. Every tier keeps the look
// (bloom, soft shadows, antialiasing); they differ in resolution, shadow detail and how many
// current particles there are. A frame-time governor lowers the resolution if frames run long.

export const TIERS = {
  battery: { label: "Battery", ratio: 1.5, shadowSize: 1024, bloom: 0.5, msaa: 4, beads: 600 },
  balanced: { label: "Balanced", ratio: 2, shadowSize: 2048, bloom: 1, msaa: 4, beads: 1800 },
  cinematic: { label: "Cinematic", ratio: 2.5, shadowSize: 4096, bloom: 1, msaa: 8, beads: 4000 },
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

// watch frame times while the view is on screen; call onDrop when they run long for a few
// seconds. Frames the browser throttles (a hidden tab, a long pause) don't count.
export class Governor {
  constructor(onDrop) { this.onDrop = onDrop; this.samples = []; this.cool = 2; }
  frame(ms) {
    if (document.hidden || !(ms > 0) || ms > 120) return;
    this.samples.push(ms);
    if (this.samples.length < 120) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length * 0.6)];
    this.samples = [];
    if (this.cool > 0) { this.cool -= 1; return; }
    if (typical > 22) { this.onDrop(typical); this.cool = 2; }
  }
  reset() { this.samples = []; this.cool = 2; }
}
