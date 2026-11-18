// Optional illustrations in public/img/<name>.<webp|jpg|png> (AI-generated ones must be labelled "ภาพประกอบ").
export const ILLUSTRATION_EXTS = ['webp', 'jpg', 'png'] as const;

/** URL for attempt number `extIndex` (0 = webp, 1 = jpg, 2 = png); null when all attempts are used up or the name is odd */
export function illustrationUrl(base: string, name: string, extIndex: number): string | null {
  if (!/^[a-z][a-z0-9-]{1,29}$/.test(name)) return null;
  const ext = ILLUSTRATION_EXTS[extIndex];
  if (!ext) return null;
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}img/${name}.${ext}`;
}
