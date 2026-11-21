import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { MapStatus } from '../map/colors';

export type Region = { id: string; code: string; name_th: string; sort_order: number };
export type Province = {
  id: string; pcode: string; slug: string; name_th: string; name_en: string;
  region_id: string; best_season: string | null; summary: string | null;
};
export type District = { id: string; pcode: string; name_th: string; name_en: string };
export type ProvinceLandmarkStatus = 'building' | 'never_visited' | 'stopped_by' | 'arrived';
export type ProvinceStat = {
  total: number; planned: number; visited: number; target: number;
  landmarkStatus?: ProvinceLandmarkStatus;
  hasPublishedLandmark?: boolean;
};

// reference data rarely changes -> cache for the session
let refCache: Promise<{ regions: Region[]; provinces: Province[] }> | null = null;

function loadReference() {
  if (!refCache) {
    refCache = Promise.all([
      supabase.from('regions').select('id,code,name_th,sort_order').order('sort_order'),
      supabase.from('provinces').select('id,pcode,slug,name_th,name_en,region_id,best_season,summary').order('name_th'),
    ]).then(([r, p]) => {
      if (r.error || p.error) throw new Error('โหลดข้อมูลจังหวัดไม่สำเร็จ');
      return { regions: (r.data ?? []) as Region[], provinces: (p.data ?? []) as Province[] };
    });
    refCache.catch(() => { refCache = null; });
  }
  return refCache;
}

export function useReference() {
  const [state, setState] = useState<{ regions: Region[]; provinces: Province[]; error: string | null; loading: boolean }>(
    { regions: [], provinces: [], error: null, loading: true },
  );
  useEffect(() => {
    let alive = true;
    loadReference()
      .then((d) => alive && setState({ ...d, error: null, loading: false }))
      .catch((e: Error) => alive && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => { alive = false; };
  }, []);
  return state;
}

/** Per-province counts keyed by province id. */
export function useProvinceStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Record<string, ProvinceStat>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const acc: Record<string, ProvinceStat> = {};
      const get = (id: string) => (acc[id] ??= { total: 0, planned: 0, visited: 0, target: 0 });

       const [places, landmarkStates] = await Promise.all([
         supabase.from('places').select('province_id').range(0, 9999),
         supabase.from('my_province_landmark_status').select('province_id,has_published_landmark,province_status'),
       ]);
      ((places.data ?? []) as { province_id: string }[]).forEach((r) => { get(r.province_id).total++; });
       type LandmarkRow = { province_id: string; has_published_landmark: boolean; province_status: ProvinceLandmarkStatus };
       if (!landmarkStates.error) {
         ((landmarkStates.data ?? []) as unknown as LandmarkRow[]).forEach((r) => {
           const s = get(r.province_id);
           s.landmarkStatus = r.province_status;
           s.hasPublishedLandmark = r.has_published_landmark;
         });
       }

      if (user) {
        const [st, vis] = await Promise.all([
          supabase.from('user_place_status').select('place_id, status, places(province_id)').not('place_id', 'is', null),
          supabase.from('visited_places').select('province_id, place_id, place_name'),
        ]);
        const visitedKeys = new Set<string>();
        const markVisited = (provinceId: string, key: string) => {
          const k = `${provinceId}:${key}`;
          if (visitedKeys.has(k)) return;
          visitedKeys.add(k);
          get(provinceId).visited++;
        };
        type StRow = { place_id: string; status: string; places: { province_id: string } | null };
        ((st.data ?? []) as unknown as StRow[]).forEach((r) => {
          const pid = r.places?.province_id;
          if (!pid) return;
          if (r.status === 'planned') get(pid).planned++;
          if (r.status === 'want' || r.status === 'planned' || r.status === 'visited') get(pid).target++;
          if (r.status === 'visited') markVisited(pid, r.place_id);
        });
        ((vis.data ?? []) as { province_id: string | null; place_id: string | null; place_name: string }[]).forEach((r) => {
          if (r.province_id) markVisited(r.province_id, r.place_id ?? r.place_name);
        });
      }
      if (alive) setStats(acc);
    })();
    return () => { alive = false; };
  }, [user]);

  return stats;
}

export function statusOf(s: ProvinceStat | undefined, goalPct = 80): MapStatus {
  if (!s) return 'none';
  if (s.landmarkStatus === 'building') return 'building';
  if (s.landmarkStatus === 'never_visited') return 'never';
  if (s.landmarkStatus === 'stopped_by') return 'stopped';
  if (s.landmarkStatus === 'arrived') return 'arrived';
  if (s.visited > 0 && s.target > 0 && (s.visited / s.target) * 100 >= goalPct) return 'goal';
  if (s.visited > 0) return 'visited';
  if (s.planned > 0) return 'planned';
  return 'none';
}
