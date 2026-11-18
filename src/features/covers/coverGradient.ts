// Deterministic "auto cover" colours (no images, no copyright): the same seed always gives the same cover.
// Both gradient stops are darkened until white text on them has contrast >= 4.5 (WCAG AA).

export const DEFAULT_COVER_COLOR = '#64748B';
const HEX = /^#[0-9a-f]{6}$/i;

/** FNV-1a 32-bit */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** small seeded random generator, returns numbers in [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : DEFAULT_COVER_COLOR;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const rgbToHex = (r: number, g: number, b: number) => `#${to2(r)}${to2(g)}${to2(b)}`;

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
}

const hslHex = (h: number, s: number, l: number) => rgbToHex(...hslToRgb(h, s, l));

/** WCAG relative luminance (0 = black, 1 = white) */
export function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** contrast ratio of white text on this background (1 ... 21) */
export const contrastWithWhite = (hex: string) => 1.05 / (relLuminance(hex) + 0.05);

/** darken a colour (keeping hue) until white text on it reaches `min` contrast */
export function darkenToContrast(hex: string, min = 4.5): string {
  const [h, s, l0] = rgbToHsl(...hexToRgb(hex));
  let l = l0;
  let out = rgbToHex(...hexToRgb(hex));
  for (let i = 0; i < 60 && contrastWithWhite(out) < min; i++) {
    l = Math.max(0, l - 0.02);
    out = hslHex(h, s, l);
  }
  return out;
}

export type CoverBlob = { cx: number; cy: number; r: number; opacity: number };
export type CoverPalette = { from: string; to: string; angle: number; blobs: CoverBlob[] };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function coverPalette(seed: string, baseColor?: string | null): CoverPalette {
  const rnd = mulberry32(hashString(seed || 'thai77'));
  const base = baseColor && HEX.test(baseColor) ? baseColor : DEFAULT_COVER_COLOR;
  const [h, s0, l0] = rgbToHsl(...hexToRgb(base));
  const s = clamp(s0, 0.3, 0.85);
  const l = clamp(l0, 0.26, 0.42);
  const h1 = h + (rnd() * 24 - 12);
  const h2 = h + 18 + rnd() * 34;
  const from = darkenToContrast(hslHex(h1, s, l));
  const to = darkenToContrast(hslHex(h2, clamp(s - 0.05, 0.25, 0.85), clamp(l - 0.06, 0.2, 0.4)));
  const angle = 115 + Math.floor(rnd() * 100);
  const blobs: CoverBlob[] = Array.from({ length: 4 }, () => ({
    cx: round1(5 + rnd() * 90),
    cy: round1(5 + rnd() * 90),
    r: round1(18 + rnd() * 30),
    opacity: round1((0.06 + rnd() * 0.08) * 100) / 100,
  }));
  return { from, to, angle, blobs };
}
