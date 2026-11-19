// Pure logic for the search page (no React / Supabase): query cleaning, URL state, paging, highlighting.
export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 80;
export const MAX_TOKENS = 5;
export const PAGE_SIZE = 20;
export const MAX_PAGE = 250; // matches the 5000-row offset limit in search_places

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX_RE = /^(?:กิ่งอำเภอ|จังหวัด|อำเภอ|จ\.|อ\.)(?=\S)/u;

export type CleanQuery = {
  /** what is sent to the server: tokens joined by one space */
  q: string;
  tokens: string[];
  /** long enough to search */
  valid: boolean;
  /** text was cut to MAX_QUERY_CHARS / MAX_TOKENS */
  truncated: boolean;
};

/**
 * "  จังหวัดชลบุรี   วัด " -> tokens ["ชลบุรี", "วัด"].
 * Strips "จังหวัด / อำเภอ / จ. / อ." in front of a word (the database stores names without them), drops control
 * characters, keeps at most 5 words and 80 characters.
 */
export function cleanQuery(raw: string | null | undefined): CleanQuery {
  const nfc = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g, ' ');
  const words = nfc.split(/\s+/).filter(Boolean).map((w) => w.replace(PREFIX_RE, ''));
  const all = words.filter(Boolean);
  let truncated = false;
  let tokens: string[] = [];
  let used = 0;
  for (const w of all) {
    if (tokens.length >= MAX_TOKENS) { truncated = true; break; }
    const chars = [...w];
    const room = MAX_QUERY_CHARS - used - (tokens.length ? 1 : 0);
    if (room <= 0) { truncated = true; break; }
    if (chars.length > room) { tokens.push(chars.slice(0, room).join('')); truncated = true; used = MAX_QUERY_CHARS; break; }
    tokens.push(w);
    used += chars.length + (tokens.length > 1 ? 1 : 0);
  }
  tokens = tokens.filter(Boolean);
  const visible = [...tokens.join('')].length;
  return { q: tokens.join(' '), tokens, valid: visible >= MIN_QUERY_CHARS, truncated };
}

export type SearchUrlState = { q: string; page: number; province: string; category: string };

const asPage = (v: string | null): number => {
  if (!v || !/^\d{1,6}$/.test(v)) return 1; // plain digits only ("1e3", "-3", "2.5" are not page numbers)
  const n = Number(v);
  return n >= 1 ? Math.min(n, MAX_PAGE) : 1;
};
const asUuid = (v: string | null): string => (v && UUID_RE.test(v) ? v.toLowerCase() : '');

export function parseSearchParams(p: URLSearchParams): SearchUrlState {
  return { q: (p.get('q') ?? '').slice(0, 200), page: asPage(p.get('p')), province: asUuid(p.get('province')), category: asUuid(p.get('cat')) };
}

/** only non-default values go into the URL */
export function buildSearchParams(s: SearchUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q.slice(0, 200));
  if (s.province && UUID_RE.test(s.province)) p.set('province', s.province);
  if (s.category && UUID_RE.test(s.category)) p.set('cat', s.category);
  if (s.page > 1) p.set('p', String(Math.min(s.page, MAX_PAGE)));
  return p;
}

export const offsetFor = (page: number, size = PAGE_SIZE) => (Math.max(1, Math.floor(page)) - 1) * size;
export const pageCount = (total: number, size = PAGE_SIZE) => (total > 0 && size > 0 ? Math.min(Math.ceil(total / size), MAX_PAGE) : 0);

/** "แสดง 21–40 จาก 85" */
export function rangeText(page: number, total: number, size = PAGE_SIZE): string {
  if (total <= 0) return '';
  const from = offsetFor(page, size) + 1;
  if (from > total) return `ทั้งหมด ${total.toLocaleString('th-TH')} แห่ง`;
  const to = Math.min(total, from + size - 1);
  return `แสดง ${from.toLocaleString('th-TH')}–${to.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')}`;
}

export type Part = { text: string; hit: boolean };

/** Splits text into plain / matching parts (case-insensitive), so the page can wrap matches in <mark> without any HTML. */
export function highlightParts(text: string, tokens: string[]): Part[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return [{ text, hit: false }]; // odd characters whose lower-case changes length: skip highlighting
  const ranges: [number, number][] = [];
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    if (!t) continue;
    let from = 0;
    for (;;) {
      const i = lower.indexOf(t, from);
      if (i < 0) break;
      ranges.push([i, i + t.length]);
      from = i + t.length;
    }
  }
  if (!ranges.length) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const parts: Part[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) parts.push({ text: text.slice(pos, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false });
  return parts;
}
