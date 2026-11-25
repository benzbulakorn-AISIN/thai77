export type MapStatus = 'none' | 'planned' | 'visited' | 'goal';

const LIGHT: Record<MapStatus, string> = { none: '#CBD5E1', planned: '#38BDF8', visited: '#22C55E', goal: '#EAB308' };
const DARK: Record<MapStatus, string> = { none: '#475569', planned: '#0EA5E9', visited: '#16A34A', goal: '#CA8A04' };

export const isDark = () => document.documentElement.classList.contains('dark');
export const statusColor = (s: MapStatus) => (isDark() ? DARK : LIGHT)[s];
export const primaryColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0369A1';

export const STATUS_LABEL: Record<MapStatus, string> = {
  none: 'ยังไม่เคยไป',
  planned: 'มีแผนจะไป',
  visited: 'เคยไปแล้ว',
  goal: 'ไปครบเป้า',
};
