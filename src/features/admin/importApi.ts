import { supabase } from '../../lib/supabase';
import { COLUMNS, FACILITY_KEYS, type Analyzed, type ImportCtx, type ImportMode } from './importModel';
import { toCsv } from './csv';

function fail(msg: string, error: unknown): never {
  console.error('[thai77]', msg, (error as { message?: string })?.message);
  throw new Error(msg);
}
const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadImportContext(): Promise<ImportCtx> {
  const [p, d, c, e, s] = await Promise.all([
    supabase.from('provinces').select('id,pcode,slug,name_th,name_en'),
    supabase.from('districts').select('id,pcode,province_id,name_th,name_en').range(0, 2999),
    supabase.from('categories').select('id,slug,name_th,name_en'),
    supabase.from('places').select('id,name_th,province_id,category_id,lat,lng').range(0, 9999),
    supabase.from('place_sources').select('place_id').range(0, 19999),
  ]);
  const err = p.error ?? d.error ?? c.error ?? e.error ?? s.error;
  if (err) fail('โหลดข้อมูลอ้างอิงไม่สำเร็จ', err);
  type Ex = ImportCtx['existing'][number];
  return {
    provinces: (p.data ?? []) as unknown as ImportCtx['provinces'],
    districts: (d.data ?? []) as unknown as ImportCtx['districts'],
    categories: (c.data ?? []) as unknown as ImportCtx['categories'],
    existing: ((e.data ?? []) as unknown as Ex[]).map((r) => ({ ...r, lat: num(r.lat), lng: num(r.lng) })),
    withSource: new Set(((s.data ?? []) as unknown as { place_id: string }[]).map((r) => r.place_id)),
  };
}

export type ImportResult = { inserted: number; updated: number; skipped: number; failed: number; errors: { line: number; message: string }[] };

