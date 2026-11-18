// Integration: Export CSV -> edit in Excel -> Import again must be a no-op "match" for every row.
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/features/admin/csv';
import { analyze, COLUMNS, parseFile, type ImportCtx } from '../../src/features/admin/importModel';

const ids = [1, 2, 3].map((n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`);
const ctx: ImportCtx = {
  provinces: [{ id: 'P1', pcode: 'TH50', slug: 'chiang-mai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai' }],
  districts: [{ id: 'D1', pcode: 'TH5001', province_id: 'P1', name_th: 'เมืองเชียงใหม่', name_en: 'Mueang' }],
  categories: [{ id: 'C1', slug: 'temple', name_th: 'วัดและศาสนสถาน', name_en: null }],
  existing: ids.map((id, i) => ({ id, name_th: `วัดทดสอบ ${i + 1}`, province_id: 'P1', category_id: 'C1', lat: 18.79 + i * 0.01, lng: 98.98 })),
  withSource: new Set([ids[0]]),
};

// what exportPlacesCsv() would write for these rows
const exported = (() => {
  const header = COLUMNS.map(([k]) => k);
  const rows = ids.map((id, i) => {
    const v: Record<string, string> = {
      id, name_th: `วัดทดสอบ ${i + 1}`, name_en: '', province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', category: 'temple',
      short_description: 'คำอธิบาย, มี "เครื่องหมาย"\nและขึ้นบรรทัดใหม่', highlights: 'จุด1|จุด2', lat: String(18.79 + i * 0.01), lng: '98.98',
      opening_hours: 'Tu-Su 09:00-16:00; Mo off', fee_thai: i === 0 ? '50' : '', best_months: '11|12|1', popularity: '10', state: 'active',
      verification: i === 0 ? 'verified' : 'pending', verified_at: i === 0 ? '2026-01-02' : '', is_demo: 'yes', is_published: 'yes',
      has_toilet: i === 0 ? 'yes' : '', source_url: i === 0 ? 'https://example.org/wat' : '', source_type: i === 0 ? 'official_social' : '',
      source_checked_at: i === 0 ? '2026-01-02' : '',
    };
    return header.map((k) => v[k] ?? '');
  });
  return toCsv([header, ...rows]);
})();

describe('export -> import round trip', () => {
  const parsed = parseFile('thai77-places.csv', exported);
  const located = parsed.records.map((r) => ({ provincePcode: 'TH50', districtPcode: r.name_th ? 'TH5001' : null }));
  const rows = analyze(parsed.records, ctx, located, parsed.lineOffset);

  it('every exported row is recognised as the same place (by id), with zero errors', () => {
    expect(parsed.unknown).toEqual([]);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.errors).toEqual([]);
      expect(r.kind).toBe('match');
      expect(r.matchReason).toBe('id ตรงกัน');
    }
  });

  it('values survive intact (quotes, newlines, lists, numbers, Thai text)', () => {
    const a = rows[0];
    expect(a.input?.short_description).toBe('คำอธิบาย, มี "เครื่องหมาย"\nและขึ้นบรรทัดใหม่');
    expect(a.input?.highlights).toEqual(['จุด1', 'จุด2']);
    expect(a.input?.fee_thai).toBe(50);
    expect(a.input?.best_months).toEqual([1, 11, 12]);
    expect(a.input?.opening_hours_text).toBe('Tu-Su 09:00-16:00; Mo off');
    expect(a.input?.verification).toBe('verified');
    expect(a.facilities).toEqual({ has_toilet: true });
    expect(a.source?.source_url).toBe('https://example.org/wat');
  });

  it('verified status is kept only where a source exists', () => {
    expect(rows[0].input?.verification).toBe('verified');
    expect(rows[1].input?.verification).toBe('pending');
  });
});
