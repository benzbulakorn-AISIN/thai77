import { pwaStore } from './pwaStore';
import { handleLoadFailure } from './reloadGuard';

const CHECK_EVERY_MS = 30 * 60 * 1000;
let registration: ServiceWorkerRegistration | null = null;
let lastCheck = Date.now();

const baseUrl = () => import.meta.env.BASE_URL;
const switchedOff = () => document.querySelector('meta[name="thai77-pwa"]')?.getAttribute('content') === 'off';

/** remove every trace of the app's workers and caches (used by the emergency switch and by "reset app") */
export async function removeWorkersAndCaches(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    for (const r of regs ?? []) if (new URL(r.scope).pathname === baseUrl()) await r.unregister();
  } catch { /* ignore */ }
  try {
    for (const k of await caches.keys()) if (k.startsWith('thai77-')) await caches.delete(k);
  } catch { /* ignore */ }
}

function watch(reg: ServiceWorkerRegistration) {
  const check = () => {
    if (reg.waiting && navigator.serviceWorker.controller) pwaStore.set({ updateReady: true });
  };
  check();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
  });
}

/** ask the server for a newer worker when the app comes back to the screen (installed apps can stay open for days) */
function checkOnReturn(reg: ServiceWorkerRegistration) {
  const run = () => {
    if (document.visibilityState === 'hidden' || Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => { /* offline */ });
  };
  document.addEventListener('visibilitychange', run);
  window.addEventListener('online', run);
}

export function startPwa(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  pwaStore.set({ supported: true });
  // no worker while developing, and none under automated browser tests (they would hide requests from the test tools)
  if (import.meta.env.DEV || navigator.webdriver) return;

  if (switchedOff()) {
    pwaStore.set({ disabled: true });
    void removeWorkersAndCaches();
    return;
  }

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${baseUrl()}sw.js`, { scope: baseUrl(), updateViaCache: 'none' });
      registration = reg;
      watch(reg);
      checkOnReturn(reg);
      void navigator.serviceWorker.ready.then(() => pwaStore.set({ offlineReady: true }));
    } catch (e) {
      console.error('[thai77] service worker failed', (e as Error).message);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });

  // a lazy file of the old build is gone after a deploy: reload once (never in a loop)
  window.addEventListener('vite:preloadError', (e) => {
    const reloaded = handleLoadFailure({ storage: window.sessionStorage, now: Date.now(), reload: () => window.location.reload() });
    if (reloaded) e.preventDefault();
  });
}

/** the user pressed "update": the waiting worker takes over, then the page reloads once */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) { window.location.reload(); return; }
  let done = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (done) return;
    done = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
