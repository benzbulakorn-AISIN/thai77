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
export type ProvinceStat = { total: number; planned: number; visited: number; target: number };

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

      const places = await supabase.from('places').select('province_id').range(0, 9999);
      ((places.data ?? []) as { province_id: string }[]).forEach((r) => { get(r.province_id).total++; });

      if (user) {
        const [st, vis] = await Promise.all([
          supabase.from('user_place_status').select('status, places(province_id)').not('place_id', 'is', null),
          supabase.from('visited_places').select('province_id, place_id, place_name'),
        ]);
        type StRow = { status: string; places: { province_id: string } | null };
        ((st.data ?? []) as unknown as StRow[]).forEach((r) => {
          const pid = r.places?.province_id;
          if (!pid) return;
          if (r.status === 'planned') get(pid).planned++;
          if (r.status === 'want' || r.status === 'planned' || r.status === 'visited') get(pid).target++;
        });
        const seen = new Set<string>();
        ((vis.data ?? []) as { province_id: string | null; place_id: string | null; place_name: string }[]).forEach((r) => {
          if (!r.province_id) return;
          const key = `${r.province_id}:${r.place_id ?? r.place_name}`;
          if (seen.has(key)) return;
          seen.add(key);
          get(r.province_id).visited++;
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
  if (s.visited > 0 && s.target > 0 && (s.visited / s.target) * 100 >= goalPct) return 'goal';
  if (s.visited > 0) return 'visited';
  if (s.planned > 0) return 'planned';
  return 'none';
}
