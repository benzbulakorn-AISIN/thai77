import type { TravelMode } from '../trips/types';

export type LatLng = { lat: number; lng: number };
export type Leg = { km: number; min: number; estimated: boolean };

export const MODE_LABEL: Record<TravelMode, string> = {
  car: 'รถยนต์',
  motorcycle: 'รถจักรยานยนต์',
  walk: 'เดิน',
  public_transport: 'ขนส่งสาธารณะ',
};
/** average door-to-door speeds used for the estimate (km/h) */
export const SPEED_KMH: Record<TravelMode, number> = { car: 60, motorcycle: 45, walk: 4.5, public_transport: 35 };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Routing provider interface. MVP = straight line x road factor.
 * Later: OpenRouteService / Mapbox / Google via a Supabase Edge Function (keeps API keys off the browser).
 */
export interface RoutingProvider {
  readonly id: 'haversine' | 'ors' | 'mapbox' | 'google';
  readonly isEstimate: boolean;
  leg(a: LatLng, b: LatLng, mode: TravelMode): Leg;
}

export function haversineProvider(roadFactor = 1.3): RoutingProvider {
  return {
    id: 'haversine',
    isEstimate: true,
    leg(a, b, mode) {
      const km = haversineKm(a, b) * roadFactor;
      const min = km < 0.05 ? 0 : Math.max(5, Math.round((km / SPEED_KMH[mode]) * 60));
      return { km, min, estimated: true };
    },
  };
}
