import { supabase } from '../../lib/supabase';
import type { GuestItems } from './guestModel';
import { planMigration, type MigrationSummary, type ServerStatus } from './migrate';

const CHUNK = 100;
const chunks = <T,>(xs: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}

export type MigrationResult = { summary: MigrationSummary; handledIds: string[] };

/**
 * Writes guest data into the signed-in account. Nothing is deleted here: the caller removes `handledIds` from this
 * device only after this function has returned without error (so a failure never loses anything).
 */
export async function migrateGuestData(userId: string, items: GuestItems): Promise<MigrationResult> {
  const ids = Object.keys(items);
  if (!ids.length) return { summary: { statuses: 0, favorites: 0, kept: 0, missing: 0 }, handledIds: [] };

  const valid = new Set<string>();
  const statuses = new Map<string, ServerStatus>();
  const favorites = new Set<string>();
  for (const part of chunks(ids)) {
    const [p, s, f] = await Promise.all([
      supabase.from('places').select('id').in('id', part),
      supabase.from('user_place_status').select('place_id,status').in('place_id', part),
      supabase.from('favorites').select('place_id').in('place_id', part),
    ]);
    if (p.error || s.error || f.error) fail('อ่านข้อมูลในบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง', p.error ?? s.error ?? f.error);
    ((p.data ?? []) as unknown as { id: string }[]).forEach((r) => valid.add(r.id));
    ((s.data ?? []) as unknown as { place_id: string; status: ServerStatus }[]).forEach((r) => statuses.set(r.place_id, r.status));
    ((f.data ?? []) as unknown as { place_id: string }[]).forEach((r) => favorites.add(r.place_id));
  }

  const plan = planMigration(items, { statuses, favorites }, valid);

  for (const part of chunks(plan.statusRows)) {
    const { error } = await supabase.from('user_place_status')
      .upsert(part.map((r) => ({ user_id: userId, place_id: r.place_id, status: r.status })), { onConflict: 'user_id,place_id' });
    if (error) fail('ย้ายสถานะไม่สำเร็จ — ข้อมูลในเครื่องยังอยู่ ลองใหม่ได้', error);
  }
  for (const part of chunks(plan.favoriteIds)) {
    const { error } = await supabase.from('favorites')
      .upsert(part.map((id) => ({ user_id: userId, place_id: id })), { onConflict: 'user_id,place_id', ignoreDuplicates: true });
    if (error) fail('ย้ายรายการโปรดไม่สำเร็จ — ข้อมูลในเครื่องยังอยู่ ลองใหม่ได้', error);
  }
  return { summary: plan.summary, handledIds: plan.handledIds };
}
