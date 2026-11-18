import { describe, expect, it } from 'vitest';
import { dominantRegion, ownsCoverPath, tripCoverPath } from '../../src/features/trips/tripCoverModel';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const regions = [{ id: 'R1', code: 'east' }, { id: 'R2', code: 'north' }];
const provinces = [
  { id: 'a', region_id: 'R1' }, { id: 'b', region_id: 'R1' }, { id: 'c', region_id: 'R2' }, { id: 'd', region_id: 'R2' }, { id: 'x', region_id: 'R-unknown' },
];

describe('dominantRegion', () => {
  it('picks the region with most provinces', () => {
    expect(dominantRegion(['a', 'b', 'c'], provinces, regions)).toBe('east');
    expect(dominantRegion(['c', 'd', 'a'], provinces, regions)).toBe('north');
  });
  it('ties go to the region met first', () => {
    expect(dominantRegion(['c', 'a'], provinces, regions)).toBe('north');
    expect(dominantRegion(['a', 'c'], provinces, regions)).toBe('east');
  });
  it('ignores unknown provinces and returns null when nothing is known', () => {
    expect(dominantRegion(['x', 'zzz'], provinces, regions)).toBeNull();
    expect(dominantRegion([], provinces, regions)).toBeNull();
    expect(dominantRegion(['x', 'a'], provinces, regions)).toBe('east');
    expect(dominantRegion(['a'], [], [])).toBeNull();
  });
  it('a repeated province counts every time', () => {
    expect(dominantRegion(['c', 'a', 'a'], provinces, regions)).toBe('east');
  });
});

describe('trip cover paths', () => {
  it('builds {user}/{trip}/{uuid}.ext and rejects bad ids', () => {
    expect(tripCoverPath(U(1), U(2), U(3), 'image/webp')).toBe(`${U(1)}/${U(2)}/${U(3)}.webp`);
    expect(tripCoverPath(U(1), U(2), U(3), 'image/png')).toBe(`${U(1)}/${U(2)}/${U(3)}.png`);
    expect(tripCoverPath(U(1), U(2), U(3), 'whatever')).toBe(`${U(1)}/${U(2)}/${U(3)}.jpg`);
    expect(() => tripCoverPath('../me', U(2), U(3), 'image/webp')).toThrow();
    expect(() => tripCoverPath(U(1), 'a/b', U(3), 'image/webp')).toThrow();
    expect(() => tripCoverPath(U(1), U(2), '', 'image/webp')).toThrow();
  });
  it('a path is deletable only when it is in my own folder and well formed', () => {
    const mine = `${U(1)}/${U(2)}/${U(3)}.webp`;
    expect(ownsCoverPath(mine, U(1))).toBe(true);
    expect(ownsCoverPath(mine, U(9))).toBe(false);
    expect(ownsCoverPath(`${U(9)}/${U(2)}/${U(3)}.webp`, U(1))).toBe(false);
    for (const bad of [null, undefined, '', 'a/b/c.webp', `${U(1)}/${U(2)}.webp`, `${U(1)}/${U(2)}/${U(3)}.svg`, `${U(1)}/${U(2)}/${U(3)}/x.webp`, `${U(1)}/../${U(3)}.webp`]) {
      expect(ownsCoverPath(bad as string, U(1))).toBe(false);
    }
    expect(ownsCoverPath(mine, 'not-a-uuid')).toBe(false);
  });
});
