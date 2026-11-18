// Pure logic for the Explore page (no React / Supabase): grouping, labels, search, breadcrumbs.
import type { MapStatus } from '../map/colors';
import { regionColor } from '../covers/regionColors';

export type RegionLite = { id: string; code: string; name_th: string };
export type ProvinceLite = { id: string; pcode: string; slug: string; name_th: string; name_en: string; region_id: string };
export type StatLite = { total: number; planned: number; visited: number; target: number };

/** province P-code -> region code */
export function provinceRegionMap(provinces: ProvinceLite[], regions: RegionLite[]): Map<string, string> {
  const byId = new Map(regions.map((r) => [r.id, r.code]));
  const m = new Map<string, string>();
  for (const p of provinces) {
    const code = byId.get(p.region_id);
    if (code) m.set(p.pcode, code);
  }
  return m;
}

/** The largest province of each region carries that region's label on the level-1 map. */
export function pickLabelHolders(items: { pcode: string; region: string | undefined; area: number }[]): Set<string> {
  const best = new Map<string, { pcode: string; area: number }>();
  for (const it of items) {
    if (!it.region) continue;
    const cur = best.get(it.region);
    if (!cur || it.area > cur.area || (it.area === cur.area && it.pcode < cur.pcode)) best.set(it.region, { pcode: it.pcode, area: it.area });
  }
  return new Set([...best.values()].map((b) => b.pcode));
}

export type RegionCard = { code: string; name: string; color: string; provinceCount: number; visitedCount: number; placeCount: number };

export function regionCards(regions: RegionLite[], provinces: ProvinceLite[], stats: Record<string, StatLite>): RegionCard[] {
  return regions.map((r) => {
    const ps = provinces.filter((p) => p.region_id === r.id);
    return {
      code: r.code,
      name: r.name_th,
      color: regionColor(r.code),
      provinceCount: ps.length,
      visitedCount: ps.filter((p) => (stats[p.id]?.visited ?? 0) > 0).length,
      placeCount: ps.reduce((s, p) => s + (stats[p.id]?.total ?? 0), 0),
    };
  });
}

export type ProvinceRow = { pcode: string; slug: string; name: string; total: number; visited: number; planned: number; status: MapStatus };

export function provinceRows(
  regionId: string,
  provinces: ProvinceLite[],
  stats: Record<string, StatLite>,
  statusFn: (s: StatLite | undefined) => MapStatus,
): ProvinceRow[] {
  return provinces
    .filter((p) => p.region_id === regionId)
    .map((p) => ({
      pcode: p.pcode,
      slug: p.slug,
      name: p.name_th,
      total: stats[p.id]?.total ?? 0,
      visited: stats[p.id]?.visited ?? 0,
      planned: stats[p.id]?.planned ?? 0,
      status: statusFn(stats[p.id]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export type Crumb = { text: string; state: 'done' | 'now' | 'todo' };

/** "เลือกภาค → เลือกจังหวัด" status bar */
export function crumbs(level: 1 | 2, regionName?: string | null, provinceName?: string | null): Crumb[] {
  if (level === 1 || !regionName) return [{ text: 'เลือกภาค', state: 'now' }, { text: 'เลือกจังหวัด', state: 'todo' }];
  if (!provinceName) return [{ text: regionName, state: 'done' }, { text: 'เลือกจังหวัด', state: 'now' }];
  return [{ text: regionName, state: 'done' }, { text: provinceName, state: 'now' }];
}

export const normalizeQuery = (s: string) =>
  s.normalize('NFC').toLowerCase().trim().replace(/^(จังหวัด|จ\.)\s*/, '').replace(/\s+/g, ' ');

/** province search: Thai prefix first, then English prefix, then "contains" */
export function searchProvinces<T extends ProvinceLite>(provinces: T[], q: string, limit = 8): T[] {
  const n = normalizeQuery(q);
  if (!n) return [];
  const compact = n.replace(/\s/g, '');
  const scored: { p: T; s: number }[] = [];
  for (const p of provinces) {
    const th = p.name_th.normalize('NFC').toLowerCase();
    const en = p.name_en.toLowerCase();
    const enc = en.replace(/\s/g, '');
    let s = -1;
    if (th.startsWith(n)) s = 0;
    else if (en.startsWith(n) || enc.startsWith(compact)) s = 1;
    else if (th.includes(n)) s = 2;
    else if (en.includes(n) || enc.includes(compact)) s = 3;
    if (s >= 0) scored.push({ p, s });
  }
  scored.sort((a, b) => a.s - b.s || a.p.name_th.localeCompare(b.p.name_th, 'th'));
  return scored.slice(0, limit).map((x) => x.p);
}
