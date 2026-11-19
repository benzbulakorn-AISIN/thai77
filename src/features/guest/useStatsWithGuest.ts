import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useProvinceStats } from '../provinces/useGeoData';
import { statusEntries, statusKey } from './guestModel';
import { overlayStats, tallyGuest } from './guestStats';
import { useGuestPlaces } from './guestStore';

type Stat = ReturnType<typeof useProvinceStats>[string];
const BLANK = { total: 0, planned: 0, visited: 0, target: 0 } as Stat;

/**
 * useProvinceStats() + the guest's own marks (want / visited kept on this device).
 * Signed in: exactly what useProvinceStats() returns.
 */
export function useProvinceStatsWithGuest() {
  const base = useProvinceStats();
  const { user } = useAuth();
  const guest = useGuestPlaces();
  const key = statusKey(guest.items);
  const guestOn = !user && key !== '';
  const [provinceOf, setProvinceOf] = useState<Map<string, string>>(new Map());

  // which province each marked place belongs to (places are public); remembered for the session
  useEffect(() => {
    if (!guestOn) return;
    const ids = statusEntries(guest.items).map(([id]) => id).filter((id) => !provinceOf.has(id));
    if (!ids.length) return;
    let alive = true;
    (async () => {
      const found = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('places').select('id,province_id').in('id', ids.slice(i, i + 100));
        ((data ?? []) as unknown as { id: string; province_id: string }[]).forEach((r) => found.set(r.id, r.province_id));
      }
      if (alive && found.size) setProvinceOf((m) => new Map([...m, ...found]));
    })().catch(() => { /* the colours simply do not include the guest's marks until the next visit */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestOn, key]);

  return useMemo(
    () => (guestOn ? overlayStats(base, tallyGuest(statusEntries(guest.items), provinceOf), BLANK) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, guestOn, key, provinceOf],
  );
}
