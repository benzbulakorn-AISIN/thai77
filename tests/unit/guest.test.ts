import { describe, expect, it } from 'vitest';
import {
  MAX_GUEST_ENTRIES, emptyGuest, guestCounts, isPlaceId, parseGuest, serializeGuest, statusEntries, statusKey, toMyState, wantIds,
  withFavorite, withStatus, withoutIds, type GuestItems, type GuestState,
} from '../../src/features/guest/guestModel';
import { createGuestStore, type StorageLike } from '../../src/features/guest/guestStoreCore';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const st = (items: GuestItems): GuestState => ({ items });

describe('parseGuest / serializeGuest', () => {
  it('nothing / garbage -> empty', () => {
    for (const bad of [null, undefined, '', 'not json', '[]', '"x"', '5', 'null', '{"v":1}', '{"v":1,"items":[]}', '{"v":2,"items":{}}', '{"items":{}}']) {
      expect(parseGuest(bad as string)).toEqual(emptyGuest());
    }
  });
  it('round trip', () => {
    const s = st({ [U(1)]: { s: 'want', f: true, t: 100 }, [U(2)]: { s: 'visited', f: false, t: 50 }, [U(3)]: { s: null, f: true, t: 10 } });
    expect(parseGuest(serializeGuest(s))).toEqual(s);
  });
  it('drops bad ids, bad statuses and empty entries; fixes odd values', () => {
    const json = JSON.stringify({ v: 1, items: {
      [U(1)]: { s: 'want', f: false, t: 5 },
      'not-a-uuid': { s: 'want', f: true, t: 5 },
      '../../etc': { s: 'want', f: true, t: 5 },
      [U(2)]: { s: 'planned', f: false, t: 5 },          // not a guest status, nothing else -> empty -> dropped
      [U(3)]: { s: 'planned', f: true, t: 5 },           // status dropped, favourite kept
      [U(4)]: { s: 'want', f: 'yes', t: 'x' },           // f must be exactly true; t falls back to 0
      [U(5)]: 'oops', [U(6)]: null, [U(7)]: { s: null, f: false, t: 9 },
    } });
    expect(parseGuest(json).items).toEqual({
      [U(1)]: { s: 'want', f: false, t: 5 },
      [U(3)]: { s: null, f: true, t: 5 },
      [U(4)]: { s: 'want', f: false, t: 0 },
    });
  });
  it('ids are lower-cased', () => {
    const up = U(1).toUpperCase().replace(/^0+/, (m) => m);
    expect(Object.keys(parseGuest(JSON.stringify({ v: 1, items: { 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA': { s: 'want', f: false, t: 1 } } })).items)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(up.length).toBe(36);
  });
  it('a file with too many entries keeps only the newest', () => {
    const items: Record<string, unknown> = {};
    for (let i = 1; i <= MAX_GUEST_ENTRIES + 20; i++) items[U(i)] = { s: 'want', f: false, t: i };
    const out = parseGuest(JSON.stringify({ v: 1, items })).items;
    expect(Object.keys(out)).toHaveLength(MAX_GUEST_ENTRIES);
    expect(out[U(MAX_GUEST_ENTRIES + 20)]).toBeTruthy();
    expect(out[U(1)]).toBeUndefined();
  });
  it('a hostile __proto__ key does not pollute anything', () => {
    parseGuest('{"v":1,"items":{"__proto__":{"s":"want","f":true,"t":1},"constructor":{"s":"want"}}}');
    expect(({} as Record<string, unknown>).s).toBeUndefined();
  });
});

describe('withStatus', () => {
  const T = 1000;
  it('sets, changes and clears a status', () => {
    let c = withStatus(emptyGuest(), U(1), 'want', T);
    expect(c.error).toBeNull();
    expect(c.state.items[U(1)]).toEqual({ s: 'want', f: false, t: T });
    c = withStatus(c.state, U(1), 'visited', T + 1);
    expect(c.state.items[U(1)]).toEqual({ s: 'visited', f: false, t: T + 1 });
    c = withStatus(c.state, U(1), 'none', T + 2);
    expect(c.state.items).toEqual({});
  });
  it('"planned" counts as "want" for a guest', () => {
    expect(withStatus(emptyGuest(), U(1), 'planned', T).state.items[U(1)].s).toBe('want');
  });
  it('clearing the status keeps a favourite', () => {
    let s = withFavorite(emptyGuest(), U(1), true, T).state;
    s = withStatus(s, U(1), 'want', T + 1).state;
    s = withStatus(s, U(1), 'none', T + 2).state;
    expect(s.items[U(1)]).toEqual({ s: null, f: true, t: T + 2 });
  });
  it('"none" on an unknown place does nothing and returns the same object', () => {
    const s = emptyGuest();
    expect(withStatus(s, U(1), 'none', T).state).toBe(s);
  });
  it('same status again returns the same object (nothing to save)', () => {
    const s = withStatus(emptyGuest(), U(1), 'want', T).state;
    expect(withStatus(s, U(1), 'want', T + 5).state).toBe(s);
  });
  it('ids are normalised; bad ids are refused', () => {
    expect(withStatus(emptyGuest(), 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'want', T).state.items['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']).toBeTruthy();
    for (const bad of ['', 'x', '../x', U(1) + 'x', null as unknown as string, undefined as unknown as string]) {
      const c = withStatus(emptyGuest(), bad, 'want', T);
      expect(c.error).toBe('invalid');
      expect(c.state.items).toEqual({});
    }
  });
  it('limit: a new place is refused when full, but existing ones can still change', () => {
    const items: GuestItems = {};
    for (let i = 1; i <= MAX_GUEST_ENTRIES; i++) items[U(i)] = { s: 'want', f: false, t: i };
    const full = st(items);
    const c = withStatus(full, U(MAX_GUEST_ENTRIES + 1), 'want', T);
    expect(c.error).toBe('full');
    expect(c.state).toBe(full);
    expect(withStatus(full, U(1), 'visited', T).error).toBeNull();
    expect(withStatus(full, U(MAX_GUEST_ENTRIES + 1), 'none', T).error).toBeNull(); // clearing something that is not there is fine
    expect(withFavorite(full, U(MAX_GUEST_ENTRIES + 1), true, T).error).toBe('full');
  });
  it('does not change the old state', () => {
    const s = st({ [U(1)]: { s: 'want', f: false, t: 1 } });
    const copy = JSON.stringify(s);
    withStatus(s, U(1), 'visited', T); withStatus(s, U(2), 'want', T); withFavorite(s, U(1), true, T); withoutIds(s, [U(1)]);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('withFavorite / withoutIds', () => {
  it('favourite on/off and the entry disappears when nothing is left', () => {
    let s = withFavorite(emptyGuest(), U(1), true, 5).state;
    expect(s.items[U(1)]).toEqual({ s: null, f: true, t: 5 });
    s = withFavorite(s, U(1), false, 6).state;
    expect(s.items).toEqual({});
  });
  it('favourite keeps the status', () => {
    let s = withStatus(emptyGuest(), U(1), 'visited', 5).state;
    s = withFavorite(s, U(1), true, 6).state;
    expect(s.items[U(1)]).toEqual({ s: 'visited', f: true, t: 6 });
    s = withFavorite(s, U(1), false, 7).state;
    expect(s.items[U(1)]).toEqual({ s: 'visited', f: false, t: 7 });
  });
  it('already in that state -> same object; turning off an unknown place -> same object', () => {
    const s = withFavorite(emptyGuest(), U(1), true, 5).state;
    expect(withFavorite(s, U(1), true, 9).state).toBe(s);
    const e = emptyGuest();
    expect(withFavorite(e, U(2), false, 9).state).toBe(e);
  });
  it('withoutIds removes only the given ids (case-insensitive) and returns the same object when nothing matches', () => {
    const s = st({ [U(1)]: { s: 'want', f: false, t: 1 }, [U(2)]: { s: 'want', f: false, t: 2 } });
    expect(Object.keys(withoutIds(s, [U(1).toUpperCase()]).items)).toEqual([U(2)]);
    expect(withoutIds(s, [U(9)])).toBe(s);
    expect(withoutIds(s, [])).toBe(s);
  });
});

describe('views of the data', () => {
  const items: GuestItems = {
    [U(1)]: { s: 'want', f: true, t: 30 }, [U(2)]: { s: 'want', f: false, t: 50 }, [U(3)]: { s: 'visited', f: true, t: 10 }, [U(4)]: { s: null, f: true, t: 70 },
  };
  it('counts', () => {
    expect(guestCounts(items)).toEqual({ want: 2, visited: 1, favorite: 3, entries: 4 });
    expect(guestCounts({})).toEqual({ want: 0, visited: 0, favorite: 0, entries: 0 });
  });
  it('wantIds are newest first', () => {
    expect(wantIds(items)).toEqual([U(2), U(1)]);
    expect(wantIds({})).toEqual([]);
  });
  it('wantIds tie -> by id', () => {
    expect(wantIds({ [U(2)]: { s: 'want', f: false, t: 5 }, [U(1)]: { s: 'want', f: false, t: 5 } })).toEqual([U(1), U(2)]);
  });
  it('statusEntries and statusKey ignore favourite-only entries and timestamps', () => {
    expect(statusEntries(items)).toEqual([[U(1), 'want'], [U(2), 'want'], [U(3), 'visited']]);
    const other: GuestItems = { ...items, [U(1)]: { s: 'want', f: false, t: 999 }, [U(5)]: { s: null, f: true, t: 1 } };
    expect(statusKey(other)).toBe(statusKey(items));
    expect(statusKey({ ...items, [U(2)]: { s: 'visited', f: false, t: 50 } })).not.toBe(statusKey(items));
  });
  it('toMyState', () => {
    expect(toMyState({ s: 'want', f: true, t: 1 })).toEqual({ status: 'want', rating: null, favorite: true, lastVisited: null });
    expect(toMyState({ s: null, f: true, t: 1 }).status).toBe('none');
    expect(toMyState(undefined)).toEqual({ status: 'none', rating: null, favorite: false, lastVisited: null });
  });
  it('isPlaceId', () => {
    expect(isPlaceId(U(1))).toBe(true);
    for (const bad of ['', 'x', null, undefined, 5, U(1) + '0']) expect(isPlaceId(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------- store
function fakeStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const s = {
    data, failWrites: false, failReads: false, writes: 0,
    getItem(k: string) { if (s.failReads) throw new Error('blocked'); return data.get(k) ?? null; },
    setItem(k: string, v: string) { if (s.failWrites) throw new Error('quota'); s.writes++; data.set(k, v); },
    removeItem(k: string) { data.delete(k); },
  };
  return s as typeof s & StorageLike;
}
const KEY = 'k';
const mk = (storage: ReturnType<typeof fakeStorage> | null, t = { now: 1000 }) => createGuestStore(storage, { key: KEY, now: () => t.now++ });

describe('guest store', () => {
  it('starts from what is saved and ignores damage', () => {
    const s = fakeStorage({ [KEY]: serializeGuest(st({ [U(1)]: { s: 'want', f: false, t: 5 } })) });
    expect(mk(s).getSnapshot().counts.want).toBe(1);
    expect(mk(fakeStorage({ [KEY]: '{{{' })).getSnapshot().counts.entries).toBe(0);
    const bad = fakeStorage(); bad.failReads = true;
    expect(mk(bad).getSnapshot().counts.entries).toBe(0);
  });
  it('saves every change and removes the key when empty', () => {
    const s = fakeStorage(); const g = mk(s);
    g.setStatus(U(1), 'want');
    expect(parseGuest(s.data.get(KEY)!).items[U(1)].s).toBe('want');
    g.setStatus(U(1), 'none');
    expect(s.data.has(KEY)).toBe(false);
  });
  it('notifies subscribers only when something changed; the snapshot is stable otherwise', () => {
    const g = mk(fakeStorage()); let n = 0;
    const off = g.subscribe(() => { n++; });
    const a = g.getSnapshot();
    expect(g.getSnapshot()).toBe(a);
    g.setStatus(U(1), 'want');
    expect(n).toBe(1);
    expect(g.getSnapshot()).not.toBe(a);
    expect(g.getSnapshot().rev).toBe(a.rev + 1);
    const b = g.getSnapshot();
    g.setStatus(U(1), 'want');            // no change
    g.setStatus(U(2), 'none');            // nothing to clear
    g.setFavorite(U(3), false);           // nothing to clear
    expect(n).toBe(1);
    expect(g.getSnapshot()).toBe(b);
    off(); g.setStatus(U(1), 'visited');
    expect(n).toBe(1);
  });
  it('writes only when something changed', () => {
    const s = fakeStorage(); const g = mk(s);
    g.setStatus(U(1), 'want'); g.setStatus(U(1), 'want'); g.setStatus(U(1), 'want');
    expect(s.writes).toBe(1);
  });
  it('toggleFavorite returns the new value (and the old one on error)', () => {
    const g = mk(fakeStorage());
    expect(g.toggleFavorite(U(1))).toEqual({ error: null, favorite: true });
    expect(g.toggleFavorite(U(1))).toEqual({ error: null, favorite: false });
    expect(g.toggleFavorite('bad')).toEqual({ error: 'invalid', favorite: false });
  });
  it('a browser that refuses to save: data stays in memory and persisted turns false', () => {
    const s = fakeStorage(); s.failWrites = true; const g = mk(s);
    expect(g.getSnapshot().persisted).toBe(true);
    g.setStatus(U(1), 'want');
    expect(g.getSnapshot().counts.want).toBe(1);
    expect(g.getSnapshot().persisted).toBe(false);
    s.failWrites = false;
    g.setStatus(U(2), 'want');
    expect(g.getSnapshot().persisted).toBe(true); // saving works again
  });
  it('no storage at all (blocked): works in memory only', () => {
    const g = mk(null);
    expect(g.getSnapshot().persisted).toBe(false);
    g.setStatus(U(1), 'want');
    expect(g.getSnapshot().counts.want).toBe(1);
  });
  it('remove and clear', () => {
    const s = fakeStorage(); const g = mk(s);
    g.setStatus(U(1), 'want'); g.setStatus(U(2), 'visited'); g.setFavorite(U(3), true);
    g.remove([U(1), U(3)]);
    expect(Object.keys(g.getSnapshot().items)).toEqual([U(2)]);
    g.clear();
    expect(g.getSnapshot().counts.entries).toBe(0);
    expect(s.data.has(KEY)).toBe(false);
  });
  it('reload picks up another tab\'s change, and ignores identical content', () => {
    const s = fakeStorage(); const g = mk(s); let n = 0;
    g.subscribe(() => { n++; });
    g.setStatus(U(1), 'want');
    n = 0;
    g.reload();
    expect(n).toBe(0);
    s.data.set(KEY, serializeGuest(st({ [U(9)]: { s: 'visited', f: false, t: 5 } })));
    g.reload();
    expect(n).toBe(1);
    expect(Object.keys(g.getSnapshot().items)).toEqual([U(9)]);
    s.data.delete(KEY); g.reload();
    expect(g.getSnapshot().counts.entries).toBe(0);
  });
  it('the full limit surfaces as an error code', () => {
    const g = mk(fakeStorage());
    for (let i = 1; i <= MAX_GUEST_ENTRIES; i++) g.setStatus(U(i), 'want');
    expect(g.setStatus(U(MAX_GUEST_ENTRIES + 1), 'want')).toBe('full');
    expect(g.getSnapshot().counts.entries).toBe(MAX_GUEST_ENTRIES);
  });
  it('two stores on different keys do not see each other', () => {
    const s = fakeStorage();
    const a = createGuestStore(s, { key: 'a', now: () => 1 }), b = createGuestStore(s, { key: 'b', now: () => 1 });
    a.setStatus(U(1), 'want');
    expect(b.getSnapshot().counts.entries).toBe(0);
  });
});
