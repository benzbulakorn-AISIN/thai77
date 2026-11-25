import { toCsv } from './csv';
import { normName } from './importModel';

export type LandmarkSourceBundle = {
  source_url: string;
  source_name?: string;
  source_type?: 'tat' | 'province' | 'national_park' | 'local_gov' | 'official_social' | 'osm' | 'other';
  checked_at?: string;
  note?: string;
};

export type LandmarkImageBundle = {
  image_url?: string;
  commons_page_url?: string;
  file_name?: string;
  width_px?: number;
  height_px?: number;
  author?: string;
  license_code?: string;
  license_url?: string;
  attribution_text?: string;
  alt_text_th?: string;
  sharealike_required?: boolean;
  modifications?: string;
  image_status: 'license_verified_visual_pending' | 'missing' | 'rejected_as_cover';
  temporary_cover_label?: string;
  review_note?: string;
};

export type LandmarkBundleItem = {
  place_key: string;
  production_place_id?: string;
  province_pcode: string;
  province_name_th: string;
  landmark_rank: number;
  place_name_th: string;
  place_name_en?: string;
  landmark_reason_th: string;
  landmark_status: 'pending';
  is_published: false;
  sources: LandmarkSourceBundle[];
  image: LandmarkImageBundle;
};

export type LandmarkBundle = {
  version: 1 | 2;
  region: 'north' | 'all';
  generated_at: string;
  instructions?: string;
  landmarks: LandmarkBundleItem[];
};

export type LandmarkLinkCtx = {
  provinces: { id: string; pcode: string; name_th: string }[];
  places: { id: string; name_th: string; province_id: string }[];
};

