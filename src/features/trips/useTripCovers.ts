import { useCallback, useEffect, useState } from 'react';
import { fetchTripCoverPaths, signTripCovers } from './tripCoverApi';

/** Signed URLs of the trips' chosen cover pictures (trips without one are simply missing from the maps). */
export function useTripCovers(tripIds: string[]) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [paths, setPaths] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);
  const key = tripIds.join(',');

  useEffect(() => {
    if (!tripIds.length) { setUrls(new Map()); setPaths(new Map()); return; }
    let alive = true;
    (async () => {
      const p = await fetchTripCoverPaths(tripIds);
      const signed = await signTripCovers([...p.values()]);
      const u = new Map<string, string>();
      p.forEach((path, id) => { const s = signed.get(path); if (s) u.set(id, s); });
      if (alive) { setPaths(p); setUrls(u); }
    })().catch(() => { /* automatic covers stay */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { urls, paths, refresh };
}
