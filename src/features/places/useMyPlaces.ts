import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { MyPlaceState, UserStatus } from './types';

const EMPTY: MyPlaceState = { status: 'none', rating: null, favorite: false, lastVisited: null };

/** The signed-in user's status / favorite / last visit for central places. */
export function useMyPlaces() {
  const { user } = useAuth();
  const [map, setMap] = useState<Record<string, MyPlaceState>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setMap({}); return; }
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
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user]);

  const get = useCallback((id: string) => map[id] ?? EMPTY, [map]);

  const setStatus = useCallback(async (placeId: string, status: UserStatus) => {
    if (!user) throw new Error('login');
    const prev = map[placeId] ?? EMPTY;
    setMap((m) => ({ ...m, [placeId]: { ...prev, status } }));
    const { error } = await supabase.from('user_place_status')
      .upsert({ user_id: user.id, place_id: placeId, status }, { onConflict: 'user_id,place_id' });
    if (error) { setMap((m) => ({ ...m, [placeId]: prev })); throw error; }
  }, [user, map]);

  const toggleFavorite = useCallback(async (placeId: string) => {
    if (!user) throw new Error('login');
    const prev = map[placeId] ?? EMPTY;
    const next = !prev.favorite;
    setMap((m) => ({ ...m, [placeId]: { ...prev, favorite: next } }));
    const { error } = next
      ? await supabase.from('favorites').insert({ user_id: user.id, place_id: placeId })
      : await supabase.from('favorites').delete().eq('user_id', user.id).eq('place_id', placeId);
    if (error) { setMap((m) => ({ ...m, [placeId]: prev })); throw error; }
    return next;
  }, [user, map]);

  return { get, setStatus, toggleFavorite, loading, signedIn: Boolean(user) };
}
