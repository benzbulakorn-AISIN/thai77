// Wording for one travel leg on the timeline ("~12 กม. · 25 นาที · ประมาณ"). Pure.
import { fmtDuration } from '../routing/time';

/** a drive of 1.5 h or more is flagged */
export const LONG_LEG_MIN = 90;

export type Leg = { km: number; min: number; estimated: boolean; bufferMin?: number };

export function formatKm(km: number): string | null {
  if (!Number.isFinite(km) || km < 0.05) return null;
  if (km < 0.975) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} ม.`;
  const r = Math.round(km * 10) / 10;
  return r < 10 ? `${r.toFixed(1)} กม.` : `${Math.round(km).toLocaleString('th-TH')} กม.`;
}

export type LegSummary = {
  distance: string | null;
  duration: string | null;
  /** distance and duration joined with " · " (null when there is neither) */
  main: string | null;
  long: boolean;
  /** "ประมาณ" (computed) or "กำหนดเอง" (typed in by the user) */
  source: 'ประมาณ' | 'กำหนดเอง';
  buffer: string | null;
  /** read out by screen readers */
  a11y: string;
};

export function legSummary(leg: Leg, modeLabel: string): LegSummary {
  const distance = formatKm(leg.km);
  const min = Number.isFinite(leg.min) ? Math.max(0, Math.round(leg.min)) : 0;
  const duration = min > 0 ? fmtDuration(min) : null;
  const main = [distance, duration].filter(Boolean).join(' · ') || null;
  const source = leg.estimated ? 'ประมาณ' : 'กำหนดเอง';
  const buf = leg.bufferMin && leg.bufferMin > 0 ? `เผื่อ ${Math.round(leg.bufferMin)} น.` : null;
  const parts = [main ? `เดินทาง${modeLabel} ${main}` : null, main ? source : null, buf].filter(Boolean);
  return { distance, duration, main, long: min >= LONG_LEG_MIN, source, buffer: buf, a11y: parts.join(' · ') };
}
