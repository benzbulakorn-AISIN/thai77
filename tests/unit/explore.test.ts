import { describe, expect, it } from 'vitest';
import {
  crumbs, normalizeQuery, pickLabelHolders, provinceRegionMap, provinceRows, regionCards, searchProvinces,
  type ProvinceLite, type RegionLite, type StatLite,
} from '../../src/features/explore/exploreModel';
import {
  FLICK_PX_PER_MS, clampHeight, cycleSnap, nearestSnap, snapFromDrag, snapHeights, SNAP_ORDER,
} from '../../src/features/explore/sheetSnap';
import { REGION_ICONS, REGION_IMAGE_EXTS, regionImageUrl } from '../../src/features/explore/regionImages';
import { REGION_ORDER } from '../../src/features/covers/regionColors';

const regions: RegionLite[] = [
  { id: 'R-n', code: 'north', name_th: 'ภาคเหนือ' },
  { id: 'R-e', code: 'east', name_th: 'ภาคตะวันออก' },
];
const provinces: ProvinceLite[] = [
  { id: 'P20', pcode: 'TH20', slug: 'chon-buri', name_th: 'ชลบุรี', name_en: 'Chon Buri', region_id: 'R-e' },
  { id: 'P21', pcode: 'TH21', slug: 'rayong', name_th: 'ระยอง', name_en: 'Rayong', region_id: 'R-e' },
  { id: 'P22', pcode: 'TH22', slug: 'chanthaburi', name_th: 'จันทบุรี', name_en: 'Chanthaburi', region_id: 'R-e' },
  { id: 'P50', pcode: 'TH50', slug: 'chiang-mai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai', region_id: 'R-n' },
  { id: 'P57', pcode: 'TH57', slug: 'chiang-rai', name_th: 'เชียงราย', name_en: 'Chiang Rai', region_id: 'R-n' },
  { id: 'PX', pcode: 'TH99', slug: 'orphan', name_th: 'ไม่มีภาค', name_en: 'Orphan', region_id: 'R-unknown' },
];
const stat = (o: Partial<StatLite>): StatLite => ({ total: 0, planned: 0, visited: 0, target: 0, ...o });

describe('provinceRegionMap / pickLabelHolders', () => {
  it('maps province codes to region codes and skips unknown regions', () => {
    const m = provinceRegionMap(provinces, regions);
    expect(m.get('TH20')).toBe('east');
    expect(m.get('TH50')).toBe('north');
    expect(m.has('TH99')).toBe(false);
  });
  it('the biggest province of each region carries the region label', () => {
    const holders = pickLabelHolders([
      { pcode: 'A', region: 'east', area: 1 }, { pcode: 'B', region: 'east', area: 5 }, { pcode: 'C', region: 'north', area: 2 },
      { pcode: 'D', region: undefined, area: 99 }, { pcode: 'E', region: 'north', area: 1 },
    ]);
    expect([...holders].sort()).toEqual(['B', 'C']);
  });
  it('ties are broken deterministically (lowest code)', () => {
    expect([...pickLabelHolders([{ pcode: 'Z', region: 'x', area: 3 }, { pcode: 'M', region: 'x', area: 3 }])]).toEqual(['M']);
  });
  it('nothing in, nothing out', () => {
    expect(pickLabelHolders([]).size).toBe(0);
  });
});

