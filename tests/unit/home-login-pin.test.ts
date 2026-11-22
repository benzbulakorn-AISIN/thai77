import { describe, expect, it } from 'vitest';
import {
  TOTAL_PROVINCES, countdownText, displayName, greetingForHour, percent, pickNextTrip, provinceProgress, sumStats, type TripLite,
} from '../../src/features/home/homeModel';
import { MIN_PASSWORD, checkPassword } from '../../src/features/auth/passwordRules';
import { formatCoords, normalizeLng, normalizePoint } from '../../src/features/explore/pin';
import { shortRegionLabel } from '../../src/features/explore/labels';
import { ILLUSTRATION_EXTS, illustrationUrl } from '../../src/features/art/illustrations';

const trip = (id: string, start: string, end: string, name = id): TripLite => ({ id, name, start_date: start, end_date: end, travelers: 2 });
const TODAY = '2026-11-19';

describe('pickNextTrip', () => {
  it('no trips / only past trips -> null', () => {
    expect(pickNextTrip([], TODAY)).toBeNull();
    expect(pickNextTrip([trip('a', '2026-10-01', '2026-10-05')], TODAY)).toBeNull();
  });
  it('picks the nearest upcoming trip and counts the days', () => {
    const n = pickNextTrip([trip('far', '2026-12-30', '2027-01-02'), trip('near', '2026-11-22', '2026-11-24'), trip('old', '2026-01-01', '2026-01-03')], TODAY)!;
    expect(n.trip.id).toBe('near');
    expect(n.status).toBe('upcoming');
    expect(n.daysUntil).toBe(3);
    expect(n.totalDays).toBe(3);
    expect(n.dayNumber).toBe(0);
    expect(countdownText(n)).toBe('อีก 3 วัน');
  });
  it('tomorrow is "พรุ่งนี้"', () => {
    expect(countdownText(pickNextTrip([trip('t', '2026-11-20', '2026-11-20')], TODAY)!)).toBe('พรุ่งนี้');
  });
  it('a trip running today comes first and shows the day number', () => {
    const n = pickNextTrip([trip('later', '2026-11-25', '2026-11-26'), trip('now', '2026-11-18', '2026-11-20')], TODAY)!;
    expect(n.trip.id).toBe('now');
    expect(n.status).toBe('ongoing');
    expect(n.dayNumber).toBe(2);
    expect(n.totalDays).toBe(3);
    expect(n.daysUntil).toBe(0);
    expect(countdownText(n)).toBe('กำลังเที่ยวอยู่ · วันที่ 2/3');
  });
  it('first and last day of a trip', () => {
    expect(pickNextTrip([trip('t', TODAY, '2026-11-21')], TODAY)!.dayNumber).toBe(1);
    expect(pickNextTrip([trip('t', '2026-11-17', TODAY)], TODAY)!.dayNumber).toBe(3);
  });
  it('ignores broken rows (bad dates, end before start)', () => {
    expect(pickNextTrip([trip('x', 'oops', '2026-12-01'), trip('y', '2026-12-05', '2026-12-01')], TODAY)).toBeNull();
  });
  it('same start date: stable order by name', () => {
    const n = pickNextTrip([trip('b', '2026-12-01', '2026-12-02', 'ข'), trip('a', '2026-12-01', '2026-12-02', 'ก')], TODAY)!;
    expect(n.trip.id).toBe('a');
  });
});

describe('greeting / name / numbers', () => {
  it('greeting by hour (and every hour has one)', () => {
    expect(greetingForHour(5)).toBe('สวัสดีตอนเช้า');
    expect(greetingForHour(11)).toBe('สวัสดีตอนเช้า');
    expect(greetingForHour(12)).toBe('สวัสดีตอนบ่าย');
    expect(greetingForHour(16)).toBe('สวัสดีตอนบ่าย');
    expect(greetingForHour(17)).toBe('สวัสดีตอนเย็น');
    expect(greetingForHour(20)).toBe('สวัสดีตอนเย็น');
    expect(greetingForHour(21)).toBe('สวัสดีตอนค่ำ');
    expect(greetingForHour(0)).toBe('สวัสดีตอนค่ำ');
    expect(greetingForHour(4)).toBe('สวัสดีตอนค่ำ');
    expect(greetingForHour(NaN)).toBe('สวัสดี');
    for (let h = 0; h < 24; h++) expect(greetingForHour(h).startsWith('สวัสดี')).toBe(true);
  });
  it('displayName: profile name first, else the e-mail prefix', () => {
    expect(displayName('  เบนซ์ ', 'a@b.com')).toBe('เบนซ์');
    expect(displayName(null, 'benz.k@example.com')).toBe('benz.k');
    expect(displayName('', undefined)).toBe('');
    expect(displayName(undefined, null)).toBe('');
  });
  it('percent is clamped and never NaN', () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(5, 4)).toBe(100);
    expect(percent(-1, 4)).toBe(0);
    expect(percent(1, 0)).toBe(0);
    expect(percent(NaN, 4)).toBe(0);
  });
  it('provinceProgress counts provinces with a visited place out of 77', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const p = provinceProgress(ids, { a: { visited: 2 }, b: { visited: 0 }, c: { visited: 1 } });
    expect(p).toEqual({ done: 2, total: 77, pct: 3 });
    expect(TOTAL_PROVINCES).toBe(77);
    expect(provinceProgress([], {})).toEqual({ done: 0, total: 77, pct: 0 });
    expect(provinceProgress(Array.from({ length: 77 }, (_, i) => `p${i}`), Object.fromEntries(Array.from({ length: 77 }, (_, i) => [`p${i}`, { visited: 1 }]))).pct).toBe(100);
  });
  it('sumStats adds everything and skips holes', () => {
    expect(sumStats({ a: { total: 14, planned: 1, visited: 2 }, b: { total: 12, planned: 0, visited: 0 }, c: undefined })).toEqual({ total: 26, planned: 1, visited: 2 });
    expect(sumStats({})).toEqual({ total: 0, planned: 0, visited: 0 });
  });
});

