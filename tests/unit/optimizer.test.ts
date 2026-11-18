import { describe, expect, it } from 'vitest';
import { orderStops } from '../../src/features/routing/optimizer';
import { haversineKm, haversineProvider } from '../../src/features/routing/provider';

const P = (lng: number, lat = 13) => ({ lat, lng });
const pathLen = (pts: { lat: number; lng: number }[], order: number[], start?: { lat: number; lng: number }, end?: { lat: number; lng: number }) => {
  let prev = start ?? null;
  let s = 0;
  for (const i of order) { if (prev) s += haversineKm(prev, pts[i]); prev = pts[i]; }
  if (end && prev) s += haversineKm(prev, end);
  return s;
};

describe('haversine', () => {
  it('Bangkok -> Chiang Mai is about 580 km straight line', () => {
    const km = haversineKm({ lat: 13.7563, lng: 100.5018 }, { lat: 18.7883, lng: 98.9853 });
    expect(km).toBeGreaterThan(560);
    expect(km).toBeLessThan(600);
  });
  it('provider applies the road factor and a 5 minute floor', () => {
    const a = { lat: 13, lng: 100 };
    const b = { lat: 13, lng: 100.1 };
    const straight = haversineKm(a, b);
    const leg = haversineProvider(1.3).leg(a, b, 'car');
    expect(leg.km).toBeCloseTo(straight * 1.3, 6);
    expect(leg.estimated).toBe(true);
    expect(leg.min).toBe(Math.round((straight * 1.3 / 60) * 60));
    expect(haversineProvider(1.3).leg(a, { lat: 13.001, lng: 100 }, 'walk').min).toBe(5);
    expect(haversineProvider(1.3).leg(a, a, 'car').min).toBe(0);
  });
});

describe('orderStops', () => {
  it('handles 0 and 1 stops', () => {
    expect(orderStops([])).toEqual([]);
    expect(orderStops([P(100)])).toEqual([0]);
  });

  it('visits points on a line in order from the start', () => {
    const pts = [P(100.3), P(100.1), P(100.4), P(100.2)];
    expect(orderStops(pts, P(100.0))).toEqual([1, 3, 0, 2]);
  });

  it('without a start it still walks the line end to end', () => {
    const pts = [P(100.3), P(100.1), P(100.4), P(100.2)];
    const o = orderStops(pts);
    expect(['[1,3,0,2]', '[2,0,3,1]']).toContain(JSON.stringify(o));
  });

  it('respects a fixed end point', () => {
    const pts = [P(100.3), P(100.1), P(100.4), P(100.2)];
    expect(orderStops(pts, P(100.5), P(100.0))).toEqual([2, 0, 3, 1]);
  });

  it('is always a permutation and never worse than input order', () => {
    // deterministic pseudo-random points
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let run = 0; run < 20; run++) {
      const n = 2 + Math.floor(rnd() * 9);
      const pts = Array.from({ length: n }, () => ({ lat: 12 + rnd() * 2, lng: 100 + rnd() * 2 }));
      const start = { lat: 13.7, lng: 100.5 };
      const o = orderStops(pts, start, start);
      expect([...o].sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
      expect(pathLen(pts, o, start, start)).toBeLessThanOrEqual(pathLen(pts, pts.map((_, i) => i), start, start) + 1e-9);
    }
  });
});
