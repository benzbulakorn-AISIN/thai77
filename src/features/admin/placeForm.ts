// Pure form <-> DB conversion + validation for the Admin place editor (no React, testable).
export type Verification = 'verified' | 'pending' | 'outdated' | 'demo';
export type PlaceState = 'active' | 'seasonal' | 'temporarily_closed' | 'permanently_closed';

export type PlaceInput = {
  name_th: string;
  name_en: string | null;
  province_id: string;
  district_id: string | null;
  category_id: string;
  short_description: string | null;
  highlights: string[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  opening_hours_text: string | null;
  closed_days_text: string | null;
  fee_thai: number | null;
  fee_foreigner: number | null;
  parking_fee: number | null;
  est_cost_per_person: number | null;
  suggested_minutes: number | null;
  best_time_of_day: string | null;
  best_months: number[];
  phone: string | null;
  website_url: string | null;
  social_url: string | null;
  google_maps_url: string | null;
  popularity: number;
  state: PlaceState;
  verification: Verification;
  verified_at: string | null;
  is_demo: boolean;
  is_published: boolean;
};

export type PlaceForm = {
  name_th: string; name_en: string; province_id: string; district_id: string; category_id: string;
  short_description: string; highlights: string; coords: string; address: string;
  opening_hours_text: string; closed_days_text: string;
  fee_thai: string; fee_foreigner: string; parking_fee: string; est_cost_per_person: string;
  suggested_minutes: string; best_time_of_day: string; best_months: number[];
  phone: string; website_url: string; social_url: string; google_maps_url: string; popularity: string;
  state: PlaceState; verification: Verification; verified_at: string; is_demo: boolean; is_published: boolean;
};

const s = (v: unknown) => (v == null ? '' : String(v));

export function emptyForm(): PlaceForm {
  return {
    name_th: '', name_en: '', province_id: '', district_id: '', category_id: '', short_description: '', highlights: '',
    coords: '', address: '', opening_hours_text: '', closed_days_text: '', fee_thai: '', fee_foreigner: '', parking_fee: '',
    est_cost_per_person: '', suggested_minutes: '', best_time_of_day: '', best_months: [], phone: '', website_url: '',
    social_url: '', google_maps_url: '', popularity: '0', state: 'active', verification: 'pending', verified_at: '',
    is_demo: false, is_published: true,
  };
}

export function toForm(p: Partial<PlaceInput>): PlaceForm {
  const f = emptyForm();
  return {
    ...f,
    name_th: s(p.name_th), name_en: s(p.name_en), province_id: s(p.province_id), district_id: s(p.district_id),
    category_id: s(p.category_id), short_description: s(p.short_description), highlights: (p.highlights ?? []).join('\n'),
    coords: p.lat != null && p.lng != null ? `${p.lat}, ${p.lng}` : '', address: s(p.address),
    opening_hours_text: s(p.opening_hours_text), closed_days_text: s(p.closed_days_text),
    fee_thai: s(p.fee_thai), fee_foreigner: s(p.fee_foreigner), parking_fee: s(p.parking_fee),
    est_cost_per_person: s(p.est_cost_per_person), suggested_minutes: s(p.suggested_minutes),
    best_time_of_day: s(p.best_time_of_day), best_months: [...(p.best_months ?? [])].sort((a, b) => a - b),
    phone: s(p.phone), website_url: s(p.website_url), social_url: s(p.social_url), google_maps_url: s(p.google_maps_url),
    popularity: s(p.popularity ?? 0), state: p.state ?? f.state, verification: p.verification ?? f.verification,
    verified_at: s(p.verified_at), is_demo: p.is_demo ?? false, is_published: p.is_published ?? true,
  };
}

const opt = (v: string, max: number) => v.trim().slice(0, max) || null;

function money(v: string, label: string): number | null {
  const t = v.replace(/[,\s฿]/g, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) throw new Error(`${label}ไม่ถูกต้อง`);
  return Math.round(n * 100) / 100;
}

function url(v: string, label: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^https?:\/\/[^\s<>"']+$/i.test(t) || t.length > 1000) throw new Error(`${label}ต้องขึ้นต้นด้วย http:// หรือ https://`);
  return t;
}

/** "13.75, 100.50" or Google Maps link -> {lat,lng}; must be inside Thailand bbox (DB check) */
export function parseThaiCoords(v: string): { lat: number; lng: number } | null {
  const t = v.trim();
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t)
    ?? /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t)
    ?? /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{2,3}(?:\.\d+)?)/.exec(t);
  if (!m) return null;
  const lat = Math.round(Number(m[1]) * 1e6) / 1e6;
  const lng = Math.round(Number(m[2]) * 1e6) / 1e6;
  if (!(lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106)) return null;
  return { lat, lng };
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function fromForm(f: PlaceForm): { ok: true; input: PlaceInput } | { ok: false; error: string } {
  try {
    const name = f.name_th.trim();
    if (!name) throw new Error('กรอกชื่อสถานที่ภาษาไทย');
    if (!f.province_id) throw new Error('เลือกจังหวัด');
    if (!f.category_id) throw new Error('เลือกหมวดหมู่');
    let lat: number | null = null, lng: number | null = null;
    if (f.coords.trim()) {
      const c = parseThaiCoords(f.coords);
      if (!c) throw new Error('พิกัดไม่ถูกต้อง หรืออยู่นอกประเทศไทย');
      ({ lat, lng } = c);
    }
    const minutes = f.suggested_minutes.trim() ? Number(f.suggested_minutes) : null;
    if (minutes != null && !(Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440)) throw new Error('เวลาที่ควรใช้ 5–1440 นาที');
    const pop = f.popularity.trim() ? Number(f.popularity) : 0;
    if (!(Number.isInteger(pop) && pop >= 0 && pop <= 100)) throw new Error('ความนิยม 0–100');
    if (f.verified_at && !/^\d{4}-\d{2}-\d{2}$/.test(f.verified_at)) throw new Error('วันที่ตรวจสอบไม่ถูกต้อง');
    const months = [...new Set(f.best_months)].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
    return {
      ok: true,
      input: {
        name_th: name.slice(0, 200),
        name_en: opt(f.name_en, 200),
        province_id: f.province_id,
        district_id: f.district_id || null,
        category_id: f.category_id,
        short_description: opt(f.short_description, 500),
        highlights: f.highlights.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 200)),
        lat, lng,
        address: opt(f.address, 500),
        opening_hours_text: opt(f.opening_hours_text, 300),
        closed_days_text: opt(f.closed_days_text, 300),
        fee_thai: money(f.fee_thai, 'ค่าเข้าชมคนไทย'),
        fee_foreigner: money(f.fee_foreigner, 'ค่าเข้าชมต่างชาติ'),
        parking_fee: money(f.parking_fee, 'ค่าจอดรถ'),
        est_cost_per_person: money(f.est_cost_per_person, 'ค่าใช้จ่ายโดยประมาณ'),
        suggested_minutes: minutes,
        best_time_of_day: opt(f.best_time_of_day, 100),
        best_months: months,
        phone: opt(f.phone, 60),
        website_url: url(f.website_url, 'เว็บไซต์'),
        social_url: url(f.social_url, 'Social Media'),
        google_maps_url: url(f.google_maps_url, 'ลิงก์ Google Maps'),
        popularity: pop,
        state: f.state,
        verification: f.verification,
        verified_at: f.verification === 'verified' ? f.verified_at || todayIso() : f.verified_at || null,
        is_demo: f.is_demo,
        is_published: f.is_published,
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
