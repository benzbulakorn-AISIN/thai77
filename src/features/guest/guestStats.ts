// Province statistics for a guest: how many provinces / places they have marked on this device. Pure.
import type { GuestStatus } from './guestModel';

export type StatCounts = { total: number; planned: number; visited: number; target: number };
export type GuestTally = { visited: number; target: number };

/** place id -> province id is looked up separately; places whose province is unknown are skipped */
export function tallyGuest(entries: [string, GuestStatus][], provinceOf: Map<string, string>): Record<string, GuestTally> {
  const out: Record<string, GuestTally> = {};
  for (const [placeId, status] of entries) {
    const pid = provinceOf.get(placeId);
    if (!pid) continue;
    const t = (out[pid] ??= { visited: 0, target: 0 });
    t.target++; // "want" and "visited" both count towards the province goal
    if (status === 'visited') t.visited++;
  }
  return out;
}

/** adds the guest's counts on top of the totals; returns the SAME object when there is nothing to add */
export function overlayStats<T extends StatCounts>(base: Record<string, T>, extra: Record<string, GuestTally>, blank: T): Record<string, T> {
  const ids = Object.keys(extra);
  if (!ids.length) return base;
  const out: Record<string, T> = { ...base };
  for (const pid of ids) {
    const cur = out[pid] ?? blank;
    out[pid] = { ...cur, visited: cur.visited + extra[pid].visited, target: cur.target + extra[pid].target };
  }
  return out;
}
