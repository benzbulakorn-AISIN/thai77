/** "07:30" | "07:30:00" -> minutes from midnight */
export function toMin(t: string | null | undefined, fallback = 0): number {
  if (!t) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutes -> "07:30" (adds " (+1)" past midnight) */
export function fmtMin(min: number): string {
  const day = Math.floor(min / 1440);
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const s = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return day > 0 ? `${s} (+${day})` : s;
}

/** minutes -> "HH:MM:00" for Postgres time columns */
export const toDbTime = (min: number) => `${fmtMin(Math.min(Math.max(min, 0), 1439)).slice(0, 5)}:00`;

/** "1 ชม. 20 น." */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} ชม. ${r} น.`;
  if (h) return `${h} ชม.`;
  return `${r} น.`;
}

export const roundUp5 = (min: number) => Math.ceil(min / 5) * 5;

/** "2026-11-20" + n days -> "YYYY-MM-DD" (timezone-safe) */
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Monday = 0 ... Sunday = 6 */
export function weekdayMon0(date: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
}

const TH_DAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-11-20" -> "ศ. 20 พ.ย." */
export function fmtDateTh(date: string, withYear = false): string {
  const [y, mo, d] = date.split('-').map(Number);
  const s = `${TH_DAYS[weekdayMon0(date)]} ${d} ${TH_MONTHS[mo - 1]}`;
  return withYear ? `${s} ${y + 543}` : s;
}

export const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
