import { supabase } from '../../lib/supabase';

export type UserPlace = {
  id: string;
  owner_id: string;
  name_th: string;
  name_en: string | null;
  province_id: string | null;
  district_id: string | null;
  category_id: string | null;
  short_description: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  suggested_minutes: number | null;
  est_cost_per_person: number | null;
  google_maps_url: string | null;
  notes: string | null;
  submission: 'private' | 'submitted' | 'approved' | 'rejected';
};
export type UserPlaceInput = Omit<UserPlace, 'id' | 'owner_id'>;

const COLS = 'id,owner_id,name_th,name_en,province_id,district_id,category_id,short_description,lat,lng,address,' +
  'suggested_minutes,est_cost_per_person,google_maps_url,notes,submission';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}
const n = (v: unknown) => (v == null ? null : Number(v));
const norm = (r: Record<string, unknown>): UserPlace => ({
  ...(r as unknown as UserPlace), lat: n(r.lat), lng: n(r.lng), est_cost_per_person: n(r.est_cost_per_person),
});

export async function listMyPlaces(userId: string): Promise<UserPlace[]> {
  const { data, error } = await supabase.from('user_places').select(COLS).eq('owner_id', userId).order('created_at', { ascending: false });
  if (error) fail('โหลดสถานที่ส่วนตัวไม่สำเร็จ', error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(norm);
}

export async function createMyPlace(userId: string, v: UserPlaceInput): Promise<UserPlace> {
  const { data, error } = await supabase.from('user_places').insert({ ...v, owner_id: userId }).select(COLS).single();
  if (error || !data) fail('บันทึกไม่สำเร็จ', error);
  return norm(data as unknown as Record<string, unknown>);
}

export async function updateMyPlace(id: string, v: UserPlaceInput): Promise<void> {
  const { error } = await supabase.from('user_places').update(v).eq('id', id);
  if (error) fail('บันทึกไม่สำเร็จ', error);
}

export async function deleteMyPlace(id: string): Promise<void> {
  const { error } = await supabase.from('user_places').delete().eq('id', id);
  if (error) fail('ลบไม่สำเร็จ', error);
}

export async function districtIdByPcode(pcode: string): Promise<{ id: string; name_th: string } | null> {
  const { data } = await supabase.from('districts').select('id,name_th').eq('pcode', pcode).maybeSingle();
  return (data as { id: string; name_th: string } | null) ?? null;
}
