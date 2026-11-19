// What a viewer sees: the JSON from get_shared_trip() -> a safe typed object -> inputs for the day scheduler. Pure.
// The server already filters everything; this file does NOT trust it blindly (types, lengths and ranges are checked,
// unknown fields are dropped, coordinates are only kept for items that point at a public place).
import { MODE_LABEL } from '../routing/provider';
import { fmtDateTh, toMin } from '../routing/time';
import type { SchedInput } from '../routing/scheduler';
import type { TravelMode, TripItemType } from '../trips/types';

export type SharedItem = {
  kind: TripItemType;
  title: string;
  placeId: string | null;
  categoryId: string | null;
  lat: number | null;
  lng: number | null;
  openingHoursText: string | null;
  durationMin: number | null;
  /** "HH:MM" when the owner locked the start time */
  lockedStart: string | null;
};
export type SharedDay = { dayIndex: number; date: string | null; isRestDay: boolean; startTime: string; items: SharedItem[] };
export type SharedProvince = { name: string; slug: string };
export type SharedTrip = {
  title: string;
  sharer: string | null;
  message: string | null;
  expiresAt: string | null;
  mode: TravelMode;
  roadFactor: number;
  dayEnd: string;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  provinces: SharedProvince[];
  days: SharedDay[];
};
export type ParseResult = { ok: true; trip: SharedTrip } | { ok: false; reason: 'unavailable' | 'invalid' | 'unsupported' };

export const SUPPORTED_VERSION = 1;
export const MAX_DAYS = 61;
export const MAX_ITEMS_PER_DAY = 200;

const KINDS: TripItemType[] = ['place', 'meal', 'cafe', 'lodging', 'rest_stop', 'custom', 'free_time', 'depart', 'arrive'];
const MODES: TravelMode[] = ['car', 'motorcycle', 'walk', 'public_transport'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** words used when the server sends no title (it always does today) */
const KIND_LABEL: Record<TripItemType, string> = {
  place: 'สถานที่', meal: 'มื้ออาหาร', cafe: 'คาเฟ่', lodging: 'ที่พัก', rest_stop: 'จุดพักรถ', custom: 'กิจกรรม',
  free_time: 'เวลาว่าง', depart: 'ออกเดินทาง', arrive: 'ถึงปลายทาง',
};
/** minutes used when an item has no duration */
export const FALLBACK_MINUTES: Record<TripItemType, number> = {
  place: 60, meal: 60, cafe: 45, lodging: 30, rest_stop: 15, custom: 60, free_time: 120, depart: 0, arrive: 0,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cap = (s: string, n: number) => [...s].slice(0, n).join('');
const str = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  return t === '' ? null : cap(t, n);
};
const hhmm = (v: unknown, fallback: string) => (typeof v === 'string' && HHMM_RE.test(v) ? v : fallback);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseItem(raw: unknown): SharedItem | null {
  if (!isObj(raw)) return null;
  const kind = KINDS.includes(raw.kind as TripItemType) ? (raw.kind as TripItemType) : 'custom';
  const placeId = typeof raw.place_id === 'string' && UUID_RE.test(raw.place_id) ? raw.place_id.toLowerCase() : null;
  const categoryId = placeId && typeof raw.category_id === 'string' && UUID_RE.test(raw.category_id) ? raw.category_id.toLowerCase() : null;
  const okPoint = placeId !== null && finite(raw.lat) && finite(raw.lng) && Math.abs(raw.lat) <= 90 && Math.abs(raw.lng) <= 180;
  const dur = raw.duration_min;
  return {
    kind,
    title: str(raw.title, 120) ?? KIND_LABEL[kind],
    placeId,
    categoryId,
    lat: okPoint ? (raw.lat as number) : null,
    lng: okPoint ? (raw.lng as number) : null,
    openingHoursText: placeId ? str(raw.opening_hours_text, 300) : null,
    durationMin: finite(dur) && Number.isInteger(dur) && dur >= 0 && dur <= 1440 ? dur : null,
    lockedStart: typeof raw.locked_start === 'string' && HHMM_RE.test(raw.locked_start) ? raw.locked_start : null,
  };
}

function parseDay(raw: unknown): SharedDay | null {
  if (!isObj(raw)) return null;
  const idx = raw.day_index;
  if (!(finite(idx) && Number.isInteger(idx) && idx >= 1 && idx <= MAX_DAYS)) return null;
  const items = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS_PER_DAY).map(parseItem).filter((x): x is SharedItem => x !== null) : [];
  return {
    dayIndex: idx,
    date: isIsoDate(raw.date) ? raw.date : null,
    isRestDay: raw.is_rest_day === true,
    startTime: hhmm(raw.start_time, '07:00'),
    items,
  };
}

