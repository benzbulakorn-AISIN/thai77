import { supabase } from '../../lib/supabase';
import { addDays, daysBetween } from '../routing/time';
import type { GeoPoint, TravelMode, Trip, TripDay, TripItem, TripItemType } from './types';

const ITEM_COLS =
  'id,trip_id,day_id,item_type,place_id,title,lat,lng,sort_order,start_time,end_time,duration_min,' +
  'travel_min_override,est_cost,is_locked_time,is_auto,notes,places(opening_hours_text)';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}

export type TripSummary = Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date' | 'travelers' | 'mode' | 'province_ids' | 'owner_id'>;

export async function listTrips(): Promise<TripSummary[]> {
  const { data, error } = await supabase.from('trips')
    .select('id,name,start_date,end_date,travelers,mode,province_ids,owner_id').order('start_date', { ascending: false });
  if (error) fail('โหลดรายการทริปไม่สำเร็จ', error);
  return (data ?? []) as TripSummary[];
}

export type NewTrip = {
  name: string;
  province_ids: string[];
  start_date: string;
  end_date: string;
  travelers: number;
  mode: TravelMode;
  start_point: GeoPoint | null;
  end_point: GeoPoint | null;
  day_start_time: string;
  day_end_time: string;
};

export async function createTrip(ownerId: string, t: NewTrip): Promise<{ trip: Trip; days: TripDay[] }> {
  const { data, error } = await supabase.from('trips').insert({ ...t, owner_id: ownerId }).select('*').single();
  if (error || !data) fail('สร้างทริปไม่สำเร็จ', error);
  const trip = data as Trip;
  const n = daysBetween(t.start_date, t.end_date) + 1;
  const rows = Array.from({ length: n }, (_, i) => ({ trip_id: trip.id, day_index: i + 1, date: addDays(t.start_date, i) }));
  const d = await supabase.from('trip_days').insert(rows).select('*').order('day_index');
  if (d.error) fail('สร้างวันในทริปไม่สำเร็จ', d.error);
  return { trip, days: (d.data ?? []) as TripDay[] };
}

export async function loadTrip(id: string): Promise<{ trip: Trip; days: TripDay[]; items: TripItem[] } | null> {
  const [t, d, i] = await Promise.all([
    supabase.from('trips').select('*').eq('id', id).maybeSingle(),
    supabase.from('trip_days').select('*').eq('trip_id', id).order('day_index'),
    supabase.from('trip_items').select(ITEM_COLS).eq('trip_id', id).order('sort_order'),
  ]);
  if (t.error || d.error || i.error) fail('โหลดทริปไม่สำเร็จ', t.error ?? d.error ?? i.error);
  if (!t.data) return null;
  return { trip: t.data as Trip, days: (d.data ?? []) as TripDay[], items: (i.data ?? []) as unknown as TripItem[] };
}

export type NewItem = {
  trip_id: string;
  day_id: string | null;
  item_type: TripItemType;
  title: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  sort_order: number;
  duration_min?: number | null;
  start_time?: string | null;
  is_locked_time?: boolean;
  est_cost?: number | null;
  is_auto?: boolean;
  notes?: string | null;
};

export async function insertItems(rows: NewItem[]): Promise<TripItem[]> {
  if (!rows.length) return [];
  const { data, error } = await supabase.from('trip_items').insert(rows).select(ITEM_COLS);
  if (error) fail('บันทึกกิจกรรมไม่สำเร็จ', error);
  return (data ?? []) as unknown as TripItem[];
}

export async function updateItem(id: string, patch: Partial<TripItem>) {
  const { places: _ignore, ...rest } = patch;
  void _ignore;
  const { error } = await supabase.from('trip_items').update(rest).eq('id', id);
  if (error) fail('บันทึกไม่สำเร็จ', error);
}

/** Save order / day for many items (n is small, so parallel single updates are fine). */
export async function saveOrder(rows: { id: string; day_id: string | null; sort_order: number }[]) {
  const res = await Promise.all(rows.map((r) =>
    supabase.from('trip_items').update({ day_id: r.day_id, sort_order: r.sort_order }).eq('id', r.id)));
  const err = res.find((r) => r.error);
  if (err) fail('บันทึกลำดับไม่สำเร็จ', err.error);
}

