import { describe, expect, it } from 'vitest';
import {
  MAX_LANES, buildCalendarParams, buildMonthGrid, dayLabel, dayProgress, daysInMonth, isIsoDate, monthKey, monthOfDate, monthTitle,
  parseCalendarParams, parseMonthKey, shiftMonth, thaiLongDate, tripsInMonth, tripsOnDay, weekSegments, type CalTrip,
} from '../../src/features/calendar/calendarModel';

const trip = (id: string, start: string, end: string, name = id): CalTrip => ({ id, name, start_date: start, end_date: end });

describe('dates and months', () => {
  it('isIsoDate accepts only real dates', () => {
    for (const ok of ['2026-11-19', '2028-02-29', '2000-01-01']) expect(isIsoDate(ok)).toBe(true);
    for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-11-31', '26-11-19', '2026-1-1', '', null, undefined, 5, '2026-11-19T00:00']) expect(isIsoDate(bad)).toBe(false);
  });
  it('parseMonthKey', () => {
    expect(parseMonthKey('2026-11')).toEqual({ year: 2026, month: 11 });
    for (const bad of ['2026-13', '2026-00', '2026-1', '1999-12', '2101-01', 'abc', '', null, undefined, '2026-11-01']) expect(parseMonthKey(bad as string)).toBeNull();
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(monthOfDate('2026-11-19')).toBe('2026-11');
  });
  it('shiftMonth rolls over years and stays in range', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(shiftMonth('2026-11', -23)).toBe('2024-12');
    expect(shiftMonth('2000-01', -1)).toBe('2000-01');
    expect(shiftMonth('2100-12', 1)).toBe('2100-12');
    expect(shiftMonth('garbage', 1)).toBe('garbage');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });
  it('titles use the Buddhist year', () => {
    expect(monthTitle('2026-11')).toBe('พฤศจิกายน 2569');
    expect(monthTitle('2027-01')).toBe('มกราคม 2570');
    expect(monthTitle('nope')).toBe('');
    expect(thaiLongDate('2026-11-19')).toBe('19 พฤศจิกายน 2569');
    expect(thaiLongDate('2026-02-30')).toBe('');
  });
  it('days in month incl. leap years', () => {
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('month grid (Sunday first)', () => {
  it('November 2026 starts on a Sunday: 5 rows, Nov 1 .. Dec 5', () => {
    const g = buildMonthGrid('2026-11');
    expect(g).toHaveLength(5);
    expect(g[0][0]).toBe('2026-11-01');
    expect(g[4][6]).toBe('2026-12-05');
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('February 2026 fits exactly in 4 rows', () => {
    const g = buildMonthGrid('2026-02');
    expect(g).toHaveLength(4);
    expect(g[0][0]).toBe('2026-02-01');
    expect(g[3][6]).toBe('2026-02-28');
  });
  it('a month starting on Saturday and spanning 6 rows (August 2026)', () => {
    const g = buildMonthGrid('2026-08'); // Aug 1 2026 = Saturday, 31 days
    expect(g).toHaveLength(6);
    expect(g[0][0]).toBe('2026-07-26');
    expect(g[0][6]).toBe('2026-08-01');
    expect(g[5][0]).toBe('2026-08-30');
  });
  it('every day of the month appears exactly once, in order, with no gaps', () => {
    for (const key of ['2026-01', '2026-02', '2026-05', '2026-11', '2027-02', '2028-02', '2026-12']) {
      const flat = buildMonthGrid(key).flat();
      const inMonth = flat.filter((d) => d.startsWith(key));
      expect(inMonth).toHaveLength(daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5))));
      for (let i = 1; i < flat.length; i++) expect(flat[i] > flat[i - 1]).toBe(true);
      const sundayFirst = new Date(`${flat[0]}T00:00:00Z`).getUTCDay();
      expect(sundayFirst).toBe(0);
    }
  });
  it('invalid key -> empty grid', () => {
    expect(buildMonthGrid('x')).toEqual([]);
  });
});

describe('weekSegments', () => {
  const WEEK = '2026-11-15'; // Sun 15 .. Sat 21
  it('a trip inside one week', () => {
    const { segments, hidden } = weekSegments([trip('a', '2026-11-16', '2026-11-18')], WEEK);
    expect(segments).toEqual([{ tripId: 'a', name: 'a', startCol: 1, endCol: 3, lane: 0, continuesLeft: false, continuesRight: false }]);
    expect(hidden).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('a one-day trip', () => {
    const s = weekSegments([trip('a', '2026-11-17', '2026-11-17')], WEEK).segments[0];
    expect([s.startCol, s.endCol]).toEqual([2, 2]);
  });
  it('a trip that crosses weeks is cut at both ends and marked as continuing', () => {
    const t = trip('a', '2026-11-20', '2026-11-24');
    const w1 = weekSegments([t], '2026-11-15').segments[0];
    expect([w1.startCol, w1.endCol, w1.continuesLeft, w1.continuesRight]).toEqual([5, 6, false, true]);
    const w2 = weekSegments([t], '2026-11-22').segments[0];
    expect([w2.startCol, w2.endCol, w2.continuesLeft, w2.continuesRight]).toEqual([0, 2, true, false]);
  });
  it('a trip spanning the whole week and more', () => {
    const s = weekSegments([trip('a', '2026-11-01', '2026-12-31')], WEEK).segments[0];
    expect([s.startCol, s.endCol, s.continuesLeft, s.continuesRight]).toEqual([0, 6, true, true]);
  });
  it('trips outside the week or invalid are ignored', () => {
    const none = weekSegments([trip('a', '2026-11-01', '2026-11-14'), trip('b', '2026-11-22', '2026-11-30'), trip('c', '2026-11-20', '2026-11-18'), trip('d', 'oops', '2026-11-18')], WEEK);
    expect(none.segments).toEqual([]);
  });
  it('overlapping trips use different lanes; non-overlapping ones share a lane', () => {
    const { segments } = weekSegments([trip('a', '2026-11-15', '2026-11-18'), trip('b', '2026-11-17', '2026-11-19'), trip('c', '2026-11-19', '2026-11-21')], WEEK);
    const lane = (id: string) => segments.find((s) => s.tripId === id)!.lane;
    expect(lane('a')).toBe(0);
    expect(lane('b')).toBe(1);
    expect(lane('c')).toBe(0); // starts after a ended (a ends Wed 18, c starts Thu 19)
  });
  it('touching days (end = next start) must NOT share a lane', () => {
    const { segments } = weekSegments([trip('a', '2026-11-15', '2026-11-17'), trip('b', '2026-11-17', '2026-11-19')], WEEK);
    expect(segments.map((s) => s.lane).sort()).toEqual([0, 1]);
  });
  it('no two bars in the same lane ever overlap', () => {
    const trips = [trip('a', '2026-11-15', '2026-11-16'), trip('b', '2026-11-15', '2026-11-21'), trip('c', '2026-11-16', '2026-11-17'),
      trip('d', '2026-11-18', '2026-11-18'), trip('e', '2026-11-17', '2026-11-20'), trip('f', '2026-11-19', '2026-11-19')];
    const { segments, hidden } = weekSegments(trips, WEEK, 10);
    expect(hidden.every((h) => h === 0)).toBe(true);
    for (const x of segments) for (const y of segments) {
      if (x !== y && x.lane === y.lane) expect(x.endCol < y.startCol || y.endCol < x.startCol).toBe(true);
    }
  });
  it('more trips than lanes: the rest are counted per day (+N)', () => {
    const trips = ['a', 'b', 'c', 'd', 'e'].map((id) => trip(id, '2026-11-17', '2026-11-18'));
    const { segments, hidden } = weekSegments(trips, WEEK, MAX_LANES);
    expect(segments).toHaveLength(MAX_LANES);
    expect(hidden).toEqual([0, 0, 2, 2, 0, 0, 0]);
    expect(Math.max(...segments.map((s) => s.lane))).toBe(MAX_LANES - 1);
  });
  it('is deterministic (same input, any order)', () => {
    const a = [trip('x', '2026-11-16', '2026-11-18'), trip('y', '2026-11-16', '2026-11-18'), trip('z', '2026-11-15', '2026-11-20')];
    expect(weekSegments(a, WEEK)).toEqual(weekSegments([...a].reverse(), WEEK));
  });
  it('longer trips come first in a lane', () => {
    const { segments } = weekSegments([trip('short', '2026-11-16', '2026-11-16'), trip('long', '2026-11-16', '2026-11-20')], WEEK);
    expect(segments.find((s) => s.tripId === 'long')!.lane).toBe(0);
  });
});

describe('queries', () => {
  const trips = [trip('b', '2026-11-20', '2026-11-22', 'ข'), trip('a', '2026-11-18', '2026-11-20', 'ก'), trip('c', '2026-12-30', '2027-01-02', 'ค'), trip('bad', '2026-11-25', '2026-11-20')];
  it('tripsOnDay includes first and last day, sorted by start', () => {
    expect(tripsOnDay(trips, '2026-11-20').map((t) => t.id)).toEqual(['a', 'b']);
    expect(tripsOnDay(trips, '2026-11-18').map((t) => t.id)).toEqual(['a']);
    expect(tripsOnDay(trips, '2026-11-22').map((t) => t.id)).toEqual(['b']);
    expect(tripsOnDay(trips, '2026-11-23')).toEqual([]);
    expect(tripsOnDay(trips, '2026-11-22').some((t) => t.id === 'bad')).toBe(false);
  });
  it('tripsInMonth includes trips that start before or end after the month', () => {
    expect(tripsInMonth(trips, '2026-11').map((t) => t.id)).toEqual(['a', 'b']);
    expect(tripsInMonth(trips, '2026-12').map((t) => t.id)).toEqual(['c']);
    expect(tripsInMonth(trips, '2027-01').map((t) => t.id)).toEqual(['c']);
    expect(tripsInMonth(trips, '2027-02')).toEqual([]);
    expect(tripsInMonth(trips, 'junk')).toEqual([]);
  });
  it('dayProgress and dayLabel', () => {
    expect(dayProgress(trips[0], '2026-11-21')).toEqual({ day: 2, total: 3 });
    expect(dayProgress(trips[0], '2026-11-20')).toEqual({ day: 1, total: 3 });
    expect(dayLabel('2026-11-19', [])).toBe('19 พฤศจิกายน 2569');
    expect(dayLabel('2026-11-20', [trips[1], trips[0]])).toBe('20 พฤศจิกายน 2569 · 2 ทริป: ก, ข');
  });
  it('does not change the input list', () => {
    const copy = trips.map((t) => t.id);
    tripsOnDay(trips, '2026-11-20'); tripsInMonth(trips, '2026-11');
    expect(trips.map((t) => t.id)).toEqual(copy);
  });
});

describe('URL state', () => {
  const TODAY = '2026-11-19';
  it('defaults to the current month with nothing selected', () => {
    expect(parseCalendarParams(new URLSearchParams(''), TODAY)).toEqual({ month: '2026-11', selected: null });
  });
  it('reads valid m and d', () => {
    expect(parseCalendarParams(new URLSearchParams('m=2027-03&d=2027-03-09'), TODAY)).toEqual({ month: '2027-03', selected: '2027-03-09' });
  });
  it('ignores nonsense (no crash, no injection)', () => {
    expect(parseCalendarParams(new URLSearchParams('m=2026-99&d=2026-02-30'), TODAY)).toEqual({ month: '2026-11', selected: null });
    expect(parseCalendarParams(new URLSearchParams("m='; drop&d=<script>"), TODAY)).toEqual({ month: '2026-11', selected: null });
  });
  it('builds a short URL and round-trips', () => {
    expect(buildCalendarParams({ month: '2026-11', selected: null }).toString()).toBe('m=2026-11');
    expect(buildCalendarParams({ month: 'bad', selected: 'bad' }).toString()).toBe('');
    const s = { month: '2026-12', selected: '2026-12-25' };
    expect(parseCalendarParams(buildCalendarParams(s), TODAY)).toEqual(s);
  });
});
