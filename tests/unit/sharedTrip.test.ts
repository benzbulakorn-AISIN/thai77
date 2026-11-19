import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MINUTES, MAX_DAYS, MAX_ITEMS_PER_DAY, dateRangeText, dayHeading, expiryText, isIsoDate, isNoiseNote, mapStops, parseSharedTrip,
  subtitleText, toSchedInputs, type SharedDay, type SharedTrip,
} from '../../src/features/share/sharedTripModel';
import { buildSharedDayViews } from '../../src/features/share/sharedSchedule';

const PL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// exactly the shape get_shared_trip() returns (see supabase/migrations/…009)
const payload = (over: Record<string, unknown> = {}) => ({
  version: 1, title: 'ทริปสาธารณะ', sharer: 'เบนซ์', message: 'ดูแผนได้เลย', expires_at: '2026-12-18T10:00:00+00:00', mode: 'car', road_factor: 1.35,
  day_end_time: '20:00', start_date: '2030-05-01', end_date: '2030-05-03', day_count: 3,
  provinces: [{ name_th: 'ชลบุรี', slug: 'chon-buri' }, { name_th: 'ระยอง', slug: 'rayong' }],
  days: [
    { day_index: 1, date: '2030-05-01', is_rest_day: false, start_time: '07:30', items: [
      { kind: 'place', title: 'ชายหาดสาธารณะ', place_id: PL, category_id: CAT, lat: 12.7, lng: 100.9, opening_hours_text: 'Tu-Su 09:00-16:00', duration_min: 90, locked_start: null },
      { kind: 'place', title: 'สถานที่ส่วนตัว', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: null, locked_start: null },
      { kind: 'meal', title: 'มื้ออาหาร', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 60, locked_start: null },
    ] },
    { day_index: 2, date: '2030-05-02', is_rest_day: false, start_time: '07:00', items: [
      { kind: 'lodging', title: 'ที่พัก', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 30, locked_start: null },
      { kind: 'custom', title: 'กิจกรรม', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 90, locked_start: '14:00' },
    ] },
    { day_index: 3, date: '2030-05-03', is_rest_day: true, start_time: '07:00', items: [] },
  ],
  ...over,
});
const ok = (j: unknown): SharedTrip => { const r = parseSharedTrip(j); if (!r.ok) throw new Error(r.reason); return r.trip; };

describe('parseSharedTrip: the normal case', () => {
  const t = ok(payload());
  it('maps every field', () => {
    expect([t.title, t.sharer, t.message, t.mode, t.roadFactor, t.dayEnd, t.dayCount]).toEqual(['ทริปสาธารณะ', 'เบนซ์', 'ดูแผนได้เลย', 'car', 1.35, '20:00', 3]);
    expect([t.startDate, t.endDate]).toEqual(['2030-05-01', '2030-05-03']);
    expect(t.provinces).toEqual([{ name: 'ชลบุรี', slug: 'chon-buri' }, { name: 'ระยอง', slug: 'rayong' }]);
    expect(t.days.map((d) => [d.dayIndex, d.date, d.isRestDay, d.startTime, d.items.length])).toEqual([
      [1, '2030-05-01', false, '07:30', 3], [2, '2030-05-02', false, '07:00', 2], [3, '2030-05-03', true, '07:00', 0]]);
    expect(t.days[0].items[0]).toEqual({
      kind: 'place', title: 'ชายหาดสาธารณะ', placeId: PL, categoryId: CAT, lat: 12.7, lng: 100.9, openingHoursText: 'Tu-Su 09:00-16:00', durationMin: 90, lockedStart: null,
    });
    expect(t.days[1].items[1].lockedStart).toBe('14:00');
  });
});

