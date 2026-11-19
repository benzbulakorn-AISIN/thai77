// Trip sharing — owner side. Pure logic (no React, no network, no clock unless passed in).
// The rules for cleaning / length limits mirror public.create_trip_share (Migration 009) EXACTLY, so what the form
// counts is what the database accepts. The database is still the authority: it re-checks everything.

export const MAX_ACTIVE_LINKS = 5;
export const NAME_MAX = 120;
export const SHARER_MAX = 60;
export const MESSAGE_MAX = 280;
export const DEFAULT_EXPIRY_DAYS = 30;

export const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 วัน' },
  { days: 30, label: '30 วัน' },
  { days: 90, label: '90 วัน' },
  { days: null, label: 'ไม่หมดอายุ' },
];

export type ShareForm = {
  displayName: string;
  sharerName: string;
  message: string;
  /** null = never expires */
  expiresDays: number | null;
  showDates: boolean;
  showLodgingNames: boolean;
  showCustomTitles: boolean;
};

/** defaults agreed for Part 7.8: dates shown, lodging / typed titles hidden, 30 days */
export const defaultShareForm = (tripName: string): ShareForm => ({
  displayName: String(tripName ?? '').slice(0, 400),
  sharerName: '',
  message: '',
  expiresDays: DEFAULT_EXPIRY_DAYS,
  showDates: true,
  showLodgingNames: false,
  showCustomTitles: false,
});

const chars = (s: string) => [...s].length; // code points, like PostgreSQL char_length

/**
 * Same as public.share_clean_text: control characters -> space (newlines kept for messages), spaces trimmed at both ends
 * (only spaces: PostgreSQL btrim() default), empty -> null.
 */
export function cleanShareText(raw: string | null | undefined, keepNewlines = false): string | null {
  const re = keepNewlines ? /[\u0001-\u0009\u000b-\u001f\u007f]/g : /[\u0001-\u001f\u007f]/g;
  const s = String(raw ?? '').replace(re, ' ').replace(/^ +| +$/g, '');
  return s === '' ? null : s;
}

/** a message as it is sent: cleaned like the database does, then blank lines / spaces at both ends removed (more lenient than the database, never stricter) */
export function cleanMessage(raw: string | null | undefined): string | null {
  const c = cleanShareText(raw, true);
  if (c === null) return null;
  const t = c.replace(/^\s+|\s+$/g, '');
  return t === '' ? null : t;
}

export type ShareParams = {
  p_trip: string;
  p_display_name: string | null;
  p_sharer_name: string | null;
  p_message: string | null;
  p_expires_days: number | null;
  p_show_dates: boolean;
  p_show_lodging_names: boolean;
  p_show_custom_titles: boolean;
};

export type FormField = 'displayName' | 'sharerName' | 'message' | 'expiresDays';
export type FormCheck = { ok: true; params: ShareParams } | { ok: false; field: FormField; error: string };

export function validateShareForm(tripId: string, f: ShareForm): FormCheck {
  const name = cleanShareText(f.displayName);
  const sharer = cleanShareText(f.sharerName);
  const message = cleanMessage(f.message);
  if (name !== null && chars(name) > NAME_MAX) return { ok: false, field: 'displayName', error: `ชื่อที่แสดงยาวเกิน ${NAME_MAX} ตัวอักษร` };
  if (sharer !== null && chars(sharer) > SHARER_MAX) return { ok: false, field: 'sharerName', error: `ชื่อผู้แชร์ยาวเกิน ${SHARER_MAX} ตัวอักษร` };
  if (message !== null && chars(message) > MESSAGE_MAX) return { ok: false, field: 'message', error: `ข้อความยาวเกิน ${MESSAGE_MAX} ตัวอักษร` };
  const d = f.expiresDays;
  if (d !== null && !(Number.isInteger(d) && d >= 1 && d <= 365)) return { ok: false, field: 'expiresDays', error: 'อายุลิงก์ต้องเป็น 1–365 วัน หรือไม่หมดอายุ' };
  return {
    ok: true,
    params: {
      p_trip: tripId,
      p_display_name: name, // empty -> the database falls back to the trip name
      p_sharer_name: sharer,
      p_message: message,
      p_expires_days: d,
      p_show_dates: f.showDates,
      p_show_lodging_names: f.showLodgingNames,
      p_show_custom_titles: f.showCustomTitles,
    },
  };
}

