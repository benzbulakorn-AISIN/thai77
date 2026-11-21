import { supabase } from '../../lib/supabase';
import type { BudgetLine } from './calc';
import type { AutoRow } from './estimate';

export type BudgetCategory = { id: string; slug: string; name_th: string; icon: string; color: string; sort_order: number };
export type BudgetItem = BudgetLine & {
  trip_id: string;
  trip_item_id: string | null;
  spent_at: string | null;
  notes: string | null;
};
export type Member = { id: string; name: string };

const COLS = 'id,trip_id,category_id,day_id,trip_item_id,label,estimated,actual,is_shared,paid_by,is_auto,spent_at,notes';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}
const num = (v: unknown) => (v == null ? null : Number(v));

let catCache: Promise<BudgetCategory[]> | null = null;
export function fetchBudgetCategories() {
  if (!catCache) {
    catCache = Promise.resolve(supabase.from('budget_categories').select('id,slug,name_th,icon,color,sort_order').order('sort_order'))
      .then(({ data, error }) => {
        if (error) fail('โหลดหมวดงบไม่สำเร็จ', error);
        return (data ?? []) as BudgetCategory[];
      });
    catCache.catch(() => { catCache = null; });
  }
  return catCache;
}

export async function fetchBudgetItems(tripId: string): Promise<BudgetItem[]> {
  const { data, error } = await supabase.from('budget_items').select(COLS).eq('trip_id', tripId).order('created_at');
  if (error) fail('โหลดงบประมาณไม่สำเร็จ', error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as BudgetItem),
    estimated: Number(r.estimated) || 0,
    actual: num(r.actual),
  }));
}

export async function fetchMembers(tripId: string): Promise<Member[]> {
  const m = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId);
  if (m.error) fail('โหลดสมาชิกไม่สำเร็จ', m.error);
  const ids = ((m.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return [];
  const p = await supabase.from('profiles').select('id,display_name').in('id', ids);
  const names = new Map(((p.data ?? []) as { id: string; display_name: string | null }[]).map((r) => [r.id, r.display_name]));
  return ids.map((id) => ({ id, name: names.get(id) || 'สมาชิก' }));
}

export async function fetchFuelDefaults(userId: string | undefined) {
  const fallback = { kmPerL: 14, pricePerL: 35 };
  if (!userId) return fallback;
  const { data } = await supabase.from('user_settings').select('fuel_km_per_l,fuel_price_per_l').eq('user_id', userId).maybeSingle();
  const d = data as { fuel_km_per_l: number | null; fuel_price_per_l: number | null } | null;
  return { kmPerL: Number(d?.fuel_km_per_l) || fallback.kmPerL, pricePerL: d?.fuel_price_per_l != null ? Number(d.fuel_price_per_l) : fallback.pricePerL };
}

export type BudgetItemInput = Pick<BudgetItem, 'category_id' | 'day_id' | 'label' | 'estimated' | 'actual' | 'is_shared' | 'paid_by' | 'notes'>;

export async function addBudgetItem(tripId: string, userId: string, v: BudgetItemInput): Promise<BudgetItem> {
  const { data, error } = await supabase.from('budget_items')
    .insert({ ...v, trip_id: tripId, created_by: userId, is_auto: false, spent_at: v.actual != null ? new Date().toISOString() : null })
    .select(COLS).single();
  if (error || !data) fail('บันทึกไม่สำเร็จ', error);
  return { ...(data as unknown as BudgetItem), estimated: Number((data as BudgetItem).estimated) || 0, actual: num((data as BudgetItem).actual) };
}

export async function updateBudgetItem(id: string, v: BudgetItemInput) {
  // editing an auto row makes it manual, so re-estimation will not overwrite it
  const { error } = await supabase.from('budget_items').update({ ...v, is_auto: false }).eq('id', id);
  if (error) fail('บันทึกไม่สำเร็จ', error);
}

export async function deleteBudgetItem(id: string) {
  const { error } = await supabase.from('budget_items').delete().eq('id', id);
  if (error) fail('ลบไม่สำเร็จ', error);
}

/** Replace all auto rows of a trip with freshly computed ones. */
export async function replaceAutoRows(tripId: string, userId: string, rows: AutoRow[], cats: BudgetCategory[]) {
  const del = await supabase.from('budget_items').delete().eq('trip_id', tripId).eq('is_auto', true);
  if (del.error) fail('คำนวณใหม่ไม่สำเร็จ', del.error);
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const ins = rows
    .filter((r) => bySlug.has(r.slug))
    .map((r) => ({
      trip_id: tripId, category_id: bySlug.get(r.slug), day_id: r.day_id, trip_item_id: r.trip_item_id,
      label: r.label.slice(0, 200), estimated: r.estimated, is_shared: true, is_auto: true, created_by: userId,
    }));
  if (!ins.length) return;
  const { error } = await supabase.from('budget_items').insert(ins);
  if (error) fail('คำนวณใหม่ไม่สำเร็จ', error);
}