/** `json` is exactly what supabase.rpc('get_shared_trip') returned (null = link not usable) */
export function parseSharedTrip(json: unknown): ParseResult {
  if (json === null || json === undefined) return { ok: false, reason: 'unavailable' };
  if (!isObj(json)) return { ok: false, reason: 'invalid' };
  if (json.version !== SUPPORTED_VERSION) return { ok: false, reason: finite(json.version) && json.version > SUPPORTED_VERSION ? 'unsupported' : 'invalid' };
  const title = str(json.title, 120);
  if (title === null || !Array.isArray(json.days)) return { ok: false, reason: 'invalid' };

  const days = json.days.slice(0, MAX_DAYS).map(parseDay).filter((d): d is SharedDay => d !== null).sort((a, b) => a.dayIndex - b.dayIndex);
  const provinces: SharedProvince[] = Array.isArray(json.provinces)
    ? json.provinces.slice(0, 20).flatMap((p) => {
        if (!isObj(p)) return [];
        const name = str(p.name_th, 80);
        return name && typeof p.slug === 'string' && SLUG_RE.test(p.slug) ? [{ name, slug: p.slug }] : [];
      })
    : [];

  let startDate = isIsoDate(json.start_date) ? json.start_date : null;
  let endDate = isIsoDate(json.end_date) ? json.end_date : null;
  if (!startDate || !endDate || endDate < startDate) { startDate = null; endDate = null; }
  const rf = json.road_factor;
  const exp = typeof json.expires_at === 'string' && Number.isFinite(Date.parse(json.expires_at)) ? json.expires_at : null;
  const dc = json.day_count;

  return {
    ok: true,
    trip: {
      title,
      sharer: str(json.sharer, 60),
      message: typeof json.message === 'string' ? cap(json.message.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim(), 280) || null : null,
      expiresAt: exp,
      mode: MODES.includes(json.mode as TravelMode) ? (json.mode as TravelMode) : 'car',
      roadFactor: finite(rf) && rf >= 1 && rf <= 3 ? rf : 1.3,
      dayEnd: hhmm(json.day_end_time, '20:00'),
      startDate,
      endDate,
      dayCount: finite(dc) && Number.isInteger(dc) && dc >= 0 && dc <= MAX_DAYS ? dc : days.length,
      provinces,
      days,
    },
  };
}

// ---------------------------------------------------------------- derived values

/** inputs for scheduleDay(). No origin / destination is ever passed (the trip's start point is not shared). */
export function toSchedInputs(day: SharedDay): SchedInput[] {
  return day.items.map((it, i) => ({
    id: `d${day.dayIndex}-${i}`,
    type: it.kind,
    title: it.title,
    lat: it.lat,
    lng: it.lng,
    durationMin: it.durationMin ?? FALLBACK_MINUTES[it.kind],
    lockedStartMin: it.lockedStart ? toMin(it.lockedStart) : null,
    travelOverrideMin: null,
    openingHoursText: it.openingHoursText,
  }));
}

/** the scheduler says "ไม่ทราบเวลาเปิด-ปิด" for every place without hours — noise for a viewer */
export const isNoiseNote = (n: string) => n === 'ไม่ทราบเวลาเปิด-ปิด';

export type MapStop = { lat: number; lng: number; label: string; n: number };

/** numbered stops with coordinates (only public places have them) */
export function mapStops(day: SharedDay): MapStop[] {
  const out: MapStop[] = [];
  for (const it of day.items) {
    if (it.lat !== null && it.lng !== null) out.push({ lat: it.lat, lng: it.lng, label: it.title, n: out.length + 1 });
  }
  return out;
}

/** "ศ. 20 พ.ย. – จ. 24 พ.ย. 2569" or "5 วัน" when the owner hid the dates */
export function dateRangeText(trip: Pick<SharedTrip, 'startDate' | 'endDate' | 'dayCount' | 'days'>): string {
  if (trip.startDate && trip.endDate) {
    return trip.startDate === trip.endDate ? fmtDateTh(trip.startDate, true) : `${fmtDateTh(trip.startDate)} – ${fmtDateTh(trip.endDate, true)}`;
  }
  const n = trip.dayCount || trip.days.length;
  return n > 0 ? `${n} วัน` : '';
}

export const subtitleText = (trip: SharedTrip) => [dateRangeText(trip), MODE_LABEL[trip.mode]].filter(Boolean).join(' · ');

export const dayHeading = (d: Pick<SharedDay, 'dayIndex' | 'date'>) => `วัน ${d.dayIndex}${d.date ? ` · ${fmtDateTh(d.date)}` : ''}`;

/** "ใช้ได้ถึง 18 ธ.ค. 2569" (Thailand time) or null when the link never expires */
export function expiryText(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  return isIsoDate(iso) ? `ใช้ได้ถึง ${fmtDateTh(iso, true)}` : null;
}
