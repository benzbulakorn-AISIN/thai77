import { supabase } from '../../lib/supabase';
import type { Compressed } from './imageCompress';

export const PHOTO_BUCKET = 'memory-photos';
export const MAX_PHOTOS = 10;

export type Visit = {
  id: string;
  user_id: string;
  place_id: string | null;
  user_place_id: string | null;
  province_id: string | null;
  place_name: string;
  trip_id: string | null;
  visited_on: string;
  rating: number | null;
  impression: string | null;
  notes: string | null;
  liked: string | null;
  caution: string | null;
  actual_cost: number | null;
  companions: string | null;
  want_return: boolean | null;
  cover_photo_id: string | null;
  share_with_trip: boolean;
};
export type VisitInput = Omit<Visit, 'id' | 'user_id' | 'cover_photo_id'>;
export type VisitRow = Visit & { category_id: string | null; trip_name: string | null };
export type Photo = { id: string; visited_place_id: string; storage_path: string; width: number | null; height: number | null; sort_order: number; url: string | null };

const COLS =
  'id,user_id,place_id,user_place_id,province_id,place_name,trip_id,visited_on,rating,impression,notes,liked,caution,' +
  'actual_cost,companions,want_return,cover_photo_id,share_with_trip';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}
const toVisit = (r: Record<string, unknown>): Visit => ({
  ...(r as unknown as Visit),
  actual_cost: r.actual_cost == null ? null : Number(r.actual_cost),
});

// ---------- signed URLs (private bucket), cached ~50 min ----------
const urlCache = new Map<string, { url: string; exp: number }>();
export async function signUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths)) {
    const c = urlCache.get(p);
    if (c && c.exp > now) out.set(p, c.url);
    else need.push(p);
  }
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(chunk, 3600);
    if (error) continue;
    for (const r of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
      if (r.path && r.signedUrl) {
        out.set(r.path, r.signedUrl);
        urlCache.set(r.path, { url: r.signedUrl, exp: now + 50 * 60 * 1000 });
      }
    }
  }
  return out;
}

// ---------- read ----------
export async function listVisits(): Promise<VisitRow[]> {
  const { data, error } = await supabase.from('visited_places')
    .select(`${COLS},places(category_id),user_places(category_id),trips(name)`)
    .order('visited_on', { ascending: false }).range(0, 1999);
  if (error) fail('โหลดความทรงจำไม่สำเร็จ', error);
  type Raw = Record<string, unknown> & { places: { category_id: string } | null; user_places: { category_id: string | null } | null; trips: { name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...toVisit(r),
    category_id: r.places?.category_id ?? r.user_places?.category_id ?? null,
    trip_name: r.trips?.name ?? null,
  }));
}

export async function listVisitsForPlace(placeId: string): Promise<Visit[]> {
  const { data, error } = await supabase.from('visited_places').select(COLS).eq('place_id', placeId).order('visited_on', { ascending: false });
  if (error) fail('โหลดประวัติการไปไม่สำเร็จ', error);
  return ((data ?? []) as Record<string, unknown>[]).map(toVisit);
}

/** cover (or first) photo URL for each visit */
export async function coverUrls(visits: Pick<Visit, 'id' | 'cover_photo_id'>[]): Promise<Map<string, string>> {
  const ids = visits.map((v) => v.id);
  const res = new Map<string, string>();
  if (!ids.length) return res;
  const rows: { id: string; visited_place_id: string; storage_path: string; sort_order: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('memory_photos').select('id,visited_place_id,storage_path,sort_order')
      .in('visited_place_id', ids.slice(i, i + 200)).order('sort_order');
    rows.push(...((data ?? []) as typeof rows));
  }
  const pick = new Map<string, string>();
  for (const v of visits) {
    const mine = rows.filter((r) => r.visited_place_id === v.id);
    const c = mine.find((r) => r.id === v.cover_photo_id) ?? mine[0];
    if (c) pick.set(v.id, c.storage_path);
  }
  const urls = await signUrls([...pick.values()]);
  pick.forEach((path, vid) => { const u = urls.get(path); if (u) res.set(vid, u); });
  return res;
}

export async function getVisit(id: string): Promise<{ visit: Visit; photos: Photo[] } | null> {
  const [v, p] = await Promise.all([
    supabase.from('visited_places').select(COLS).eq('id', id).maybeSingle(),
    supabase.from('memory_photos').select('id,visited_place_id,storage_path,width,height,sort_order').eq('visited_place_id', id).order('sort_order'),
  ]);
  if (v.error) fail('โหลดความทรงจำไม่สำเร็จ', v.error);
  if (!v.data) return null;
  const raw = (p.data ?? []) as Omit<Photo, 'url'>[];
  const urls = await signUrls(raw.map((r) => r.storage_path));
  return { visit: toVisit(v.data as Record<string, unknown>), photos: raw.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null })) };
}

