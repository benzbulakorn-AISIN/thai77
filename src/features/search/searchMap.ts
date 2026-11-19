// Server rows -> typed search results (no network, easy to test).
export type SearchHit = {
  id: string;
  name_th: string;
  name_en: string | null;
  province_id: string;
  district_id: string | null;
  district_name: string | null;
  category_id: string;
  short_description: string | null;
  lat: number | null;
  lng: number | null;
  verification: 'verified' | 'pending' | 'outdated' | 'demo';
  is_demo: boolean;
  popularity: number;
  rank: number;
};
export type SearchResult = { hits: SearchHit[]; total: number };

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** server answer -> typed hits (total is repeated on every row; no rows = no results) */
export function mapSearchRows(rows: unknown): SearchResult {
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const hits = list.map((r) => ({
    id: String(r.id),
    name_th: String(r.name_th ?? ''),
    name_en: (r.name_en as string | null) ?? null,
    province_id: String(r.province_id),
    district_id: (r.district_id as string | null) ?? null,
    district_name: (r.district_name as string | null) ?? null,
    category_id: String(r.category_id),
    short_description: (r.short_description as string | null) ?? null,
    lat: num(r.lat),
    lng: num(r.lng),
    verification: (r.verification as SearchHit['verification']) ?? 'pending',
    is_demo: Boolean(r.is_demo),
    popularity: Number(r.popularity ?? 0),
    rank: Number(r.rank ?? 3),
  }));
  const total = list.length ? Number(list[0].total) : 0;
  return { hits, total: Number.isFinite(total) ? total : hits.length };
}
