// Import model: file -> records -> validated rows (pure, no React / Supabase).
import { emptyForm, fromForm, parseThaiCoords, todayIso, type PlaceForm, type PlaceInput } from './placeForm';
import { parseCsv } from './csv';

export type RawRecord = Record<string, string>;
export type Located = { provincePcode: string; districtPcode: string | null } | null;
export type SourceType = 'tat' | 'province' | 'national_park' | 'local_gov' | 'official_social' | 'osm' | 'other';
export type ImportMode = 'new_only' | 'merge';

export const MAX_ROWS = 1000;
export const MAX_BYTES = 2 * 1024 * 1024;

export const FACILITY_KEYS = ['has_toilet', 'has_parking', 'elderly_friendly', 'wheelchair', 'kid_friendly', 'pet_friendly'] as const;
export type FacilityKey = (typeof FACILITY_KEYS)[number];

/** canonical columns (also the CSV export / template header order) */
export const COLUMNS: [string, string][] = [
  ['id', 'รหัสสถานที่ (มีเมื่อ Export) — ใช้แก้ไขของเดิม'],
  ['name_th', 'ชื่อภาษาไทย *'],
  ['name_en', 'ชื่อภาษาอังกฤษ'],
  ['province', 'จังหวัด * (ชื่อไทย / อังกฤษ / รหัส เช่น TH20) — ว่างได้ถ้ามีพิกัด'],
  ['district', 'อำเภอ (ว่าง = หาจากพิกัด)'],
  ['category', 'หมวด * (slug เช่น temple หรือชื่อไทย)'],
  ['short_description', 'คำอธิบายสั้น (เขียนเอง)'],
  ['highlights', 'จุดเด่น คั่นด้วย |'],
  ['lat', 'ละติจูด เช่น 13.7563'],
  ['lng', 'ลองจิจูด เช่น 100.5018'],
  ['address', 'ที่อยู่'],
  ['opening_hours', 'เวลาเปิด-ปิด รูปแบบ OSM เช่น Tu-Su 09:00-16:00; Mo off'],
  ['closed_days', 'วันหยุด (ข้อความ)'],
  ['fee_thai', 'ค่าเข้า คนไทย (บาท)'],
  ['fee_foreigner', 'ค่าเข้า ต่างชาติ (บาท)'],
  ['parking_fee', 'ค่าจอดรถ (บาท)'],
  ['est_cost', 'ค่าใช้จ่ายประมาณ/คน'],
  ['suggested_minutes', 'เวลาที่ควรใช้ (นาที)'],
  ['best_time', 'ช่วงเวลาที่แนะนำ'],
  ['best_months', 'เดือนที่เหมาะ เช่น 11|12|1'],
  ['phone', 'โทรศัพท์'],
  ['website', 'เว็บไซต์ (https://...)'],
  ['social', 'Social Media (https://...)'],
  ['google_maps_url', 'ลิงก์ Google Maps'],
  ['popularity', 'ความนิยม 0–100'],
  ['state', 'active / seasonal / temporarily_closed / permanently_closed'],
  ['verification', 'pending / verified / outdated / demo'],
  ['verified_at', 'วันที่ตรวจล่าสุด YYYY-MM-DD'],
  ['is_demo', 'yes / no'],
  ['is_published', 'yes / no (ว่าง = yes)'],
  ['has_toilet', 'ห้องน้ำ yes / no / ว่าง=ไม่ทราบ'],
  ['has_parking', 'ที่จอดรถ'],
  ['elderly_friendly', 'ผู้สูงอายุ'],
  ['wheelchair', 'รถเข็น'],
  ['kid_friendly', 'เด็ก'],
  ['pet_friendly', 'สัตว์เลี้ยง'],
  ['source_url', 'ลิงก์แหล่งข้อมูล (https://...)'],
  ['source_name', 'ชื่อแหล่งข้อมูล'],
  ['source_type', 'tat / province / national_park / local_gov / official_social / osm / other'],
  ['source_checked_at', 'วันที่ตรวจแหล่งข้อมูล YYYY-MM-DD'],
];
const KNOWN = new Set(COLUMNS.map(([k]) => k));

