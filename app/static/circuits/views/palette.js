// The voltage color scale: one diverging ramp centred on ground. Positive voltages rise from a
// dim warm grey through ochre to bright amber, negative ones through slate to pale blue.
// Brightness grows with |V| on both sides, so the scale still reads in grayscale and for
// color-blind eyes, and there's never a red/green pair. Numbers always sit beside the color.

const POS = [[74, 70, 63], [143, 116, 64], [196, 154, 69], [240, 185, 85], [255, 217, 138]];
const NEG = [[74, 70, 63], [79, 100, 118], [95, 134, 168], [143, 180, 214], [207, 227, 245]];

// t in [-1, 1] -> [r, g, b] (0-255)
export function rampRGB(t) {
  const stops = t < 0 ? NEG : POS;
  const x = Math.min(1, Math.abs(t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x)), f = x - k;
  return stops[k].map((c, i) => Math.round(c + (stops[k + 1][i] - c) * f));
}

export function voltageColor(v, vmax) {
  const [r, g, b] = rampRGB(vmax > 0 ? v / vmax : 0);
  return `rgb(${r} ${g} ${b})`;
}

// a scale that ends on a round number of volts, so the legend reads well
export function niceMax(x) {
  if (!(x > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(x)), m = x / e;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => m <= k + 1e-9);
  return step * e;
}

export function legendGradient(direction = "90deg", signed = false) {
  const stops = signed ? [...NEG].reverse().concat(POS.slice(1)) : POS;
  return `linear-gradient(${direction}, ${stops.map(([r, g, b]) => `rgb(${r} ${g} ${b})`).join(", ")})`;
}

// A phase angle (radians) as a hue on an even-lightness circle (OKLCH), so no angle looks
// bigger than another: 0° amber like the positive end of the voltage scale, 90° green, ±180°
// blue, −90° magenta. strength 0–1 fades it toward grey (an amplitude near zero has no angle
// worth showing). The numbers always sit beside the color.
export function phaseRGB(angle, strength = 1) {
  const h = (72 * Math.PI) / 180 + angle, c = 0.13 * Math.max(0, Math.min(1, strength));
  return oklchRGB(0.75, c, h);
}

// OKLCH -> sRGB (0-255), clipped to the gamut
function oklchRGB(L, C, h) {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((x) => { const v = Math.max(0, Math.min(1, x)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); });
}
