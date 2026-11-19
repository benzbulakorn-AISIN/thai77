// A tiny observable store (no React): used by the PWA state and by the install-prompt state.
export type Store<T extends object> = {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(fn: () => void): () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      const same = (Object.keys(next) as (keyof T)[]).every((k) => Object.is(next[k], state[k]));
      if (same) return; // identical -> same object, nobody is notified (stable for useSyncExternalStore)
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
