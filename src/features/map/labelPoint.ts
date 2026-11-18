import type { Geometry, Position } from 'geojson';

// Returns [lat, lng] INSIDE the largest polygon of a (Multi)Polygon, for placing a label.
// (Leaflet's getCenter() uses only the first ring, which can be a small island.)
type Ring = Position[];

function ringArea(r: Ring) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function centroid(r: Ring): [number, number] {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f;
    y += (r[j][1] + r[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) return [r[0][0], r[0][1]];
  return [x / (3 * a), y / (3 * a)];
}

function inside(pt: [number, number], r: Ring) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** midpoint of the widest horizontal span inside the ring at latitude y */
function widestSpan(r: Ring, y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  let w = 0;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, y]; }
  }
  return best;
}

export function labelPoint(g: Geometry): [number, number] | null {
  let rings: Ring[] = [];
  if (g.type === 'Polygon') rings = [g.coordinates[0]];
  else if (g.type === 'MultiPolygon') rings = g.coordinates.map((p) => p[0]);
  if (!rings.length) return null;
  const outer = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  let p = centroid(outer);
  if (!inside(p, outer)) {
    let minY = Infinity, maxY = -Infinity;
    outer.forEach((c) => { minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
    p = widestSpan(outer, p[1]) ?? widestSpan(outer, (minY + maxY) / 2) ?? p;
  }
  return [p[1], p[0]];
}

export function geometryArea(g: Geometry): number {
  if (g.type === 'Polygon') return ringArea(g.coordinates[0]);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + ringArea(p[0]), 0);
  return 0;
}