// ---------- status sync ----------
async function setPlaceStatus(userId: string, placeId: string | null, userPlaceId: string | null, status: 'visited' | 'want', rating?: number | null) {
  const extra = rating ? { personal_rating: rating } : {};
  if (placeId) {
    await supabase.from('user_place_status').upsert({ user_id: userId, place_id: placeId, status, ...extra }, { onConflict: 'user_id,place_id' });
  } else if (userPlaceId) {
    const { data } = await supabase.from('user_place_status').select('id').eq('user_place_id', userPlaceId).maybeSingle();
    if (data) await supabase.from('user_place_status').update({ status, ...extra }).eq('id', (data as { id: string }).id);
    else await supabase.from('user_place_status').insert({ user_id: userId, user_place_id: userPlaceId, status, ...extra });
  }
}

// ---------- write ----------
export type SaveVisitArgs = {
  userId: string;
  id: string | null;
  input: VisitInput;
  removedPhotoIds: string[];
  added: Compressed[];
  startOrder: number;
  cover: { kind: 'existing'; id: string } | { kind: 'new'; index: number } | null;
  onProgress?: (done: number, total: number) => void;
};

export async function saveVisit(a: SaveVisitArgs): Promise<{ id: string; failed: number }> {
  let visitId = a.id;
  if (visitId) {
    const { error } = await supabase.from('visited_places').update(a.input).eq('id', visitId);
    if (error) fail('บันทึกไม่สำเร็จ', error);
  } else {
    const { data, error } = await supabase.from('visited_places').insert({ ...a.input, user_id: a.userId }).select('id').single();
    if (error || !data) fail('บันทึกไม่สำเร็จ', error);
    visitId = (data as { id: string }).id;
  }

  if (a.removedPhotoIds.length) {
    const { data } = await supabase.from('memory_photos').select('id,storage_path').in('id', a.removedPhotoIds);
    const paths = ((data ?? []) as { storage_path: string }[]).map((r) => r.storage_path);
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    await supabase.from('memory_photos').delete().in('id', a.removedPhotoIds);
  }

  const created: (string | null)[] = [];
  let failed = 0;
  for (let i = 0; i < a.added.length; i++) {
    a.onProgress?.(i, a.added.length);
    const p = a.added[i];
    const path = `${a.userId}/${visitId}/${crypto.randomUUID()}.${p.mime === 'image/webp' ? 'webp' : 'jpg'}`;
    const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, p.blob, { contentType: p.mime, upsert: false, cacheControl: '3600' });
    if (up.error) { failed++; created.push(null); continue; }
    const ins = await supabase.from('memory_photos').insert({
      user_id: a.userId, visited_place_id: visitId, storage_path: path, width: p.width, height: p.height,
      size_bytes: p.blob.size, mime_type: p.mime, sort_order: a.startOrder + i,
    }).select('id').single();
    if (ins.error || !ins.data) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]); // keep storage and table in sync
      failed++; created.push(null); continue;
    }
    created.push((ins.data as { id: string }).id);
  }
  a.onProgress?.(a.added.length, a.added.length);

  let cover: string | null = null;
  if (a.cover?.kind === 'existing' && !a.removedPhotoIds.includes(a.cover.id)) cover = a.cover.id;
  else if (a.cover?.kind === 'new') cover = created[a.cover.index] ?? null;
  if (!cover) {
    const { data } = await supabase.from('memory_photos').select('id').eq('visited_place_id', visitId).order('sort_order').limit(1);
    cover = ((data ?? []) as { id: string }[])[0]?.id ?? null;
  }
  await supabase.from('visited_places').update({ cover_photo_id: cover }).eq('id', visitId);
  await setPlaceStatus(a.userId, a.input.place_id, a.input.user_place_id, 'visited', a.input.rating);
  return { id: visitId as string, failed };
}

/** Deletes the visit, its photo rows and the files in Storage. */
export async function deleteVisit(userId: string, visit: Visit) {
  const { data } = await supabase.from('memory_photos').select('storage_path').eq('visited_place_id', visit.id);
  const paths = ((data ?? []) as { storage_path: string }[]).map((r) => r.storage_path);
  if (paths.length) {
    const r = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (r.error) fail('ลบรูปไม่สำเร็จ', r.error);
  }
  const { error } = await supabase.from('visited_places').delete().eq('id', visit.id);
  if (error) fail('ลบไม่สำเร็จ', error);
  // no visits left for this place -> back to "อยากไป"
  const col = visit.place_id ? 'place_id' : visit.user_place_id ? 'user_place_id' : null;
  const val = visit.place_id ?? visit.user_place_id;
  if (col && val) {
    const { count } = await supabase.from('visited_places').select('id', { count: 'exact', head: true }).eq(col, val);
    if (!count) await setPlaceStatus(userId, visit.place_id, visit.user_place_id, 'want');
  }
}
