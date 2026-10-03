/**
 * Color math for the design-token tests: WCAG contrast, CIE Lab, CIEDE2000
 * and color-vision-deficiency simulation. Pure functions, no DOM.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

const HEX = /^#([0-9a-f]{6})$/i;

export function parseHex(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** sRGB channel (0-255) to linear light (0-1). */
export function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0-1) to sRGB channel (0-255). */
export function linearToChannel(linear: number): number {
  const c = Math.max(0, Math.min(1, linear));
  const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return srgb * 255;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelToLinear(color.r) +
    0.7152 * channelToLinear(color.g) +
    0.0722 * channelToLinear(color.b)
  );
}

/** WCAG 2.x contrast ratio between two hex colors, 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(parseHex(foreground));
  const l2 = relativeLuminance(parseHex(background));
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

// D65 reference white
const WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };

export function rgbToLab(color: Rgb): Lab {
  const r = channelToLinear(color.r);
  const g = channelToLinear(color.g);
  const b = channelToLinear(color.b);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / WHITE.x;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / WHITE.y;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / WHITE.z;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** CIEDE2000 color difference (Sharma, Wu, Dalal 2005). */
export function deltaE2000(first: Lab, second: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const cMean = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const a1 = (1 + g) * first.a;
  const a2 = (1 + g) * second.a;
  const c1p = Math.hypot(a1, first.b);
  const c2p = Math.hypot(a2, second.b);

  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = toDegrees(Math.atan2(b, a));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(a1, first.b);
  const h2p = hue(a2, second.b);

  const dL = second.l - first.l;
  const dC = c2p - c1p;
  let dh = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dh = diff;
    else dh = diff > 180 ? diff - 360 : diff + 360;
  }
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRadians(dh / 2));

  const lMean = (first.l + second.l) / 2;
  const cpMean = (c1p + c2p) / 2;
  let hMean: number;
  if (c1p * c2p === 0) hMean = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hMean = (h1p + h2p) / 2;
  else hMean = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

  const t =
    1 -
    0.17 * Math.cos(toRadians(hMean - 30)) +
    0.24 * Math.cos(toRadians(2 * hMean)) +
    0.32 * Math.cos(toRadians(3 * hMean + 6)) -
    0.2 * Math.cos(toRadians(4 * hMean - 63));
  const dTheta = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cpMean ** 7 / (cpMean ** 7 + 25 ** 7));
  const sL = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sC = 1 + 0.045 * cpMean;
  const sH = 1 + 0.015 * cpMean * t;
  const rT = -Math.sin(toRadians(2 * dTheta)) * rC;

  const lTerm = dL / (kL * sL);
  const cTerm = dC / (kC * sC);
  const hTerm = dH / (kH * sH);
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rT * cTerm * hTerm);
}

/** Color difference between two hex colors. */
export function deltaEHex(first: string, second: string): number {
  return deltaE2000(rgbToLab(parseHex(first)), rgbToLab(parseHex(second)));
}

export type ColorVisionDeficiency = "protanopia" | "deuteranopia";

/** Machado, Oliveira and Fernandes (2009) matrices at full severity, applied in linear RGB. */
const CVD_MATRICES: Record<ColorVisionDeficiency, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

/** Returns the color as seen with the given color-vision deficiency. */
export function simulateCvd(hex: string, type: ColorVisionDeficiency): string {
  const { r, g, b } = parseHex(hex);
  const linear = [channelToLinear(r), channelToLinear(g), channelToLinear(b)];
  const [lr, lg, lb] = CVD_MATRICES[type].map((row) =>
    row.reduce((sum, weight, index) => sum + weight * linear[index], 0),
  );
  return toHex({ r: linearToChannel(lr), g: linearToChannel(lg), b: linearToChannel(lb) });
}
