// Moving guest data into the account: decide what to write. Pure.
// Rules: never lower what the account already has (visited > planned > want > none), never remove a favourite,
// and skip places that no longer exist.
import type { GuestItems, GuestStatus } from './guestModel';

export type ServerStatus = 'none' | 'want' | 'planned' | 'visited';
export const STATUS_RANK: Record<ServerStatus, number> = { none: 0, want: 1, planned: 2, visited: 3 };

export type MigrationSummary = {
  /** statuses written to the account */
  statuses: number;
  /** favourites added to the account */
  favorites: number;
  /** local statuses NOT written because the account already had the same or a more advanced one */
  kept: number;
  /** places that no longer exist */
  missing: number;
};

export type MigrationPlan = {
  statusRows: { place_id: string; status: GuestStatus }[];
  favoriteIds: string[];
  /** every id that has been dealt with and may be removed from this device after the writes succeed */
  handledIds: string[];
  summary: MigrationSummary;
};

export type ServerSnapshot = { statuses: Map<string, ServerStatus>; favorites: Set<string> };

export function planMigration(items: GuestItems, server: ServerSnapshot, validPlaces: Set<string>): MigrationPlan {
  const plan: MigrationPlan = { statusRows: [], favoriteIds: [], handledIds: [], summary: { statuses: 0, favorites: 0, kept: 0, missing: 0 } };
  for (const id of Object.keys(items).sort()) {
    const e = items[id];
    plan.handledIds.push(id);
    if (!validPlaces.has(id)) { plan.summary.missing++; continue; }
    if (e.s) {
      const have = STATUS_RANK[server.statuses.get(id) ?? 'none'] ?? 0;
      if (STATUS_RANK[e.s] > have) plan.statusRows.push({ place_id: id, status: e.s });
      else plan.summary.kept++;
    }
    if (e.f && !server.favorites.has(id)) plan.favoriteIds.push(id);
  }
  plan.summary.statuses = plan.statusRows.length;
  plan.summary.favorites = plan.favoriteIds.length;
  return plan;
}

export function summaryText(s: MigrationSummary): string {
  const parts: string[] = [];
  if (s.statuses) parts.push(`สถานะ ${s.statuses} แห่ง`);
  if (s.favorites) parts.push(`โปรด ${s.favorites} แห่ง`);
  const head = parts.length ? `ย้ายแล้ว: ${parts.join(' · ')}` : 'ไม่มีอะไรต้องย้ายเพิ่ม';
  const tail: string[] = [];
  if (s.kept) tail.push(`${s.kept} แห่งบัญชีมีสถานะเดิมอยู่แล้ว จึงไม่เปลี่ยน`);
  if (s.missing) tail.push(`${s.missing} แห่งไม่มีในระบบแล้ว`);
  return tail.length ? `${head} (${tail.join(' · ')})` : head;
}