const ALIASES: Record<string, string> = {
  ชื่อ: 'name_th', ชื่อไทย: 'name_th', name: 'name_th', ชื่ออังกฤษ: 'name_en',
  จังหวัด: 'province', province_pcode: 'province', province_th: 'province', province_name: 'province',
  อำเภอ: 'district', district_name: 'district', หมวด: 'category', หมวดหมู่: 'category', category_slug: 'category',
  คำอธิบาย: 'short_description', description: 'short_description', จุดเด่น: 'highlights',
  ละติจูด: 'lat', latitude: 'lat', ลองจิจูด: 'lng', longitude: 'lng', lon: 'lng',
  ที่อยู่: 'address', opening_hours_text: 'opening_hours', เวลาเปิดปิด: 'opening_hours', closed_days_text: 'closed_days',
  est_cost_per_person: 'est_cost', best_time_of_day: 'best_time', website_url: 'website', social_url: 'social',
  โทร: 'phone', โทรศัพท์: 'phone', checked_at: 'source_checked_at',
};

const normHeader = (h: string) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const canonical = (h: string) => ALIASES[normHeader(h)] ?? normHeader(h);

function cellText(v: unknown): string {
  let s: string;
  if (v == null) s = '';
  else if (Array.isArray(v)) s = v.map((x) => String(x)).join('|');
  else if (typeof v === 'boolean') s = v ? 'yes' : 'no';
  else if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : '';
  else if (typeof v === 'string') s = v;
  else s = '';
  s = s.trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1); // undo CSV formula guard
  return s;
}

export type Parsed = { format: 'csv' | 'json'; records: RawRecord[]; lineOffset: number; unknown: string[] };

function toRecord(obj: Record<string, unknown>, unknown: Set<string>, defaults: RawRecord = {}): RawRecord {
  const r: RawRecord = { ...defaults };
  for (const [k, v] of Object.entries(obj)) {
    const c = canonical(k);
    if (KNOWN.has(c)) { const t = cellText(v); if (t !== '' || !(c in r)) r[c] = t; } else if (k !== 'key') unknown.add(k);
  }
  return r;
}

