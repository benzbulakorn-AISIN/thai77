import { supabase } from '../../lib/supabase';
import type { AnalyzedLandmarkLink, LandmarkLinkCtx } from './landmarkImportModel';

const fail = (message: string, error: unknown): never => {
  console.error('[thai77]', message, (error as { message?: string })?.message);
  throw new Error(message);
};

export async function loadLandmarkLinkContext(): Promise<LandmarkLinkCtx> {
  const [provinces, places] = await Promise.all([
    supabase.from('provinces').select('id,pcode,name_th').range(0, 199),
    supabase.from('places').select('id,name_th,province_id').range(0, 9999),
  ]);
  if (provinces.error ?? places.error) fail('โหลดข้อมูลสำหรับจับคู่ Landmark ไม่สำเร็จ', provinces.error ?? places.error);
  return {
    provinces: (provinces.data ?? []) as LandmarkLinkCtx['provinces'],
    places: (places.data ?? []) as LandmarkLinkCtx['places'],
  };
}

export type LandmarkLinkResult = {
  linked: number;
  failed: number;
  errors: { placeKey: string; message: string }[];
};

export async function linkLandmarkBundleRows(
  rows: AnalyzedLandmarkLink[],
  onProgress?: (done: number, total: number) => void,
): Promise<LandmarkLinkResult> {
  if (rows.some((r) => r.kind !== 'ready' || !r.placeId)) throw new Error('Preview ยังมีข้อผิดพลาด — จะไม่เชื่อมข้อมูล');
  const result: LandmarkLinkResult = { linked: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i, rows.length);
    const row = rows[i];
    const { error } = await supabase.rpc('admin_link_province_landmark', {
      p_place: row.placeId,
      p_province_pcode: row.item.province_pcode,
      p_place_key: row.item.place_key,
      p_rank: row.item.landmark_rank,
      p_reason: row.item.landmark_reason_th,
      p_sources: row.item.sources,
      p_image: row.item.image,
    });
    if (error) {
      result.failed++;
      result.errors.push({ placeKey: row.item.place_key, message: (error as { message?: string }).message ?? 'เชื่อมไม่สำเร็จ' });
    } else result.linked++;
  }
  onProgress?.(rows.length, rows.length);
  return result;
}

export type LandmarkStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type LandmarkAdminRow = {
  id: string;
  province_id: string;
  place_id: string;
  place_key: string;
  rank: number;
  landmark_reason_th: string;
  status: LandmarkStatus;
  is_published: boolean;
  admin_note: string | null;
  name_th: string;
  verification: 'verified' | 'pending' | 'outdated' | 'demo';
  place_is_published: boolean;
  cover_image_id: string | null;
  image: {
    source_url: string | null;
    external_url: string | null;
    image_status: 'approved' | 'license_verified_visual_pending' | 'missing' | 'rejected_as_cover';
    license: string;
    author: string | null;
    alt_th: string | null;
    review_note: string | null;
  } | null;
};

type LandmarkDb = Omit<LandmarkAdminRow, 'rank' | 'name_th' | 'verification' | 'place_is_published' | 'cover_image_id' | 'image'> & { landmark_rank: number };
type PlaceDb = { id: string; name_th: string; verification: LandmarkAdminRow['verification']; is_published: boolean; cover_image_id: string | null };
type ImageDb = NonNullable<LandmarkAdminRow['image']> & { place_id: string; review_key: string | null };

export async function listLandmarkAdminRows(): Promise<LandmarkAdminRow[]> {
  const landmarks = await supabase.from('province_landmarks')
    .select('id,province_id,place_id,place_key,landmark_rank,landmark_reason_th,status,is_published,admin_note')
    .order('province_id').order('landmark_rank').range(0, 999);
  if (landmarks.error) fail('โหลด Landmark ไม่สำเร็จ — ตรวจว่า Migration 012 รันแล้ว', landmarks.error);
  const raw = (landmarks.data ?? []) as unknown as LandmarkDb[];
  if (!raw.length) return [];
  const ids = raw.map((r) => r.place_id);
  const [places, images] = await Promise.all([
    supabase.from('places').select('id,name_th,verification,is_published,cover_image_id').in('id', ids),
    supabase.from('place_images')
      .select('place_id,review_key,source_url,external_url,image_status,license,author,alt_th,review_note')
      .in('place_id', ids).not('review_key', 'is', null),
  ]);
  if (places.error ?? images.error) fail('โหลดข้อมูลประกอบ Landmark ไม่สำเร็จ', places.error ?? images.error);
  const placeMap = new Map(((places.data ?? []) as unknown as PlaceDb[]).map((p) => [p.id, p]));
  const imageMap = new Map(((images.data ?? []) as unknown as ImageDb[]).map((i) => [i.place_id, i]));
  return raw.flatMap((r) => {
    const p = placeMap.get(r.place_id);
    if (!p) return [];
    const image = imageMap.get(r.place_id) ?? null;
    return [{
      ...r,
      rank: r.landmark_rank,
      name_th: p.name_th,
      verification: p.verification,
      place_is_published: p.is_published,
      cover_image_id: p.cover_image_id,
      image: image ? {
        source_url: image.source_url,
        external_url: image.external_url,
        image_status: image.image_status,
        license: image.license,
        author: image.author,
        alt_th: image.alt_th,
        review_note: image.review_note,
      } : null,
    }];
  });
}

export async function reviewProvinceLandmark(o: {
  id: string; rank: number; reason: string; status: 'pending' | 'rejected'; note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_review_province_landmark', {
    p_id: o.id, p_rank: o.rank, p_reason: o.reason, p_status: o.status, p_note: o.note ?? null,
  });
  if (error) fail('บันทึกการตรวจ Landmark ไม่สำเร็จ', error);
}

export async function publishProvinceLandmark(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_publish_province_landmark', { p_id: id });
  if (error) fail('เผยแพร่ไม่ได้ — สถานที่ต้อง verified และเผยแพร่ก่อน', error);
}

export async function unpublishProvinceLandmark(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_unpublish_province_landmark', { p_id: id });
  if (error) fail('ยกเลิกเผยแพร่ Landmark ไม่สำเร็จ', error);
}
