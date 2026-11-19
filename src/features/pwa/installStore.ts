import { useSyncExternalStore } from 'react';
import { createStore } from './storeCore';
import { detectInstallState, type InstallState } from './installModel';

// Chrome / Edge / Android send this event once; keeping it lets us show our own "install" button in the profile page.
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
const store = createStore({ hasPrompt: false, installed: false });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no automatic mini-bar: the user decides from the profile page
    deferred = e as InstallPromptEvent;
    store.set({ hasPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    store.set({ hasPrompt: false, installed: true });
  });
}

const isStandalone = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true) ||
  (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function useInstallState(): InstallState {
  const s = useSyncExternalStore(store.subscribe, store.get, store.get);
  return detectInstallState({
    ua: navigator.userAgent,
    standalone: s.installed || isStandalone(),
    hasPrompt: s.hasPrompt,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null; // an event can be used once
  store.set({ hasPrompt: false });
  try {
    await ev.prompt();
    return (await ev.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}
