import { supabase } from '../../lib/supabase';
import type { Place } from '../places/types';

/** the fields the trip cart needs (see CartProvider.toCartItem) */
export type WantPlace = Pick<
  Place,
  'id' | 'name_th' | 'province_id' | 'category_id' | 'lat' | 'lng' | 'suggested_minutes' | 'opening_hours_text' | 'est_cost_per_person' | 'fee_thai'
>;

const COLS =
  'place_id, places(id,name_th,province_id,category_id,lat,lng,suggested_minutes,opening_hours_text,est_cost_per_person,fee_thai)';

const num = (v: unknown) => (v == null ? null : Number(v));

/** my places with status "อยากไป" */
export async function fetchWantPlaces(): Promise<WantPlace[]> {
  const { data, error } = await supabase.from('user_place_status').select(COLS)
    .eq('status', 'want').not('place_id', 'is', null).range(0, 499);
  if (error) {
    console.error('[thai77] load want list failed', (error as { message?: string }).message);
    throw new Error('โหลดรายการที่สนใจไม่สำเร็จ');
  }
  type Row = { places: Record<string, unknown> | null };
  const out: WantPlace[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = r.places;
    if (!p) continue; // place hidden / deleted
    out.push({
      id: String(p.id),
      name_th: String(p.name_th),
      province_id: String(p.province_id),
      category_id: String(p.category_id),
      lat: num(p.lat),
      lng: num(p.lng),
      suggested_minutes: num(p.suggested_minutes),
      opening_hours_text: (p.opening_hours_text as string | null) ?? null,
      est_cost_per_person: num(p.est_cost_per_person),
      fee_thai: num(p.fee_thai),
    });
  }
  return out;
}

/** take a place off the "อยากไป" list */
export async function clearWant(userId: string, placeId: string): Promise<void> {
  const { error } = await supabase.from('user_place_status')
    .upsert({ user_id: userId, place_id: placeId, status: 'none' }, { onConflict: 'user_id,place_id' });
  if (error) throw new Error('เอาออกไม่สำเร็จ');
}
