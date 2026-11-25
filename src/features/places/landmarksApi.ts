import { supabase } from '../../lib/supabase';

export type PublishedProvinceLandmark = {
  id: string;
  place_id: string;
  place_key: string;
  rank: number;
  landmark_reason_th: string;
  name_th: string;
  cover_url: string;
};

function bundledLandmarkCover(placeKey: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${base}landmark-covers/${encodeURIComponent(placeKey)}.jpg`;
}

/**
 * RLS returns only explicitly published Landmark rows. A second query reads the
 * referenced places; the existing places RLS independently hides any place
 * that is no longer published.
 */
export async function fetchPublishedLandmarksByProvince(provinceId: string): Promise<PublishedProvinceLandmark[]> {
  const landmarks = await supabase.from('province_landmarks')
    .select('id,place_id,place_key,landmark_rank,landmark_reason_th')
    .eq('province_id', provinceId)
    .eq('status', 'published')
    .eq('is_published', true)
    .order('landmark_rank')
    .range(0, 9);
  if (landmarks.error) throw new Error('โหลด Landmark ไม่สำเร็จ');
  const rows = (landmarks.data ?? []) as { id: string; place_id: string; place_key: string; landmark_rank: number; landmark_reason_th: string }[];
  if (!rows.length) return [];
  const places = await supabase.from('places').select('id,name_th').in('id', rows.map((r) => r.place_id));
  if (places.error) throw new Error('โหลดสถานที่ Landmark ไม่สำเร็จ');
  const names = new Map(((places.data ?? []) as { id: string; name_th: string }[]).map((p) => [p.id, p.name_th]));
  return rows.flatMap((r) => {
    const name = names.get(r.place_id);
    return name ? [{
      id: r.id,
      place_id: r.place_id,
      place_key: r.place_key,
      rank: r.landmark_rank,
      landmark_reason_th: r.landmark_reason_th,
      name_th: name,
      cover_url: bundledLandmarkCover(r.place_key),
    }] : [];
  });
}
