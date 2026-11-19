import { useSyncExternalStore } from 'react';
import { createStore, type Store } from './storeCore';

export type PwaState = {
  /** this browser can run service workers at all */
  supported: boolean;
  /** the page is controlled by a worker -> works offline */
  offlineReady: boolean;
  /** a newer version is downloaded and waiting for the user's OK */
  updateReady: boolean;
  /** the emergency switch (pwa.config.json) is off */
  disabled: boolean;
};

export const pwaStore: Store<PwaState> = createStore<PwaState>({ supported: false, offlineReady: false, updateReady: false, disabled: false });

export const usePwa = () => useSyncExternalStore(pwaStore.subscribe, pwaStore.get, pwaStore.get);
