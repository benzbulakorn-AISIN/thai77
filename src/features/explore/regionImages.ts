// AI-generated illustrations of each region (labelled "ภาพประกอบ"). Put them in public/img/regions/<code>.<webp|jpg|png>.
// Missing files are fine: the UI falls back to a generated gradient cover.
export const REGION_IMAGE_EXTS = ['webp', 'jpg', 'png'] as const;

export const REGION_ICONS: Record<string, string> = {
  north: 'Mountain', northeast: 'Leaf', central: 'Landmark', east: 'Waves', west: 'Trees', south: 'Palmtree',
};

/** URL for attempt number `extIndex` (0 = webp, 1 = jpg, 2 = png); null when all attempts are used up */
export function regionImageUrl(base: string, code: string, extIndex: number): string | null {
  if (!/^[a-z]{2,20}$/.test(code)) return null;
  const ext = REGION_IMAGE_EXTS[extIndex];
  if (!ext) return null;
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}img/regions/${code}.${ext}`;
}
