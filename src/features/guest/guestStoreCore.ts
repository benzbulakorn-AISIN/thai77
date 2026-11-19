// The guest store: memory + (best effort) localStorage + subscribers. Works with any storage-like object, so tests need no browser.
import {
  GUEST_KEY, emptyGuest, guestCounts, parseGuest, serializeGuest, withFavorite, withStatus, withoutIds,
  type GuestCounts, type GuestError, type GuestItems, type GuestState,
} from './guestModel';

export type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type GuestSnapshot = {
  items: GuestItems;
  /** increases on every change */
  rev: number;
  /** false when the browser refused to save (private mode / full): data lives only until the page is closed */
  persisted: boolean;
  counts: GuestCounts;
};

export function createGuestStore(storage: StorageLike | null, opts: { key?: string; now?: () => number } = {}) {
  const key = opts.key ?? GUEST_KEY;
  const now = opts.now ?? (() => Date.now());
  let state: GuestState = load();
  let rev = 0;
  let persisted = storage !== null;
  let snap = makeSnap();
  const listeners = new Set<() => void>();

  function load(): GuestState {
    try { return parseGuest(storage ? storage.getItem(key) : null); } catch { return emptyGuest(); }
  }
  function makeSnap(): GuestSnapshot {
    return { items: state.items, rev, persisted, counts: guestCounts(state.items) };
  }
  function emit() {
    rev++;
    snap = makeSnap();
    listeners.forEach((l) => l());
  }
  function save() {
    if (!storage) { persisted = false; return; }
    try {
      if (Object.keys(state.items).length === 0) storage.removeItem(key);
      else storage.setItem(key, serializeGuest(state));
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  function commit(next: GuestState) {
    if (next === state) return;
    state = next;
    save();
    emit();
  }

  return {
    getSnapshot: (): GuestSnapshot => snap,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    setStatus(id: string, status: string): GuestError | null {
      const c = withStatus(state, id, status, now());
      commit(c.state);
      return c.error;
    },
    setFavorite(id: string, favorite: boolean): GuestError | null {
      const c = withFavorite(state, id, favorite, now());
      commit(c.state);
      return c.error;
    },
    toggleFavorite(id: string): { error: GuestError | null; favorite: boolean } {
      const was = state.items[String(id).toLowerCase()]?.f ?? false;
      const error = this.setFavorite(id, !was);
      return { error, favorite: error ? was : !was };
    },
    remove(ids: string[]) { commit(withoutIds(state, ids)); },
    clear() { commit(emptyGuest()); },
    /** another tab changed the storage */
    reload() {
      const loaded = load();
      if (serializeGuest(loaded) !== serializeGuest(state)) { state = loaded; emit(); }
    },
  };
}

export type GuestStore = ReturnType<typeof createGuestStore>;
