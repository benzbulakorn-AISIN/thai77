import { supabase } from '../../lib/supabase';
import {
  BACKUP_APP, BACKUP_KIND, DB_TABLE, SCHEMA_VERSION, TABLES, pickSettings, transformRow,
  type Backup, type RestoreMode, type Row, type TableKey,
} from './backupModel';

const BUCKETS = ['memory-photos', 'trip-covers'] as const;

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}

async function selectAll(table: string, apply: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(supabase.from(table).select('*')).range(from, from + 999);
    if (error) fail(`อ่านข้อมูล ${table} ไม่สำเร็จ`, error);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function selectIn(table: string, col: string, ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    out.push(...(await selectAll(table, (q) => q.in(col, chunk))));
  }
  return out;
}

// ---------------- export ----------------
export async function buildBackup(uid: string): Promise<Backup> {
  const trips = await selectAll('trips', (q) => q.eq('owner_id', uid));
  const tripIds = trips.map((t) => t.id);
  const [tripDays, accommodations, tripItems, tripRoutes, budgetItems] = await Promise.all(
    ['trip_days', 'accommodations', 'trip_items', 'trip_routes', 'budget_items'].map((t) => selectIn(t, 'trip_id', tripIds)),
  );
  const [userPlaces, travelMemories, visitedPlaces, memoryPhotos, userPlaceStatus, favorites] = await Promise.all([
    selectAll('user_places', (q) => q.eq('owner_id', uid)),
    selectAll('travel_memories', (q) => q.eq('user_id', uid)),
    selectAll('visited_places', (q) => q.eq('user_id', uid)),
    selectAll('memory_photos', (q) => q.eq('user_id', uid)),
    selectAll('user_place_status', (q) => q.eq('user_id', uid)),
    selectAll('favorites', (q) => q.eq('user_id', uid)),
  ]);
  const s = await supabase.from('user_settings').select('*').eq('user_id', uid).maybeSingle();
  const cats = await supabase.from('budget_categories').select('id,slug');
  const budgetCategories: Record<string, string> = {};
  ((cats.data ?? []) as unknown as { id: string; slug: string }[]).forEach((c) => { budgetCategories[c.id] = c.slug; });
  // the joined column from trip_items queries elsewhere is not selected here (select('*'))
  return {
    app: BACKUP_APP, kind: BACKUP_KIND, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), userId: uid,
    refs: { budgetCategories },
    data: {
      userPlaces, trips, tripDays, accommodations, tripItems, tripRoutes, budgetItems, travelMemories, visitedPlaces,
      memoryPhotos, userPlaceStatus, favorites, userSettings: (s.data as Record<string, unknown> | null) ?? null,
    },
  };
}

// ---------------- restore ----------------
/** ids from the file that already exist (and are visible to me) */
export async function existingIds(b: Backup): Promise<Partial<Record<TableKey, Set<string>>>> {
  const out: Partial<Record<TableKey, Set<string>>> = {};
  for (const t of TABLES) {
    const ids = b.data[t].map((r) => r.id);
    if (!ids.length) continue;
    const set = new Set<string>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from(DB_TABLE[t]).select('id').in('id', ids.slice(i, i + 150));
      ((data ?? []) as unknown as { id: string }[]).forEach((r) => set.add(r.id));
    }
    out[t] = set;
  }
  return out;
}

async function existingPlaceIds(b: Backup): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const t of ['tripItems', 'visitedPlaces', 'userPlaceStatus', 'favorites'] as TableKey[]) {
    b.data[t].forEach((r) => { if (typeof r.place_id === 'string') ids.add(r.place_id); });
  }
  const list = [...ids];
  const found = new Set<string>();
  for (let i = 0; i < list.length; i += 150) {
    const { data } = await supabase.from('places').select('id').in('id', list.slice(i, i + 150));
    ((data ?? []) as unknown as { id: string }[]).forEach((r) => found.add(r.id));
  }
  return found;
}

/** which photo files exist in my storage folder */
async function existingPhotoPaths(uid: string, paths: string[]): Promise<Set<string>> {
  const mine = paths.filter((p) => p.startsWith(`${uid}/`));
  const ok = new Set<string>();
  for (let i = 0; i < mine.length; i += 100) {
    const { data } = await supabase.storage.from('memory-photos').createSignedUrls(mine.slice(i, i + 100), 60);
    ((data ?? []) as { path: string | null; signedUrl: string | null; error: string | null }[])
      .forEach((r) => { if (r.path && r.signedUrl && !r.error) ok.add(r.path); });
  }
  return ok;
}

async function insertRows(table: string, rows: Row[]): Promise<{ ok: Set<string>; failed: number; dup: number }> {
  const ok = new Set<string>();
  let failed = 0, dup = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).insert(chunk);
    if (!error) { chunk.forEach((r) => ok.add(r.id)); continue; }
    for (const r of chunk) { // fall back to one by one so one bad row does not block the rest
      const e = (await supabase.from(table).insert(r)).error;
      if (!e) ok.add(r.id);
      else if ((e as { code?: string }).code === '23505') dup++;
      else failed++;
    }
  }
  return { ok, failed, dup };
}

/** List every file in my folder of a bucket ({uid}/{sub}/{file}). */
async function listMyFiles(bucket: string, uid: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (prefix: string, depth: number) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) return;
      const items = (data ?? []) as { name: string; id: string | null }[];
      for (const it of items) {
        const p = `${prefix}/${it.name}`;
        if (it.id === null) { if (depth < 3) await walk(p, depth + 1); } else out.push(p);
      }
      if (items.length < 1000) return;
    }
  };
  await walk(uid, 1);
  return out;
}