export function parseFile(fileName: string, text: string): Parsed {
  const unknown = new Set<string>();
  const isJson = /\.json$/i.test(fileName) || /^\s*[[{]/.test(text.replace(/^\uFEFF/, ''));
  if (isJson) {
    let data: unknown;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('ไฟล์ JSON ไม่ถูกต้อง'); }
    let items: unknown[];
    let defaults: RawRecord = {};
    if (Array.isArray(data)) items = data;
    else if (data && typeof data === 'object' && Array.isArray((data as { places?: unknown }).places)) {
      const o = data as Record<string, unknown>;
      items = o.places as unknown[];
      const prov = cellText(o.province_pcode ?? o.province ?? o.province_th);
      if (prov) defaults = { province: prov };
    } else throw new Error('JSON ต้องเป็น array ของสถานที่ หรือ { "places": [...] }');
    const records = items.map((it, i) => {
      if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error(`รายการที่ ${i + 1} ไม่ใช่ object`);
      return toRecord(it as Record<string, unknown>, unknown, defaults);
    });
    return { format: 'json', records, lineOffset: 1, unknown: [...unknown] };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว');
  const header = rows[0];
  const cols = header.map(canonical);
  if (!cols.includes('name_th')) throw new Error('ไม่พบคอลัมน์ name_th (ชื่อภาษาไทย) — ดาวน์โหลด Template เพื่อดูหัวตาราง');
  header.forEach((h, i) => { if (!KNOWN.has(cols[i]) && h.trim()) unknown.add(h.trim()); });
  const records = rows.slice(1).map((r) => {
    const rec: RawRecord = {};
    cols.forEach((c, i) => { if (KNOWN.has(c)) rec[c] = cellText(r[i] ?? ''); });
    return rec;
  });
  return { format: 'csv', records, lineOffset: 2, unknown: [...unknown] };
}

// ---------------- analysis ----------------
export type ImportCtx = {
  provinces: { id: string; pcode: string; slug: string; name_th: string; name_en: string }[];
  districts: { id: string; pcode: string; province_id: string; name_th: string; name_en: string }[];
  categories: { id: string; slug: string; name_th: string; name_en: string | null }[];
  existing: { id: string; name_th: string; province_id: string; category_id: string; lat: number | null; lng: number | null }[];
  withSource: Set<string>;
};

export type SourceRow = { source_url: string; source_name: string | null; source_type: SourceType; checked_at: string };

export type Analyzed = {
  line: number;
  name: string;
  kind: 'new' | 'match' | 'error';
  errors: string[];
  warnings: string[];
  input: PlaceInput | null;
  patch: Partial<PlaceInput>;
  matchId: string | null;
  matchReason: string | null;
  facilities: Partial<Record<FacilityKey, boolean | null>>;
  source: SourceRow | null;
};

export const normName = (s: string) =>
  s.normalize('NFC').toLowerCase().trim()
    .replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|กิ่งอำเภอ|amphoe|khet|changwat)\s*/, '')
    .replace(/[\s\-_.,'"()]/g, '');

function resolveByName<T extends { name_th: string; name_en?: string | null }>(q: string, list: T[], extra: (t: T) => string[] = () => []):
  { item: T | null; fuzzy: boolean } {
  const n = normName(q);
  if (!n) return { item: null, fuzzy: false };
  const exact = list.find((t) => [t.name_th, t.name_en ?? '', ...extra(t)].some((x) => x && normName(x) === n));
  if (exact) return { item: exact, fuzzy: false };
  if (n.length < 3) return { item: null, fuzzy: false };
  const cands = list.filter((t) => { const m = normName(t.name_th); return m.startsWith(n) || n.startsWith(m); });
  return cands.length === 1 ? { item: cands[0], fuzzy: true } : { item: null, fuzzy: false };
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseBool(v: string): boolean | null | undefined {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (['yes', 'y', 'true', '1', 'มี', 'ใช่', 'ได้'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'ไม่มี', 'ไม่ใช่', 'ไม่ได้'].includes(t)) return false;
  return undefined; // invalid
}

export function parseMonths(v: string): number[] | null {
  if (!v.trim()) return [];
  const parts = v.split(/[|,;\s]+/).filter(Boolean).map(Number);
  return parts.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) ? [...new Set(parts)].sort((a, b) => a - b) : null;
}

/** column -> PlaceInput keys it controls (used to build partial updates) */
const COL_KEYS: Record<string, (keyof PlaceInput)[]> = {
  name_th: ['name_th'], name_en: ['name_en'], province: ['province_id'], district: ['district_id'], category: ['category_id'],
  short_description: ['short_description'], highlights: ['highlights'], lat: ['lat', 'lng', 'district_id'], lng: ['lat', 'lng', 'district_id'],
  address: ['address'], opening_hours: ['opening_hours_text'], closed_days: ['closed_days_text'], fee_thai: ['fee_thai'],
  fee_foreigner: ['fee_foreigner'], parking_fee: ['parking_fee'], est_cost: ['est_cost_per_person'], suggested_minutes: ['suggested_minutes'],
  best_time: ['best_time_of_day'], best_months: ['best_months'], phone: ['phone'], website: ['website_url'], social: ['social_url'],
  google_maps_url: ['google_maps_url'], popularity: ['popularity'], state: ['state'], verification: ['verification', 'verified_at'],
  verified_at: ['verified_at'], is_demo: ['is_demo'], is_published: ['is_published'],
};

const STATES = ['active', 'seasonal', 'temporarily_closed', 'permanently_closed'];
const VERIFS = ['verified', 'pending', 'outdated', 'demo'];
const SOURCE_TYPES: SourceType[] = ['tat', 'province', 'national_park', 'local_gov', 'official_social', 'osm', 'other'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** coordinates found in a record (lat/lng columns or Google Maps link) — used to pre-locate province */
export function recordCoords(r: RawRecord): { lat: number; lng: number; fromLink: boolean } | null {
  if (r.lat && r.lng) { const c = parseThaiCoords(`${r.lat}, ${r.lng}`); return c ? { ...c, fromLink: false } : null; }
  if (!r.lat && !r.lng && r.google_maps_url) { const c = parseThaiCoords(r.google_maps_url); return c ? { ...c, fromLink: true } : null; }
  return null;
}

export function analyze(records: RawRecord[], ctx: ImportCtx, located: (Located | undefined)[], lineOffset: number): Analyzed[] {
  const seen = new Map<string, number>();
  const today = todayIso();
  return records.map((r, i) => {
    const line = i + lineOffset;
    const errors: string[] = [];
    const warnings: string[] = [];
    const has = (k: string) => (r[k] ?? '') !== '';
    const f: PlaceForm = emptyForm();
    let matchId: string | null = null;
    let matchReason: string | null = null;

    // --- id (round-trip from Export)
    let byId: ImportCtx['existing'][number] | undefined;
    if (has('id')) {
      if (!UUID.test(r.id)) errors.push('id ไม่ใช่รูปแบบ UUID');
      else {
        byId = ctx.existing.find((e) => e.id === r.id.toLowerCase());
        if (!byId) errors.push('ไม่พบสถานที่ตาม id นี้ (ลบคอลัมน์ id ถ้าต้องการเพิ่มใหม่)');
        else { matchId = byId.id; matchReason = 'id ตรงกัน'; }
      }
    }

    f.name_th = r.name_th ?? '';
    if (!f.name_th && byId) f.name_th = byId.name_th;

    // --- coordinates
    const coords = recordCoords(r);
    if ((has('lat') || has('lng')) && !coords) errors.push('ละติจูด/ลองจิจูดไม่ถูกต้อง หรืออยู่นอกประเทศไทย');
    if (coords) {
      f.coords = `${coords.lat}, ${coords.lng}`;
      if (coords.fromLink) warnings.push('ใช้พิกัดจากลิงก์ Google Maps');
    }
    const loc = located[i];

    // --- province
    let prov: ImportCtx['provinces'][number] | null = null;
    if (has('province')) {
      const q = r.province;
      const byCode = ctx.provinces.find((p) => p.pcode.toLowerCase() === q.toLowerCase() || p.slug === q.toLowerCase());
      const res = byCode ? { item: byCode, fuzzy: false } : resolveByName(q, ctx.provinces);
      prov = res.item;
      if (!prov) errors.push(`ไม่พบจังหวัด “${q}”`);
      else if (res.fuzzy) warnings.push(`ตีความจังหวัด “${q}” เป็น ${prov.name_th}`);
    } else if (byId) prov = ctx.provinces.find((p) => p.id === byId!.province_id) ?? null;
    else if (loc) {
      prov = ctx.provinces.find((p) => p.pcode === loc.provincePcode) ?? null;
      if (prov) warnings.push(`เลือกจังหวัด ${prov.name_th} จากพิกัด`);
    }
    if (!prov && !has('province')) errors.push('ไม่ระบุจังหวัด (และหาจากพิกัดไม่ได้)');
    if (coords && loc === null) warnings.push('ตรวจจังหวัดจากพิกัดไม่ได้');
    if (prov && loc && loc.provincePcode !== prov.pcode) {
      const real = ctx.provinces.find((p) => p.pcode === loc.provincePcode);
      errors.push(`พิกัดอยู่ใน${real ? real.name_th : 'จังหวัดอื่น'} ไม่ใช่${prov.name_th}`);
    }
    if (prov) f.province_id = prov.id;

    // --- district
    if (prov) {
      const ds = ctx.districts.filter((d) => d.province_id === prov!.id);
      const fromLoc = loc?.districtPcode ? ds.find((d) => d.pcode === loc.districtPcode) : undefined;
      if (has('district')) {
        const res = resolveByName(r.district, ds, (d) => [d.pcode]);
        if (res.item) {
          f.district_id = res.item.id;
          if (res.fuzzy) warnings.push(`ตีความอำเภอ “${r.district}” เป็น ${res.item.name_th}`);
          if (fromLoc && fromLoc.id !== res.item.id) warnings.push(`พิกัดอยู่ใน ${fromLoc.name_th} ไม่ตรงกับอำเภอที่ระบุ`);
        } else {
          warnings.push(`ไม่พบอำเภอ “${r.district}” ใน${prov.name_th}${fromLoc ? ` — ใช้ ${fromLoc.name_th} จากพิกัด` : ''}`);
          if (fromLoc) f.district_id = fromLoc.id;
        }
      } else if (fromLoc) f.district_id = fromLoc.id;
    }

    // --- category
    if (has('category')) {
      const q = r.category;
      const c = ctx.categories.find((x) => x.slug === q.toLowerCase()) ?? resolveByName(q, ctx.categories).item;
      if (!c) errors.push(`ไม่พบหมวด “${q}” (ใช้ slug เช่น temple, beach หรือชื่อหมวดในหน้า Admin)`);
      else f.category_id = c.id;
    } else if (byId) f.category_id = byId.category_id;
    else errors.push('ไม่ระบุหมวด');

    // --- simple text / numbers
    f.name_en = r.name_en ?? '';
    f.short_description = r.short_description ?? '';
    f.highlights = (r.highlights ?? '').split('|').map((x) => x.trim()).filter(Boolean).join('\n');
    f.address = r.address ?? '';
    f.opening_hours_text = r.opening_hours ?? '';
    f.closed_days_text = r.closed_days ?? '';
    f.fee_thai = r.fee_thai ?? '';
    f.fee_foreigner = r.fee_foreigner ?? '';
    f.parking_fee = r.parking_fee ?? '';
    f.est_cost_per_person = r.est_cost ?? '';
    f.suggested_minutes = r.suggested_minutes ?? '';
    f.best_time_of_day = r.best_time ?? '';
    f.phone = r.phone ?? '';
    f.website_url = r.website ?? '';
    f.social_url = r.social ?? '';
    f.google_maps_url = r.google_maps_url ?? '';
    f.popularity = has('popularity') ? r.popularity : '0';
    const months = parseMonths(r.best_months ?? '');
    if (months === null) errors.push('best_months ต้องเป็นตัวเลข 1–12 คั่นด้วย |');
    else f.best_months = months;

    if (has('state')) { if (STATES.includes(r.state)) f.state = r.state as PlaceForm['state']; else errors.push(`state ไม่ถูกต้อง: ${r.state}`); }
    if (has('verification')) {
      if (VERIFS.includes(r.verification)) f.verification = r.verification as PlaceForm['verification'];
      else errors.push(`verification ไม่ถูกต้อง: ${r.verification}`);
    }
    if (has('verified_at')) {
      if (!DATE.test(r.verified_at) || r.verified_at > today) errors.push('verified_at ต้องเป็นวันที่ YYYY-MM-DD ที่ไม่เกินวันนี้');
      else f.verified_at = r.verified_at;
    }
    for (const [col, key] of [['is_demo', 'is_demo'], ['is_published', 'is_published']] as const) {
      if (!has(col)) continue;
      const b = parseBool(r[col]);
      if (b === undefined) errors.push(`${col} ต้องเป็น yes หรือ no`);
      else if (b !== null) f[key] = b;
    }

    // --- facilities
    const facilities: Analyzed['facilities'] = {};
    for (const k of FACILITY_KEYS) {
      if (!has(k)) continue;
      const b = parseBool(r[k]);
      if (b === undefined) errors.push(`${k} ต้องเป็น yes / no หรือเว้นว่าง`);
      else facilities[k] = b;
    }

    // --- source
    let source: SourceRow | null = null;
    if (has('source_url')) {
      if (!/^https?:\/\/[^\s<>"']+$/i.test(r.source_url) || r.source_url.length > 1000) errors.push('source_url ต้องขึ้นต้นด้วย http(s)://');
      else {
        const type = (r.source_type || 'other') as SourceType;
        if (!SOURCE_TYPES.includes(type)) errors.push(`source_type ไม่ถูกต้อง: ${r.source_type}`);
        let checked = r.source_checked_at ?? '';
        if (checked && (!DATE.test(checked) || checked > today)) { errors.push('source_checked_at ต้องเป็นวันที่ YYYY-MM-DD'); checked = today; }
        if (!checked) { checked = today; warnings.push('ไม่ระบุวันที่ตรวจแหล่งข้อมูล — ใช้วันนี้'); }
        source = { source_url: r.source_url, source_name: (r.source_name || '').slice(0, 200) || null, source_type: type, checked_at: checked };
      }
    } else if (has('source_name') || has('source_type') || has('source_checked_at')) warnings.push('มีข้อมูลแหล่งข้อมูลแต่ไม่มี source_url — ข้าม');

    // --- matching (when no id)
    if (!matchId && prov && f.name_th) {
      const n = normName(f.name_th);
      const same = ctx.existing.find((e) => e.province_id === prov!.id && normName(e.name_th) === n);
      if (same) { matchId = same.id; matchReason = 'ชื่อซ้ำในจังหวัดเดียวกัน'; }
      else if (coords) {
        const near = ctx.existing.find((e) => e.province_id === prov!.id && e.lat != null && e.lng != null
          && km(coords, { lat: e.lat, lng: e.lng }) <= 0.1
          && (normName(e.name_th).includes(n) || n.includes(normName(e.name_th))));
        if (near) { matchId = near.id; matchReason = `พิกัดใกล้กับ “${near.name_th}” และชื่อคล้ายกัน`; }
      }
    }

    // --- duplicates inside the file
    const key = matchId ? `id:${matchId}` : prov ? `${prov.id}:${normName(f.name_th)}` : '';
    if (key && f.name_th) {
      const prev = seen.get(key);
      if (prev !== undefined) errors.push(`ซ้ำกับแถว ${prev} ในไฟล์เดียวกัน`);
      else seen.set(key, line);
    }

    // --- verified needs a source
    if (f.verification === 'verified' && !source && !(matchId && ctx.withSource.has(matchId))) {
      f.verification = 'pending';
      warnings.push('ตั้ง “verified” ไม่ได้เพราะไม่มีแหล่งข้อมูล — ใช้ “pending”');
    }

    let input: PlaceInput | null = null;
    if (!errors.length) {
      const res = fromForm(f);
      if (res.ok) input = res.input;
      else errors.push(res.error);
    }

    const patch: Partial<PlaceInput> = {};
    if (input && matchId) {
      const keys = new Set<keyof PlaceInput>();
      Object.keys(COL_KEYS).forEach((c) => { if (has(c)) COL_KEYS[c].forEach((k) => keys.add(k)); });
      if (coords && has('google_maps_url')) ['lat', 'lng', 'district_id'].forEach((k) => keys.add(k as keyof PlaceInput));
      if (input.verification !== 'verified' && !has('verified_at')) keys.delete('verified_at');
      keys.forEach((k) => { (patch as Record<string, unknown>)[k] = input![k]; });
    }

    return {
      line, name: f.name_th || '(ไม่มีชื่อ)', kind: errors.length ? 'error' : matchId ? 'match' : 'new',
      errors, warnings, input, patch, matchId, matchReason, facilities, source,
    };
  });
}

export function summarize(rows: Analyzed[], mode: ImportMode) {
  const s = { total: rows.length, insert: 0, update: 0, skip: 0, error: 0, warn: 0 };
  for (const r of rows) {
    if (r.warnings.length) s.warn++;
    if (r.kind === 'error') s.error++;
    else if (r.kind === 'new') s.insert++;
    else if (mode === 'new_only') s.skip++;
    else s.update++;
  }
  return s;
}
