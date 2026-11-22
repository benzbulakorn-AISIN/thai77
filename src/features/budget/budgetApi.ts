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

export class BudgetConflictError extends Error {
  constructor(message = 'รายการนี้มีการเปลี่ยนแปลงจากอุปกรณ์อื่น ระบบจึงไม่เขียนทับข้อมูลล่าสุด') {
    super(message);
    this.name = 'BudgetConflictError';
  }
}

export type AutoBudgetRowInput = {
  category_id: string;
  day_id: string | null;
  trip_item_id: string | null;
  label: string;
  estimated: number;
};

/**
 * Carries the complete intended replacement so the UI can verify the database
 * after a lost/ambiguous network response instead of retrying the mutation.
 */
export class BudgetAutoReplaceError extends Error {
  constructor(message: string, public readonly expected: AutoBudgetRowInput[]) {
    super(message);
    this.name = 'BudgetAutoReplaceError';
  }
}

function normalizeBudgetItem(data: Record<string, unknown>): BudgetItem {
  return {
    ...(data as unknown as BudgetItem),
    estimated: Number(data.estimated) || 0,
    actual: num(data.actual),
  };
}

function sameTimestamp(a: string | null, b: string | null) {
  if (a == null || b == null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** Verify that the row returned by PostgREST contains the values we asked it to save. */
export function budgetItemMatchesInput(item: BudgetItem, v: BudgetItemInput): boolean {
  return item.category_id === v.category_id
    && item.day_id === v.day_id
    && item.label === v.label
    && Math.abs(item.estimated - v.estimated) < 0.005
    && (item.actual == null || v.actual == null ? item.actual === v.actual : Math.abs(item.actual - v.actual) < 0.005)
    && item.is_shared === v.is_shared
    && item.paid_by === v.paid_by
    && item.notes === v.notes
    && (v.spent_at === undefined || sameTimestamp(item.spent_at, v.spent_at));
}

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
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeBudgetItem);
}

