import { describe, expect, it } from 'vitest';
import { overlayStats, tallyGuest, type StatCounts } from '../../src/features/guest/guestStats';

const S = (o: Partial<StatCounts> = {}): StatCounts => ({ total: 0, planned: 0, visited: 0, target: 0, ...o });
const BLANK = S();

describe('tallyGuest', () => {
  const prov = new Map([['p1', 'A'], ['p2', 'A'], ['p3', 'B']]);
  it('counts want and visited per province (both count towards the goal)', () => {
    expect(tallyGuest([['p1', 'want'], ['p2', 'visited'], ['p3', 'visited']], prov)).toEqual({ A: { visited: 1, target: 2 }, B: { visited: 1, target: 1 } });
  });
  it('places whose province is unknown are skipped', () => {
    expect(tallyGuest([['p1', 'want'], ['ghost', 'visited']], prov)).toEqual({ A: { visited: 0, target: 1 } });
  });
  it('nothing in -> nothing out', () => {
    expect(tallyGuest([], prov)).toEqual({});
    expect(tallyGuest([['p1', 'want']], new Map())).toEqual({});
  });
});

describe('overlayStats', () => {
  it('adds to the totals and keeps the other fields', () => {
    const base = { A: S({ total: 14, planned: 2, visited: 1, target: 3 }), B: S({ total: 9 }) };
    const out = overlayStats(base, { A: { visited: 2, target: 3 } }, BLANK);
    expect(out.A).toEqual({ total: 14, planned: 2, visited: 3, target: 6 });
    expect(out.B).toBe(base.B);
  });
  it('a province that has no row yet starts from the blank row', () => {
    const out = overlayStats({}, { Z: { visited: 1, target: 1 } }, BLANK);
    expect(out.Z).toEqual({ total: 0, planned: 0, visited: 1, target: 1 });
  });
  it('returns the SAME object when there is nothing to add (stable identity for React)', () => {
    const base = { A: S({ total: 1 }) };
    expect(overlayStats(base, {}, BLANK)).toBe(base);
  });
  it('never changes its inputs', () => {
    const base = { A: S({ total: 5 }) };
    const extra = { A: { visited: 1, target: 1 } };
    const b = JSON.stringify(base), e = JSON.stringify(extra);
    overlayStats(base, extra, BLANK);
    expect(JSON.stringify(base)).toBe(b);
    expect(JSON.stringify(extra)).toBe(e);
  });
  it('extra fields of the real stat type survive', () => {
    type Rich = StatCounts & { note: string };
    const out = overlayStats<Rich>({ A: { ...S({ total: 3 }), note: 'x' } }, { A: { visited: 1, target: 1 } }, { ...BLANK, note: '' });
    expect(out.A.note).toBe('x');
  });
});
