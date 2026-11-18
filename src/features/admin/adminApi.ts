import { supabase } from '../../lib/supabase';
import type { PlaceInput, Verification } from './placeForm';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}
const num = (v: unknown) => (v == null ? null : Number(v));

// ---------------- settings ----------------
export async function staleCutoff(): Promise<{ months: number; cutoff: string }> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'stale_after_months').maybeSingle();
  const raw = Number((data as { value: unknown } | null)?.value);
  const months = Number.isFinite(raw) && raw > 0 ? raw : 12;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return { months, cutoff: d.toISOString().slice(0, 10) };
}

// ---------------- dashboard ----------------
export type AdminStats = {
  total: number; verified: number; pending: number; outdated: number; stale: number;
  unpublished: number; demo: number; noCoords: number; noSource: number; submissions: number;
};

export async function adminStats(cutoff: string): Promise<AdminStats> {
  const head = () => supabase.from('places').select('id', { count: 'exact', head: true });
  const c = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q;
    if (r.error) fail('โหลดสถิติไม่สำเร็จ', r.error);
    return r.count ?? 0;
  };
  const [total, verified, pending, outdated, stale, unpublished, demo, noCoords, subs, srcRows] = await Promise.all([
    c(head()),
    c(head().eq('verification', 'verified')),
    c(head().eq('verification', 'pending')),
    c(head().eq('verification', 'outdated')),
    c(head().eq('verification', 'verified').lt('verified_at', cutoff)),
    c(head().eq('is_published', false)),
    c(head().eq('is_demo', true)),
    c(head().is('lat', null)),
    supabase.rpc('admin_list_submissions'),
    supabase.from('place_sources').select('place_id').range(0, 9999),
  ]);
  const withSource = new Set(((srcRows.data ?? []) as { place_id: string }[]).map((r) => r.place_id)).size;
  return {
    total, verified, pending, outdated, stale, unpublished, demo, noCoords,
    noSource: Math.max(0, total - withSource),
    submissions: ((subs.data ?? []) as unknown[]).length,
  };
}

/** verified rows older than the cutoff -> outdated. returns number of rows changed */
export async function markStale(cutoff: string): Promise<number> {
  const { data, error } = await supabase.from('places').update({ verification: 'outdated' })
    .eq('verification', 'verified').lt('verified_at', cutoff).select('id');
  if (error) fail('อัปเดตไม่สำเร็จ', error);
  return (data ?? []).length;
}

// ---------------- places ----------------
export type AdminPlaceRow = {
  id: string; name_th: string; province_id: string; district_id: string | null; category_id: string;
  verification: Verification; verified_at: string | null; is_demo: boolean; is_published: boolean;
  state: string; lat: number | null; updated_at: string;
};
export type PlaceFilter = {
  q: string; provinceId: string; categoryId: string; verification: '' | Verification;
  published: '' | 'yes' | 'no'; demo: '' | 'yes' | 'no'; problem: '' | 'stale' | 'nocoords'; page: number;
};
export const PAGE_SIZE = 30;
export const emptyFilter = (): PlaceFilter => ({ q: '', provinceId: '', categoryId: '', verification: '', published: '', demo: '', problem: '', page: 0 });

export async function listPlaces(f: PlaceFilter, cutoff: string): Promise<{ rows: AdminPlaceRow[]; count: number }> {
  let q = supabase.from('places')
    .select('id,name_th,province_id,district_id,category_id,verification,verified_at,is_demo,is_published,state,lat,updated_at', { count: 'exact' });
  const text = f.q.trim().replace(/[%_\\,()*]/g, '');
  if (text) q = q.ilike('name_th', `%${text}%`);
  if (f.provinceId) q = q.eq('province_id', f.provinceId);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.verification) q = q.eq('verification', f.verification);
  if (f.published) q = q.eq('is_published', f.published === 'yes');
  if (f.demo) q = q.eq('is_demo', f.demo === 'yes');
  if (f.problem === 'stale') q = q.or(`verification.eq.outdated,and(verification.eq.verified,verified_at.lt.${cutoff})`);
  if (f.problem === 'nocoords') q = q.is('lat', null);
  const from = f.page * PAGE_SIZE;
  const { data, error, count } = await q.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) fail('โหลดรายการสถานที่ไม่สำเร็จ', error);
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as AdminPlaceRow), lat: num(r.lat) })), count: count ?? 0 };
}

