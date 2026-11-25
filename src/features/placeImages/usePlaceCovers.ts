import { useEffect, useState } from 'react';
import { fetchCovers } from './placeImagesApi';
import type { PlaceImage } from './imageModel';
import { approvedCoverIds, type ReviewedCoverRequest } from './reviewedCovers';
import { joinPendingBatch } from './sharedPending';

// One cache entry per place id. A null entry means Supabase returned no
// approved row, so the card can immediately use its local illustration.
const cache = new Map<string, PlaceImage | null>();
const pending = new Map<string, Promise<void>>();
const subscribers = new Set<() => void>();
let cacheGeneration = 0;

const emitCacheChange = () => {
  for (const notify of subscribers) notify();
};

/** Call after Admin changes pictures. */
export function clearCoverCache() {
  cacheGeneration += 1;
  cache.clear();
  pending.clear();
  emitCacheChange();
}

async function loadIds(ids: readonly string[], generation: number) {
  const saved = await fetchCovers([...ids]);
  if (generation !== cacheGeneration) return;
  ids.forEach((id) => cache.set(id, saved.get(id) ?? null));
  emitCacheChange();
}

/** Share one Supabase batch between all mounted card lists, including StrictMode remounts. */
function ensureLoaded(ids: readonly string[]): Promise<void> {
  const missing = [...new Set(ids.filter((id) => !cache.has(id)))];
  return joinPendingBatch(pending, missing, async (freshIds) => {
    const generation = cacheGeneration;
    try {
      await loadIds(freshIds, generation);
    } catch {
      if (generation !== cacheGeneration) return;
      freshIds.forEach((id) => {
        if (!cache.has(id)) cache.set(id, null);
      });
    }
  });
}

/**
 * Approved cover pictures from Supabase for a list of places. Place names are
 * accepted for backward-compatible callers but are not used for network image
 * discovery. No row means the existing local illustration remains visible.
 */
export function usePlaceCovers(input: ReviewedCoverRequest[]): Map<string, PlaceImage> {
  const [revision, bump] = useState(0);
  const ids = approvedCoverIds(input);
  const key = ids.join(',');

  useEffect(() => {
    let alive = true;
    const rerender = () => { if (alive) bump((n) => n + 1); };
    subscribers.add(rerender);

    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length) void ensureLoaded(missing).finally(rerender);

    return () => { alive = false; subscribers.delete(rerender); };
    // revision intentionally re-checks the cache after Admin clears it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  const out = new Map<string, PlaceImage>();
  ids.forEach((id) => {
    const image = cache.get(id);
    if (image) out.set(id, image);
  });
  return out;
}
