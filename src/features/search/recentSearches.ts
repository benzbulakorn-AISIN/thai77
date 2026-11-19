import { cleanQuery } from './searchModel';

export const RECENT_KEY = 'thai77.search.recent';
export const MAX_RECENT = 6;

const sameKey = (s: string) => s.toLowerCase();

/** newest first, no duplicates (case-insensitive), only searches that are long enough */
export function addRecent(list: string[], raw: string, max = MAX_RECENT): string[] {
  const c = cleanQuery(raw);
  if (!c.valid) return list.slice(0, max);
  const rest = list.filter((x) => sameKey(x) !== sameKey(c.q));
  return [c.q, ...rest].slice(0, max);
}

export const removeRecent = (list: string[], q: string): string[] => list.filter((x) => sameKey(x) !== sameKey(q));

/** read from localStorage text; anything unexpected is ignored */
export function parseRecent(json: string | null | undefined, max = MAX_RECENT): string[] {
  if (!json) return [];
  let v: unknown;
  try { v = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const c = cleanQuery(x);
    if (c.valid && !out.some((o) => sameKey(o) === sameKey(c.q))) out.push(c.q);
    if (out.length >= max) break;
  }
  return out;
}

export function loadRecent(): string[] {
  try { return parseRecent(localStorage.getItem(RECENT_KEY)); } catch { return []; }
}
export function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* private mode */ }
}
