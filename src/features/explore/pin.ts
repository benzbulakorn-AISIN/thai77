// Helpers for "ปักหมุดเอง" (drop a pin on the map).
export type LatLng = { lat: number; lng: number };

/** Leaflet can return longitudes beyond ±180 when the map is panned around the globe */
export const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

export function normalizePoint(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Math.max(-90, Math.min(90, lat)), lng: normalizeLng(lng) };
}

/** "13.756300, 100.501800" — accepted by the place form and by Google Maps */
export const formatCoords = (p: LatLng) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
