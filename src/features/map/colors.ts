export type MapStatus = 'none' | 'planned' | 'visited' | 'goal' | 'building' | 'never' | 'stopped' | 'arrived';

const LIGHT: Record<MapStatus, string> = {
  none: '#CBD5E1', planned: '#38BDF8', visited: '#22C55E', goal: '#EAB308',
  building: '#CBD5E1', never: '#94A3B8', stopped: '#38BDF8', arrived: '#EAB308',
};
const DARK: Record<MapStatus, string> = {
  none: '#475569', planned: '#0EA5E9', visited: '#16A34A', goal: '#CA8A04',
  building: '#475569', never: '#64748B', stopped: '#0EA5E9', arrived: '#CA8A04',
};

export const isDark = () => document.documentElement.classList.contains('dark');
export const statusColor = (s: MapStatus) => (isDark() ? DARK : LIGHT)[s];
export const primaryColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0369A1';

export const STATUS_LABEL: Record<MapStatus, string> = {
  none: 'ยังไม่เคยไป',
  planned: 'มีแผนจะไป',
  visited: 'เคยไปแล้ว',
  goal: 'ไปครบเป้า',
  building: 'กำลังจัดทำ Landmark',
  never: 'ยังไม่เคยไป',
  stopped: 'เคยแวะ',
  arrived: 'ถึงแล้ว',
};