/** Writes rows one by one (so one bad row never blocks the rest), then an import_logs entry. */
export async function runImport(o: {
  rows: Analyzed[]; mode: ImportMode; userId: string; fileName: string; format: 'csv' | 'json';
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportResult> {
  const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const work = o.rows.filter((r) => r.kind !== 'error');
  o.rows.filter((r) => r.kind === 'error').forEach((r) => res.errors.push({ line: r.line, message: r.errors.join(' ; ').slice(0, 300) }));

  for (let i = 0; i < work.length; i++) {
    o.onProgress?.(i, work.length);
    const r = work[i];
    try {
      let placeId: string;
      if (r.kind === 'match') {
        if (o.mode === 'new_only') { res.skipped++; continue; }
        placeId = r.matchId as string;
        const hasExtra = Object.keys(r.facilities).length > 0 || r.source !== null;
        if (Object.keys(r.patch).length) {
          const { error } = await supabase.from('places').update(r.patch).eq('id', placeId);
          if (error) throw error;
        } else if (!hasExtra) { res.skipped++; continue; }
        res.updated++;
      } else {
        const { data, error } = await supabase.from('places').insert({ ...r.input, created_by: o.userId }).select('id').single();
        if (error || !data) throw error ?? new Error('insert');
        placeId = (data as unknown as { id: string }).id;
        res.inserted++;
      }

      if (Object.keys(r.facilities).length) {
        const { error } = await supabase.from('place_facilities').upsert({ place_id: placeId, ...r.facilities }, { onConflict: 'place_id' });
        if (error) res.errors.push({ line: r.line, message: 'บันทึกสิ่งอำนวยความสะดวกไม่สำเร็จ' });
      }
      if (r.source) {
        const dup = await supabase.from('place_sources').select('id').eq('place_id', placeId).eq('source_url', r.source.source_url).limit(1);
        if (!((dup.data ?? []) as unknown[]).length) {
          const { error } = await supabase.from('place_sources').insert({ place_id: placeId, ...r.source, fields: [] });
          if (error) res.errors.push({ line: r.line, message: 'บันทึกแหล่งข้อมูลไม่สำเร็จ' });
        }
      }
    } catch (e) {
      res.failed++;
      const code = (e as { code?: string })?.code;
      res.errors.push({ line: r.line, message: code === '23514' ? 'ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล' : code === '42501' ? 'ไม่มีสิทธิ์ (ต้องเป็น Admin)' : 'บันทึกไม่สำเร็จ' });
    }
  }
  o.onProgress?.(work.length, work.length);

  await supabase.from('import_logs').insert({
    user_id: o.userId,
    kind: o.format === 'json' ? 'admin_places_json' : 'admin_places_csv',
    file_name: o.fileName.slice(0, 200),
    mode: o.mode === 'merge' ? 'merge' : 'insert',
    total_rows: o.rows.length,
    inserted: res.inserted,
    updated: res.updated,
    skipped: res.skipped,
    errors: res.errors.slice(0, 200),
  });
  return res;
}

export type ImportLog = {
  id: string; kind: string; file_name: string | null; mode: string | null; total_rows: number; inserted: number;
  updated: number; skipped: number; errors: { line: number; message: string }[]; created_at: string;
};

export async function listImportLogs(): Promise<ImportLog[]> {
  const { data, error } = await supabase.from('import_logs')
    .select('id,kind,file_name,mode,total_rows,inserted,updated,skipped,errors,created_at')
    .in('kind', ['admin_places_csv', 'admin_places_json'])
    .order('created_at', { ascending: false }).limit(10);
  if (error) fail('โหลดประวัติการนำเข้าไม่สำเร็จ', error);
  return (data ?? []) as unknown as ImportLog[];
}

export const templateCsv = () => toCsv([COLUMNS.map(([k]) => k)]);

/** All places as CSV in the same format as the import (round-trip editing in Excel). */
export async function exportPlacesCsv(ctx: ImportCtx): Promise<{ csv: string; count: number }> {
  const [p, f, s] = await Promise.all([
    supabase.from('places').select('id,name_th,name_en,province_id,district_id,category_id,short_description,highlights,lat,lng,address,opening_hours_text,closed_days_text,fee_thai,fee_foreigner,parking_fee,est_cost_per_person,suggested_minutes,best_time_of_day,best_months,phone,website_url,social_url,google_maps_url,popularity,state,verification,verified_at,is_demo,is_published').order('province_id').order('name_th').range(0, 9999),
    supabase.from('place_facilities').select('place_id,has_toilet,has_parking,elderly_friendly,wheelchair,kid_friendly,pet_friendly').range(0, 9999),
    supabase.from('place_sources').select('place_id,source_url,source_name,source_type,checked_at').order('checked_at', { ascending: false }).range(0, 19999),
  ]);
  if (p.error) fail('Export ไม่สำเร็จ', p.error);
  type Row = Record<string, unknown>;
  const fac = new Map(((f.data ?? []) as unknown as Row[]).map((r) => [r.place_id as string, r]));
  const src = new Map<string, Row>();
  ((s.data ?? []) as unknown as Row[]).forEach((r) => { if (!src.has(r.place_id as string)) src.set(r.place_id as string, r); });
  const prov = new Map(ctx.provinces.map((x) => [x.id, x.name_th]));
  const dist = new Map(ctx.districts.map((x) => [x.id, x.name_th]));
  const cat = new Map(ctx.categories.map((x) => [x.id, x.slug]));
  const yn = (v: unknown) => (v == null ? '' : v ? 'yes' : 'no');
  const s_ = (v: unknown) => (v == null ? '' : String(v));

  const rows = ((p.data ?? []) as unknown as Row[]).map((r) => {
    const fa = fac.get(r.id as string) ?? {};
    const so = src.get(r.id as string) ?? {};
    const byCol: Record<string, string> = {
      id: s_(r.id), name_th: s_(r.name_th), name_en: s_(r.name_en), province: prov.get(r.province_id as string) ?? '',
      district: r.district_id ? dist.get(r.district_id as string) ?? '' : '', category: cat.get(r.category_id as string) ?? '',
      short_description: s_(r.short_description), highlights: ((r.highlights as string[] | null) ?? []).join('|'),
      lat: s_(r.lat), lng: s_(r.lng), address: s_(r.address), opening_hours: s_(r.opening_hours_text), closed_days: s_(r.closed_days_text),
      fee_thai: s_(r.fee_thai), fee_foreigner: s_(r.fee_foreigner), parking_fee: s_(r.parking_fee), est_cost: s_(r.est_cost_per_person),
      suggested_minutes: s_(r.suggested_minutes), best_time: s_(r.best_time_of_day), best_months: ((r.best_months as number[] | null) ?? []).join('|'),
      phone: s_(r.phone), website: s_(r.website_url), social: s_(r.social_url), google_maps_url: s_(r.google_maps_url),
      popularity: s_(r.popularity), state: s_(r.state), verification: s_(r.verification), verified_at: s_(r.verified_at),
      is_demo: yn(r.is_demo), is_published: yn(r.is_published),
      source_url: s_(so.source_url), source_name: s_(so.source_name), source_type: s_(so.source_type), source_checked_at: s_(so.checked_at),
    };
    FACILITY_KEYS.forEach((k) => { byCol[k] = yn((fa as Row)[k]); });
    return COLUMNS.map(([k]) => byCol[k] ?? '');
  });
  return { csv: toCsv([COLUMNS.map(([k]) => k), ...rows]), count: rows.length };
}
