// Pure logic for the Home summary page (no React / Supabase) — easy to test.
import { daysBetween } from '../routing/time';

export const TOTAL_PROVINCES = 77;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type TripLite = { id: string; name: string; start_date: string; end_date: string; travelers: number };

export type NextTrip = {
  trip: TripLite;
  status: 'ongoing' | 'upcoming';
  /** days until the trip starts (0 while it is ongoing) */
  daysUntil: number;
  /** 1-based day of the trip while ongoing, else 0 */
  dayNumber: number;
  totalDays: number;
};

/** The trip to show on the home page: the one running now, otherwise the nearest upcoming one. */
export function pickNextTrip(trips: TripLite[], today: string): NextTrip | null {
  const valid = trips.filter((t) => DATE.test(t.start_date) && DATE.test(t.end_date) && t.end_date >= t.start_date && t.end_date >= today);
  if (!valid.length) return null;
  const t = [...valid].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name, 'th'))[0];
  const totalDays = daysBetween(t.start_date, t.end_date) + 1;
  if (t.start_date <= today) {
    return { trip: t, status: 'ongoing', daysUntil: 0, dayNumber: daysBetween(t.start_date, today) + 1, totalDays };
  }
  return { trip: t, status: 'upcoming', daysUntil: daysBetween(today, t.start_date), dayNumber: 0, totalDays };
}

export function countdownText(n: NextTrip): string {
  if (n.status === 'ongoing') return `กำลังเที่ยวอยู่ · วันที่ ${n.dayNumber}/${n.totalDays}`;
  return n.daysUntil === 1 ? 'พรุ่งนี้' : `อีก ${n.daysUntil} วัน`;
}

export function greetingForHour(hour: number): string {
  if (!Number.isFinite(hour)) return 'สวัสดี';
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return 'สวัสดีตอนเช้า';
  if (h >= 12 && h < 17) return 'สวัสดีตอนบ่าย';
  if (h >= 17 && h < 21) return 'สวัสดีตอนเย็น';
  return 'สวัสดีตอนค่ำ';
}

/** display name: profile name, else the part of the e-mail before "@" */
export function displayName(profileName: string | null | undefined, email: string | null | undefined): string {
  const p = (profileName ?? '').trim();
  if (p) return p;
  return (email ?? '').split('@')[0].trim();
}

export function percent(n: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round((n / total) * 100)));
}

type VisitStat = { visited: number };
type CountStat = { total: number; planned: number; visited: number };

/** how many provinces have at least one visited place (out of 77) */
export function provinceProgress(provinceIds: string[], stats: Record<string, VisitStat | undefined>) {
  const done = provinceIds.filter((id) => (stats[id]?.visited ?? 0) > 0).length;
  return { done, total: TOTAL_PROVINCES, pct: percent(done, TOTAL_PROVINCES) };
}

export function sumStats(stats: Record<string, CountStat | undefined>) {
  let total = 0, planned = 0, visited = 0;
  for (const s of Object.values(stats)) {
    if (!s) continue;
    total += s.total;
    planned += s.planned;
    visited += s.visited;
  }
  return { total, planned, visited };
}
