// Trip cover helpers (pure).
export type ProvLite = { id: string; region_id: string };
export type RegLite = { id: string; code: string };

/** the region most of the trip's provinces belong to (ties: the region met first); null when nothing is known */
export function dominantRegion(provinceIds: string[], provinces: ProvLite[], regions: RegLite[]): string | null {
  const regionOfProvince = new Map(provinces.map((p) => [p.id, p.region_id]));
  const codeOfRegion = new Map(regions.map((r) => [r.id, r.code]));
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const pid of provinceIds) {
    const code = codeOfRegion.get(regionOfProvince.get(pid) ?? '');
    if (!code) continue;
    if (!counts.has(code)) order.push(code);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const code of order) if (best === null || (counts.get(code) ?? 0) > (counts.get(best) ?? 0)) best = code;
  return best;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extOf = (mime: string) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg');

/** {user}/{trip}/{random}.ext in the private trip-covers bucket */
export function tripCoverPath(uid: string, tripId: string, rand: string, mime: string): string {
  if (!UUID_RE.test(uid) || !UUID_RE.test(tripId) || !UUID_RE.test(rand)) throw new Error('invalid id');
  return `${uid}/${tripId}/${rand}.${extOf(mime)}`;
}

/** only files in my own folder may be deleted by me */
export function ownsCoverPath(path: string | null | undefined, uid: string): boolean {
  if (!path || !UUID_RE.test(uid)) return false;
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === uid && UUID_RE.test(parts[1]) && /^[0-9a-f-]{36}\.(webp|jpg|png)$/i.test(parts[2]);
}