export async function deleteItems(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from('trip_items').delete().in('id', ids);
  if (error) fail('ลบไม่สำเร็จ', error);
}

export async function updateDay(id: string, patch: Partial<Pick<TripDay, 'is_rest_day' | 'start_time' | 'title' | 'notes'>>) {
  const { error } = await supabase.from('trip_days').update(patch).eq('id', id);
  if (error) fail('บันทึกวันไม่สำเร็จ', error);
}

export async function updateTrip(id: string, patch: Partial<Trip>) {
  const { error } = await supabase.from('trips').update(patch).eq('id', id);
  if (error) fail('บันทึกทริปไม่สำเร็จ', error);
}

/** Change trip dates: add/remove trip_days; items of removed days become unscheduled. */
export async function changeTripDates(trip: Trip, days: TripDay[], start: string, end: string): Promise<TripDay[]> {
  const n = daysBetween(start, end) + 1;
  const removed = days.filter((d) => d.day_index > n);
  if (removed.length) {
    const ids = removed.map((d) => d.id);
    const u = await supabase.from('trip_items').update({ day_id: null }).in('day_id', ids);
    if (u.error) fail('ย้ายกิจกรรมไม่สำเร็จ', u.error);
    const del = await supabase.from('trip_days').delete().in('id', ids);
    if (del.error) fail('ลบวันไม่สำเร็จ', del.error);
  }
  const keep = days.filter((d) => d.day_index <= n);
  await Promise.all(keep.map((d) => supabase.from('trip_days').update({ date: addDays(start, d.day_index - 1) }).eq('id', d.id)));
  const add = Array.from({ length: Math.max(0, n - keep.length) }, (_, i) => {
    const idx = keep.length + i + 1;
    return { trip_id: trip.id, day_index: idx, date: addDays(start, idx - 1) };
  });
  if (add.length) {
    const a = await supabase.from('trip_days').insert(add);
    if (a.error) fail('เพิ่มวันไม่สำเร็จ', a.error);
  }
  await updateTrip(trip.id, { start_date: start, end_date: end });
  const d = await supabase.from('trip_days').select('*').eq('trip_id', trip.id).order('day_index');
  return (d.data ?? []) as TripDay[];
}

export async function deleteTrip(id: string) {
  const { error } = await supabase.from('trips').delete().eq('id', id);
  if (error) fail('ลบทริปไม่สำเร็จ', error);
}

export async function saveRoutes(tripId: string, mode: TravelMode, factor: number, perDay: { dayId: string; km: number; min: number }[]) {
  await supabase.from('trip_routes').delete().eq('trip_id', tripId);
  if (!perDay.length) return;
  const { error } = await supabase.from('trip_routes').insert(perDay.map((d) => ({
    trip_id: tripId, day_id: d.dayId, provider: 'haversine', mode, road_factor: factor,
    distance_km: Math.round(d.km * 10) / 10, duration_min: Math.round(d.min), is_estimate: true,
  })));
  if (error) console.warn('[thai77] save routes failed');
}

/** Mark places as "อยู่ในแผนทริป" without downgrading "เคยไปแล้ว". */
export async function markPlanned(userId: string, placeIds: string[]) {
  const ids = [...new Set(placeIds)];
  if (!ids.length) return;
  const { data } = await supabase.from('user_place_status').select('place_id,status').in('place_id', ids);
  const visited = new Set(((data ?? []) as { place_id: string; status: string }[]).filter((r) => r.status === 'visited').map((r) => r.place_id));
  const rows = ids.filter((id) => !visited.has(id)).map((place_id) => ({ user_id: userId, place_id, status: 'planned' }));
  if (rows.length) await supabase.from('user_place_status').upsert(rows, { onConflict: 'user_id,place_id' });
}

export async function inviteMember(tripId: string, email: string) {
  const { error } = await supabase.rpc('invite_trip_member', { p_trip: tripId, p_email: email, p_role: 'editor' });
  if (error) throw new Error(error.message.includes('ไม่พบผู้ใช้') ? 'ไม่พบผู้ใช้อีเมลนี้' : 'ชวนไม่สำเร็จ');
}
