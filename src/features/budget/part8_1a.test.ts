import { describe, expect, it } from 'vitest';
import {
  baht,
  localDateTimeToIso,
  parseMoneyInput,
  summarize,
  toDateTimeLocal,
  type BudgetLine,
} from './calc';

const line = (v: Partial<BudgetLine> = {}): BudgetLine => ({
  id: 'line-1',
  category_id: 'food',
  day_id: null,
  label: 'อาหาร',
  estimated: 100.25,
  actual: 80.5,
  is_shared: true,
  paid_by: 'user-1',
  is_auto: false,
  ...v,
});

describe('Part 8.1a money validation', () => {
  it.each([
    ['0', 0],
    ['0.1', 0.1],
    ['125.50', 125.5],
    ['฿1,234.56', 1234.56],
    [' .5 ', 0.5],
  ])('accepts %s', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(['-1', '1.999', 'abc', '1..2', '10,00.00', '10000000'])('rejects %s', (input) => {
    expect(Number.isNaN(parseMoneyInput(input))).toBe(true);
  });

  it('keeps an empty optional estimate distinguishable from zero', () => {
    expect(parseMoneyInput('   ')).toBeNull();
    expect(parseMoneyInput('0')).toBe(0);
  });
});

describe('Part 8.1a satang display and existing summaries', () => {
  it('always displays two decimal places without rounding to whole baht', () => {
    expect(baht(125.5)).toBe('฿125.50');
    expect(baht(125.55)).toBe('฿125.55');
    expect(baht(0)).toBe('฿0.00');
  });

  it('preserves the existing estimate/actual summary behavior with satang', () => {
    const result = summarize([
      line(),
      line({ id: 'line-2', estimated: 20.1, actual: null, is_shared: false }),
    ], { reservePct: 10, limit: 500, travelers: 2 });

    expect(result.estimated).toBeCloseTo(120.35, 8);
    expect(result.actual).toBeCloseTo(80.5, 8);
    expect(result.expected).toBeCloseTo(100.6, 8);
    expect(result.remaining).toBeCloseTo(419.5, 8);
  });
});

describe('Part 8.1a paid-at conversion', () => {
  it('round-trips a browser-local minute value', () => {
    const local = '2026-11-21T08:05';
    const iso = localDateTimeToIso(local);
    expect(iso).not.toBeNull();
    expect(toDateTimeLocal(iso)).toBe(local);
  });

  it.each(['', '2026-11-21', 'not-a-date'])('rejects an invalid datetime-local value: %s', (value) => {
    expect(localDateTimeToIso(value)).toBeNull();
  });
});
