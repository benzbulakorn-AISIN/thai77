// iCalendar (.ics, RFC 5545) writer. Pure: nothing here reads the clock or the network.
//  * lines end with CRLF and are folded at 75 BYTES (UTF-8 safe, Thai text is never cut in the middle of a character)
//  * text is escaped, so a title can never inject extra properties
//  * times are written as Asia/Bangkok (UTC+7, no daylight saving) with a VTIMEZONE block
import { addDays } from '../routing/time';

const CRLF = '\r\n';
export const ICS_TZID = 'Asia/Bangkok';
export const MAX_EVENTS = 2000;
export const MIN_EVENT_MINUTES = 5;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const enc = new TextEncoder();

/** TEXT value: remove control characters, escape \  ;  ,  and newlines */
export function escapeText(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Break a logical line into physical lines of at most 75 bytes (continuation lines start with one space). */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}

const compactDate = (iso: string) => iso.replace(/-/g, '');
const validDate = (s: string) => {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

/** date + minutes after midnight (may be >= 1440 or negative) -> local date/time parts */
export function localDateTime(date: string, minutes: number): { date: string; time: string } {
  const total = Math.round(minutes);
  const dayShift = Math.floor(total / 1440);
  const m = total - dayShift * 1440;
  const d = dayShift === 0 ? date : addDays(date, dayShift);
  return { date: compactDate(d), time: `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00` };
}

export function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const uidPart = (s: string) => String(s ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || 'x';

type EventSpec = {
  uid: string;
  summary: string;
  description?: string;
  categories?: string;
  geo?: { lat: number; lng: number } | null;
  allDay?: { start: string; endExclusive: string };
  timed?: { startDate: string; startMin: number; endMin: number };
};

function eventLines(e: EventSpec, stamp: string): string[] {
  const L: string[] = ['BEGIN:VEVENT', `UID:${e.uid}@thai77`, `DTSTAMP:${stamp}`];
  if (e.allDay) {
    L.push(`DTSTART;VALUE=DATE:${compactDate(e.allDay.start)}`, `DTEND;VALUE=DATE:${compactDate(e.allDay.endExclusive)}`);
  } else if (e.timed) {
    const end = Math.max(e.timed.endMin, e.timed.startMin + MIN_EVENT_MINUTES);
    const s = localDateTime(e.timed.startDate, e.timed.startMin);
    const f = localDateTime(e.timed.startDate, end);
    L.push(`DTSTART;TZID=${ICS_TZID}:${s.date}T${s.time}`, `DTEND;TZID=${ICS_TZID}:${f.date}T${f.time}`);
  }
  L.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) L.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.categories) L.push(`CATEGORIES:${escapeText(e.categories)}`);
  const g = e.geo;
  if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180) {
    L.push(`GEO:${g.lat.toFixed(6)};${g.lng.toFixed(6)}`);
  }
  L.push('SEQUENCE:0', 'END:VEVENT');
  return L;
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${ICS_TZID}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE',
];

function wrap(name: string, events: EventSpec[], now: Date): string {
  const stamp = utcStamp(now);
  const list = events.slice(0, MAX_EVENTS);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//thai77//Trip Planner//TH', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`, `X-WR-TIMEZONE:${ICS_TZID}`,
    ...(list.some((e) => e.timed) ? VTIMEZONE : []),
    ...list.flatMap((e) => eventLines(e, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// ---------------------------------------------------------------- trips

export type IcsTrip = { id: string; name: string; start_date: string; end_date: string; travelers?: number };

function tripEvent(t: IcsTrip, withDescription = true): EventSpec | null {
  if (!validDate(t.start_date) || !validDate(t.end_date) || t.end_date < t.start_date) return null;
  return {
    uid: `trip-${uidPart(t.id)}`,
    summary: t.name || 'ทริป',
    description: withDescription
      ? `ทริปจากแอป เที่ยวไทย 77${t.travelers ? ` · ${t.travelers} คน` : ''}`
      : undefined,
    categories: 'ทริป',
    allDay: { start: t.start_date, endExclusive: addDays(t.end_date, 1) },
  };
}

/** every trip as one all-day (multi-day) event */
export function buildTripsCalendar(trips: IcsTrip[], now: Date): string {
  const events = trips.map((t) => tripEvent(t)).filter((e): e is EventSpec => e !== null);
  return wrap('ทริปของฉัน', events, now);
}

export type IcsItem = {
  id: string;
  title: string;
  /** "สถานที่", "มื้ออาหาร", ... */
  kind: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  /** minutes after midnight of the day's date (end may pass 1440) */
  start: number;
  end: number;
  travelKm: number | null;
  travelMin: number | null;
  travelEstimated: boolean;
};
export type IcsDay = { date: string | null; dayIndex: number; items: IcsItem[] };

function itemDescription(it: IcsItem, trip: IcsTrip, day: IcsDay, modeLabel: string): string {
  const lines = [`${trip.name} · วันที่ ${day.dayIndex}`, 'เวลาเป็นค่าประมาณจากแผนในแอป อาจต่างจากความเป็นจริง'];
  const km = it.travelKm != null && it.travelKm >= 0.05 ? `~${it.travelKm < 10 ? it.travelKm.toFixed(1) : Math.round(it.travelKm)} กม.` : null;
  const min = it.travelMin != null && it.travelMin > 0 ? `~${Math.round(it.travelMin)} นาที` : null;
  if (km || min) {
    lines.push(`เดินทางมาจุดนี้${modeLabel ? `โดย${modeLabel}` : ''} ${[km, min].filter(Boolean).join(' · ')}${it.travelEstimated ? ' (ค่าประมาณ)' : ' (เวลากำหนดเอง)'}`);
  }
  if (it.notes && it.notes.trim()) lines.push(`หมายเหตุ: ${it.notes.trim()}`);
  return lines.join('\n');
}

/**
 * One trip: an all-day banner for the whole trip + one event per timeline item.
 * NOT included on purpose: the start/end points of the trip (home), costs and the budget.
 */
export function buildTripCalendar(o: { trip: IcsTrip; days: IcsDay[]; modeLabel: string; now: Date }): string {
  const events: EventSpec[] = [];
  const banner = tripEvent(o.trip);
  if (banner) events.push(banner);
  for (const day of o.days) {
    if (!day.date || !validDate(day.date)) continue;
    for (const it of day.items) {
      if (!Number.isFinite(it.start) || !Number.isFinite(it.end)) continue;
      events.push({
        uid: `item-${uidPart(it.id)}`,
        summary: it.title || it.kind || 'กิจกรรม',
        description: itemDescription(it, o.trip, day, o.modeLabel),
        categories: it.kind,
        geo: it.lat != null && it.lng != null ? { lat: it.lat, lng: it.lng } : null,
        timed: { startDate: day.date, startMin: it.start, endMin: it.end },
      });
    }
  }
  return wrap(o.trip.name || 'ทริป', events, o.now);
}

/** thai77-ชื่อทริป-2026-11-20.ics (characters that are not allowed in file names are removed) */
export function icsFileName(name: string, date: string): string {
  const slug = String(name ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|#%&{}$!'`@+=^~\[\];,]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/g, '');
  return `thai77-${slug || 'trip'}-${validDate(date) ? date : 'export'}.ics`;
}
