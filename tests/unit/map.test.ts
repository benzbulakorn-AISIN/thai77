import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { geometryArea, labelPoint } from '../../src/features/map/labelPoint';
import { inGeometry, parseLatLng } from '../../src/features/map/locate';
import { escapeHtml } from '../../src/lib/escapeHtml';

const C: Geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]] };
const square = (x: number, y: number, s: number) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

describe('labelPoint', () => {
  it('stays inside a C-shaped province (centroid would fall outside)', () => {
    const p = labelPoint(C)!;
    expect(inGeometry(p[1], p[0], C)).toBe(true);
  });
  it('uses the largest part of a MultiPolygon (islands do not steal the label)', () => {
    const g: Geometry = { type: 'MultiPolygon', coordinates: [[square(50, 50, 0.1)], [square(0, 0, 4)]] };
    expect(labelPoint(g)).toEqual([2, 2]); // [lat, lng] of the big square's centre
    expect(geometryArea(g)).toBeCloseTo(16.01, 2);
  });
  it('non-polygon geometry has no label', () => {
    expect(labelPoint({ type: 'Point', coordinates: [1, 1] })).toBeNull();
  });
});

describe('inGeometry', () => {
  const holed: Geometry = { type: 'Polygon', coordinates: [square(0, 0, 10), square(4, 4, 2)] };
  it('respects holes (enclave provinces)', () => {
    expect(inGeometry(1, 1, holed)).toBe(true);
    expect(inGeometry(5, 5, holed)).toBe(false);
    expect(inGeometry(20, 20, holed)).toBe(false);
    expect(inGeometry(1, 1, null)).toBe(false);
  });
});

describe('parseLatLng', () => {
  it('plain and Google Maps links', () => {
    expect(parseLatLng('13.7563, 100.5018')).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(parseLatLng('https://www.google.com/maps/place/X/@12.9276,100.8771,17z/data=!3d12.927604!4d100.877115')).toEqual({ lat: 12.927604, lng: 100.877115 });
    expect(parseLatLng('https://maps.google.com/?q=18.80,98.92')).toEqual({ lat: 18.8, lng: 98.92 });
  });
  it('rejects nonsense and out-of-range values', () => {
    expect(parseLatLng('hello')).toBeNull();
    expect(parseLatLng('95.1, 100.2')).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escapes everything that can break out of HTML (map tooltips)', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    expect(escapeHtml('วัดพระแก้ว')).toBe('วัดพระแก้ว');
  });
});
