import { describe, expect, it } from 'vitest';
import {
  MAX_PAGE, MAX_QUERY_CHARS, MAX_TOKENS, MIN_QUERY_CHARS, PAGE_SIZE, buildSearchParams, cleanQuery, highlightParts, offsetFor,
  pageCount, parseSearchParams, rangeText,
} from '../../src/features/search/searchModel';
import { MAX_RECENT, addRecent, parseRecent, removeRecent } from '../../src/features/search/recentSearches';
import { mapSearchRows } from '../../src/features/search/searchMap';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = 'AAAAAAAA-aaaa-4aaa-8aaa-AAAAAAAAAAAA';

describe('cleanQuery', () => {
  it('splits on any whitespace and trims', () => {
    const c = cleanQuery('  ชลบุรี \t วัด\n ');
    expect(c).toEqual({ q: 'ชลบุรี วัด', tokens: ['ชลบุรี', 'วัด'], valid: true, truncated: false });
  });
  it('strips จังหวัด / อำเภอ / จ. / อ. / กิ่งอำเภอ in front of a word (the database stores names without them)', () => {
    expect(cleanQuery('จังหวัดชลบุรี').tokens).toEqual(['ชลบุรี']);
    expect(cleanQuery('จ.ระยอง อ.แกลง').tokens).toEqual(['ระยอง', 'แกลง']);
    expect(cleanQuery('อำเภอเมืองเชียงใหม่').tokens).toEqual(['เมืองเชียงใหม่']);
    expect(cleanQuery('กิ่งอำเภอเกาะจันทร์').tokens).toEqual(['เกาะจันทร์']);
  });
  it('keeps words that merely start with the same letters', () => {
    expect(cleanQuery('อ่าวมะนาว').tokens).toEqual(['อ่าวมะนาว']);
    expect(cleanQuery('อัมพวา').tokens).toEqual(['อัมพวา']);
    expect(cleanQuery('จันทบุรี').tokens).toEqual(['จันทบุรี']);
    expect(cleanQuery('อ.').tokens).toEqual(['อ.']); // nothing after the prefix: leave as typed
  });
  it('a bare prefix word becomes nothing', () => {
    expect(cleanQuery('จังหวัด').tokens).toEqual(['จังหวัด']);
    expect(cleanQuery('จังหวัด').valid).toBe(true);
  });
  it('needs at least 2 visible characters', () => {
    expect(MIN_QUERY_CHARS).toBe(2);
    expect(cleanQuery('').valid).toBe(false);
    expect(cleanQuery('   ').valid).toBe(false);
    expect(cleanQuery('ก').valid).toBe(false);
    expect(cleanQuery('ก ข').valid).toBe(true); // 2 characters in total
    expect(cleanQuery('วัด').valid).toBe(true);
    expect(cleanQuery(null).valid).toBe(false);
    expect(cleanQuery(undefined).valid).toBe(false);
  });
  it('removes control and zero-width characters', () => {
    expect(cleanQuery('ช\u0000ล\u200bบุรี').q).toBe('ช ล บุรี');
    expect(cleanQuery('วัด\u0007พระ').tokens).toEqual(['วัด', 'พระ']);
    expect(cleanQuery('\ufeffวัด').tokens).toEqual(['วัด']);
  });
  it('limits to 5 words and 80 characters, and says so', () => {
    expect(MAX_TOKENS).toBe(5);
    const six = cleanQuery('หนึ่ง สอง สาม สี่ ห้า หก');
    expect(six.tokens).toHaveLength(5);
    expect(six.truncated).toBe(true);
    const long = cleanQuery('ก'.repeat(500));
    expect([...long.q].length).toBe(MAX_QUERY_CHARS);
    expect(long.truncated).toBe(true);
    const total = cleanQuery(['ก'.repeat(40), 'ข'.repeat(40), 'ค'.repeat(40)].join(' '));
    expect([...total.q].length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect(total.truncated).toBe(true);
    expect(cleanQuery('ชลบุรี วัด').truncated).toBe(false);
  });
  it('counts characters, not UTF-16 units (emoji, Thai combining marks)', () => {
    expect(cleanQuery('😀😀').valid).toBe(true);
    expect([...cleanQuery('😀'.repeat(100)).q].length).toBe(MAX_QUERY_CHARS);
    expect(cleanQuery('ก้').valid).toBe(true);
  });
  it('is idempotent', () => {
    for (const raw of ['จังหวัดชลบุรี  วัด', '  a  b  ', 'ก'.repeat(300)]) {
      const once = cleanQuery(raw);
      expect(cleanQuery(once.q).q).toBe(once.q);
    }
  });
  it('NFC-normalises (decomposed and composed text search the same)', () => {
    expect(cleanQuery('e\u0301cole').q).toBe(cleanQuery('\u00e9cole').q);
  });
});

describe('URL state', () => {
  it('parses q / page / filters and ignores nonsense', () => {
    const s = parseSearchParams(new URLSearchParams(`q=วัด&p=3&province=${U1}&cat=${U2}`));
    expect(s).toEqual({ q: 'วัด', page: 3, province: U1, category: U2.toLowerCase() });
    expect(parseSearchParams(new URLSearchParams(''))).toEqual({ q: '', page: 1, province: '', category: '' });
    for (const bad of ['0', '-3', '2.5', 'abc', '', '1e3']) expect(parseSearchParams(new URLSearchParams(`p=${bad}`)).page).toBe(1);
    expect(parseSearchParams(new URLSearchParams('p=99999')).page).toBe(MAX_PAGE);
    expect(parseSearchParams(new URLSearchParams('province=not-a-uuid&cat=1 or 1=1')).province).toBe('');
    expect(parseSearchParams(new URLSearchParams('province=not-a-uuid&cat=1 or 1=1')).category).toBe('');
    expect(parseSearchParams(new URLSearchParams(`q=${'x'.repeat(500)}`)).q).toHaveLength(200);
  });
  it('writes only non-default values', () => {
    expect(buildSearchParams({ q: '', page: 1, province: '', category: '' }).toString()).toBe('');
    const p = buildSearchParams({ q: 'วัด', page: 2, province: U1, category: '' });
    expect(p.get('q')).toBe('วัด');
    expect(p.get('p')).toBe('2');
    expect(p.get('province')).toBe(U1);
    expect(p.has('cat')).toBe(false);
    expect(buildSearchParams({ q: 'วัด', page: 1, province: '', category: '' }).has('p')).toBe(false);
  });
  it('refuses a filter that is not a UUID and clamps the page', () => {
    expect(buildSearchParams({ q: 'a', page: 1, province: "x'; drop", category: '' }).has('province')).toBe(false);
    expect(buildSearchParams({ q: 'a', page: 9999, province: '', category: '' }).get('p')).toBe(String(MAX_PAGE));
  });
  it('round-trips', () => {
    const s = { q: 'ชลบุรี วัด', page: 4, province: U1, category: U2.toLowerCase() };
    expect(parseSearchParams(buildSearchParams(s))).toEqual(s);
  });
});

describe('paging', () => {
  it('offset and page count', () => {
    expect(PAGE_SIZE).toBe(20);
    expect(offsetFor(1)).toBe(0);
    expect(offsetFor(3)).toBe(40);
    expect(offsetFor(0)).toBe(0);
    expect(offsetFor(-4)).toBe(0);
    expect(offsetFor(2.9)).toBe(20);
    expect(pageCount(0)).toBe(0);
    expect(pageCount(-5)).toBe(0);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(85)).toBe(5);
    expect(pageCount(10_000_000)).toBe(MAX_PAGE);
    expect(pageCount(10, 0)).toBe(0);
  });
  it('range text', () => {
    expect(rangeText(1, 85)).toBe('แสดง 1–20 จาก 85');
    expect(rangeText(2, 85)).toBe('แสดง 21–40 จาก 85');
    expect(rangeText(5, 85)).toBe('แสดง 81–85 จาก 85');
    expect(rangeText(1, 3)).toBe('แสดง 1–3 จาก 3');
    expect(rangeText(1, 0)).toBe('');
    expect(rangeText(9, 85)).toBe('ทั้งหมด 85 แห่ง'); // page beyond the end
    expect(rangeText(1, 1234)).toContain('1,234');
  });
});