const FULL_COLS =
  'id,name_th,name_en,province_id,district_id,category_id,short_description,highlights,lat,lng,address,opening_hours_text,' +
  'closed_days_text,fee_thai,fee_foreigner,parking_fee,est_cost_per_person,suggested_minutes,best_time_of_day,best_months,' +
  'phone,website_url,social_url,google_maps_url,popularity,state,verification,verified_at,is_demo,is_published,updated_at';

export type Facilities = {
  has_toilet: boolean | null; has_parking: boolean | null; elderly_friendly: boolean | null;
  wheelchair: boolean | null; kid_friendly: boolean | null; pet_friendly: boolean | null;
};
export const emptyFacilities = (): Facilities => ({
  has_toilet: null, has_parking: null, elderly_friendly: null, wheelchair: null, kid_friendly: null, pet_friendly: null,
});
export type SourceType = 'tat' | 'province' | 'national_park' | 'local_gov' | 'official_social' | 'osm' | 'other';
export type Source = { id: string; source_url: string; source_name: string | null; source_type: SourceType; fields: string[]; checked_at: string; note: string | null };

export async function getPlaceFull(id: string): Promise<{ place: PlaceInput & { id: string; updated_at: string }; facilities: Facilities; sources: Source[] } | null> {
  const [p, f, s] = await Promise.all([
    supabase.from('places').select(FULL_COLS).eq('id', id).maybeSingle(),
    supabase.from('place_facilities').select('has_toilet,has_parking,elderly_friendly,wheelchair,kid_friendly,pet_friendly').eq('place_id', id).maybeSingle(),
    supabase.from('place_sources').select('id,source_url,source_name,source_type,fields,checked_at,note').eq('place_id', id).order('checked_at', { ascending: false }),
  ]);
  if (p.error) fail('โหลดสถานที่ไม่สำเร็จ', p.error);
  if (!p.data) return null;
  const r = p.data as unknown as Record<string, unknown>;
  const place = {
    ...(r as unknown as PlaceInput & { id: string; updated_at: string }),
    lat: num(r.lat), lng: num(r.lng), fee_thai: num(r.fee_thai), fee_foreigner: num(r.fee_foreigner),
    parking_fee: num(r.parking_fee), est_cost_per_person: num(r.est_cost_per_person),
  };
  return { place, facilities: (f.data as Facilities | null) ?? emptyFacilities(), sources: (s.data ?? []) as Source[] };
}

export async function savePlace(id: string | null, input: PlaceInput, userId: string): Promise<string> {
  if (id) {
    const { error } = await supabase.from('places').update(input).eq('id', id);
    if (error) fail(error && (error as { code?: string }).code === '23514' ? 'ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล' : 'บันทึกไม่สำเร็จ', error);
    return id;
  }
  const { data, error } = await supabase.from('places').insert({ ...input, created_by: userId }).select('id').single();
  if (error || !data) fail('บันทึกไม่สำเร็จ', error);
  return (data as { id: string }).id;
}

export async function saveFacilities(placeId: string, f: Facilities) {
  const { error } = await supabase.from('place_facilities').upsert({ place_id: placeId, ...f }, { onConflict: 'place_id' });
  if (error) fail('บันทึกสิ่งอำนวยความสะดวกไม่สำเร็จ', error);
}

export async function deletePlace(id: string) {
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) fail('ลบไม่สำเร็จ', error);
}