export type AnalyzedLandmarkLink = {
  index: number;
  item: LandmarkBundleItem;
  placeId: string | null;
  matchReason: string | null;
  kind: 'ready' | 'error';
  errors: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = new Set(['tat', 'province', 'national_park', 'local_gov', 'official_social', 'osm', 'other']);
const IMAGE_STATES = new Set(['license_verified_visual_pending', 'missing', 'rejected_as_cover']);
const HTTP = /^https?:\/\/[^\s<>"']+$/i;
const WIKIMEDIA_UPLOAD = /^https:\/\/upload\.wikimedia\.org\//i;

const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';

function assertObject(v: unknown, name: string): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${name} ต้องเป็น object`);
}

function parseSource(v: unknown, label: string): LandmarkSourceBundle {
  assertObject(v, label);
  const source_url = text(v.source_url);
  if (!HTTP.test(source_url)) throw new Error(`${label}: source_url ไม่ถูกต้อง`);
  const source_type = text(v.source_type) || 'other';
  if (!SOURCE_TYPES.has(source_type)) throw new Error(`${label}: source_type ไม่ถูกต้อง`);
  const checked_at = text(v.checked_at);
  if (checked_at && !DATE.test(checked_at)) throw new Error(`${label}: checked_at ต้องเป็น YYYY-MM-DD`);
  return {
    source_url,
    source_name: text(v.source_name) || undefined,
    source_type: source_type as LandmarkSourceBundle['source_type'],
    checked_at: checked_at || undefined,
    note: text(v.note) || undefined,
  };
}

function parseImage(v: unknown, label: string): LandmarkImageBundle {
  assertObject(v, label);
  const image_status = text(v.image_status);
  if (!IMAGE_STATES.has(image_status)) {
    throw new Error(`${label}: ห้ามอนุมัติรูปผ่านไฟล์เชื่อม (ใช้ pending/missing/rejected เท่านั้น)`);
  }
  const image_url = text(v.image_url);
  if (image_url && !WIKIMEDIA_UPLOAD.test(image_url)) throw new Error(`${label}: image_url ต้องเป็น upload.wikimedia.org`);
  const page = text(v.commons_page_url);
  if (page && !/^https:\/\/commons\.wikimedia\.org\//i.test(page)) throw new Error(`${label}: commons_page_url ไม่ถูกต้อง`);
  const width = v.width_px == null || v.width_px === '' ? undefined : Number(v.width_px);
  const height = v.height_px == null || v.height_px === '' ? undefined : Number(v.height_px);
  if (width != null && (!Number.isInteger(width) || width <= 0)) throw new Error(`${label}: width_px ไม่ถูกต้อง`);
  if (height != null && (!Number.isInteger(height) || height <= 0)) throw new Error(`${label}: height_px ไม่ถูกต้อง`);
  return {
    image_url: image_url || undefined,
    commons_page_url: page || undefined,
    file_name: text(v.file_name) || undefined,
    width_px: width,
    height_px: height,
    author: text(v.author) || undefined,
    license_code: text(v.license_code) || undefined,
    license_url: text(v.license_url) || undefined,
    attribution_text: text(v.attribution_text) || undefined,
    alt_text_th: text(v.alt_text_th) || undefined,
    sharealike_required: typeof v.sharealike_required === 'boolean' ? v.sharealike_required : undefined,
    modifications: text(v.modifications) || undefined,
    image_status: image_status as LandmarkImageBundle['image_status'],
    temporary_cover_label: text(v.temporary_cover_label) || 'ภาพประกอบ',
    review_note: text(v.review_note) || undefined,
  };
}

function parseItem(v: unknown, index: number): LandmarkBundleItem {
  const label = `landmarks[${index}]`;
  assertObject(v, label);
  const rank = Number(v.landmark_rank);
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) throw new Error(`${label}: landmark_rank ต้องเป็น 1–10`);
  const productionId = text(v.production_place_id);
  if (productionId && !UUID.test(productionId)) throw new Error(`${label}: production_place_id ไม่ใช่ UUID`);
  const status = text(v.landmark_status);
  if (status !== 'pending' || v.is_published !== false) {
    throw new Error(`${label}: ชุดเชื่อมต้องเริ่ม pending และ is_published=false เท่านั้น`);
  }
  const required = ['place_key', 'province_pcode', 'province_name_th', 'place_name_th', 'landmark_reason_th'] as const;
  required.forEach((key) => { if (!text(v[key])) throw new Error(`${label}: ${key} ห้ามว่าง`); });
  if (!Array.isArray(v.sources) || v.sources.length === 0) throw new Error(`${label}: ต้องมี sources อย่างน้อย 1 รายการ`);
  return {
    place_key: text(v.place_key),
    production_place_id: productionId || undefined,
    province_pcode: text(v.province_pcode),
    province_name_th: text(v.province_name_th),
    landmark_rank: rank,
    place_name_th: text(v.place_name_th),
    place_name_en: text(v.place_name_en) || undefined,
    landmark_reason_th: text(v.landmark_reason_th),
    landmark_status: 'pending',
    is_published: false,
    sources: v.sources.map((s, i) => parseSource(s, `${label}.sources[${i}]`)),
    image: parseImage(v.image, `${label}.image`),
  };
}

export function parseLandmarkBundle(fileName: string, raw: string): LandmarkBundle {
  if (!/\.json$/i.test(fileName)) throw new Error('ไฟล์เชื่อม Landmark ต้องเป็น JSON');
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('ไฟล์ JSON ไม่ถูกต้อง'); }
  assertObject(data, 'bundle');
  const version = Number(data.version);
  const region = text(data.region);
  const supported = (version === 1 && region === 'north') || (version === 2 && region === 'all');
  if (!supported) throw new Error('รองรับ bundle version 1 ภาคเหนือ หรือ version 2 ครบ 77 จังหวัด');
  if (!Array.isArray(data.landmarks) || data.landmarks.length === 0) throw new Error('ไม่พบรายการ landmarks');
  const landmarks = data.landmarks.map(parseItem);
  const keySet = new Set<string>();
  const rankSet = new Set<string>();
  landmarks.forEach((item) => {
    if (keySet.has(item.place_key)) throw new Error(`place_key ซ้ำ: ${item.place_key}`);
    keySet.add(item.place_key);
    const rankKey = `${item.province_pcode}:${item.landmark_rank}`;
    if (rankSet.has(rankKey)) throw new Error(`อันดับซ้ำในจังหวัด: ${rankKey}`);
    rankSet.add(rankKey);
  });
  return {
    version: version as 1 | 2,
    region: region as 'north' | 'all',
    generated_at: text(data.generated_at),
    instructions: text(data.instructions) || undefined,
    landmarks,
  };
}

export function analyzeLandmarkBundle(bundle: LandmarkBundle, ctx: LandmarkLinkCtx): AnalyzedLandmarkLink[] {
  const seenPlaces = new Set<string>();
  return bundle.landmarks.map((item, index) => {
    const errors: string[] = [];
    const pcode = item.province_pcode.toUpperCase().replace(/^TH/, '');
    const province = ctx.provinces.find((p) => p.pcode.toUpperCase().replace(/^TH/, '') === pcode);
    let placeId: string | null = null;
    let matchReason: string | null = null;
    if (!province) errors.push(`ไม่พบจังหวัด ${item.province_pcode}`);
    if (province) {
      if (item.production_place_id) {
        const place = ctx.places.find((p) => p.id.toLowerCase() === item.production_place_id!.toLowerCase());
        if (!place) errors.push('ไม่พบ production_place_id ในฐานข้อมูลปัจจุบัน');
        else if (place.province_id !== province.id) errors.push('production_place_id อยู่คนละจังหวัด');
        else { placeId = place.id; matchReason = 'production_place_id ตรงกัน'; }
      } else {
        const name = normName(item.place_name_th);
        const matches = ctx.places.filter((p) => p.province_id === province.id && normName(p.name_th) === name);
        if (matches.length === 0) errors.push('ยังไม่พบสถานที่ชื่อเดียวกันในจังหวัด — นำเข้า places ก่อนแล้ว Preview ใหม่');
        else if (matches.length > 1) errors.push('พบสถานที่ชื่อเดียวกันมากกว่า 1 แห่ง — ต้องใส่ production_place_id จริง');
        else { placeId = matches[0].id; matchReason = 'ชื่อไทยตรงกันในจังหวัดเดียวกัน'; }
      }
    }
    if (placeId && seenPlaces.has(placeId)) errors.push('place_id ซ้ำใน bundle เดียวกัน');
    if (placeId) seenPlaces.add(placeId);
    return { index, item, placeId, matchReason, kind: errors.length ? 'error' : 'ready', errors };
  });
}

export function summarizeLandmarkLinks(rows: AnalyzedLandmarkLink[]) {
  return {
    total: rows.length,
    ready: rows.filter((r) => r.kind === 'ready').length,
    error: rows.filter((r) => r.kind === 'error').length,
    fixedId: rows.filter((r) => r.kind === 'ready' && r.item.production_place_id).length,
    exactName: rows.filter((r) => r.kind === 'ready' && !r.item.production_place_id).length,
  };
}

export function landmarkMappingCsv(rows: AnalyzedLandmarkLink[]): string {
  const header = ['place_key', 'province_pcode', 'landmark_rank', 'place_name_th', 'production_place_id', 'match_reason', 'status'];
  const data = rows.map((r) => [
    r.item.place_key, r.item.province_pcode, r.item.landmark_rank, r.item.place_name_th,
    r.placeId ?? '', r.matchReason ?? '', r.kind === 'ready' ? 'ready_pending_link' : r.errors.join(' | '),
  ]);
  return toCsv([header, ...data]);
}
