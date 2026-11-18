import { describe, expect, it } from 'vitest';
import { BUFFER_MIN, scheduleDay, type DayOptions, type SchedInput } from '../../src/features/routing/scheduler';
import { haversineProvider } from '../../src/features/routing/provider';

const place = (id: string, lng: number, over: Partial<SchedInput> = {}): SchedInput => ({
  id, type: 'place', title: id, lat: 13, lng, durationMin: 60, lockedStartMin: null, travelOverrideMin: null, openingHoursText: null, ...over,
});
const meal = (id = 'meal', over: Partial<SchedInput> = {}): SchedInput => ({
  id, type: 'meal', title: id, lat: null, lng: null, durationMin: 60, lockedStartMin: null, travelOverrideMin: null, openingHoursText: null, ...over,
});
// 2026-11-21 is a Saturday, 2026-11-23 a Monday
const opts = (over: Partial<DayOptions> = {}): DayOptions => ({
  date: '2026-11-21', startMin: 8 * 60, endMin: 20 * 60, origin: null, destination: null, mode: 'car', roadFactor: 1.3, ...over,
});

describe('scheduleDay', () => {
  it('starts the first place at the departure time (no origin = no travel)', () => {
    const r = scheduleDay([place('a', 100)], opts());
    expect(r.entries[0].start).toBe(480);
    expect(r.entries[0].end).toBe(540);
    expect(r.entries[0].travel).toBeNull();
  });

  it('adds travel time from the origin using the routing provider', () => {
    const origin = { lat: 13, lng: 100 };
    const a = place('a', 100.2);
    const leg = haversineProvider(1.3).leg(origin, { lat: 13, lng: 100.2 }, 'car');
    const r = scheduleDay([a], opts({ origin }));
    expect(r.entries[0].travel?.min).toBe(leg.min);
    expect(r.entries[0].arrive).toBe(480 + leg.min);
    expect(r.entries[0].start % 5).toBe(0); // rounded to 5 minutes
    expect(r.totalKm).toBeCloseTo(leg.km, 6);
  });

  it('leaves a breathing buffer between two places', () => {
    const r = scheduleDay([place('a', 100), place('b', 100)], opts()); // same spot -> 0 min travel
    expect(r.entries[1].travel?.bufferMin).toBe(BUFFER_MIN);
    expect(r.entries[1].arrive).toBe(r.entries[0].end + BUFFER_MIN);
  });

  it('waits for opening time instead of warning', () => {
    const p = place('a', 100, { openingHoursText: '09:00-17:00' });
    const r = scheduleDay([p], opts({ startMin: 7 * 60 }));
    expect(r.entries[0].start).toBe(540);
    expect(r.entries[0].waitMin).toBe(120);
    expect(r.entries[0].notes.join()).toContain('รอเปิด');
    expect(r.entries[0].warnings).toEqual([]);
  });

  it('warns when the place is closed that day', () => {
    const p = place('a', 100, { openingHoursText: 'Tu-Su 09:00-16:00; Mo off' });
    const r = scheduleDay([p], opts({ date: '2026-11-23' }));
    expect(r.entries[0].warnings).toEqual(['ปิดในวันนี้']);
  });

  it('warns when arriving after closing time', () => {
    const p = place('a', 100, { openingHoursText: '08:00-12:00' });
    const r = scheduleDay([p], opts({ startMin: 13 * 60 }));
    expect(r.entries[0].warnings[0]).toContain('หลังเวลาปิด');
  });

  it('warns when the visit would run past closing time', () => {
    const p = place('a', 100, { openingHoursText: '08:00-09:30', durationMin: 120 });
    const r = scheduleDay([p], opts());
    expect(r.entries[0].warnings[0]).toContain('เกินเวลาปิด');
  });

  it('notes unknown opening hours (never invents them)', () => {
    const r = scheduleDay([place('a', 100)], opts());
    expect(r.entries[0].notes).toEqual(['ไม่ทราบเวลาเปิด-ปิด']);
    expect(r.entries[0].warnings).toEqual([]);
  });

  it('locked time: waits when early, warns when late', () => {
    const early = scheduleDay([place('a', 100, { type: 'lodging', durationMin: 30, lockedStartMin: 14 * 60 })], opts());
    expect(early.entries[0].start).toBe(840);
    expect(early.entries[0].warnings).toEqual([]);
    const late = scheduleDay([place('a', 100, { durationMin: 300 }), place('b', 100, { type: 'lodging', lockedStartMin: 10 * 60 })], opts());
    expect(late.entries[1].warnings[0]).toContain('เวลาซ้อน');
  });

  it('earliest start is a soft lower bound (lunch not before 11:30)', () => {
    const r = scheduleDay([meal('lunch', { earliestStartMin: 11 * 60 + 30 })], opts());
    expect(r.entries[0].start).toBe(690);
    expect(r.entries[0].end).toBe(750);
  });

  it('manual travel override beats the estimate (ferry, island)', () => {
    const origin = { lat: 13, lng: 100 };
    const r = scheduleDay([place('island', 100.5, { travelOverrideMin: 90 })], opts({ origin }));
    expect(r.entries[0].travel?.min).toBe(90);
    expect(r.entries[0].travel?.estimated).toBe(false);
  });

  it('adds the return leg to a destination and reports overflow past the end of day', () => {
    const origin = { lat: 13, lng: 100 };
    const r = scheduleDay([place('a', 100.5, { durationMin: 600 })], opts({ origin, destination: origin, endMin: 17 * 60 }));
    expect(r.returnLeg).not.toBeNull();
    expect(r.finish).toBeGreaterThan(r.entries[0].end);
    expect(r.overflowMin).toBe(r.finish - 17 * 60);
    expect(r.overflowMin).toBeGreaterThan(0);
  });

  it('empty day finishes when it started', () => {
    const r = scheduleDay([], opts());
    expect(r.finish).toBe(480);
    expect(r.overflowMin).toBe(0);
    expect(r.lastPoint).toBeNull();
  });
});
