import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { AUTH_LOADING_ERROR, GUEST_FULL_ERROR, toMyState } from '../guest/guestModel';
import { guestStore, useGuestPlaces } from '../guest/guestStore';
import type { MyPlaceState, UserStatus } from './types';

const EMPTY: MyPlaceState = { status: 'none', rating: null, favorite: false, lastVisited: null };

/**
 * Status / favourite of every place for the current visitor.
 *  - signed in: read and written in Supabase
 *  - guest:     kept on this device (see features/guest); moved into the account after sign-in
 */
export function useMyPlaces() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.id ?? null;
  const guest = useGuestPlaces();
  const [map, setMap] = useState<Record<string, MyPlaceState>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) { setMap({}); return; }
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase.from('user_place_status').select('place_id,status,personal_rating').not('place_id', 'is', null),
      supabase.from('favorites').select('place_id').not('place_id', 'is', null),
      supabase.from('visited_places').select('place_id,visited_on').not('place_id', 'is', null),
    ]).then(([st, fav, vis]) => {
      if (!alive) return;
      const m: Record<string, MyPlaceState> = {};
      const get = (id: string) => (m[id] ??= { ...EMPTY });
      ((st.data ?? []) as { place_id: string; status: UserStatus; personal_rating: number | null }[]).forEach((r) => {
        const s = get(r.place_id); s.status = r.status; s.rating = r.personal_rating;
      });
      ((fav.data ?? []) as { place_id: string }[]).forEach((r) => { get(r.place_id).favorite = true; });
      ((vis.data ?? []) as { place_id: string; visited_on: string }[]).forEach((r) => {
        const s = get(r.place_id);
        if (!s.lastVisited || r.visited_on > s.lastVisited) s.lastVisited = r.visited_on;
        if (s.status === 'none') s.status = 'visited';
      });
      setMap(m);
    }).catch(() => { /* the lists simply stay empty; the next visit tries again */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  const get = useCallback(
    (id: string): MyPlaceState => (uid ? map[id] ?? EMPTY : toMyState(guest.items[id.toLowerCase()])),
    [uid, map, guest.items],
  );

  const setStatus = useCallback(async (placeId: string, status: UserStatus) => {
    if (authLoading) throw new Error(AUTH_LOADING_ERROR); // do not guess "guest" before we know
    if (!uid) {
      const err = guestStore.setStatus(placeId, status);
      if (err === 'full') throw new Error(GUEST_FULL_ERROR);
      if (err) throw new Error(err);
      return;
    }
    const prev = map[placeId] ?? EMPTY;
    setMap((m) => ({ ...m, [placeId]: { ...prev, status } }));
    const { error } = await supabase.from('user_place_status')
      .upsert({ user_id: uid, place_id: placeId, status }, { onConflict: 'user_id,place_id' });
    if (error) { setMap((m) => ({ ...m, [placeId]: prev })); throw error; }
  }, [authLoading, uid, map]);

  const toggleFavorite = useCallback(async (placeId: string) => {
    if (authLoading) throw new Error(AUTH_LOADING_ERROR);
    if (!uid) {
      const r = guestStore.toggleFavorite(placeId);
      if (r.error === 'full') throw new Error(GUEST_FULL_ERROR);
      if (r.error) throw new Error(r.error);
      return r.favorite;
    }
    const prev = map[placeId] ?? EMPTY;
    const next = !prev.favorite;
    setMap((m) => ({ ...m, [placeId]: { ...prev, favorite: next } }));
    const { error } = next
      ? await supabase.from('favorites').insert({ user_id: uid, place_id: placeId })
      : await supabase.from('favorites').delete().eq('user_id', uid).eq('place_id', placeId);
    if (error) { setMap((m) => ({ ...m, [placeId]: prev })); throw error; }
    return next;
  }, [authLoading, uid, map]);

  /** `signedIn` stays truthful; guests can save too, but only on this device */
  return { get, setStatus, toggleFavorite, loading, signedIn: uid !== null, guest: uid === null };
}
