// Month calendar: grid, trip bars (lanes), URL state. Pure — no React / Supabase.
import { addDays, daysBetween } from '../routing/time';

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** Thai calendars start the week on Sunday */
export const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const MAX_LANES = 3;

export type CalTrip = { id: string; name: string; start_date: string; end_date: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** a real calendar date written YYYY-MM-DD (2026-02-30 is not) */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const validTrip = (t: CalTrip) => isIsoDate(t.start_date) && isIsoDate(t.end_date) && t.end_date >= t.start_date;

export function parseMonthKey(s: string | null | undefined): { year: number; month: number } | null {
  const m = MONTH_RE.exec(s ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR ? { year, month: Number(m[2]) } : null;
}

export const monthKey = (year: number, month: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
export const monthOfDate = (date: string) => date.slice(0, 7);

/** "2026-12" + 1 -> "2027-01" (stays inside 2000..2100) */
export function shiftMonth(key: string, delta: number): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  const lo = MIN_YEAR * 12, hi = MAX_YEAR * 12 + 11;
  const total = Math.min(hi, Math.max(lo, p.year * 12 + (p.month - 1) + Math.trunc(delta)));
  return monthKey(Math.floor(total / 12), (total % 12) + 1);
}

export function monthTitle(key: string): string {
  const p = parseMonthKey(key);
  return p ? `${THAI_MONTHS[p.month - 1]} ${p.year + 543}` : '';
}

/** "19 พฤศจิกายน 2569" */
export function thaiLongDate(date: string): string {
  if (!isIsoDate(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** weeks (Sunday first) covering the month, including the grey days of the neighbouring months */
export function buildMonthGrid(key: string): string[][] {
  const p = parseMonthKey(key);
  if (!p) return [];
  const first = `${key}-01`;
  const offset = new Date(Date.UTC(p.year, p.month - 1, 1)).getUTCDay(); // 0 = Sunday
  const rows = Math.ceil((offset + daysInMonth(p.year, p.month)) / 7);
  const start = addDays(first, -offset);
  return Array.from({ length: rows }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));
}

export type Segment = {
  tripId: string;
  name: string;
  /** 0..6 inside the week */
  startCol: number;
  endCol: number;
  lane: number;
  /** the trip started in an earlier week / goes on in a later one (square the corners) */
  continuesLeft: boolean;
  continuesRight: boolean;
};

/** Bars for one week. Trips that do not fit in `maxLanes` rows are counted per day in `hidden` ("+N"). */
export function weekSegments(trips: CalTrip[], weekStart: string, maxLanes = MAX_LANES): { segments: Segment[]; hidden: number[] } {
  const weekEnd = addDays(weekStart, 6);
  const items = trips
    .filter((t) => validTrip(t) && t.start_date <= weekEnd && t.end_date >= weekStart)
    .map((t) => ({ t, s: Math.max(0, daysBetween(weekStart, t.start_date)), e: Math.min(6, daysBetween(weekStart, t.end_date)) }))
    .sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s) || a.t.start_date.localeCompare(b.t.start_date) || a.t.id.localeCompare(b.t.id));
  const laneEnd: number[] = [];
  const segments: Segment[] = [];
  const hidden = Array.from({ length: 7 }, () => 0);
  for (const { t, s, e } of items) {
    let lane = laneEnd.findIndex((end) => end < s);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = e;
    if (lane >= maxLanes) { for (let c = s; c <= e; c++) hidden[c]++; continue; }
    segments.push({
      tripId: t.id, name: t.name, startCol: s, endCol: e, lane,
      continuesLeft: t.start_date < weekStart, continuesRight: t.end_date > weekEnd,
    });
  }
  return { segments, hidden };
}

const byStart = (a: CalTrip, b: CalTrip) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date) || a.name.localeCompare(b.name, 'th') || a.id.localeCompare(b.id);

export function tripsOnDay<T extends CalTrip>(trips: T[], date: string): T[] {
  return trips.filter((t) => validTrip(t) && t.start_date <= date && t.end_date >= date).sort(byStart);
}

export function tripsInMonth<T extends CalTrip>(trips: T[], key: string): T[] {
  const p = parseMonthKey(key);
  if (!p) return [];
  const first = `${key}-01`;
  const last = `${key}-${String(daysInMonth(p.year, p.month)).padStart(2, '0')}`;
  return trips.filter((t) => validTrip(t) && t.start_date <= last && t.end_date >= first).sort(byStart);
}

/** "วันที่ 2/3" of a trip on a given date */
export function dayProgress(trip: CalTrip, date: string): { day: number; total: number } {
  return { day: daysBetween(trip.start_date, date) + 1, total: daysBetween(trip.start_date, trip.end_date) + 1 };
}

/** screen-reader text of a day cell */
export function dayLabel(date: string, trips: CalTrip[]): string {
  const n = trips.length;
  const base = thaiLongDate(date);
  return n === 0 ? base : `${base} · ${n} ทริป: ${trips.map((t) => t.name).join(', ')}`;
}

export type CalendarUrl = { month: string; selected: string | null };

/** ?m=2026-11&d=2026-11-19 — anything invalid falls back to the current month / no selection */
export function parseCalendarParams(p: URLSearchParams, today: string): CalendarUrl {
  const m = p.get('m');
  const d = p.get('d');
  const month = parseMonthKey(m) ? (m as string) : monthOfDate(today);
  const selected = isIsoDate(d) ? d : null;
  return { month, selected };
}

export function buildCalendarParams(s: CalendarUrl): URLSearchParams {
  const p = new URLSearchParams();
  if (parseMonthKey(s.month)) p.set('m', s.month);
  if (s.selected && isIsoDate(s.selected)) p.set('d', s.selected);
  return p;
}
