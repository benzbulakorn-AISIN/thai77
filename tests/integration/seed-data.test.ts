// Integration: the demo seed files shipped in data/seed/places must stay importable and honest.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '../../src/features/admin/importModel';

const DIR = join(process.cwd(), 'data', 'seed', 'places');
const CATEGORY_SLUGS = new Set([
  'temple', 'national-park', 'nature', 'viewpoint', 'beach', 'island', 'river', 'waterfall', 'dam', 'cave', 'market', 'floating-market',
  'walking-street', 'community', 'historic', 'museum', 'culture', 'cafe', 'restaurant', 'photo-spot', 'flower-garden', 'farm', 'family',
  'nightlife', 'unseen', 'other',
]);
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('data/seed/places', () => {
  it('has seed files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    describe(f, () => {
      const text = readFileSync(join(DIR, f), 'utf8');
      const raw = JSON.parse(text) as { province_pcode?: string; places?: Record<string, string>[] };

      it('declares a valid province code', () => {
        expect(raw.province_pcode).toMatch(/^TH\d{2}$/);
      });

      it('parses with the importer and every place is complete', () => {
        const p = parseFile(f, text);
        expect(p.records.length).toBeGreaterThan(0);
        expect(p.unknown).toEqual([]);
        for (const r of p.records) {
          expect(r.name_th.length).toBeGreaterThan(0);
          expect(CATEGORY_SLUGS.has(r.category)).toBe(true);
          expect(r.province).toBe(raw.province_pcode);
          expect((r.short_description ?? '').length).toBeLessThanOrEqual(500);
        }
      });

      it('has unique keys and unique names', () => {
        const places = raw.places ?? [];
        const keys = places.map((x) => x.key);
        expect(new Set(keys).size).toBe(keys.length);
        const names = places.map((x) => x.name_th);
        expect(new Set(names).size).toBe(names.length);
      });

      it('never ships invented prices, hours or coordinates', () => {
        for (const x of raw.places ?? []) {
          for (const bad of ['lat', 'lng', 'fee_thai', 'fee_foreigner', 'opening_hours', 'phone']) {
            expect(x[bad]).toBeUndefined();
          }
        }
      });
    });
  }
});
