import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { clearWant, fetchWantPlaces, type WantPlace } from './exploreApi';

/** The signed-in user's "ที่สนใจ" (status = อยากไป) places. Empty for guests. */
export function useWantList() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<WantPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<WantPlace[]>([]);
  latest.current = items;

  useEffect(() => {
    if (!uid) { setItems([]); setError(null); return; }
    let alive = true;
    setLoading(true);
    fetchWantPlaces()
      .then((d) => { if (alive) { setItems(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  const remove = useCallback(async (placeId: string) => {
    if (!uid) return;
    const before = latest.current;
    setItems(before.filter((x) => x.id !== placeId));
    try {
      await clearWant(uid, placeId);
    } catch (e) {
      setItems(before);
      throw e;
    }
  }, [uid]);

  return { items, loading, error, remove, signedIn: uid !== null };
}
