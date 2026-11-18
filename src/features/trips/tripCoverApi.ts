import { supabase } from '../../lib/supabase';
import { PHOTO_BUCKET, signUrls } from '../memories/memoriesApi';
import { ownsCoverPath, tripCoverPath } from './tripCoverModel';

export const TRIP_COVER_BUCKET = 'trip-covers';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}

export async function fetchTripCoverPaths(tripIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < tripIds.length; i += 100) {
    const { data } = await supabase.from('trips').select('id,cover_path').in('id', tripIds.slice(i, i + 100));
    ((data ?? []) as unknown as { id: string; cover_path: string | null }[]).forEach((r) => { if (r.cover_path) out.set(r.id, r.cover_path); });
  }
  return out;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signTripCovers(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths)) {
    const c = urlCache.get(p);
    if (c && c.exp > now) out.set(p, c.url); else need.push(p);
  }
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await supabase.storage.from(TRIP_COVER_BUCKET).createSignedUrls(need.slice(i, i + 100), 3600);
    for (const r of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
      if (r.path && r.signedUrl) { out.set(r.path, r.signedUrl); urlCache.set(r.path, { url: r.signedUrl, exp: now + 50 * 60 * 1000 }); }
    }
  }
  return out;
}

export type MyPhoto = { id: string; storage_path: string; url: string };

/** my newest memory photos (to pick a trip cover from) */
export async function listMyPhotos(limit = 60): Promise<MyPhoto[]> {
  const { data, error } = await supabase.from('memory_photos').select('id,storage_path').order('created_at', { ascending: false }).limit(limit);
  if (error) fail('โหลดรูปความทรงจำไม่สำเร็จ', error);
  const rows = (data ?? []) as unknown as { id: string; storage_path: string }[];
  const urls = await signUrls(rows.map((r) => r.storage_path));
  return rows.flatMap((r) => { const u = urls.get(r.storage_path); return u ? [{ id: r.id, storage_path: r.storage_path, url: u }] : []; });
}

/** copy a memory photo into trip-covers and make it the trip's cover (the old cover file is deleted) */
export async function setTripCoverFromMemory(o: { userId: string; tripId: string; memoryPath: string; oldPath: string | null }): Promise<string> {
  const dl = await supabase.storage.from(PHOTO_BUCKET).download(o.memoryPath);
  if (dl.error || !dl.data) fail('ดึงรูปไม่สำเร็จ', dl.error);
  const blob = dl.data as Blob;
  const path = tripCoverPath(o.userId, o.tripId, crypto.randomUUID(), blob.type || 'image/webp');
  const up = await supabase.storage.from(TRIP_COVER_BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false });
  if (up.error) fail('อัปโหลดปกไม่สำเร็จ', up.error);
  const { error } = await supabase.from('trips').update({ cover_path: path }).eq('id', o.tripId);
  if (error) {
    await supabase.storage.from(TRIP_COVER_BUCKET).remove([path]);
    fail('บันทึกปกไม่สำเร็จ', error);
  }
  if (ownsCoverPath(o.oldPath, o.userId)) await supabase.storage.from(TRIP_COVER_BUCKET).remove([o.oldPath as string]);
  return path;
}

/** back to the automatic cover */
export async function clearTripCover(o: { userId: string; tripId: string; oldPath: string | null }): Promise<void> {
  const { error } = await supabase.from('trips').update({ cover_path: null }).eq('id', o.tripId);
  if (error) fail('บันทึกไม่สำเร็จ', error);
  if (ownsCoverPath(o.oldPath, o.userId)) await supabase.storage.from(TRIP_COVER_BUCKET).remove([o.oldPath as string]);
}