export const messageCount = (raw: string) => chars(cleanMessage(raw) ?? '');

// ---------------------------------------------------------------- links

export type ShareRow = {
  id: string;
  trip_id: string;
  token: string;
  display_name: string;
  sharer_name: string | null;
  message: string | null;
  show_dates: boolean;
  show_lodging_names: boolean;
  show_custom_titles: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ShareStatus = 'active' | 'expired' | 'revoked';

export function shareStatus(row: Pick<ShareRow, 'revoked_at' | 'expires_at'>, now: number): ShareStatus {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at) {
    const t = Date.parse(row.expires_at);
    if (Number.isFinite(t) && t <= now) return 'expired';
  }
  return 'active';
}

export const activeShares = (rows: ShareRow[], now: number) => rows.filter((r) => shareStatus(r, now) === 'active');
export const canCreateMore = (rows: ShareRow[], now: number) => activeShares(rows, now).length < MAX_ACTIVE_LINKS;

/** newest first, active ones before the finished ones */
export function sortShares(rows: ShareRow[], now: number): ShareRow[] {
  return [...rows].sort((a, b) => {
    const sa = shareStatus(a, now) === 'active' ? 0 : 1;
    const sb = shareStatus(b, now) === 'active' ? 0 : 1;
    return sa - sb || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** a route parameter -> normalised token, or null when it cannot be a link token */
export function parseShareToken(raw: string | null | undefined): string | null {
  let s = String(raw ?? '');
  try { s = decodeURIComponent(s); } catch { return null; }
  s = s.trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}

/** https://host/thai77/#/s/<token>  (nothing after "#" is ever sent to a server) */
export function buildShareUrl(origin: string, pathname: string, token: string): string | null {
  const t = parseShareToken(token);
  if (!t) return null;
  let p = String(pathname ?? '/').replace(/index\.html?$/i, '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return `${String(origin ?? '').replace(/\/+$/, '')}${p}#/s/${t}`;
}

export const tokenTail = (token: string) => `…${String(token ?? '').slice(-4)}`;

/** "ภาพถ่าย…" style one-liner of the options of a link */
export function optionLabels(r: Pick<ShareRow, 'show_dates' | 'show_lodging_names' | 'show_custom_titles'>): string[] {
  const out: string[] = [];
  if (!r.show_dates) out.push('ซ่อนวันที่');
  if (r.show_lodging_names) out.push('แสดงชื่อที่พัก');
  if (r.show_custom_titles) out.push('แสดงชื่อที่พิมพ์เอง');
  return out;
}

// ---------------------------------------------------------------- errors

type ApiError = { code?: string; message?: string } | null | undefined;

/** friendly Thai text for the errors the share functions can raise */
export function shareErrorText(err: unknown): string {
  const e = (err ?? {}) as NonNullable<ApiError>;
  const code = String(e.code ?? '');
  const msg = String(e.message ?? (err instanceof Error ? err.message : ''));
  if (code === '42501') return 'เฉพาะเจ้าของทริปเท่านั้นที่แชร์ได้ (ลอง Login ใหม่ถ้าเพิ่งเข้าสู่ระบบ)';
  if (code === '54000') return `มีลิงก์ที่ใช้งานอยู่ครบ ${MAX_ACTIVE_LINKS} ลิงก์แล้ว — ปิดลิงก์เก่าก่อน`;
  if (code === '22023') return 'ข้อมูลที่กรอกไม่ถูกต้อง ตรวจความยาวของช่องต่าง ๆ';
  if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg)) {
    return 'ยังไม่ได้รัน Migration 009 / 010 ใน Supabase (ฟังก์ชันแชร์ทริป)';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
  return 'ไม่สำเร็จ ลองใหม่อีกครั้ง';
}
