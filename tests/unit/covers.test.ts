import { describe, expect, it } from 'vitest';
import {
  contrastWithWhite, coverPalette, darkenToContrast, hashString, hexToRgb, relLuminance, rgbToHex, rgbToHsl, hslToRgb,
} from '../../src/features/covers/coverGradient';
import { REGION_COLORS, REGION_ORDER, REGION_FALLBACK, regionColor } from '../../src/features/covers/regionColors';

const HEX = /^#[0-9a-f]{6}$/;

describe('hashString (FNV-1a)', () => {
  it('matches known values', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
  });
  it('is stable and unsigned', () => {
    expect(hashString('วัดพระแก้ว')).toBe(hashString('วัดพระแก้ว'));
    expect(hashString('วัดพระแก้ว')).toBeGreaterThanOrEqual(0);
  });
});

describe('colour maths', () => {
  it('luminance and contrast of black / white', () => {
    expect(relLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 5);
  });
  it('hex <-> hsl round trip stays within 1/255', () => {
    for (const hex of ['#0369a1', '#c2410c', '#15803d', '#7c3aed', '#a16207', '#64748b']) {
      const [r, g, b] = hexToRgb(hex);
      const [h, s, l] = rgbToHsl(r, g, b);
      const [r2, g2, b2] = hslToRgb(h, s, l);
      expect(Math.abs(r - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b - b2)).toBeLessThanOrEqual(1);
    }
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080');
  });
  it('hexToRgb falls back for invalid colours', () => {
    expect(hexToRgb('not-a-colour')).toEqual(hexToRgb('#64748B'));
  });
  it('darkenToContrast keeps dark colours and darkens light ones until AA', () => {
    expect(darkenToContrast('#000000')).toBe('#000000');
    for (const c of ['#ffffff', '#eab308', '#fde68a', '#38bdf8']) {
      expect(contrastWithWhite(darkenToContrast(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('coverPalette', () => {
  it('is deterministic for the same seed + colour', () => {
    expect(coverPalette('place-1', '#0284C7')).toEqual(coverPalette('place-1', '#0284C7'));
  });
  it('different seeds give different covers', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(coverPalette(`seed-${i}`, '#0284C7'))));
    expect(seen.size).toBeGreaterThanOrEqual(28);
  });
  it('both stops always allow readable white text (>= 4.5) for any base colour', () => {
    const bases = ['#EAB308', '#FFFFFF', '#000000', '#F472B6', '#38BDF8', '#B8860B', '#64748B', null, undefined, 'bad', '#12'];
    for (const base of bases) {
      for (let i = 0; i < 25; i++) {
        const p = coverPalette(`s${i}`, base as string | null | undefined);
        expect(p.from).toMatch(HEX);
        expect(p.to).toMatch(HEX);
        expect(contrastWithWhite(p.from)).toBeGreaterThanOrEqual(4.5);
        expect(contrastWithWhite(p.to)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('angle, blobs and ranges stay in bounds', () => {
    for (let i = 0; i < 50; i++) {
      const p = coverPalette(`x${i}`, '#0369A1');
      expect(p.angle).toBeGreaterThanOrEqual(115);
      expect(p.angle).toBeLessThan(215);
      expect(p.blobs).toHaveLength(4);
      for (const b of p.blobs) {
        expect(b.cx).toBeGreaterThanOrEqual(5);
        expect(b.cx).toBeLessThanOrEqual(95);
        expect(b.r).toBeGreaterThanOrEqual(18);
        expect(b.r).toBeLessThanOrEqual(48);
        expect(b.opacity).toBeGreaterThan(0);
        expect(b.opacity).toBeLessThan(0.2);
      }
    }
  });
  it('empty seed still works', () => {
    expect(coverPalette('', '#0369A1').from).toMatch(HEX);
  });
});

describe('region colours', () => {
  it('six regions, all different, all readable with white text', () => {
    expect(REGION_ORDER).toHaveLength(6);
    const colors = REGION_ORDER.map((r) => REGION_COLORS[r]);
    expect(new Set(colors).size).toBe(6);
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(contrastWithWhite(c)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('unknown / empty region uses the neutral colour', () => {
    expect(regionColor('east')).toBe(REGION_COLORS.east);
    expect(regionColor('mars')).toBe(REGION_FALLBACK);
    expect(regionColor(null)).toBe(REGION_FALLBACK);
    expect(regionColor(undefined)).toBe(REGION_FALLBACK);
  });
});