export type WipeResult = { files: number };

/**
 * Delete my travel data (keeps the account and settings).
 * keepFiles = true is used by "Replace" restore so photo files can be re-linked.
 */
export async function wipeMyData(uid: string, keepFiles: boolean): Promise<WipeResult> {
  let files = 0;
  if (!keepFiles) {
    for (const b of BUCKETS) {
      const paths = await listMyFiles(b, uid);
      for (let i = 0; i < paths.length; i += 100) {
        const r = await supabase.storage.from(b).remove(paths.slice(i, i + 100));
        if (r.error) fail('ลบรูปไม่สำเร็จ', r.error);
        files += Math.min(100, paths.length - i);
      }
    }
  }
  // children are removed by ON DELETE CASCADE (trip_days, trip_items, budget_items, memory_photos ...)
  const steps: [string, string][] = [
    ['visited_places', 'user_id'], ['travel_memories', 'user_id'], ['user_place_status', 'user_id'],
    ['favorites', 'user_id'], ['trips', 'owner_id'], ['user_places', 'owner_id'],
  ];
  for (const [t, col] of steps) {
    const { error } = await supabase.from(t).delete().eq(col, uid);
    if (error) fail('ลบข้อมูลไม่สำเร็จ', error);
  }
  return { files };
}

export type RestoreResult = {
  inserted: number; skipped: number; failed: number; photosMissing: number; dropped: number; settings: boolean;
  perTable: { table: TableKey; inserted: number; skipped: number; failed: number }[];
};

export async function restoreBackup(o: {
  backup: Backup; uid: string; mode: RestoreMode; fileName: string; onStep?: (label: string) => void;
}): Promise<RestoreResult> {
  const { backup: b, uid, mode } = o;
  if (mode === 'replace') { o.onStep?.('ลบข้อมูลเดิม…'); await wipeMyData(uid, true); }

  o.onStep?.('ตรวจข้อมูล…');
  const [existing, validPlaceIds, cats] = await Promise.all([
    existingIds(b), existingPlaceIds(b), supabase.from('budget_categories').select('id,slug'),
  ]);
  const catRows = (cats.data ?? []) as unknown as { id: string; slug: string }[];
  const ctx = {
    uid, backupUid: b.userId, validPlaceIds,
    budgetCatBySlug: new Map(catRows.map((c) => [c.slug, c.id])),
    otherBudgetCat: catRows.find((c) => c.slug === 'other')?.id ?? null,
  };
  const photoOk = await existingPhotoPaths(uid, b.data.memoryPhotos.map((p) => String(p.storage_path ?? '')));

  const res: RestoreResult = { inserted: 0, skipped: 0, failed: 0, photosMissing: 0, dropped: 0, settings: false, perTable: [] };
  const insertedPhotos = new Set<string>();

  for (const t of TABLES) {
    const all = b.data[t];
    if (!all.length) continue;
    o.onStep?.(`กู้คืน${t === 'memoryPhotos' ? 'รูปภาพ' : ''}… (${all.length})`);
    const ex = existing[t] ?? new Set<string>();
    let skipped = 0;
    const rows: Row[] = [];
    for (const r of all) {
      if (ex.has(r.id)) { skipped++; continue; }
      if (t === 'memoryPhotos' && !photoOk.has(String(r.storage_path))) { res.photosMissing++; continue; }
      const x = transformRow(t, r, b, ctx);
      if (!x) { res.dropped++; continue; }
      rows.push(x);
    }
    const ins = await insertRows(DB_TABLE[t], rows);
    if (t === 'memoryPhotos') ins.ok.forEach((id) => insertedPhotos.add(id));
    res.inserted += ins.ok.size;
    res.skipped += skipped + ins.dup;
    res.failed += ins.failed;
    res.perTable.push({ table: t, inserted: ins.ok.size, skipped: skipped + ins.dup, failed: ins.failed });
  }

  // re-link cover photos
  for (const v of b.data.visitedPlaces) {
    const cover = typeof v.cover_photo_id === 'string' ? v.cover_photo_id : null;
    if (cover && (insertedPhotos.has(cover) || existing.memoryPhotos?.has(cover))) {
      await supabase.from('visited_places').update({ cover_photo_id: cover }).eq('id', v.id).eq('user_id', uid);
    }
  }

  const s = pickSettings(b.data.userSettings);
  if (s) {
    const { error } = await supabase.from('user_settings').update(s).eq('user_id', uid);
    res.settings = !error;
  }

  await supabase.from('import_logs').insert({
    user_id: uid, kind: 'user_backup', file_name: o.fileName.slice(0, 200), mode, schema_version: b.schemaVersion,
    total_rows: TABLES.reduce((n, t) => n + b.data[t].length, 0),
    inserted: res.inserted, updated: 0, skipped: res.skipped + res.dropped + res.photosMissing,
    errors: res.failed ? [{ line: 0, message: `ไม่สำเร็จ ${res.failed} รายการ` }] : [],
  });
  return res;
}

// ---------------- account deletion ----------------
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) {
    const msg = (error as { message?: string }).message ?? '';
    throw new Error(/not found|404|Failed to send/i.test(msg)
      ? 'ยังไม่ได้ติดตั้ง Edge Function “delete-account” (ดูคู่มือ)'
      : 'ลบบัญชีไม่สำเร็จ ลองใหม่ภายหลัง');
  }
  if (!(data as { ok?: boolean } | null)?.ok) throw new Error('ลบบัญชีไม่สำเร็จ');
}