export async function fetchBudgetItem(id: string): Promise<BudgetItem | null> {
  const { data, error } = await supabase.from('budget_items').select(COLS).eq('id', id).maybeSingle();
  if (error) fail('ตรวจสอบรายการงบไม่สำเร็จ', error);
  return data ? normalizeBudgetItem(data as Record<string, unknown>) : null;
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

export type BudgetItemInput = Pick<BudgetItem, 'category_id' | 'day_id' | 'label' | 'estimated' | 'actual' | 'is_shared' | 'paid_by' | 'notes'> & {
  /** Optional only for backward compatibility with existing callers; the edit sheet always sends it. */
  spent_at?: string | null;
};

export async function addBudgetItem(tripId: string, userId: string, v: BudgetItemInput): Promise<BudgetItem> {
  const input = { ...v, spent_at: v.spent_at === undefined ? (v.actual != null ? new Date().toISOString() : null) : v.spent_at };
  const { data, error } = await supabase.from('budget_items')
    .insert({ ...input, trip_id: tripId, created_by: userId, is_auto: false })
    .select(COLS).single();
  if (error || !data) fail('บันทึกไม่สำเร็จ', error);
  const saved = normalizeBudgetItem(data as Record<string, unknown>);
  if (!budgetItemMatchesInput(saved, input)) fail('ตรวจสอบผลบันทึกไม่สำเร็จ', null);
  return saved;
}

export async function updateBudgetItem(id: string, v: BudgetItemInput): Promise<BudgetItem> {
  // editing an auto row makes it manual, so re-estimation will not overwrite it
  const { data, error } = await supabase.from('budget_items').update({ ...v, is_auto: false }).eq('id', id).select(COLS).single();
  if (error || !data) fail('บันทึกไม่สำเร็จ', error);
  const saved = normalizeBudgetItem(data as Record<string, unknown>);
  if (saved.id !== id || saved.is_auto || !budgetItemMatchesInput(saved, v)) fail('ตรวจสอบผลบันทึกไม่สำเร็จ', null);
  return saved;
}

/**
 * Add every mutable value from the row we displayed to the mutation filter.
 * If another device edits even one value during the Undo window, PostgREST
 * returns no row and we refresh instead of overwriting/deleting their change.
 */
function matchBudgetSnapshot(query: any, item: BudgetItem) {
  let q = query
    .eq('id', item.id)
    .eq('trip_id', item.trip_id)
    .eq('category_id', item.category_id)
    .eq('label', item.label)
    .eq('estimated', item.estimated)
    .eq('is_shared', item.is_shared)
    .eq('is_auto', item.is_auto);
  q = item.day_id == null ? q.is('day_id', null) : q.eq('day_id', item.day_id);
  q = item.trip_item_id == null ? q.is('trip_item_id', null) : q.eq('trip_item_id', item.trip_item_id);
  q = item.actual == null ? q.is('actual', null) : q.eq('actual', item.actual);
  q = item.paid_by == null ? q.is('paid_by', null) : q.eq('paid_by', item.paid_by);
  q = item.spent_at == null ? q.is('spent_at', null) : q.eq('spent_at', item.spent_at);
  q = item.notes == null ? q.is('notes', null) : q.eq('notes', item.notes);
  return q;
}

/** Clear only actual-payment fields and keep the estimate and the whole row. */
export async function clearBudgetActual(item: BudgetItem): Promise<BudgetItem> {
  if (item.actual == null) throw new BudgetConflictError('รายการนี้ไม่มียอดจ่ายจริงให้ล้างแล้ว');
  const mutation = matchBudgetSnapshot(
    supabase.from('budget_items').update({ actual: null, spent_at: null, paid_by: null }),
    item,
  );
  const { data, error } = await mutation.select(COLS).maybeSingle();
  if (error) fail('ล้างยอดจ่ายจริงไม่สำเร็จ', error);
  if (!data) throw new BudgetConflictError();

  // Re-read from the database before the UI reports success.
  const confirmed = await fetchBudgetItem(item.id);
  if (!confirmed || confirmed.actual != null || confirmed.spent_at != null || confirmed.paid_by != null) {
    throw new BudgetConflictError('ตรวจสอบแล้วพบว่ายอดจ่ายจริงยังไม่ถูกล้าง กรุณาลองใหม่');
  }
  return confirmed;
}

/** Delete only when the current database row still matches the displayed snapshot. */
export async function deleteBudgetItem(item: BudgetItem): Promise<void> {
  const mutation = matchBudgetSnapshot(supabase.from('budget_items').delete(), item);
  const { data, error } = await mutation.select(COLS).maybeSingle();
  if (error) fail('ลบไม่สำเร็จ', error);
  if (!data) throw new BudgetConflictError();

  // A returned DELETE row is useful, but a second read proves the row is gone now.
  if (await fetchBudgetItem(item.id)) {
    throw new BudgetConflictError('ตรวจสอบแล้วพบว่ารายการยังไม่ถูกลบ กรุณาลองใหม่');
  }
}

/** Convert every calculated row to the exact payload accepted by the atomic RPC. */
export function prepareAutoRows(rows: AutoRow[], cats: BudgetCategory[]): AutoBudgetRowInput[] {
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
  return rows.map((r) => {
    const categoryId = bySlug.get(r.slug);
    if (!categoryId) throw new Error(`ไม่พบหมวดงบสำหรับรายการอัตโนมัติ: ${r.slug}`);
    return {
      category_id: categoryId,
      day_id: r.day_id,
      trip_item_id: r.trip_item_id,
      label: r.label.slice(0, 200),
      estimated: r.estimated,
    };
  });
}

const autoRowSignature = (r: AutoBudgetRowInput) => JSON.stringify([
  r.category_id, r.day_id, r.trip_item_id, r.label, Math.round(r.estimated * 100),
]);

/** Compare multisets, not database ids/order: the transaction creates new ids. */
export function autoRowsMatchExpected(items: BudgetItem[], expected: AutoBudgetRowInput[]): boolean {
  const actual = items.filter((item) => item.is_auto);
  if (actual.length !== expected.length || actual.some((item) => (
    !item.is_shared || item.actual != null || item.paid_by != null || item.spent_at != null || item.notes != null
  ))) return false;
  const a = actual.map(autoRowSignature).sort();
  const b = expected.map(autoRowSignature).sort();
  return a.every((signature, index) => signature === b[index]);
}

/**
 * Replace all auto rows with one PostgreSQL RPC call. The migration performs
 * DELETE + INSERT in the same transaction, so an invalid row rolls everything
 * back and the previous estimates remain intact.
 */
export async function replaceAutoRows(
  tripId: string,
  rows: AutoRow[],
  cats: BudgetCategory[],
): Promise<AutoBudgetRowInput[]> {
  const expected = prepareAutoRows(rows, cats);
  const { data, error } = await supabase.rpc('replace_budget_auto_items', {
    p_trip_id: tripId,
    p_rows: expected,
  });
  if (error) {
    console.error('[thai77] คำนวณใหม่ไม่สำเร็จ', (error as { message?: string })?.message);
    throw new BudgetAutoReplaceError('คำนวณใหม่ไม่สำเร็จ', expected);
  }

  const inserted = ((data ?? []) as Record<string, unknown>[]).map(normalizeBudgetItem);
  if (!autoRowsMatchExpected(inserted, expected)) {
    throw new BudgetAutoReplaceError('ตรวจสอบผลคำนวณใหม่ไม่สำเร็จ', expected);
  }
  return expected;
}
