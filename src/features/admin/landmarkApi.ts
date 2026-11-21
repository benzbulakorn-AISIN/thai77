import { supabase } from '../../lib/supabase';

export type LandmarkAdminRow = {
  id: string;
  place_key: string;
  name_th: string;
  province_id: string;
  landmark_rank: number;
  landmark_status: 'draft' | 'pending' | 'published' | 'rejected';
  verification: 'verified' | 'pending' | 'outdated' | 'demo';
  verified_at: string | null;
  is_published: boolean;
  cover_image_id: string | null;
  landmark_reason_th: string;
};

export type ImageReviewQueue = {
  place_id: string;
  commons_search_url: string;
  commons_page_url: string | null;
  license_status: 'pending' | 'approved' | 'rejected';
  image_status: string;
  cover_mode: 'actual' | 'auto_fallback';
};

export async function listLandmarkAdminRows(): Promise<{
  rows: LandmarkAdminRow[];
  imageQueue: Map<string, ImageReviewQueue>;
  candidateCounts: Map<string, number>;
}> {
  const [p, i, c] = await Promise.all([
    supabase.from('places')
      .select('id,place_key,name_th,province_id,landmark_rank,landmark_status,verification,verified_at,is_published,cover_image_id,landmark_reason_th')
      .eq('is_landmark', true).order('place_key').range(0, 999),
    supabase.from('place_image_review_queue')
      .select('place_id,commons_search_url,commons_page_url,license_status,image_status,cover_mode').eq('is_cover', true).range(0, 999),
    supabase.from('landmark_admin_candidates').select('province_id').range(0, 999),
  ]);
  if (p.error) throw new Error('โหลด Landmark ไม่สำเร็จ — ตรวจว่า Migration 012 และ seed_landmarks.sql รันแล้ว');
  if (i.error || c.error) throw new Error('โหลดคิวตรวจ Landmark ไม่สำเร็จ');
  const queue = new Map<string, ImageReviewQueue>();
  ((i.data ?? []) as unknown as ImageReviewQueue[]).forEach((r) => queue.set(r.place_id, r));
  const candidateCounts = new Map<string, number>();
  ((c.data ?? []) as { province_id: string }[]).forEach((r) => candidateCounts.set(r.province_id, (candidateCounts.get(r.province_id) ?? 0) + 1));
  return { rows: (p.data ?? []) as unknown as LandmarkAdminRow[], imageQueue: queue, candidateCounts };
}

export async function publishLandmark(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_publish_landmark', { p_place: id });
  if (error) throw new Error('เผยแพร่ Landmark ไม่สำเร็จ');
}

export async function unpublishLandmark(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_unpublish_landmark', { p_place: id });
  if (error) throw new Error('ยกเลิกเผยแพร่ Landmark ไม่สำเร็จ');
}
