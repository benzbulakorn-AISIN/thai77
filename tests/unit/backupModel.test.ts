import { describe, expect, it } from 'vitest';
import { pickSettings, previewCounts, transformRow, validateBackup, type Backup, type TransformCtx } from '../../src/features/backup/backupModel';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const file = (over: Record<string, unknown> = {}) => ({
  app: 'thai77', kind: 'personal-backup', schemaVersion: 1, exportedAt: '2026-11-18T00:00:00Z', userId: 'OLD',
  refs: { budgetCategories: { [U(90)]: 'food', [U(91)]: 'gone' } },
  data: {
    trips: [{ id: U(1), owner_id: 'OLD', name: 't', share_token: U(5), updated_at: 'z' }],
    tripItems: [{ id: U(2), trip_id: U(1), place_id: U(50) }, { id: U(3), trip_id: U(1), place_id: U(51) }],
    budgetItems: [{ id: U(4), category_id: U(90), paid_by: 'OLD' }, { id: U(6), category_id: U(91), paid_by: 'PARTNER' }],
    userPlaceStatus: [{ id: U(7), place_id: U(51), user_id: 'OLD' }],
    visitedPlaces: [{ id: U(8), user_id: 'OLD', place_id: U(51), cover_photo_id: U(9) }],
    userPlaces: [{ id: U(10), owner_id: 'OLD', submission: 'approved', promoted_place_id: U(50) }],
    userSettings: { theme: 'sakura', id: 'x', user_id: 'OLD', evil: 1 },
  },
  ...over,
});
const parse = (o: object): Backup => { const r = validateBackup(JSON.stringify(o)); if (!r.ok) throw new Error(r.error); return r.backup; };
const ctx: TransformCtx = {
  uid: 'ME', backupUid: 'OLD', validPlaceIds: new Set([U(50)]),
  budgetCatBySlug: new Map([['food', 'F'], ['other', 'O']]), otherBudgetCat: 'O',
};

describe('validateBackup', () => {
  it('rejects non-JSON, other apps, newer versions and malformed rows with Thai messages', () => {
    const bad = (t: string) => { const r = validateBackup(t); return r.ok ? '' : r.error; };
    expect(bad('nope')).toContain('JSON');
    expect(bad(JSON.stringify({ app: 'thai77', kind: 'x' }))).toContain('ไม่ใช่ไฟล์สำรอง');
    expect(bad(JSON.stringify(file({ schemaVersion: 2 })))).toContain('เวอร์ชันใหม่กว่า');
    expect(bad(JSON.stringify(file({ schemaVersion: 0 })))).toContain('เวอร์ชัน');
    expect(bad(JSON.stringify(file({ data: { trips: [{ id: 'bad' }] } })))).toContain('ทริป');
    expect(bad(JSON.stringify(file({ data: { trips: 'x' } })))).toContain('ทริป');
    expect(bad(JSON.stringify(file({ data: null })))).toContain('ข้อมูล');
  });
  it('accepts a valid file; missing tables default to empty', () => {
    const b = parse(file());
    expect(b.data.trips).toHaveLength(1);
    expect(b.data.favorites).toEqual([]);
    expect(b.userId).toBe('OLD');
  });
});

describe('previewCounts', () => {
  it('merge counts rows that already exist; replace counts everything', () => {
    const b = parse(file());
    const merge = previewCounts(b, { trips: new Set([U(1)]) }, 'merge');
    expect(merge.find((l) => l.table === 'trips')).toEqual({ table: 'trips', total: 1, existing: 1, insert: 0 });
    expect(merge.find((l) => l.table === 'tripItems')?.insert).toBe(2);
    const replace = previewCounts(b, { trips: new Set([U(1)]) }, 'replace');
    expect(replace.find((l) => l.table === 'trips')?.insert).toBe(1);
  });
  it('hides empty tables', () => {
    expect(previewCounts(parse(file()), {}, 'merge').some((l) => l.table === 'favorites')).toBe(false);
  });
});

describe('transformRow (restore into the current account)', () => {
  const b = parse(file());
  it('re-owns trips, clears share tokens and server timestamps', () => {
    const t = transformRow('trips', b.data.trips[0], b, ctx)!;
    expect(t.owner_id).toBe('ME');
    expect(t.share_token).toBeNull();
    expect('updated_at' in t).toBe(false);
  });
  it('nulls place references that no longer exist', () => {
    expect(b.data.tripItems.map((r) => transformRow('tripItems', r, b, ctx)!.place_id)).toEqual([U(50), null]);
  });
  it('drops statuses of places that no longer exist', () => {
    expect(transformRow('userPlaceStatus', b.data.userPlaceStatus[0], b, ctx)).toBeNull();
  });
  it('maps budget categories by slug, falls back to "other", keeps only my own paid_by', () => {
    const [a, c] = b.data.budgetItems.map((r) => transformRow('budgetItems', r, b, ctx)!);
    expect([a.category_id, a.paid_by, a.created_by]).toEqual(['F', 'ME', 'ME']);
    expect([c.category_id, c.paid_by]).toEqual(['O', null]);
    expect(transformRow('budgetItems', b.data.budgetItems[0], b, { ...ctx, budgetCatBySlug: new Map(), otherBudgetCat: null })).toBeNull();
  });
  it('visited places: new owner, cover photo cleared (re-linked later), missing place nulled', () => {
    const v = transformRow('visitedPlaces', b.data.visitedPlaces[0], b, ctx)!;
    expect([v.user_id, v.cover_photo_id, v.place_id]).toEqual(['ME', null, null]);
  });
  it('approved submissions go back to private and lose the promoted place link', () => {
    const u = transformRow('userPlaces', b.data.userPlaces[0], b, ctx)!;
    expect([u.owner_id, u.submission, u.promoted_place_id]).toEqual(['ME', 'private', null]);
  });
  it('cannot smuggle __proto__ keys', () => {
    const evil = JSON.parse('{"id":"' + U(77) + '","__proto__":{"polluted":true},"name":"x"}');
    transformRow('travelMemories', evil, b, ctx);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('pickSettings', () => {
  it('keeps only whitelisted columns', () => {
    expect(pickSettings({ theme: 'sakura', id: 'x', user_id: 'OLD', evil: 1 })).toEqual({ theme: 'sakura' });
    expect(pickSettings({ id: 'x' })).toBeNull();
    expect(pickSettings(null)).toBeNull();
  });
});
