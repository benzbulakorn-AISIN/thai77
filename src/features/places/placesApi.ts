import { supabase } from '../../lib/supabase';
import type { Category, Place, PlaceSource } from './types';

const PLACE_COLS =
  'id,name_th,name_en,province_id,district_id,category_id,short_description,highlights,lat,lng,address,' +
  'opening_hours_text,closed_days_text,fee_thai,fee_foreigner,parking_fee,est_cost_per_person,suggested_minutes,' +
  'best_time_of_day,best_months,phone,website_url,social_url,google_maps_url,popularity,state,verification,verified_at,is_demo';

let catCache: Promise<Category[]> | null = null;
export function fetchCategories(): Promise<Category[]> {
  if (!catCache) {
    catCache = Promise.resolve(
      supabase.from('categories').select('id,slug,name_th,icon,color,sort_order,is_active').order('sort_order'),
    ).then(({ data, error }) => {
      if (error) throw new Error('โหลดหมวดหมู่ไม่สำเร็จ');
      return (data ?? []) as Category[];
    });
    catCache.catch(() => { catCache = null; });
  }
  return catCache;
}

export async function fetchPlacesByProvince(provinceId: string): Promise<Place[]> {
  const { data, error } = await supabase.from('places').select(PLACE_COLS).eq('province_id', provinceId)
    .order('popularity', { ascending: false }).order('name_th').range(0, 999);
  if (error) throw new Error('โหลดสถานที่ไม่สำเร็จ');
  return (data ?? []) as unknown as Place[];
}

export async function fetchPlace(id: string): Promise<{ place: Place; sources: PlaceSource[] } | null> {
  const [p, s] = await Promise.all([
    supabase.from('places').select(PLACE_COLS).eq('id', id).maybeSingle(),
    supabase.from('place_sources').select('id,source_url,source_name,source_type,fields,checked_at').eq('place_id', id).order('checked_at', { ascending: false }),
  ]);
  if (p.error) throw new Error('โหลดสถานที่ไม่สำเร็จ');
  if (!p.data) return null;
  return { place: p.data as unknown as Place, sources: (s.data ?? []) as PlaceSource[] };
}
