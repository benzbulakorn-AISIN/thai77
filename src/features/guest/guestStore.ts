import { useSyncExternalStore } from 'react';
import { GUEST_KEY } from './guestModel';
import { createGuestStore, type StorageLike } from './guestStoreCore';

function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    const probe = '__thai77_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null; // blocked (private mode, strict settings)
  }
}

/** one store for the whole app */
export const guestStore = createGuestStore(browserStorage());

if (typeof window !== 'undefined') {
  // another tab saved something
  window.addEventListener('storage', (e) => { if (e.key === null || e.key === GUEST_KEY) guestStore.reload(); });
}

export function useGuestPlaces() {
  return useSyncExternalStore(guestStore.subscribe, guestStore.getSnapshot, guestStore.getSnapshot);
}
