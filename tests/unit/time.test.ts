import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fmtDateTh, fmtDuration, fmtMin, roundUp5, toDbTime, toMin, weekdayMon0 } from '../../src/features/routing/time';

describe('time helpers', () => {
  it('toMin parses HH:MM and HH:MM:SS, falls back on bad input', () => {
    expect(toMin('07:30')).toBe(450);
    expect(toMin('07:30:00')).toBe(450);
    expect(toMin('7:05')).toBe(425);
    expect(toMin(null, 99)).toBe(99);
    expect(toMin('abc', 5)).toBe(5);
  });

  it('fmtMin formats and marks next-day times', () => {
    expect(fmtMin(0)).toBe('00:00');
    expect(fmtMin(450)).toBe('07:30');
    expect(fmtMin(1439)).toBe('23:59');
    expect(fmtMin(1500)).toBe('01:00 (+1)');
  });

  it('toDbTime clamps to a valid Postgres time', () => {
    expect(toDbTime(450)).toBe('07:30:00');
    expect(toDbTime(-10)).toBe('00:00:00');
    expect(toDbTime(5000)).toBe('23:59:00');
  });

  it('fmtDuration speaks Thai', () => {
    expect(fmtDuration(0)).toBe('0 น.');
    expect(fmtDuration(45)).toBe('45 น.');
    expect(fmtDuration(60)).toBe('1 ชม.');
    expect(fmtDuration(80)).toBe('1 ชม. 20 น.');
  });

  it('roundUp5 rounds up to the next 5 minutes', () => {
    expect(roundUp5(61)).toBe(65);
    expect(roundUp5(65)).toBe(65);
    expect(roundUp5(0)).toBe(0);
  });

  it('addDays / daysBetween are calendar-safe', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-18', '2026-11-21')).toBe(3);
    expect(daysBetween('2026-11-21', '2026-11-18')).toBe(-3);
  });

  it('weekdayMon0 has Monday = 0', () => {
    expect(weekdayMon0('2026-11-16')).toBe(0); // Monday
    expect(weekdayMon0('2026-11-18')).toBe(2); // Wednesday
    expect(weekdayMon0('2026-11-22')).toBe(6); // Sunday
  });

  it('fmtDateTh', () => {
    expect(fmtDateTh('2026-11-20')).toBe('ศ. 20 พ.ย.');
    expect(fmtDateTh('2026-11-20', true)).toBe('ศ. 20 พ.ย. 2569');
  });
});