describe('parseSharedTrip: unusable answers', () => {
  it('null / undefined = link not usable (the server answers the same for missing, expired and revoked)', () => {
    expect(parseSharedTrip(null)).toEqual({ ok: false, reason: 'unavailable' });
    expect(parseSharedTrip(undefined)).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('wrong shapes are "invalid"', () => {
    for (const bad of ['x', 5, true, [], [payload()], {}, { version: 1 }, payload({ days: 'nope' }), payload({ title: '' }), payload({ title: '   ' }), payload({ title: 5 }), payload({ version: 'x' }), payload({ version: 0 })]) {
      expect(parseSharedTrip(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });
  it('a newer format asks for an app update', () => {
    expect(parseSharedTrip(payload({ version: 2 }))).toEqual({ ok: false, reason: 'unsupported' });
    expect(parseSharedTrip(payload({ version: 99 }))).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('parseSharedTrip: defensive cleaning', () => {
  it('unknown fields from the server are dropped (nothing extra can reach the screen)', () => {
    const j = payload({ budget_total: 424242, start_point: { lat: 13.1, lng: 100.6 }, notes: 'SECRET' });
    (j.days[0] as Record<string, unknown>).notes = 'SECRET_DAY';
    (j.days[0].items[0] as Record<string, unknown>).est_cost = 616161;
    (j.days[0].items[0] as Record<string, unknown>).notes = 'SECRET_ITEM';
    const s = JSON.stringify(ok(j));
    for (const w of ['424242', 'SECRET', '616161', 'start_point', '13.1']) expect(s.includes(w)).toBe(false);
  });
  it('coordinates are kept ONLY for items that point at a public place', () => {
    const j = payload();
    (j.days[0].items[1] as Record<string, unknown>).lat = 13.123456;
    (j.days[0].items[1] as Record<string, unknown>).lng = 100.654321;       // no place_id: must be dropped
    const it = ok(j).days[0].items[1];
    expect([it.lat, it.lng, it.placeId]).toEqual([null, null, null]);
  });
  it('opening hours and category also need a place', () => {
    const j = payload();
    (j.days[0].items[2] as Record<string, unknown>).opening_hours_text = 'SECRET 09:00';
    (j.days[0].items[2] as Record<string, unknown>).category_id = CAT;
    const it = ok(j).days[0].items[2];
    expect([it.openingHoursText, it.categoryId]).toEqual([null, null]);
  });
  it('bad numbers / ranges are dropped, not shown', () => {
    const j = payload();
    const a = j.days[0].items[0] as Record<string, unknown>;
    a.lat = 'x'; expect(ok(j).days[0].items[0].lat).toBeNull();
    a.lat = 95; a.lng = 100; expect(ok(j).days[0].items[0].lat).toBeNull();
    a.lat = 12; a.lng = NaN; expect(ok(j).days[0].items[0].lng).toBeNull();
    a.lat = 12; a.lng = 100; a.duration_min = -5; expect(ok(j).days[0].items[0].durationMin).toBeNull();
    a.duration_min = 99999; expect(ok(j).days[0].items[0].durationMin).toBeNull();
    a.duration_min = 1.5; expect(ok(j).days[0].items[0].durationMin).toBeNull();
    a.duration_min = 0; expect(ok(j).days[0].items[0].durationMin).toBe(0);
    a.locked_start = '25:61'; expect(ok(j).days[0].items[0].lockedStart).toBeNull();
    a.locked_start = '9:00'; expect(ok(j).days[0].items[0].lockedStart).toBeNull();
    a.locked_start = '09:00'; expect(ok(j).days[0].items[0].lockedStart).toBe('09:00');
  });
  it('unknown kinds become "custom"; missing titles get a label; long text is cut', () => {
    const j = payload();
    (j.days[0].items[0] as Record<string, unknown>).kind = 'teleport';
    (j.days[0].items[1] as Record<string, unknown>).title = '';
    (j.days[0].items[2] as Record<string, unknown>).title = 'ก'.repeat(500);
    const d = ok(j).days[0];
    expect(d.items[0].kind).toBe('custom');
    expect(d.items[1].title).toBe('สถานที่');
    expect([...d.items[2].title]).toHaveLength(120);
  });
  it('control characters in text become spaces', () => {
    const j = payload({ title: 'ชื่อ\u0007ทริป', sharer: 'a\u0000b', message: 'บรรทัด\u0001หนึ่ง' });
    const t = ok(j);
    expect([t.title, t.sharer, t.message]).toEqual(['ชื่อ ทริป', 'a b', 'บรรทัด หนึ่ง']);
  });
  it('mode, road factor and times fall back to safe defaults', () => {
    const t = ok(payload({ mode: 'rocket', road_factor: 99, day_end_time: 'late' }));
    expect([t.mode, t.roadFactor, t.dayEnd]).toEqual(['car', 1.3, '20:00']);
    const d = ok(payload({ days: [{ day_index: 1, date: null, is_rest_day: false, start_time: 'x', items: [] }] })).days[0];
    expect(d.startTime).toBe('07:00');
  });
  it('dates must be real; a reversed range is dropped; hidden dates stay null', () => {
    expect(ok(payload({ start_date: '2030-02-30' })).startDate).toBeNull();
    const rev = ok(payload({ start_date: '2030-05-09', end_date: '2030-05-01' }));
    expect([rev.startDate, rev.endDate]).toEqual([null, null]);
    const hid = ok(payload({ start_date: null, end_date: null }));
    expect([hid.startDate, hid.endDate]).toEqual([null, null]);
    expect(ok(payload({ days: [{ day_index: 1, date: '2030-13-40', is_rest_day: false, start_time: '07:00', items: [] }] })).days[0].date).toBeNull();
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
  });
  it('bad province entries are skipped (a slug can never contain slashes or quotes)', () => {
    const t = ok(payload({ provinces: [{ name_th: 'ดี', slug: 'ok-1' }, { name_th: 'x', slug: '../evil' }, { name_th: 'y', slug: 'a"b' }, { name_th: '', slug: 'z' }, null, 'str'] }));
    expect(t.provinces).toEqual([{ name: 'ดี', slug: 'ok-1' }]);
  });
  it('days are sorted by number; bad days are dropped; counts are capped', () => {
    const day = (n: number) => ({ day_index: n, date: null, is_rest_day: false, start_time: '07:00', items: [] });
    const t = ok(payload({ days: [day(3), day(1), { day_index: 0 }, { day_index: 'x' }, null, day(2)] }));
    expect(t.days.map((d) => d.dayIndex)).toEqual([1, 2, 3]);
    const many = ok(payload({ days: Array.from({ length: MAX_DAYS + 20 }, (_, i) => day(i + 1)) }));
    expect(many.days).toHaveLength(MAX_DAYS);
    const items = Array.from({ length: MAX_ITEMS_PER_DAY + 50 }, () => ({ kind: 'meal', title: 'x' }));
    expect(ok(payload({ days: [{ ...day(1), items }] })).days[0].items).toHaveLength(MAX_ITEMS_PER_DAY);
  });
  it('a "__proto__" key from a hostile answer does not pollute anything', () => {
    parseSharedTrip(JSON.parse('{"version":1,"title":"x","days":[],"__proto__":{"polluted":true}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('does not throw on any strange input', () => {
    for (const x of [{ version: 1, title: 'x', days: [null, 5, 'a', [], { items: 3 }] }, { version: 1, title: 'x', days: [], provinces: 5, expires_at: {} }]) {
      expect(() => parseSharedTrip(x)).not.toThrow();
    }
  });
});

describe('derived texts', () => {
  const t = ok(payload());
  it('date range: dates, one day, or only the number of days when dates are hidden', () => {
    expect(dateRangeText(t)).toBe('พ. 1 พ.ค. – ศ. 3 พ.ค. 2573');
    expect(dateRangeText({ ...t, endDate: '2030-05-01' })).toBe('พ. 1 พ.ค. 2573');
    expect(dateRangeText({ ...t, startDate: null, endDate: null })).toBe('3 วัน');
    expect(dateRangeText({ ...t, startDate: null, endDate: null, dayCount: 0, days: [] })).toBe('');
  });
  it('subtitle and day heading', () => {
    expect(subtitleText(t)).toBe('พ. 1 พ.ค. – ศ. 3 พ.ค. 2573 · รถยนต์');
    expect(subtitleText({ ...t, startDate: null, endDate: null, mode: 'walk' })).toBe('3 วัน · เดิน');
    expect(dayHeading({ dayIndex: 2, date: '2030-05-02' })).toBe('วัน 2 · พฤ. 2 พ.ค.');
    expect(dayHeading({ dayIndex: 2, date: null })).toBe('วัน 2');
  });
  it('expiry text uses Thailand time (a link that ends late at night UTC is the next Thai day)', () => {
    expect(expiryText('2026-12-18T10:00:00+00:00')).toBe('ใช้ได้ถึง ศ. 18 ธ.ค. 2569');
    expect(expiryText('2026-12-18T18:00:00Z')).toBe('ใช้ได้ถึง ส. 19 ธ.ค. 2569');
    expect(expiryText(null)).toBeNull();
    expect(expiryText('garbage')).toBeNull();
  });
  it('map stops: numbered, only items with coordinates', () => {
    expect(mapStops(t.days[0])).toEqual([{ lat: 12.7, lng: 100.9, label: 'ชายหาดสาธารณะ', n: 1 }]);
    expect(mapStops(t.days[1])).toEqual([]);
  });
  it('the unknown-opening-hours note is noise for viewers', () => {
    expect(isNoiseNote('ไม่ทราบเวลาเปิด-ปิด')).toBe(true);
    expect(isNoiseNote('รอเปิด 09:00')).toBe(false);
  });
});

describe('toSchedInputs', () => {
  const t = ok(payload());
  it('durations: the item\'s own, else a fallback per kind; locked start becomes minutes; never a travel override', () => {
    const a = toSchedInputs(t.days[0]);
    expect(a.map((x) => x.durationMin)).toEqual([90, FALLBACK_MINUTES.place, 60]);
    expect(a.every((x) => x.travelOverrideMin === null)).toBe(true);
    const b = toSchedInputs(t.days[1]);
    expect(b.map((x) => x.lockedStartMin)).toEqual([null, 14 * 60]);
    expect(b[0].durationMin).toBe(30);
  });
  it('ids are unique across days', () => {
    const ids = t.days.flatMap((d) => toSchedInputs(d).map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('fallback minutes exist for every kind', () => {
    for (const k of ['place', 'meal', 'cafe', 'lodging', 'rest_stop', 'custom', 'free_time', 'depart', 'arrive']) expect(typeof FALLBACK_MINUTES[k as keyof typeof FALLBACK_MINUTES]).toBe('number');
  });
});

describe('viewer schedule (real scheduler)', () => {
  const t = ok(payload());
  const views = buildSharedDayViews(t);
  it('one view per day; the first item starts at the day start (there is no origin, so no drive from home)', () => {
    expect(views).toHaveLength(3);
    const first = views[0].result.entries[0];
    expect(first.travel).toBeNull();
    expect(first.arrive).toBe(7 * 60 + 30);
    expect(first.start).toBe(9 * 60);                              // waits for the 09:00 opening (2030-05-01 is a Wednesday)
    expect(first.notes.join()).toContain('รอเปิด');
  });
  it('no origin and no destination: nothing like a return leg exists', () => {
    for (const v of views) expect(v.result.returnLeg).toBeNull();
  });
  it('items without coordinates add time but no distance', () => {
    const r = views[0].result;
    expect(r.entries[1].travel?.km ?? 0).toBe(0);
    expect(r.totalKm).toBe(0);
  });
  it('a locked start time is honoured', () => {
    expect(views[1].result.entries[1].start).toBe(14 * 60);
  });
  it('a rest day has an empty timeline', () => {
    expect(views[2].result.entries).toEqual([]);
    expect(views[2].result.finish).toBe(7 * 60);
  });
  it('with the dates hidden there are no opening-hours warnings (the weekday is unknown)', () => {
    const hid = ok(payload({ start_date: null, end_date: null, days: payload().days.map((d) => ({ ...d, date: null })) }));
    const v = buildSharedDayViews(hid);
    expect(v[0].result.entries[0].warnings).toEqual([]);
    expect(v[0].result.entries[0].start).toBe(7 * 60 + 30);       // no "wait for opening" without a date
  });
  it('a closed day is reported (Monday 2030-04-29, place closed on Mondays)', () => {
    const mon = ok(payload({ days: [{ day_index: 1, date: '2030-04-29', is_rest_day: false, start_time: '09:00', items: [
      { kind: 'place', title: 'ปิดวันจันทร์', place_id: PL, category_id: CAT, lat: 12.7, lng: 100.9, opening_hours_text: 'Tu-Su 09:00-16:00; Mo off', duration_min: 60, locked_start: null }] }] }));
    expect(buildSharedDayViews(mon)[0].result.entries[0].warnings).toContain('ปิดในวันนี้');
  });
  it('travel between two public places uses the trip\'s mode and road factor', () => {
    const two = ok(payload({ mode: 'walk', road_factor: 1, days: [{ day_index: 1, date: '2030-05-01', is_rest_day: false, start_time: '08:00', items: [
      { kind: 'place', title: 'A', place_id: PL, category_id: CAT, lat: 12.7, lng: 100.9, opening_hours_text: null, duration_min: 30, locked_start: null },
      { kind: 'place', title: 'B', place_id: PL, category_id: CAT, lat: 12.709, lng: 100.9, opening_hours_text: null, duration_min: 30, locked_start: null }] }] }));
    const leg = buildSharedDayViews(two)[0].result.entries[1].travel!;
    expect(leg.km).toBeGreaterThan(0.9);
    expect(leg.km).toBeLessThan(1.1);
    expect(leg.min).toBe(13);                                       // ~1 km at 4.5 km/h
    expect(leg.estimated).toBe(true);
  });
  it('the day end comes from the trip', () => {
    const late = ok(payload({ day_end_time: '10:00', days: [{ day_index: 1, date: null, is_rest_day: false, start_time: '08:00', items: [
      { kind: 'free_time', title: 'x', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 240, locked_start: null }] }] }));
    expect(buildSharedDayViews(late)[0].result.overflowMin).toBe(120);
  });
});