describe('regionCards / provinceRows', () => {
  const stats: Record<string, StatLite> = {
    P20: stat({ total: 14, visited: 2, planned: 1 }), P21: stat({ total: 12 }), P50: stat({ total: 14, visited: 1 }),
  };
  it('counts provinces, visited provinces and places per region', () => {
    const c = regionCards(regions, provinces, stats);
    const east = c.find((x) => x.code === 'east')!;
    expect([east.provinceCount, east.visitedCount, east.placeCount]).toEqual([3, 1, 26]);
    expect(east.name).toBe('ภาคตะวันออก');
    expect(east.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const north = c.find((x) => x.code === 'north')!;
    expect([north.provinceCount, north.visitedCount, north.placeCount]).toEqual([2, 1, 14]);
  });
  it('rows only for the region, with stats and the injected status function', () => {
    const rows = provinceRows('R-e', provinces, stats, (s) => (s && s.visited > 0 ? 'visited' : 'none'));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.pcode).sort()).toEqual(['TH20', 'TH21', 'TH22']);
    const cb = rows.find((r) => r.pcode === 'TH20')!;
    expect([cb.total, cb.visited, cb.planned, cb.status, cb.slug]).toEqual([14, 2, 1, 'visited', 'chon-buri']);
    expect(rows.find((r) => r.pcode === 'TH22')!.total).toBe(0);
    expect(rows.find((r) => r.pcode === 'TH22')!.status).toBe('none');
  });
  it('empty region -> no rows', () => {
    expect(provinceRows('R-none', provinces, stats, () => 'none')).toEqual([]);
  });
});

describe('crumbs (status bar)', () => {
  it('level 1: เลือกภาค → เลือกจังหวัด', () => {
    expect(crumbs(1)).toEqual([{ text: 'เลือกภาค', state: 'now' }, { text: 'เลือกจังหวัด', state: 'todo' }]);
  });
  it('level 2 without a selected province', () => {
    expect(crumbs(2, 'ภาคตะวันออก')).toEqual([{ text: 'ภาคตะวันออก', state: 'done' }, { text: 'เลือกจังหวัด', state: 'now' }]);
  });
  it('level 2 with a selected province', () => {
    expect(crumbs(2, 'ภาคตะวันออก', 'ชลบุรี')).toEqual([{ text: 'ภาคตะวันออก', state: 'done' }, { text: 'ชลบุรี', state: 'now' }]);
  });
  it('level 2 but the region name is not known yet falls back to level 1 text', () => {
    expect(crumbs(2, null)[0].text).toBe('เลือกภาค');
  });
});

describe('searchProvinces', () => {
  it('normalises "จังหวัด"/"จ." prefixes, case and spaces', () => {
    expect(normalizeQuery('  จังหวัด ชลบุรี ')).toBe('ชลบุรี');
    expect(normalizeQuery('จ.ระยอง')).toBe('ระยอง');
    expect(normalizeQuery('CHON   BURI')).toBe('chon buri');
    expect(normalizeQuery('   ')).toBe('');
  });
  it('empty query returns nothing', () => {
    expect(searchProvinces(provinces, '')).toEqual([]);
    expect(searchProvinces(provinces, '   ')).toEqual([]);
  });
  it('Thai prefix match comes before "contains"', () => {
    const r = searchProvinces(provinces, 'ชล').map((p) => p.pcode);
    expect(r[0]).toBe('TH20');
    expect(searchProvinces(provinces, 'เชียง').map((p) => p.pcode).sort()).toEqual(['TH50', 'TH57']);
    expect(searchProvinces(provinces, 'บุรี').map((p) => p.pcode).sort()).toEqual(['TH20', 'TH22']); // contains
  });
  it('English works with or without the space', () => {
    expect(searchProvinces(provinces, 'chon buri').map((p) => p.pcode)).toEqual(['TH20']);
    expect(searchProvinces(provinces, 'chonburi').map((p) => p.pcode)).toEqual(['TH20']);
    expect(searchProvinces(provinces, 'CHIANG').map((p) => p.pcode).sort()).toEqual(['TH50', 'TH57']);
  });
  it('respects the limit and ignores no-match', () => {
    expect(searchProvinces(provinces, 'เชียง', 1)).toHaveLength(1);
    expect(searchProvinces(provinces, 'zzz')).toEqual([]);
  });
});

describe('snapHeights', () => {
  it('is ordered hidden < half < full <= container for any realistic size', () => {
    for (const h of [200, 240, 300, 420, 560, 700, 844, 1000, 1400]) {
      const s = snapHeights(h);
      expect(s.hidden).toBeLessThan(s.half);
      expect(s.half).toBeLessThan(s.full);
      expect(s.full).toBeLessThanOrEqual(Math.max(h, 240));
      expect(s.hidden).toBeGreaterThan(40);
    }
  });
  it('bad input still gives a usable result', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const s = snapHeights(bad);
      expect(Number.isFinite(s.hidden) && Number.isFinite(s.half) && Number.isFinite(s.full)).toBe(true);
      expect(s.hidden).toBeLessThan(s.half);
    }
  });
});