export async function setPublished(ids: string[], published: boolean) {
  if (!ids.length) return;
  const { error } = await supabase.from('places').update({ is_published: published }).in('id', ids);
  if (error) fail('อัปเดตไม่สำเร็จ', error);
}

export type SourceInput = Omit<Source, 'id'>;
export async function addSource(placeId: string, s: SourceInput): Promise<Source> {
  const { data, error } = await supabase.from('place_sources').insert({ ...s, place_id: placeId })
    .select('id,source_url,source_name,source_type,fields,checked_at,note').single();
  if (error || !data) fail('เพิ่มแหล่งข้อมูลไม่สำเร็จ', error);
  return data as Source;
}

export async function deleteSource(id: string) {
  const { error } = await supabase.from('place_sources').delete().eq('id', id);
  if (error) fail('ลบแหล่งข้อมูลไม่สำเร็จ', error);
}

export async function districtsOf(provinceId: string): Promise<{ id: string; pcode: string; name_th: string }[]> {
  if (!provinceId) return [];
  const { data } = await supabase.from('districts').select('id,pcode,name_th').eq('province_id', provinceId).order('name_th');
  return (data ?? []) as { id: string; pcode: string; name_th: string }[];
}

// ---------------- categories ----------------
export type AdminCategory = { id: string; slug: string; name_th: string; name_en: string | null; icon: string; color: string; sort_order: number; is_active: boolean };

export async function listAllCategories(): Promise<AdminCategory[]> {
  const { data, error } = await supabase.from('categories').select('id,slug,name_th,name_en,icon,color,sort_order,is_active').order('sort_order');
  if (error) fail('โหลดหมวดหมู่ไม่สำเร็จ', error);
  return (data ?? []) as AdminCategory[];
}

export type CategoryInput = Omit<AdminCategory, 'id'>;
export async function saveCategory(id: string | null, v: CategoryInput): Promise<AdminCategory> {
  const q = id
    ? supabase.from('categories').update(v).eq('id', id).select('*').single()
    : supabase.from('categories').insert(v).select('*').single();
  const { data, error } = await q;
  if (error || !data) fail((error as { code?: string } | null)?.code === '23505' ? 'รหัสหมวด (slug) ซ้ำ' : 'บันทึกหมวดไม่สำเร็จ', error);
  return data as AdminCategory;
}

export async function categoryUsage(id: string): Promise<number> {
  const [a, b] = await Promise.all([
    supabase.from('places').select('id', { count: 'exact', head: true }).eq('category_id', id),
    supabase.from('user_places').select('id', { count: 'exact', head: true }).eq('category_id', id),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) fail('ลบไม่ได้ — หมวดนี้ยังถูกใช้อยู่ ให้ปิดการแสดงแทน', error);
}

export async function swapCategoryOrder(a: AdminCategory, b: AdminCategory) {
  const r = await Promise.all([
    supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id),
  ]);
  const e = r.find((x) => x.error);
  if (e) fail('เรียงลำดับไม่สำเร็จ', e.error);
}

// ---------------- submissions ----------------
export type Submission = {
  id: string; owner_name: string | null; name_th: string; name_en: string | null; province_id: string | null;
  district_id: string | null; category_id: string | null; short_description: string | null; lat: number | null; lng: number | null;
  address: string | null; suggested_minutes: number | null; est_cost_per_person: number | null; google_maps_url: string | null; created_at: string;
};

export async function listSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase.rpc('admin_list_submissions');
  if (error) fail('โหลดรายการเสนอไม่สำเร็จ (รัน Migration 007 แล้วหรือยัง?)', error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as Submission), lat: num(r.lat), lng: num(r.lng), est_cost_per_person: num(r.est_cost_per_person),
  }));
}

export async function decideSubmission(id: string, status: 'approved' | 'rejected', placeId: string | null = null) {
  const { error } = await supabase.rpc('admin_decide_submission', { p_id: id, p_status: status, p_place: placeId });
  if (error) fail('บันทึกผลการตรวจไม่สำเร็จ', error);
}
