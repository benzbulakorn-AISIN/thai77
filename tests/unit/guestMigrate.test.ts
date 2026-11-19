import { describe, expect, it } from 'vitest';
import type { GuestItems } from '../../src/features/guest/guestModel';
import { STATUS_RANK, planMigration, summaryText, type ServerStatus } from '../../src/features/guest/migrate';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const e = (s: 'want' | 'visited' | null, f = false) => ({ s, f, t: 1 });
const server = (st: Record<string, ServerStatus> = {}, fav: string[] = []) => ({ statuses: new Map(Object.entries(st)), favorites: new Set(fav) });
const all = (...ids: string[]) => new Set(ids);

describe('planMigration', () => {
  it('an empty account gets everything', () => {
    const items: GuestItems = { [U(1)]: e('want'), [U(2)]: e('visited', true), [U(3)]: e(null, true) };
    const p = planMigration(items, server(), all(U(1), U(2), U(3)));
    expect(p.statusRows).toEqual([{ place_id: U(1), status: 'want' }, { place_id: U(2), status: 'visited' }]);
    expect(p.favoriteIds).toEqual([U(2), U(3)]);
    expect(p.summary).toEqual({ statuses: 2, favorites: 2, kept: 0, missing: 0 });
    expect(p.handledIds).toEqual([U(1), U(2), U(3)]);
  });
  it('never lowers a status the account already has', () => {
    const items: GuestItems = { [U(1)]: e('want'), [U(2)]: e('want'), [U(3)]: e('visited'), [U(4)]: e('want') };
    const p = planMigration(items, server({ [U(1)]: 'visited', [U(2)]: 'planned', [U(3)]: 'visited', [U(4)]: 'none' }), all(U(1), U(2), U(3), U(4)));
    expect(p.statusRows).toEqual([{ place_id: U(4), status: 'want' }]);
    expect(p.summary.kept).toBe(3);
  });
  it('visited beats planned and want; same level is not rewritten', () => {
    const items: GuestItems = { [U(1)]: e('visited'), [U(2)]: e('visited'), [U(3)]: e('want') };
    const p = planMigration(items, server({ [U(1)]: 'planned', [U(2)]: 'want', [U(3)]: 'want' }), all(U(1), U(2), U(3)));
    expect(p.statusRows.map((r) => r.place_id)).toEqual([U(1), U(2)]);
    expect(p.summary.kept).toBe(1);
  });
  it('favourites already in the account are not added again; none is ever removed', () => {
    const items: GuestItems = { [U(1)]: e(null, true), [U(2)]: e(null, true), [U(3)]: e('want', false) };
    const p = planMigration(items, server({}, [U(1), U(9)]), all(U(1), U(2), U(3)));
    expect(p.favoriteIds).toEqual([U(2)]);
    expect(p.summary.favorites).toBe(1);
  });
  it('places that no longer exist are skipped (and cleared from the device)', () => {
    const items: GuestItems = { [U(1)]: e('want', true), [U(2)]: e('want', true) };
    const p = planMigration(items, server(), all(U(2)));
    expect(p.statusRows).toEqual([{ place_id: U(2), status: 'want' }]);
    expect(p.favoriteIds).toEqual([U(2)]);
    expect(p.summary.missing).toBe(1);
    expect(p.handledIds).toEqual([U(1), U(2)]);
  });
  it('everything missing / nothing local', () => {
    expect(planMigration({ [U(1)]: e('want') }, server(), all()).summary).toEqual({ statuses: 0, favorites: 0, kept: 0, missing: 1 });
    const p = planMigration({}, server(), all());
    expect(p.statusRows).toEqual([]);
    expect(p.handledIds).toEqual([]);
  });
  it('a favourite-only entry never touches the status table', () => {
    const p = planMigration({ [U(1)]: e(null, true) }, server({ [U(1)]: 'visited' }), all(U(1)));
    expect(p.statusRows).toEqual([]);
    expect(p.summary.kept).toBe(0);
  });
  it('is deterministic whatever the key order', () => {
    const a: GuestItems = { [U(2)]: e('want'), [U(1)]: e('want') };
    const b: GuestItems = { [U(1)]: e('want'), [U(2)]: e('want') };
    expect(planMigration(a, server(), all(U(1), U(2)))).toEqual(planMigration(b, server(), all(U(1), U(2))));
  });
  it('rank order is none < want < planned < visited', () => {
    expect(STATUS_RANK.none < STATUS_RANK.want && STATUS_RANK.want < STATUS_RANK.planned && STATUS_RANK.planned < STATUS_RANK.visited).toBe(true);
  });
  it('an unknown server status word is treated as "none" (never blocks a write)', () => {
    const p = planMigration({ [U(1)]: e('want') }, server({ [U(1)]: 'weird' as ServerStatus }), all(U(1)));
    expect(p.statusRows).toHaveLength(1);
  });
});

describe('summaryText', () => {
  it('says what moved', () => {
    expect(summaryText({ statuses: 3, favorites: 2, kept: 0, missing: 0 })).toBe('ย้ายแล้ว: สถานะ 3 แห่ง · โปรด 2 แห่ง');
    expect(summaryText({ statuses: 0, favorites: 1, kept: 0, missing: 0 })).toBe('ย้ายแล้ว: โปรด 1 แห่ง');
  });
  it('explains what was not changed', () => {
    expect(summaryText({ statuses: 1, favorites: 0, kept: 2, missing: 1 })).toBe('ย้ายแล้ว: สถานะ 1 แห่ง (2 แห่งบัญชีมีสถานะเดิมอยู่แล้ว จึงไม่เปลี่ยน · 1 แห่งไม่มีในระบบแล้ว)');
  });
  it('nothing to move', () => {
    expect(summaryText({ statuses: 0, favorites: 0, kept: 0, missing: 0 })).toBe('ไม่มีอะไรต้องย้ายเพิ่ม');
    expect(summaryText({ statuses: 0, favorites: 0, kept: 3, missing: 0 })).toBe('ไม่มีอะไรต้องย้ายเพิ่ม (3 แห่งบัญชีมีสถานะเดิมอยู่แล้ว จึงไม่เปลี่ยน)');
  });
});
