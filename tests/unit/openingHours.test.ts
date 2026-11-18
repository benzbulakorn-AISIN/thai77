import { describe, expect, it } from 'vitest';
import { formatOpeningHoursTh, parseOpeningHours } from '../../src/features/routing/openingHours';

describe('parseOpeningHours', () => {
  it('returns null for empty / unknown formats (never guesses)', () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours('')).toBeNull();
    expect(parseOpeningHours('sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('Mo-Fr 8am-5pm')).toBeNull();
  });

  it('24/7 is open all week', () => {
    const w = parseOpeningHours('24/7');
    expect(w).not.toBeNull();
    expect(w![3]).toEqual([[0, 1440]]);
  });

  it('plain hours apply to every day', () => {
    const w = parseOpeningHours('08:00-17:00')!;
    for (let d = 0; d < 7; d++) expect(w[d]).toEqual([[480, 1020]]);
  });

  it('day ranges and lists', () => {
    const w = parseOpeningHours('Mo-Fr 08:30-16:30; Sa,Su 09:00-18:00')!;
    expect(w[0]).toEqual([[510, 990]]);
    expect(w[4]).toEqual([[510, 990]]);
    expect(w[5]).toEqual([[540, 1080]]);
    expect(w[6]).toEqual([[540, 1080]]);
  });

  it('"off" rules close a day', () => {
    const w = parseOpeningHours('Tu-Su 09:00-16:00; Mo off')!;
    expect(w[0]).toEqual([]);
    expect(w[1]).toEqual([[540, 960]]);
  });

  it('multiple ranges per day and ignored public holidays', () => {
    const w = parseOpeningHours('Mo-Su 08:00-12:00,13:00-17:00; PH off')!;
    expect(w[2]).toEqual([[480, 720], [780, 1020]]);
  });

  it('overnight hours run past midnight', () => {
    const w = parseOpeningHours('18:00-02:00')!;
    expect(w[0]).toEqual([[1080, 1560]]);
  });

  it('wrapping day ranges (Sa-Mo)', () => {
    const w = parseOpeningHours('Sa-Mo 10:00-12:00')!;
    expect(w[5]).toEqual([[600, 720]]);
    expect(w[6]).toEqual([[600, 720]]);
    expect(w[0]).toEqual([[600, 720]]);
    expect(w[2]).toEqual([]);
  });
});

describe('formatOpeningHoursTh', () => {
  it('groups consecutive days', () => {
    expect(formatOpeningHoursTh('Mo-Fr 08:30-16:30; Sa,Su 09:00-18:00')).toBe('จ.–ศ. 08:30–16:30 · ส.–อา. 09:00–18:00');
    expect(formatOpeningHoursTh('Tu-Su 09:00-16:00; Mo off')).toBe('จ. ปิด · อ.–อา. 09:00–16:00');
  });
  it('says "ทุกวัน" and 24 ชม.', () => {
    expect(formatOpeningHoursTh('08:00-17:00')).toBe('ทุกวัน 08:00–17:00');
    expect(formatOpeningHoursTh('24/7')).toBe('ทุกวัน 24 ชม.');
  });
  it('falls back to the raw text when it cannot parse', () => {
    expect(formatOpeningHoursTh('ตามประกาศ')).toBe('ตามประกาศ');
    expect(formatOpeningHoursTh(null)).toBeNull();
  });
});
