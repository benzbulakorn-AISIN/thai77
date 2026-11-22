import { supabase } from '../../lib/supabase';
import { compressImage, type Compressed } from '../memories/imageCompress';
import type { CommonsInfo } from './commons';
import {
  PLACE_IMAGE_BUCKET, chooseCover, isWikimediaUploadUrl, placeImagePath,
  type ImageMetaValue, type PlaceImage,
} from './imageModel';

const COLS = 'id,place_id,storage_path,external_url,license,author,source_url,alt_th,sort_order';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}

export const publicUrlOf = (path: string) => supabase.storage.from(PLACE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;

// ---------------- read (everyone) ----------------
export async function fetchPlaceImageSet(placeId: string): Promise<{ images: PlaceImage[]; coverId: string | null }> {
  const [i, p] = await Promise.all([
    supabase.from('place_images').select(COLS).eq('place_id', placeId).eq('image_status', 'approved').order('sort_order').order('created_at'),
    supabase.from('places').select('cover_image_id').eq('id', placeId).maybeSingle(),
  ]);
  if (i.error) fail('โหลดรูปไม่สำเร็จ', i.error);
  return {
    images: (i.data ?? []) as unknown as PlaceImage[],
    coverId: ((p.data as { cover_image_id: string | null } | null)?.cover_image_id) ?? null,
  };
}

/** cover picture of each place (places without pictures are simply missing from the map) */
export async function fetchCovers(placeIds: string[]): Promise<Map<string, PlaceImage>> {
  const out = new Map<string, PlaceImage>();
  const ids = [...new Set(placeIds)];
  for (let k = 0; k < ids.length; k += 100) {
    const chunk = ids.slice(k, k + 100);
    const [imgs, covers] = await Promise.all([
      supabase.from('place_images').select(COLS).in('place_id', chunk).eq('image_status', 'approved'),
      supabase.from('places').select('id,cover_image_id').in('id', chunk),
    ]);
    if (imgs.error) fail('โหลดรูปไม่สำเร็จ', imgs.error);
    const byPlace = new Map<string, PlaceImage[]>();
    for (const r of (imgs.data ?? []) as unknown as PlaceImage[]) byPlace.set(r.place_id, [...(byPlace.get(r.place_id) ?? []), r]);
    const coverOf = new Map(((covers.data ?? []) as unknown as { id: string; cover_image_id: string | null }[]).map((r) => [r.id, r.cover_image_id]));
    for (const [pid, list] of byPlace) {
      const c = chooseCover(list, coverOf.get(pid) ?? null);
      if (c) out.set(pid, c);
    }
  }
  return out;
}

// ---------------- write (Admin only — enforced by RLS) ----------------
export async function getPlaceBasics(placeId: string): Promise<{ id: string; name_th: string } | null> {
  const { data, error } = await supabase.from('places').select('id,name_th').eq('id', placeId).maybeSingle();
  if (error) fail('โหลดสถานที่ไม่สำเร็จ', error);
  return (data as { id: string; name_th: string } | null) ?? null;
}

async function insertRow(row: Omit<PlaceImage, 'id'>): Promise<PlaceImage> {
  const { data, error } = await supabase.from('place_images').insert(row).select(COLS).single();
  if (error || !data) fail('บันทึกรูปไม่สำเร็จ (ต้องเป็น Admin)', error);
  return data as unknown as PlaceImage;
}

export async function addUploadedImage(o: { placeId: string; comp: Compressed; meta: ImageMetaValue; sortOrder: number }): Promise<PlaceImage> {
  const path = placeImagePath(o.placeId, crypto.randomUUID(), o.comp.mime);
  const up = await supabase.storage.from(PLACE_IMAGE_BUCKET).upload(path, o.comp.blob, {
    contentType: o.comp.mime, upsert: false, cacheControl: '31536000', // file names are unique, so long caching is safe
  });
  if (up.error) fail('อัปโหลดรูปไม่สำเร็จ', up.error);
  try {
    return await insertRow({ place_id: o.placeId, storage_path: path, external_url: null, ...o.meta, sort_order: o.sortOrder });
  } catch (e) {
    await supabase.storage.from(PLACE_IMAGE_BUCKET).remove([path]); // keep storage and table in sync
    throw e;
  }
}

/** download the Wikimedia thumbnail (null when blocked / not an image / too big) */
async function downloadThumb(url: string): Promise<File | null> {
  if (!isWikimediaUploadUrl(url)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size === 0 || blob.size > 12 * 1024 * 1024) return null;
    return new File([blob], 'commons', { type: blob.type });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Add a Wikimedia Commons picture. Wikimedia recommends keeping your own copy instead of hot-linking
 * (files can be renamed or deleted), so with copy=true we download + resize + store it; if that is not possible
 * we fall back to linking the Wikimedia thumbnail. Credit + licence are stored either way.
 */
export async function addCommonsImage(o: {
  placeId: string; info: CommonsInfo; meta: ImageMetaValue; copy: boolean; sortOrder: number;
}): Promise<{ image: PlaceImage; mode: 'copy' | 'link' }> {
  if (o.copy) {
    const file = await downloadThumb(o.info.thumbUrl);
    if (file) {
      try {
        const comp = await compressImage(file);
        return { image: await addUploadedImage({ placeId: o.placeId, comp, meta: o.meta, sortOrder: o.sortOrder }), mode: 'copy' };
      } catch {
        /* fall through to link */
      }
    }
  }
  if (!isWikimediaUploadUrl(o.info.thumbUrl)) throw new Error('ลิงก์รูปไม่ถูกต้อง');
  const image = await insertRow({
    place_id: o.placeId, storage_path: null, external_url: o.info.thumbUrl, ...o.meta, sort_order: o.sortOrder,
  });
  return { image, mode: 'link' };
}

export async function deleteImage(img: PlaceImage): Promise<void> {
  const { error } = await supabase.from('place_images').delete().eq('id', img.id);
  if (error) fail('ลบรูปไม่สำเร็จ', error);
  if (img.storage_path) await supabase.storage.from(PLACE_IMAGE_BUCKET).remove([img.storage_path]); // best effort
}

export async function setCover(placeId: string, imageId: string | null): Promise<void> {
  const { error } = await supabase.from('places').update({ cover_image_id: imageId }).eq('id', placeId);
  if (error) fail('ตั้งรูปปกไม่สำเร็จ', error);
}
