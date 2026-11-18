// One colour per region (codes match public.regions.code). All pass 4.5:1 contrast with white text.
export const REGION_ORDER = ['north', 'northeast', 'central', 'east', 'west', 'south'] as const;
export type RegionCode = (typeof REGION_ORDER)[number];

export const REGION_COLORS: Record<RegionCode, string> = {
  north: '#15803D',      // เขียวภูเขา
  northeast: '#C2410C',  // ส้มทุ่งนา
  central: '#A16207',    // ทองแม่น้ำ
  east: '#0369A1',       // น้ำเงินทะเล
  west: '#7C3AED',       // ม่วงเทือกเขา
  south: '#0F766E',      // เขียวมรกตอันดามัน
};

export const REGION_FALLBACK = '#64748B';

export function regionColor(code: string | null | undefined): string {
  return (REGION_ORDER as readonly string[]).includes(code ?? '') ? REGION_COLORS[code as RegionCode] : REGION_FALLBACK;
}