describe('highlightParts', () => {
  const join = (ps: { text: string }[]) => ps.map((p) => p.text).join('');
  it('marks every occurrence, case-insensitively', () => {
    const ps = highlightParts('วัดพระธาตุ วัดใหญ่', ['วัด']);
    expect(ps.filter((p) => p.hit).map((p) => p.text)).toEqual(['วัด', 'วัด']);
    expect(join(ps)).toBe('วัดพระธาตุ วัดใหญ่');
    const en = highlightParts('Doi Suthep', ['suthep', 'DOI']);
    expect(en.filter((p) => p.hit).map((p) => p.text)).toEqual(['Doi', 'Suthep']);
  });
  it('merges overlapping and touching matches into one mark', () => {
    const ps = highlightParts('abcdef', ['abc', 'cde']);
    expect(ps).toEqual([{ text: 'abcde', hit: true }, { text: 'f', hit: false }]);
    expect(highlightParts('abcd', ['ab', 'cd'])).toEqual([{ text: 'abcd', hit: true }]);
  });
  it('always reassembles to the original text', () => {
    for (const [text, toks] of [['ซีซีวัดใหญ่ ซีซี', ['ซีซี', 'วัด']], ['AaBbAa', ['a']], ['x', ['y']], ['', ['a']], ['เชียงใหม่', []]] as [string, string[]][]) {
      expect(join(highlightParts(text, toks))).toBe(text);
    }
  });
  it('no match / no tokens / empty -> one plain part (or none)', () => {
    expect(highlightParts('วัด', ['ถ้ำ'])).toEqual([{ text: 'วัด', hit: false }]);
    expect(highlightParts('วัด', [])).toEqual([{ text: 'วัด', hit: false }]);
    expect(highlightParts('วัด', [''])).toEqual([{ text: 'วัด', hit: false }]);
    expect(highlightParts('', ['วัด'])).toEqual([]);
  });
  it('treats the query as plain text (regex characters are harmless)', () => {
    expect(highlightParts('ลด 50% (พิเศษ)', ['50%', '(พิเศษ)']).filter((p) => p.hit).map((p) => p.text)).toEqual(['50%', '(พิเศษ)']);
    expect(highlightParts('a.b', ['.']).filter((p) => p.hit).map((p) => p.text)).toEqual(['.']);
    expect(highlightParts('abc', ['.*']).every((p) => !p.hit)).toBe(true);
  });
  it('is safe with characters whose lower-case has a different length', () => {
    expect(join(highlightParts('İstanbul', ['i']))).toBe('İstanbul');
  });
});