describe('checkPassword', () => {
  it('only the length is required', () => {
    expect(MIN_PASSWORD).toBe(8);
    expect(checkPassword('')).toEqual({ length: false, letter: false, digit: false, ok: false });
    expect(checkPassword('abc1234')).toEqual({ length: false, letter: true, digit: true, ok: false });
    expect(checkPassword('abcdefgh')).toEqual({ length: true, letter: true, digit: false, ok: true });
    expect(checkPassword('12345678')).toEqual({ length: true, letter: false, digit: true, ok: true });
  });
  it('Thai letters and digits count; length is counted in characters', () => {
    expect(checkPassword('รหัสผ่านใหม่1').letter).toBe(true);
    expect(checkPassword('รหัสผ่านใหม่1').digit).toBe(true);
    expect(checkPassword('๑๒๓๔๕๖๗๘').digit).toBe(true);
    expect(checkPassword('😀😀😀😀😀😀😀😀').length).toBe(true); // 8 emoji = 8 characters (16 UTF-16 units)
    expect(checkPassword('😀😀😀😀😀😀😀').length).toBe(false);
  });
  it('symbols alone are not "letters"', () => {
    const c = checkPassword('!@#$%^&*()');
    expect([c.length, c.letter, c.digit, c.ok]).toEqual([true, false, false, true]);
  });
});

describe('pin-drop helpers', () => {
  it('normalizeLng wraps around the globe', () => {
    expect(normalizeLng(100.5)).toBeCloseTo(100.5, 6);
    expect(normalizeLng(460.5)).toBeCloseTo(100.5, 6);
    expect(normalizeLng(-259.5)).toBeCloseTo(100.5, 6);
    expect(normalizeLng(180)).toBeCloseTo(-180, 6);
    expect(normalizeLng(-180)).toBeCloseTo(-180, 6);
  });
  it('normalizePoint clamps latitude and rejects NaN', () => {
    expect(normalizePoint(13.75, 100.5)).toEqual({ lat: 13.75, lng: 100.5 });
    expect(normalizePoint(95, 10)).toEqual({ lat: 90, lng: 10 });
    expect(normalizePoint(-95, 10)).toEqual({ lat: -90, lng: 10 });
    expect(normalizePoint(NaN, 1)).toBeNull();
    expect(normalizePoint(1, Infinity)).toBeNull();
  });
  it('formatCoords gives 6 decimals that the place form can read back', () => {
    expect(formatCoords({ lat: 13.7563, lng: 100.5018 })).toBe('13.756300, 100.501800');
    expect(formatCoords({ lat: -0.5, lng: 99 })).toBe('-0.500000, 99.000000');
  });
});

describe('labels / illustrations', () => {
  it('shortRegionLabel drops the "ภาค" prefix', () => {
    expect(shortRegionLabel('ภาคเหนือ')).toBe('เหนือ');
    expect(shortRegionLabel('ภาคตะวันออกเฉียงเหนือ')).toBe('ตะวันออกเฉียงเหนือ');
    expect(shortRegionLabel('ภาค ใต้')).toBe('ใต้');
    expect(shortRegionLabel('ภาค')).toBe('ภาค');
    expect(shortRegionLabel('')).toBe('');
    expect(shortRegionLabel('เหนือ')).toBe('เหนือ');
  });
  it('illustrationUrl tries webp, jpg, png then gives up; odd names are refused', () => {
    expect(ILLUSTRATION_EXTS).toHaveLength(3);
    expect(illustrationUrl('/thai77/', 'login', 0)).toBe('/thai77/img/login.webp');
    expect(illustrationUrl('/thai77', 'login', 1)).toBe('/thai77/img/login.jpg');
    expect(illustrationUrl('/', 'login', 2)).toBe('/img/login.png');
    expect(illustrationUrl('/', 'login', 3)).toBeNull();
    expect(illustrationUrl('/', '../x', 0)).toBeNull();
    expect(illustrationUrl('/', 'Login', 0)).toBeNull();
    expect(illustrationUrl('/', '', 0)).toBeNull();
  });
});
