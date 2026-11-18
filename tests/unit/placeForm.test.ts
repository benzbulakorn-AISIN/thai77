import { describe, expect, it } from 'vitest';
import { emptyForm, fromForm, parseThaiCoords, toForm, type PlaceForm } from '../../src/features/admin/placeForm';

const ok = (over: Partial<PlaceForm> = {}): PlaceForm => ({ ...emptyForm(), name_th: ' วัดทดสอบ ', province_id: 'p1', category_id: 'c1', ...over });
const input = (f: PlaceForm) => { const r = fromForm(f); if (!r.ok) throw new Error(r.error); return r.input; };
const error = (f: PlaceForm) => { const r = fromForm(f); return r.ok ? null : r.error; };

describe('parseThaiCoords', () => {
  it('plain, Google Maps @ and !3d!4d formats', () => {
    expect(parseThaiCoords('13.7563, 100.5018')).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(parseThaiCoords('https://www.google.com/maps/place/X/@12.92,100.87,17z')).toEqual({ lat: 12.92, lng: 100.87 });
    expect(parseThaiCoords('...!3d12.927604!4d100.877115')).toEqual({ lat: 12.927604, lng: 100.877115 });
  });
  it('rejects points outside Thailand and garbage', () => {
    expect(parseThaiCoords('40.7, -74.0')).toBeNull();
    expect(parseThaiCoords('hello')).toBeNull();
    expect(parseThaiCoords('4.9, 100')).toBeNull();
    expect(parseThaiCoords('13, 96.9')).toBeNull();
  });
});

describe('fromForm', () => {
  it('trims, converts numbers and normalises lists', () => {
    const i = input(ok({ fee_thai: '1,200', highlights: 'a\n\n b ', best_months: [12, 1, 1, 13], coords: '12.92, 100.87', short_description: '  hi  ' }));
    expect(i.name_th).toBe('วัดทดสอบ');
    expect(i.fee_thai).toBe(1200);
    expect(i.highlights).toEqual(['a', 'b']);
    expect(i.best_months).toEqual([1, 12]);
    expect(i.lat).toBe(12.92);
    expect(i.short_description).toBe('hi');
    expect(i.fee_foreigner).toBeNull();
  });
  it('required fields', () => {
    expect(error(ok({ name_th: '  ' }))).toContain('ชื่อ');
    expect(error(ok({ province_id: '' }))).toContain('จังหวัด');
    expect(error(ok({ category_id: '' }))).toContain('หมวด');
  });
  it('rejects bad values', () => {
    expect(error(ok({ coords: '40.7, -74' }))).toContain('พิกัด');
    expect(error(ok({ fee_thai: '-5' }))).toContain('ค่าเข้า');
    expect(error(ok({ fee_thai: 'abc' }))).toContain('ค่าเข้า');
    expect(error(ok({ suggested_minutes: '2' }))).toContain('5–1440');
    expect(error(ok({ suggested_minutes: '12.5' }))).toContain('5–1440');
    expect(error(ok({ popularity: '101' }))).toContain('0–100');
    expect(error(ok({ verified_at: '18/11/2026' }))).toContain('วันที่');
  });
  it('only http(s) links are accepted (no javascript: / data:)', () => {
    expect(error(ok({ website_url: 'javascript:alert(1)' }))).toContain('http');
    expect(error(ok({ social_url: 'data:text/html,x' }))).toContain('http');
    expect(error(ok({ google_maps_url: 'ftp://x' }))).toContain('http');
    expect(input(ok({ website_url: 'https://example.com/a?b=1' })).website_url).toBe('https://example.com/a?b=1');
  });
  it('"verified" gets today when no date is given', () => {
    const i = input(ok({ verification: 'verified' }));
    expect(i.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input(ok({ verification: 'pending' })).verified_at).toBeNull();
  });
});

describe('toForm', () => {
  it('round-trips through fromForm', () => {
    const f = ok({ fee_thai: '50', highlights: 'x\ny', coords: '13.5, 100.5', best_months: [3, 1] });
    const back = toForm(input(f));
    expect(back.fee_thai).toBe('50');
    expect(back.highlights).toBe('x\ny');
    expect(back.coords).toBe('13.5, 100.5');
    expect(back.best_months).toEqual([1, 3]);
  });
});
