import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS, MIN_EVENT_MINUTES, buildTripCalendar, buildTripsCalendar, escapeText, foldLine, icsFileName, localDateTime, utcStamp,
  type IcsDay, type IcsItem, type IcsTrip,
} from '../../src/features/calendar/ics';

const NOW = new Date('2026-11-19T03:04:05.678Z');
const trip: IcsTrip = { id: '11111111-1111-4111-8111-111111111111', name: 'เที่ยวชลบุรี', start_date: '2026-11-20', end_date: '2026-11-22', travelers: 2 };
const item = (o: Partial<IcsItem> = {}): IcsItem => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'วัดญาณฯ', kind: 'สถานที่', lat: 12.7, lng: 100.9, notes: null,
  start: 8 * 60 + 30, end: 10 * 60, travelKm: 12.34, travelMin: 25, travelEstimated: true, ...o,
});
const day = (items: IcsItem[], date: string | null = '2026-11-20', dayIndex = 1): IcsDay => ({ date, dayIndex, items });

/** unfold + split into logical lines */
const lines = (s: string) => s.replace(/\r\n[ \t]/g, '').split('\r\n').filter((l) => l !== '');
const events = (ics: string) => {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const l of lines(ics)) {
    if (l === 'BEGIN:VEVENT') cur = [];
    else if (l === 'END:VEVENT') { out.push(cur!); cur = null; }
    else if (cur) cur.push(l);
  }
  return out;
};
const prop = (ev: string[], name: string) => ev.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    expect(escapeText('บรรทัด1\nบรรทัด2')).toBe('บรรทัด1\\nบรรทัด2');
    expect(escapeText('a\r\nb\rc')).toBe('a\\nb\\nc');
  });
  it('removes control characters but keeps tabs', () => {
    expect(escapeText('a\u0000b\u0007c\u007fd\te')).toBe('abcd\te');
  });
  it('a title can never inject a new property', () => {
    const s = escapeText('x\r\nATTENDEE:mailto:evil@example.com\r\nEND:VEVENT');
    expect(s.includes('\n')).toBe(false);
    expect(s.includes('\r')).toBe(false);
    const ics = buildTripCalendar({ trip, days: [day([item({ title: 'x\r\nATTENDEE:mailto:evil@example.com' })])], modeLabel: 'รถยนต์', now: NOW });
    expect(lines(ics).some((l) => l.startsWith('ATTENDEE'))).toBe(false);
  });
  it('null / undefined are empty', () => {
    expect(escapeText(null as unknown as string)).toBe('');
    expect(escapeText(undefined as unknown as string)).toBe('');
  });
});

describe('foldLine', () => {
  const enc = new TextEncoder();
  const physical = (s: string) => s.split('\r\n');
  it('short lines are untouched', () => {
    expect(foldLine('SUMMARY:สั้น')).toBe('SUMMARY:สั้น');
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
  });
  it('long ASCII: every physical line <= 75 bytes and unfolding restores the text', () => {
    const l = 'DESCRIPTION:' + 'abcdefghij'.repeat(30);
    const f = foldLine(l);
    for (const p of physical(f)) expect(enc.encode(p).length <= 75).toBe(true);
    expect(f.replace(/\r\n /g, '')).toBe(l);
    expect(physical(f)[1].startsWith(' ')).toBe(true);
  });
  it('Thai text (3 bytes per letter): limit is in BYTES, characters are never cut in half', () => {
    const l = 'DESCRIPTION:' + 'เที่ยวไทยครบเจ็ดสิบเจ็ดจังหวัด'.repeat(8);
    const f = foldLine(l);
    for (const p of physical(f)) {
      expect(enc.encode(p).length <= 75).toBe(true);
      new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(p)); // would throw on a broken sequence
    }
    expect(f.replace(/\r\n /g, '')).toBe(l);
  });
  it('emoji (4 bytes) are kept whole', () => {
    const l = 'SUMMARY:' + '🏝️'.repeat(60);
    const f = foldLine(l);
    for (const p of physical(f)) expect(enc.encode(p).length <= 75).toBe(true);
    expect(f.replace(/\r\n /g, '')).toBe(l);
  });
  it('exactly at the boundary', () => {
    expect(physical(foldLine('x'.repeat(76))).length).toBe(2);
    expect(physical(foldLine('x'.repeat(75 + 74))).length).toBe(2);
    expect(physical(foldLine('x'.repeat(75 + 75))).length).toBe(3);
  });
});