describe('snapping', () => {
  const H = snapHeights(700);
  it('nearestSnap picks the closest level', () => {
    expect(nearestSnap(H.hidden + 5, H)).toBe('hidden');
    expect(nearestSnap(H.half - 10, H)).toBe('half');
    expect(nearestSnap(H.full + 50, H)).toBe('full');
    expect(nearestSnap((H.half + H.full) / 2 + 1, H)).toBe('full');
  });
  it('cycleSnap: hidden → half → full → half', () => {
    expect(cycleSnap('hidden')).toBe('half');
    expect(cycleSnap('half')).toBe('full');
    expect(cycleSnap('full')).toBe('half');
  });
  it('clampHeight stays inside [~hidden, full]', () => {
    expect(clampHeight(10, H)).toBeCloseTo(H.hidden * 0.85, 5);
    expect(clampHeight(99999, H)).toBe(H.full);
    expect(clampHeight(H.half, H)).toBe(H.half);
  });
  it('slow drag goes to the nearest level (negative dy = dragged up)', () => {
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: -(H.full - H.half) + 10, velocity: -0.05, heights: H })).toBe('full');
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: H.half - H.hidden - 10, velocity: 0.05, heights: H })).toBe('hidden');
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: -20, velocity: -0.05, heights: H })).toBe('half');
  });
  it('a quick flick moves exactly one level', () => {
    expect(snapFromDrag({ from: 'hidden', startHeight: H.hidden, dy: -40, velocity: -FLICK_PX_PER_MS - 0.1, heights: H })).toBe('half');
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: -40, velocity: -1.5, heights: H })).toBe('full');
    expect(snapFromDrag({ from: 'full', startHeight: H.full, dy: 40, velocity: 1.5, heights: H })).toBe('half');
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: 40, velocity: 1.5, heights: H })).toBe('hidden');
  });
  it('flicks cannot go past the ends; tiny movements are not flicks', () => {
    expect(snapFromDrag({ from: 'full', startHeight: H.full, dy: -40, velocity: -2, heights: H })).toBe('full');
    expect(snapFromDrag({ from: 'hidden', startHeight: H.hidden, dy: 40, velocity: 2, heights: H })).toBe('hidden');
    expect(snapFromDrag({ from: 'half', startHeight: H.half, dy: -5, velocity: -2, heights: H })).toBe('half');
  });
  it('SNAP_ORDER has the three levels', () => {
    expect(SNAP_ORDER).toEqual(['hidden', 'half', 'full']);
  });
});

describe('region images', () => {
  it('tries webp, then jpg, then png, then gives up', () => {
    expect(regionImageUrl('/thai77/', 'east', 0)).toBe('/thai77/img/regions/east.webp');
    expect(regionImageUrl('/thai77/', 'east', 1)).toBe('/thai77/img/regions/east.jpg');
    expect(regionImageUrl('/thai77/', 'east', 2)).toBe('/thai77/img/regions/east.png');
    expect(regionImageUrl('/thai77/', 'east', 3)).toBeNull();
    expect(REGION_IMAGE_EXTS).toHaveLength(3);
  });
  it('adds the slash when the base has none and rejects odd codes', () => {
    expect(regionImageUrl('/thai77', 'north', 0)).toBe('/thai77/img/regions/north.webp');
    expect(regionImageUrl('/', 'north', 0)).toBe('/img/regions/north.webp');
    expect(regionImageUrl('/', '../secret', 0)).toBeNull();
    expect(regionImageUrl('/', '', 0)).toBeNull();
  });
  it('every region has a fallback icon', () => {
    for (const r of REGION_ORDER) expect(typeof REGION_ICONS[r]).toBe('string');
  });
});
