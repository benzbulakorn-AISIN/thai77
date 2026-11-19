import { describe, expect, it } from 'vitest';
import { LONG_LEG_MIN, formatKm, legSummary } from '../../src/features/trips/travelText';

describe('formatKm', () => {
  it('nothing for zero / tiny / invalid', () => {
    for (const v of [0, 0.01, 0.049, -3, NaN, Infinity]) expect(formatKm(v)).toBeNull();
  });
  it('under a kilometre -> metres in steps of 50', () => {
    expect(formatKm(0.05)).toBe('50 ม.');
    expect(formatKm(0.12)).toBe('100 ม.');
    expect(formatKm(0.45)).toBe('450 ม.');
    expect(formatKm(0.97)).toBe('950 ม.');
  });
  it('never prints "1000 ม."', () => {
    expect(formatKm(0.974)).toBe('950 ม.');
    expect(formatKm(0.975)).toBe('1.0 กม.');
    expect(formatKm(0.999)).toBe('1.0 กม.');
  });
  it('1–10 km with one decimal, 10+ rounded, thousands separated', () => {
    expect(formatKm(1)).toBe('1.0 กม.');
    expect(formatKm(3.44)).toBe('3.4 กม.');
    expect(formatKm(9.94)).toBe('9.9 กม.');
    expect(formatKm(9.96)).toBe('10 กม.');
    expect(formatKm(12.4)).toBe('12 กม.');
    expect(formatKm(87.5)).toBe('88 กม.');
    expect(formatKm(1234.4)).toBe('1,234 กม.');
  });
});

describe('legSummary', () => {
  it('distance · duration, flagged as an estimate', () => {
    const s = legSummary({ km: 12.4, min: 25, estimated: true }, 'รถยนต์');
    expect(s.distance).toBe('12 กม.');
    expect(s.duration).toBe('25 น.');
    expect(s.main).toBe('12 กม. · 25 น.');
    expect(s.source).toBe('ประมาณ');
    expect(s.long).toBe(false);
    expect(s.buffer).toBeNull();
    expect(s.a11y).toBe('เดินทางรถยนต์ 12 กม. · 25 น. · ประมาณ');
  });
  it('typed-in time is "กำหนดเอง"', () => {
    expect(legSummary({ km: 0, min: 90, estimated: false }, 'เดิน').source).toBe('กำหนดเอง');
  });
  it('hours and minutes; long legs are flagged from 90 minutes', () => {
    expect(LONG_LEG_MIN).toBe(90);
    const s = legSummary({ km: 88, min: 100, estimated: true }, 'รถยนต์');
    expect(s.duration).toBe('1 ชม. 40 น.');
    expect(s.long).toBe(true);
    expect(legSummary({ km: 80, min: 89, estimated: true }, 'x').long).toBe(false);
    expect(legSummary({ km: 80, min: 90, estimated: true }, 'x').long).toBe(true);
  });
  it('the buffer is shown separately', () => {
    const s = legSummary({ km: 3, min: 8, estimated: true, bufferMin: 15 }, 'รถยนต์');
    expect(s.buffer).toBe('เผื่อ 15 น.');
    expect(s.a11y.endsWith('เผื่อ 15 น.')).toBe(true);
  });
  it('buffer only (same place twice): no distance, no duration', () => {
    const s = legSummary({ km: 0, min: 0, estimated: true, bufferMin: 15 }, 'รถยนต์');
    expect(s.main).toBeNull();
    expect(s.distance).toBeNull();
    expect(s.duration).toBeNull();
    expect(s.buffer).toBe('เผื่อ 15 น.');
    expect(s.a11y).toBe('เผื่อ 15 น.');
  });
  it('nothing to say -> everything empty', () => {
    const s = legSummary({ km: 0, min: 0, estimated: true }, 'รถยนต์');
    expect([s.main, s.buffer, s.a11y]).toEqual([null, null, '']);
  });
  it('odd numbers do not produce NaN or negative text', () => {
    const s = legSummary({ km: NaN, min: NaN, estimated: true, bufferMin: -5 }, 'รถยนต์');
    expect(s.main).toBeNull();
    expect(s.buffer).toBeNull();
    expect(legSummary({ km: 5, min: -10, estimated: true }, 'x').duration).toBeNull();
  });
  it('rounds minutes', () => {
    expect(legSummary({ km: 5, min: 24.6, estimated: true }, 'x').duration).toBe('25 น.');
  });
});