describe('date helpers', () => {
  it('localDateTime handles midnight, overnight and negative minutes', () => {
    expect(localDateTime('2026-11-20', 0)).toEqual({ date: '20261120', time: '000000' });
    expect(localDateTime('2026-11-20', 8 * 60 + 5)).toEqual({ date: '20261120', time: '080500' });
    expect(localDateTime('2026-11-20', 1439)).toEqual({ date: '20261120', time: '235900' });
    expect(localDateTime('2026-11-20', 1440)).toEqual({ date: '20261121', time: '000000' });
    expect(localDateTime('2026-11-30', 25 * 60)).toEqual({ date: '20261201', time: '010000' });
    expect(localDateTime('2026-12-31', 1500)).toEqual({ date: '20270101', time: '010000' });
    expect(localDateTime('2026-03-01', -30)).toEqual({ date: '20260228', time: '233000' });
    expect(localDateTime('2028-02-28', 1440)).toEqual({ date: '20280229', time: '000000' });
  });
  it('utcStamp', () => {
    expect(utcStamp(NOW)).toBe('20261119T030405Z');
  });
});

describe('all-day trips', () => {
  const ics = buildTripsCalendar([trip, { id: 't2', name: 'ปีใหม่', start_date: '2026-12-30', end_date: '2026-12-31' }, { id: 't3', name: 'วันเดียว', start_date: '2026-11-25', end_date: '2026-11-25' }], NOW);
  const evs = events(ics);
  it('is a well-formed calendar with CRLF endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.includes('\n') && !/[^\r]\n/.test(ics)).toBe(true); // every LF is preceded by CR
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(3);
    expect(ics.split('END:VEVENT').length - 1).toBe(3);
    expect(lines(ics).filter((l) => l.startsWith('BEGIN:')).length).toBe(lines(ics).filter((l) => l.startsWith('END:')).length);
  });
  it('DTEND of an all-day event is the day AFTER the last day', () => {
    expect(prop(evs[0], 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261120');
    expect(prop(evs[0], 'DTEND')).toBe('DTEND;VALUE=DATE:20261123');
    expect(prop(evs[1], 'DTEND')).toBe('DTEND;VALUE=DATE:20270101'); // year rollover
    expect(prop(evs[2], 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261125');
    expect(prop(evs[2], 'DTEND')).toBe('DTEND;VALUE=DATE:20261126'); // one-day trip
  });
  it('has summary, a stable UID and the stamp', () => {
    expect(prop(evs[0], 'SUMMARY')).toBe('SUMMARY:เที่ยวชลบุรี');
    expect(prop(evs[0], 'UID')).toBe('UID:trip-11111111-1111-4111-8111-111111111111@thai77');
    expect(prop(evs[0], 'DTSTAMP')).toBe('DTSTAMP:20261119T030405Z');
    expect(new Set(evs.map((e) => prop(e, 'UID'))).size).toBe(3);
  });
  it('no VTIMEZONE when there are no timed events', () => {
    expect(ics.includes('VTIMEZONE')).toBe(false);
  });
  it('same input gives the same bytes', () => {
    expect(buildTripsCalendar([trip], NOW)).toBe(buildTripsCalendar([trip], NOW));
  });
  it('skips trips with broken dates', () => {
    const bad = buildTripsCalendar([{ id: 'x', name: 'x', start_date: '2026-11-25', end_date: '2026-11-20' }, { id: 'y', name: 'y', start_date: 'oops', end_date: '2026-11-20' }, { id: 'z', name: 'z', start_date: '2026-02-30', end_date: '2026-03-01' }], NOW);
    expect(events(bad)).toHaveLength(0);
  });
  it('trip names with commas / semicolons are escaped', () => {
    const e = events(buildTripsCalendar([{ ...trip, name: 'ทริป A, B; C' }], NOW))[0];
    expect(prop(e, 'SUMMARY')).toBe('SUMMARY:ทริป A\\, B\\; C');
  });
});

describe('timeline events', () => {
  const build = (days: IcsDay[]) => buildTripCalendar({ trip, days, modeLabel: 'รถยนต์', now: NOW });
  it('one banner + one event per item, with Bangkok times', () => {
    const ics = build([day([item(), item({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'อาหารกลางวัน', kind: 'มื้ออาหาร', lat: null, lng: null, start: 12 * 60, end: 13 * 60 })])]);
    const evs = events(ics);
    expect(evs).toHaveLength(3);
    expect(prop(evs[1], 'DTSTART')).toBe('DTSTART;TZID=Asia/Bangkok:20261120T083000');
    expect(prop(evs[1], 'DTEND')).toBe('DTEND;TZID=Asia/Bangkok:20261120T100000');
    expect(prop(evs[2], 'DTSTART')).toBe('DTSTART;TZID=Asia/Bangkok:20261120T120000');
  });
  it('writes a VTIMEZONE (UTC+7, no daylight saving) once', () => {
    const ics = build([day([item()])]);
    expect(ics.split('BEGIN:VTIMEZONE').length - 1).toBe(1);
    expect(ics.includes('TZID:Asia/Bangkok')).toBe(true);
    expect(ics.includes('TZOFFSETFROM:+0700') && ics.includes('TZOFFSETTO:+0700')).toBe(true);
    expect(ics.includes('DAYLIGHT')).toBe(false);
  });
  it('overnight items end on the next day', () => {
    const e = events(build([day([item({ start: 22 * 60, end: 25 * 60 })])]))[1];
    expect(prop(e, 'DTSTART')).toBe('DTSTART;TZID=Asia/Bangkok:20261120T220000');
    expect(prop(e, 'DTEND')).toBe('DTEND;TZID=Asia/Bangkok:20261121T010000');
  });
  it('an item with no length gets a minimum length (DTEND must be later than DTSTART)', () => {
    expect(MIN_EVENT_MINUTES).toBe(5);
    const e = events(build([day([item({ start: 600, end: 600 })])]))[1];
    expect(prop(e, 'DTEND')).toBe('DTEND;TZID=Asia/Bangkok:20261120T100500');
    const e2 = events(build([day([item({ start: 600, end: 590 })])]))[1];
    expect(prop(e2, 'DTEND')).toBe('DTEND;TZID=Asia/Bangkok:20261120T100500');
  });
  it('days without a date and items with broken times are skipped; the banner stays', () => {
    const evs = events(build([day([item()], null), day([item({ start: NaN })], '2026-11-21', 2), day([item()], '2026-02-30', 3)]));
    expect(evs).toHaveLength(1);
    expect(prop(evs[0], 'UID')?.startsWith('UID:trip-')).toBe(true);
  });
  it('GEO only for real coordinates', () => {
    const evs = events(build([day([item(), item({ id: 'c', lat: null, lng: null }), item({ id: 'd', lat: 95, lng: 100 }), item({ id: 'e', lat: NaN, lng: 100 })])]));
    expect(prop(evs[1], 'GEO')).toBe('GEO:12.700000;100.900000');
    expect(prop(evs[2], 'GEO')).toBeUndefined();
    expect(prop(evs[3], 'GEO')).toBeUndefined();
    expect(prop(evs[4], 'GEO')).toBeUndefined();
  });
  it('description says the times are estimates and shows the travel leg', () => {
    const d = prop(events(build([day([item()])]))[1], 'DESCRIPTION')!;
    expect(d).toContain('ค่าประมาณ');
    expect(d).toContain('โดยรถยนต์');
    expect(d).toContain('~12 กม.');
    expect(d).toContain('~25 นาที');
    expect(d).toContain('วันที่ 1');
  });
  it('typed-in travel time is labelled as such; no leg -> no travel line', () => {
    const typed = prop(events(build([day([item({ travelEstimated: false })])]))[1], 'DESCRIPTION')!;
    expect(typed).toContain('เวลากำหนดเอง');
    const none = prop(events(build([day([item({ travelKm: null, travelMin: null })])]))[1], 'DESCRIPTION')!;
    expect(none.includes('เดินทางมาจุดนี้')).toBe(false);
  });
  it('notes are included when present', () => {
    const d = prop(events(build([day([item({ notes: 'จองโต๊ะไว้แล้ว' })])]))[1], 'DESCRIPTION')!;
    expect(d).toContain('หมายเหตุ: จองโต๊ะไว้แล้ว');
  });
  it('PRIVACY: nothing about the start/end point, costs or budget is written', () => {
    const ics = build([day([item({ title: 'ร้านอาหาร' })])]);
    for (const word of ['start_point', 'end_point', 'budget', 'งบ', 'บาท', 'est_cost', 'บ้าน']) expect(ics.includes(word)).toBe(false);
  });
  it('item UIDs are stable and unique', () => {
    const ics = build([day([item(), item({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })])]);
    const uids = events(ics).map((e) => prop(e, 'UID'));
    expect(new Set(uids).size).toBe(3);
    expect(uids[1]).toBe('UID:item-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@thai77');
    expect(build([day([item()])])).toBe(build([day([item()])]));
  });
  it('UID cannot be used to inject anything', () => {
    const ics = build([day([item({ id: 'x\r\nATTENDEE:evil;@' })])]);
    expect(lines(ics).some((l) => l.startsWith('ATTENDEE'))).toBe(false);
    expect(prop(events(ics)[1], 'UID')).toBe('UID:item-xATTENDEEevil@thai77');
  });
  it('every physical line is at most 75 bytes, even for very long Thai notes', () => {
    const enc = new TextEncoder();
    const ics = build([day([item({ notes: 'หมายเหตุยาวมาก '.repeat(60), title: 'ชื่อกิจกรรมที่ยาวมาก '.repeat(10) })])]);
    for (const p of ics.split('\r\n')) expect(enc.encode(p).length <= 75).toBe(true);
    const e = events(ics)[1];
    expect(prop(e, 'DESCRIPTION')!.length > 500).toBe(true); // unfolded content is complete
  });
  it('calendar name is the trip name', () => {
    expect(lines(build([day([])])).includes('X-WR-CALNAME:เที่ยวชลบุรี')).toBe(true);
  });
  it('the number of events is capped', () => {
    const many = Array.from({ length: MAX_EVENTS + 50 }, (_, i) => item({ id: `id-${i}` }));
    expect(events(build([day(many)])).length).toBe(MAX_EVENTS);
  });
});

describe('icsFileName', () => {
  it('keeps Thai, removes forbidden characters, always ends with .ics', () => {
    expect(icsFileName('เที่ยวชลบุรี', '2026-11-20')).toBe('thai77-เที่ยวชลบุรี-2026-11-20.ics');
    expect(icsFileName('a/b\\c:d*e?f"g<h>i|j', '2026-11-20')).toBe('thai77-a-b-c-d-e-f-g-h-i-j-2026-11-20.ics');
    expect(icsFileName('  ทริป   สอง  ', '2026-11-20')).toBe('thai77-ทริป-สอง-2026-11-20.ics');
    expect(icsFileName('../../etc/passwd', '2026-11-20')).toBe('thai77-etc-passwd-2026-11-20.ics');
  });
  it('falls back when the name is empty or the date is bad; length is limited', () => {
    expect(icsFileName('', '2026-11-20')).toBe('thai77-trip-2026-11-20.ics');
    expect(icsFileName('???', '2026-11-20')).toBe('thai77-trip-2026-11-20.ics');
    expect(icsFileName('x', 'bad')).toBe('thai77-x-export.ics');
    expect(icsFileName('ก'.repeat(200), '2026-11-20').length).toBeLessThan(80);
  });
});
