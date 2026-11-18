// Personal backup file format + validation + restore planning (pure, testable).
export const BACKUP_APP = 'thai77';
export const BACKUP_KIND = 'personal-backup';
export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** insert order matters (foreign keys) */
export const TABLES = [
  'userPlaces', 'trips', 'tripDays', 'accommodations', 'tripItems', 'tripRoutes', 'budgetItems',
  'travelMemories', 'visitedPlaces', 'memoryPhotos', 'userPlaceStatus', 'favorites',
] as const;
export type TableKey = (typeof TABLES)[number];

export const DB_TABLE: Record<TableKey, string> = {
  userPlaces: 'user_places', trips: 'trips', tripDays: 'trip_days', accommodations: 'accommodations',
  tripItems: 'trip_items', tripRoutes: 'trip_routes', budgetItems: 'budget_items', travelMemories: 'travel_memories',
  visitedPlaces: 'visited_places', memoryPhotos: 'memory_photos', userPlaceStatus: 'user_place_status', favorites: 'favorites',
};

export const TABLE_LABEL: Record<TableKey, string> = {
  userPlaces: 'สถานที่ส่วนตัว', trips: 'ทริป', tripDays: 'วันในทริป', accommodations: 'ที่พัก', tripItems: 'กิจกรรมใน Timeline',
  tripRoutes: 'เส้นทาง', budgetItems: 'รายการงบประมาณ', travelMemories: 'บันทึกการเดินทาง', visitedPlaces: 'สถานที่ที่เคยไป',
  memoryPhotos: 'รูปภาพ (ข้อมูลอ้างอิง)', userPlaceStatus: 'สถานะสถานที่', favorites: 'สถานที่โปรด',
};

export type Row = Record<string, unknown> & { id: string };
export type Backup = {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  userId: string;
  refs: { budgetCategories: Record<string, string> }; // id -> slug
  data: Record<TableKey, Row[]> & { userSettings: Record<string, unknown> | null };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Upgrade older files here when SCHEMA_VERSION increases. */
function migrate(b: Record<string, unknown>): Record<string, unknown> {
  return b; // only v1 exists
}

export function validateBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return { ok: false, error: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง' }; }
  if (!isObj(raw) || raw.app !== BACKUP_APP || raw.kind !== BACKUP_KIND) {
    return { ok: false, error: 'ไม่ใช่ไฟล์สำรองข้อมูลของแอปนี้ (ถ้าเป็นไฟล์สถานที่ ให้ใช้หน้า Admin → นำเข้า)' };
  }
  const v = Number(raw.schemaVersion);
  if (!Number.isInteger(v) || v < 1) return { ok: false, error: 'ไม่พบเวอร์ชันของไฟล์สำรอง' };
  if (v > SCHEMA_VERSION) return { ok: false, error: `ไฟล์นี้มาจากแอปเวอร์ชันใหม่กว่า (v${v}) — อัปเดตแอปก่อน` };
  const b = migrate(raw);
  if (!isObj(b.data)) return { ok: false, error: 'ไฟล์ไม่มีส่วนข้อมูล' };
  const data = b.data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const t of TABLES) {
    const list = data[t] ?? [];
    if (!Array.isArray(list)) return { ok: false, error: `ข้อมูล ${TABLE_LABEL[t]} ไม่ถูกต้อง` };
    for (const r of list) {
      if (!isObj(r) || typeof r.id !== 'string' || !UUID.test(r.id)) return { ok: false, error: `ข้อมูล ${TABLE_LABEL[t]} มีรายการที่ไม่ถูกต้อง` };
    }
    out[t] = list;
  }
  out.userSettings = isObj(data.userSettings) ? data.userSettings : null;
  const refs = isObj(b.refs) && isObj(b.refs.budgetCategories) ? b.refs.budgetCategories as Record<string, string> : {};
  return {
    ok: true,
    backup: {
      app: BACKUP_APP, kind: BACKUP_KIND, schemaVersion: v, exportedAt: String(b.exportedAt ?? ''), userId: String(b.userId ?? ''),
      refs: { budgetCategories: refs }, data: out as Backup['data'],
    },
  };
}

export type RestoreMode = 'merge' | 'replace';
export type PreviewLine = { table: TableKey; total: number; existing: number; insert: number };

export function previewCounts(b: Backup, existing: Partial<Record<TableKey, Set<string>>>, mode: RestoreMode): PreviewLine[] {
  return TABLES.map((t) => {
    const rows = b.data[t];
    const ex = mode === 'merge' ? rows.filter((r) => existing[t]?.has(r.id)).length : 0;
    return { table: t, total: rows.length, existing: ex, insert: rows.length - ex };
  }).filter((l) => l.total > 0);
}

export type TransformCtx = {
  uid: string;
  backupUid: string;
  validPlaceIds: Set<string>;
  budgetCatBySlug: Map<string, string>; // slug -> current id
  otherBudgetCat: string | null;
};

const omit = (r: Row, keys: string[]) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!keys.includes(k) && k !== '__proto__') o[k] = v;
  return o as Row;
};

/**
 * Prepare one row for insertion into the current account.
 * Returns null when the row cannot be restored (e.g. a status for a place that no longer exists).
 */
export function transformRow(t: TableKey, r: Row, b: Backup, c: TransformCtx): Row | null {
  const row = omit(r, ['updated_at']);
  const place = (k: string) => { if (row[k] && !c.validPlaceIds.has(String(row[k]))) row[k] = null; };
  switch (t) {
    case 'userPlaces':
      row.owner_id = c.uid;
      row.promoted_place_id = null;
      if (row.submission === 'approved' || row.submission === 'rejected') row.submission = 'private';
      return row;
    case 'trips':
      row.owner_id = c.uid;
      row.share_token = null;
      return row;
    case 'tripItems':
      place('place_id');
      return row;
    case 'budgetItems': {
      const slug = b.refs.budgetCategories[String(row.category_id)];
      const id = (slug && c.budgetCatBySlug.get(slug)) || c.otherBudgetCat;
      if (!id) return null;
      row.category_id = id;
      row.created_by = c.uid;
      row.paid_by = row.paid_by && row.paid_by === c.backupUid ? c.uid : null;
      return row;
    }
    case 'travelMemories':
      row.user_id = c.uid;
      return row;
    case 'visitedPlaces':
      row.user_id = c.uid;
      row.cover_photo_id = null; // set after photos are restored
      place('place_id');
      return row;
    case 'memoryPhotos':
      row.user_id = c.uid;
      return row;
    case 'userPlaceStatus':
    case 'favorites':
      row.user_id = c.uid;
      if (row.place_id && !c.validPlaceIds.has(String(row.place_id))) return null;
      return row;
    default:
      return row; // child rows keep their trip_id / day_id
  }
}

export const SETTINGS_FIELDS = [
  'theme', 'color_mode', 'locale', 'hidden_category_ids', 'default_mode', 'fuel_km_per_l', 'fuel_price_per_l',
  'road_factor', 'goal_threshold_pct', 'extra',
] as const;

export function pickSettings(s: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!s) return null;
  const o: Record<string, unknown> = {};
  for (const k of SETTINGS_FIELDS) if (k in s && s[k] !== undefined) o[k] = s[k];
  return Object.keys(o).length ? o : null;
}
