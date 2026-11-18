import { fuelCost } from './calc';
import type { Trip, TripItem } from '../trips/types';

/** One auto-generated budget row (category given by slug). */
export type AutoRow = {
  slug: 'fuel' | 'entry' | 'food' | 'drinks' | 'lodging' | 'activity' | 'other';
  day_id: string | null;
  trip_item_id: string | null;
  label: string;
  estimated: number;
};

export type EstimateInput = {
  trip: Trip;
  items: TripItem[];
  kmByDay: { dayId: string; km: number; label: string }[];
  defaults: { kmPerL: number; pricePerL: number };
  /** trip_item_ids / fuel day ids that already have a manual row -> skip */
  manualItemIds: Set<string>;
  manualFuelDays: Set<string>;
};

export const fuelParams = (trip: Trip, d: EstimateInput['defaults']) => ({
  kmPerL: Number(trip.fuel_km_per_l) || d.kmPerL,
  pricePerL: trip.fuel_price_per_l != null ? Number(trip.fuel_price_per_l) : d.pricePerL,
  vehicles: Math.max(0, trip.vehicle_count ?? 1),
});

/** Turn the current plan into estimated costs. Unknown prices are skipped, never guessed. */
export function buildAutoRows(i: EstimateInput): AutoRow[] {
  const rows: AutoRow[] = [];
  const t = i.trip;
  const people = Math.max(1, t.travelers);

  if (t.mode === 'car' || t.mode === 'motorcycle') {
    const fp = fuelParams(t, i.defaults);
    for (const d of i.kmByDay) {
      if (i.manualFuelDays.has(d.dayId)) continue;
      const { cost, litres } = fuelCost({ km: d.km, ...fp });
      if (cost > 0) rows.push({ slug: 'fuel', day_id: d.dayId, trip_item_id: null, label: `น้ำมัน ${d.label} (~${Math.round(d.km)} กม. · ${litres} ลิตร)`, estimated: cost });
    }
  }

  for (const it of i.items) {
    if (!it.day_id || i.manualItemIds.has(it.id)) continue;
    const c = it.est_cost != null ? Number(it.est_cost) : null;
    switch (it.item_type) {
      case 'place':
        if (c != null && c > 0) rows.push({ slug: 'entry', day_id: it.day_id, trip_item_id: it.id, label: `ค่าเข้า ${it.title} × ${people}`, estimated: Math.round(c * people) });
        break;
      case 'meal': {
        const v = c ?? (Number(t.meal_cost_pp) || 0) * people;
        if (v > 0) rows.push({ slug: 'food', day_id: it.day_id, trip_item_id: it.id, label: c != null ? it.title : `${it.title} (${people} คน)`, estimated: Math.round(v) });
        break;
      }
      case 'cafe':
        if (c != null && c > 0) rows.push({ slug: 'drinks', day_id: it.day_id, trip_item_id: it.id, label: it.title, estimated: Math.round(c) });
        break;
      case 'lodging':
        if (c != null && c > 0) rows.push({ slug: 'lodging', day_id: it.day_id, trip_item_id: it.id, label: it.title, estimated: Math.round(c) });
        break;
      case 'custom':
        if (c != null && c > 0) rows.push({ slug: 'activity', day_id: it.day_id, trip_item_id: it.id, label: it.title, estimated: Math.round(c) });
        break;
      default:
        if (c != null && c > 0) rows.push({ slug: 'other', day_id: it.day_id, trip_item_id: it.id, label: it.title, estimated: Math.round(c) });
    }
  }
  return rows;
}
