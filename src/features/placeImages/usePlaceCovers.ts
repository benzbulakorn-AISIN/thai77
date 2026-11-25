import { useEffect, useState } from 'react';
import { fetchCovers } from './placeImagesApi';
import { fetchAutomaticCommonsCover, type AutomaticCoverRequest } from './autoCovers';
import type { PlaceImage } from './imageModel';
import { joinPendingBatch } from './sharedPending';

// Session cache is keyed by the full request shape. A database-only lookup that
// found no image must not block a later name-aware automatic lookup for the
// same place id.
const cache = new Map<string, PlaceImage | null>();
// Each request key points to the batch that is already loading it. Components
// must be able to join that Promise: React StrictMode mounts an effect, cleans
// it up, then mounts it again in development. A plain Set would make the second
// effect return early while the first (now dead) effect owns every state update.
const pending = new Map<string, Promise<void>>();
const subscribers = new Set<() => void>();
let cacheGeneration = 0;

const emitCacheChange = () => {
  for (const notify of subscribers) notify();
};

const specKey = (spec: { id: string } | AutomaticCoverRequest) => {
  if (!('nameTh' in spec)) return `saved:${spec.id}`;
  return [
    'automatic', spec.id, spec.nameTh, spec.nameEn ?? '', ...(spec.aliases ?? []),
    spec.provinceTh ?? '', spec.provinceEn ?? '', ...(spec.provinceAliases ?? []),
  ].join('\u001f');
};

/** call after Admin changes pictures */
export function clearCoverCache() {
  cacheGeneration += 1;
  cache.clear();
  pending.clear();
  emitCacheChange();
}

async function runWithLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Load a batch once and publish each successful automatic image as it arrives. */
async function loadSpecs(specs: ({ id: string } | AutomaticCoverRequest)[], generation: number) {
  let saved = new Map<string, PlaceImage>();
  try {
    saved = await fetchCovers(specs.map((x) => x.id));
  } catch {
    // The licensed automatic fallback is still useful when the saved-cover
    // request is temporarily unavailable.
  }
  if (generation !== cacheGeneration) return;

  specs.forEach((x) => cache.set(specKey(x), saved.get(x.id) ?? null));
  emitCacheChange();

  const automatic = specs.filter((x): x is AutomaticCoverRequest =>
    !saved.has(x.id) && 'nameTh' in x && Boolean(x.nameTh.trim()));
  await runWithLimit(automatic, 3, async (request) => {
    const image = await fetchAutomaticCommonsCover(request);
    if (generation !== cacheGeneration) return;
    cache.set(specKey(request), image);
    if (image) emitCacheChange();
  });
}

/**
 * Start any missing keys and return a Promise shared by every interested
 * effect. Sharing the Promise (instead of just marking keys as "loading") is
 * what keeps React StrictMode's second effect subscribed to the result.
 */
function ensureLoaded(specs: ({ id: string } | AutomaticCoverRequest)[]): Promise<void> {
  const missing = specs.filter((x) => !cache.has(specKey(x)));
  const byKey = new Map(missing.map((x) => [specKey(x), x]));
  return joinPendingBatch(pending, [...byKey.keys()], async (freshKeys) => {
    const fresh = freshKeys.map((key) => byKey.get(key)).filter((x): x is { id: string } | AutomaticCoverRequest => Boolean(x));
    const generation = cacheGeneration;
    try {
      await loadSpecs(fresh, generation);
    } catch {
      if (generation !== cacheGeneration) return;
      fresh.forEach((x) => {
        const k = specKey(x);
        if (!cache.has(k)) cache.set(k, null);
      });
    }
  });
}

/**
 * Cover pictures for a list of places. Approved Supabase pictures always win.
 * When a name is supplied and no saved picture exists, an exact
 * Wikipedia/Wikidata lead image is validated through Commons (three requests
 * at a time) and cached for this browser session. Plain string ids retain the
 * old database-only mode.
 */
export function usePlaceCovers(input: (string | AutomaticCoverRequest)[]): Map<string, PlaceImage> {
  const [revision, bump] = useState(0);
  const specs = input.map((x) => typeof x === 'string' ? { id: x } : x);
  const ids = specs.map((x) => x.id);
  const keys = specs.map(specKey);
  const key = keys.join(',');

  useEffect(() => {
    let alive = true;
    const rerender = () => { if (alive) bump((n) => n + 1); };
    subscribers.add(rerender);

    const missing = specs.filter((x) => !cache.has(specKey(x)));
    if (missing.length) void ensureLoaded(missing).finally(rerender);

    return () => { alive = false; subscribers.delete(rerender); };
    // revision intentionally re-checks the cache after Admin clears it or an
    // in-flight batch publishes another result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  const out = new Map<string, PlaceImage>();
  for (let i = 0; i < ids.length; i += 1) {
    const v = cache.get(keys[i]);
    if (v) out.set(ids[i], v);
  }
  return out;
}