describe('recent searches', () => {
  it('newest first, no duplicates, capped', () => {
    expect(addRecent([], 'วัด')).toEqual(['วัด']);
    expect(addRecent(['วัด'], 'ชายหาด')).toEqual(['ชายหาด', 'วัด']);
    expect(addRecent(['ชายหาด', 'วัด'], 'วัด')).toEqual(['วัด', 'ชายหาด']);
    expect(addRecent(['Doi'], 'doi')).toEqual(['doi']);
    let l: string[] = [];
    for (let i = 0; i < 20; i++) l = addRecent(l, `คำค้น${i}`);
    expect(l).toHaveLength(MAX_RECENT);
    expect(l[0]).toBe('คำค้น19');
  });
  it('only valid searches are kept, stored in their cleaned form', () => {
    expect(addRecent(['วัด'], 'ก')).toEqual(['วัด']);
    expect(addRecent(['วัด'], '   ')).toEqual(['วัด']);
    expect(addRecent([], '  จังหวัดชลบุรี   วัด ')).toEqual(['ชลบุรี วัด']);
  });
  it('removeRecent ignores case', () => {
    expect(removeRecent(['Doi', 'วัด'], 'doi')).toEqual(['วัด']);
    expect(removeRecent(['วัด'], 'x')).toEqual(['วัด']);
  });
  it('parseRecent ignores anything that is not a list of good strings', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('')).toEqual([]);
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('"วัด"')).toEqual([]);
    expect(parseRecent(JSON.stringify(['วัด', 5, null, { a: 1 }, 'ก', 'วัด', 'WAT', 'wat', '<img src=x>']))).toEqual(['วัด', 'WAT', '<img src=x>']);
    expect(parseRecent(JSON.stringify(Array.from({ length: 50 }, (_, i) => `คำค้น${i}`)))).toHaveLength(MAX_RECENT);
  });
});

describe('mapSearchRows', () => {
  const row = (o: Record<string, unknown> = {}) => ({
    id: 'p1', name_th: 'วัด', name_en: null, province_id: 'pv', district_id: null, district_name: null, category_id: 'c', short_description: null,
    lat: '13.5', lng: 100.5, verification: 'pending', is_demo: true, popularity: 5, rank: 1, total: 42, ...o,
  });
  it('maps rows and takes the total from the first row', () => {
    const r = mapSearchRows([row(), row({ id: 'p2', total: 42 })]);
    expect(r.total).toBe(42);
    expect(r.hits).toHaveLength(2);
    expect(r.hits[0].lat).toBe(13.5); // numeric text -> number
    expect(r.hits[0].is_demo).toBe(true);
  });
  it('bigint arriving as text is fine', () => {
    expect(mapSearchRows([row({ total: '1234' })]).total).toBe(1234);
  });
  it('no rows / odd input -> empty result, no crash', () => {
    for (const x of [[], null, undefined, 'x', 5, {}]) expect(mapSearchRows(x)).toEqual({ hits: [], total: 0 });
  });
  it('missing optional fields get safe defaults', () => {
    const r = mapSearchRows([{ id: 'a', province_id: 'p', category_id: 'c', total: 1 }]);
    expect(r.hits[0]).toEqual({
      id: 'a', name_th: '', name_en: null, province_id: 'p', district_id: null, district_name: null, category_id: 'c', short_description: null,
      lat: null, lng: null, verification: 'pending', is_demo: false, popularity: 0, rank: 3,
    });
  });
  it('a broken total falls back to the number of rows', () => {
    expect(mapSearchRows([row({ total: 'abc' })]).total).toBe(1);
  });
});
