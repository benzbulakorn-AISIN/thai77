import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { wantIds } from '../guest/guestModel';
import { guestStore, useGuestPlaces } from '../guest/guestStore';
import { clearWant, fetchPlacesByIds, fetchWantPlaces, type WantPlace } from './exploreApi';

/** "ที่สนใจ" (status = อยากไป): from the account when signed in, from this device for a guest. */
export function useWantList() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const guest = useGuestPlaces();

  // ----- signed in
  const [serverItems, setServerItems] = useState<WantPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<WantPlace[]>([]);
  latest.current = serverItems;

  useEffect(() => {
    if (!uid) { setServerItems([]); setError(null); return; }
    let alive = true;
    setLoading(true);
    fetchWantPlaces()
      .then((d) => { if (alive) { setServerItems(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  // ----- guest: ids on the device, details from the server (kept for the session; null = not found / hidden)
  const ids = useMemo(() => wantIds(guest.items), [guest.items]);
  const idsKey = ids.join(',');
  const cache = useRef(new Map<string, WantPlace | null>());
  const [cacheRev, setCacheRev] = useState(0);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) return;
    const missing = ids.filter((id) => !cache.current.has(id));
    if (!missing.length) return;
    let alive = true;
    setGuestLoading(true);
    fetchPlacesByIds(missing)
      .then((rows) => {
        if (!alive) return;
        missing.forEach((id) => cache.current.set(id, null));
        rows.forEach((r) => cache.current.set(r.id, r));
        setGuestError(null);
        setCacheRev((n) => n + 1);
      })
      .catch((e: Error) => { if (alive) setGuestError(e.message); })
      .finally(() => { if (alive) setGuestLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, idsKey]);

  const guestItems = useMemo(
    () => ids.flatMap((id) => { const p = cache.current.get(id); return p ? [p] : []; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, cacheRev],
  );

  const remove = useCallback(async (placeId: string) => {
    if (!uid) {
      const err = guestStore.setStatus(placeId, 'none');
      if (err) throw new Error(err);
      return;
    }
    const before = latest.current;
    setServerItems(before.filter((x) => x.id !== placeId));
    try {
      await clearWant(uid, placeId);
    } catch (e) {
      setServerItems(before);
      throw e;
    }
  }, [uid]);

  return uid
    ? { items: serverItems, loading, error, remove, signedIn: true }
    : { items: guestItems, loading: guestLoading, error: guestError, remove, signedIn: false };
}
