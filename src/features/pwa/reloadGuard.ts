// "A file of the app could not be loaded (it was replaced by a new deploy)": reload ONCE, never in a loop.
export const RELOAD_KEY = 'thai77.reloaded.at';
export const RELOAD_WINDOW_MS = 30_000;

/** true when the last automatic reload is unknown, older than the window, or "in the future" (clock changed) */
export function shouldAutoReload(lastMs: number | null | undefined, now: number, windowMs = RELOAD_WINDOW_MS): boolean {
  if (lastMs == null || !Number.isFinite(lastMs)) return true;
  const age = now - lastMs;
  return age < 0 || age >= windowMs;
}

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** returns true when it asked for a reload */
export function handleLoadFailure(o: { storage: Storage | null; now: number; reload: () => void }): boolean {
  let last: number | null = null;
  try { const v = o.storage?.getItem(RELOAD_KEY); last = v == null ? null : Number(v); } catch { /* private mode */ }
  if (!shouldAutoReload(last, o.now)) return false;
  try { o.storage?.setItem(RELOAD_KEY, String(o.now)); } catch { /* private mode: without a stored time we still reload once per page load */ }
  o.reload();
  return true;
}
