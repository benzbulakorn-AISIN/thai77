import { useEffect, useState } from 'react';
import { fetchCovers } from './placeImagesApi';
import type { PlaceImage } from './imageModel';

// session cache: null = checked, this place has no picture
const cache = new Map<string, PlaceImage | null>();

/** call after Admin changes pictures */
export function clearCoverCache() {
  cache.clear();
}

/** Cover pictures for a list of places (one request per batch, results remembered for the session). */
export function usePlaceCovers(ids: string[]): Map<string, PlaceImage> {
  const [, bump] = useState(0);
  const key = ids.join(',');

  useEffect(() => {
    const missing = ids.filter((id) => !cache.has(id));
    if (!missing.length) return;
    let alive = true;
    fetchCovers(missing)
      .then((m) => {
        missing.forEach((id) => cache.set(id, m.get(id) ?? null));
        if (alive) bump((n) => n + 1);
      })
      .catch(() => { /* not cached: automatic covers are shown instead */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const out = new Map<string, PlaceImage>();
  for (const id of ids) {
    const v = cache.get(id);
    if (v) out.set(id, v);
  }
  return out;
}
