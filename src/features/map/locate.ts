import type { Geometry, Position } from 'geojson';
import { loadDistrictShapes, loadProvinceShapes } from './geoLoader';

function inRing(x: number, y: number, ring: Position[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inPolygon(x: number, y: number, poly: Position[][]) {
  if (!poly.length || !inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}
export function inGeometry(lng: number, lat: number, g: Geometry | null): boolean {
  if (!g) return false;
  if (g.type === 'Polygon') return inPolygon(lng, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => inPolygon(lng, lat, p));
  return false;
}

/** province + district P-codes containing the point (null when outside Thailand / files missing) */
export async function locatePoint(lat: number, lng: number): Promise<{ provincePcode: string; districtPcode: string | null } | null> {
  try {
    const prov = await loadProvinceShapes();
    const p = prov.features.find((f) => inGeometry(lng, lat, f.geometry));
    if (!p) return null;
    let districtPcode: string | null = null;
    try {
      const d = await loadDistrictShapes(p.properties.pcode);
      districtPcode = d.features.find((f) => inGeometry(lng, lat, f.geometry))?.properties.pcode ?? null;
    } catch { /* district file missing */ }
    return { provincePcode: p.properties.pcode, districtPcode };
  } catch {
    return null;
  }
}

/** "13.7563, 100.5018" or Google Maps links (@lat,lng · q=lat,lng · !3dlat!4dlng) */
export function parseLatLng(s: string): { lat: number; lng: number } | null {
  const t = s.trim();
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t)
    ?? /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t)
    ?? /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
