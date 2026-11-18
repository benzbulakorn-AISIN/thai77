// Integration: Backup JSON -> validate -> preview -> transform for restore keeps the data consistent.
import { describe, expect, it } from 'vitest';
import { TABLES, previewCounts, transformRow, validateBackup, type Backup, type Row } from '../../src/features/backup/backupModel';

const U = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;
const data = {
  userPlaces: [{ id: U(1), owner_id: 'OLD', name_th: 'ร้านลับ', submission: 'private', notes: 'secret note' }],
  trips: [{ id: U(10), owner_id: 'OLD', name: 'ทริปชลบุรี', share_token: null }],
  tripDays: [{ id: U(11), trip_id: U(10), day_index: 1 }, { id: U(12), trip_id: U(10), day_index: 2 }],
  accommodations: [{ id: U(13), trip_id: U(10), name: 'โรงแรม' }],
  tripItems: [
    { id: U(20), trip_id: U(10), day_id: U(11), title: 'วัด', place_id: U(90) },
    { id: U(21), trip_id: U(10), day_id: U(12), title: 'ร้านลับ', place_id: null, user_place_id: U(1) },
  ],
  tripRoutes: [{ id: U(30), trip_id: U(10), day_id: U(11), distance_km: 100 }],
  budgetItems: [{ id: U(40), trip_id: U(10), category_id: U(95), label: 'น้ำมัน', estimated: 500, paid_by: 'OLD' }],
  travelMemories: [{ id: U(50), user_id: 'OLD', title: 'วันดี' }],
  visitedPlaces: [{ id: U(60), user_id: 'OLD', place_id: U(90), place_name: 'วัด', cover_photo_id: U(70) }],
  memoryPhotos: [{ id: U(70), user_id: 'OLD', visited_place_id: U(60), storage_path: 'OLD/x/a.webp' }],
  userPlaceStatus: [{ id: U(80), user_id: 'OLD', place_id: U(90), status: 'visited' }],
  favorites: [{ id: U(81), user_id: 'OLD', place_id: U(90) }],
  userSettings: { theme: 'forest', color_mode: 'dark', fuel_km_per_l: 12 },
};
const text = JSON.stringify({ app: 'thai77', kind: 'personal-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), userId: 'OLD', refs: { budgetCategories: { [U(95)]: 'fuel' } }, data });
const v = validateBackup(text);
if (!v.ok) throw new Error(v.error);
const backup: Backup = v.backup;
const ctx = { uid: 'NEW', backupUid: 'OLD', validPlaceIds: new Set([U(90)]), budgetCatBySlug: new Map([['fuel', 'FUEL']]), otherBudgetCat: 'OTHER' };

describe('backup file -> restore', () => {
  const restored = new Map<string, Row[]>();
  for (const t of TABLES) {
    restored.set(t, backup.data[t].map((r) => transformRow(t, r, backup, ctx)).filter((r): r is Row => r !== null));
  }

  it('nothing is lost when everything it refers to still exists', () => {
    for (const t of TABLES) expect(restored.get(t)).toHaveLength(backup.data[t].length);
  });

  it('every row now belongs to the new account', () => {
    for (const t of ['trips', 'userPlaces'] as const) for (const r of restored.get(t)!) expect(r.owner_id).toBe('NEW');
    for (const t of ['travelMemories', 'visitedPlaces', 'memoryPhotos', 'userPlaceStatus', 'favorites'] as const) {
      for (const r of restored.get(t)!) expect(r.user_id).toBe('NEW');
    }
  });

  it('foreign keys between restored rows are preserved (insert order is valid)', () => {
    const ids = (t: string) => new Set((restored.get(t) ?? []).map((r) => r.id));
    for (const d of restored.get('tripDays')!) expect(ids('trips').has(String(d.trip_id))).toBe(true);
    for (const i of restored.get('tripItems')!) {
      expect(ids('trips').has(String(i.trip_id))).toBe(true);
      expect(ids('tripDays').has(String(i.day_id))).toBe(true);
    }
    for (const p of restored.get('memoryPhotos')!) expect(ids('visitedPlaces').has(String(p.visited_place_id))).toBe(true);
    // parents are inserted before children
    expect(TABLES.indexOf('trips')).toBeLessThan(TABLES.indexOf('tripItems'));
    expect(TABLES.indexOf('visitedPlaces')).toBeLessThan(TABLES.indexOf('memoryPhotos'));
    expect(TABLES.indexOf('userPlaces')).toBeLessThan(TABLES.indexOf('tripItems'));
  });

  it('budget category is re-mapped to the current database id', () => {
    expect(restored.get('budgetItems')![0].category_id).toBe('FUEL');
  });

  it('a second restore of the same file would insert nothing in merge mode', () => {
    const existing = Object.fromEntries(TABLES.map((t) => [t, new Set(backup.data[t].map((r) => r.id))]));
    const lines = previewCounts(backup, existing, 'merge');
    expect(lines.every((l) => l.insert === 0)).toBe(true);
  });
});
