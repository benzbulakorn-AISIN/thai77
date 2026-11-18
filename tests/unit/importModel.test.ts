import { describe, expect, it } from 'vitest';
import {
  analyze, normName, parseBool, parseFile, parseMonths, summarize, type ImportCtx, type Located,
} from '../../src/features/admin/importModel';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ctx: ImportCtx = {
  provinces: [
    { id: 'P20', pcode: 'TH20', slug: 'chon-buri', name_th: 'ชลบุรี', name_en: 'Chon Buri' },
    { id: 'P21', pcode: 'TH21', slug: 'rayong', name_th: 'ระยอง', name_en: 'Rayong' },
  ],
  districts: [
    { id: 'D1', pcode: 'TH2001', province_id: 'P20', name_th: 'เมืองชลบุรี', name_en: 'Mueang Chon Buri' },
    { id: 'D4', pcode: 'TH2004', province_id: 'P20', name_th: 'บางละมุง', name_en: 'Bang Lamung' },
  ],
  categories: [
    { id: 'C1', slug: 'temple', name_th: 'วัดและศาสนสถาน', name_en: 'Temples' },
    { id: 'C2', slug: 'beach', name_th: 'ทะเลและชายหาด', name_en: null },
  ],
  existing: [{ id: ID1, name_th: 'หาดพัทยา', province_id: 'P20', category_id: 'C2', lat: 12.93, lng: 100.88 }],
  withSource: new Set<string>(),
};
const run = (csv: string, located: (Located | undefined)[] = []) => {
  const p = parseFile('t.csv', csv);
  return analyze(p.records, ctx, p.records.map((_, i) => located[i]), p.lineOffset);
};

describe('helpers', () => {
  it('parseBool understands English and Thai, blank = unknown, junk = invalid', () => {
    expect(parseBool('yes')).toBe(true);
    expect(parseBool('มี')).toBe(true);
    expect(parseBool('No')).toBe(false);
    expect(parseBool('ไม่มี')).toBe(false);
    expect(parseBool('')).toBeNull();
    expect(parseBool('maybe')).toBeUndefined();
  });
  it('parseMonths', () => {
    expect(parseMonths('12|1|1')).toEqual([1, 12]);
    expect(parseMonths('')).toEqual([]);
    expect(parseMonths('13')).toBeNull();
    expect(parseMonths('x')).toBeNull();
  });
  it('normName strips Thai administrative prefixes and punctuation', () => {
    expect(normName('จังหวัดชลบุรี')).toBe('ชลบุรี');
    expect(normName('อ. เมือง ชลบุรี')).toBe('เมืองชลบุรี');
    expect(normName(' Chon-Buri ')).toBe('chonburi');
  });
});

describe('parseFile', () => {
  it('CSV: aliases (Thai headers), unknown columns reported, BOM ok', () => {
    const p = parseFile('a.csv', '\uFEFFname_th,จังหวัด,ละติจูด,foo\nวัด,ชลบุรี,12.9,x\n');
    expect(p.format).toBe('csv');
    expect(p.lineOffset).toBe(2);
    expect(p.records[0]).toMatchObject({ name_th: 'วัด', province: 'ชลบุรี', lat: '12.9' });
    expect(p.unknown).toEqual(['foo']);
  });
  it('CSV without name_th is rejected with a helpful message', () => {
    expect(() => parseFile('a.csv', 'x,y\n1,2')).toThrow();
    expect(() => parseFile('a.csv', 'name_th\n')).toThrow();
  });
  it('JSON array and { places } with a default province; arrays become | lists', () => {
    const a = parseFile('a.json', JSON.stringify([{ name_th: 'A', highlights: ['x', 'y'], is_demo: true }]));
    expect(a.records[0]).toMatchObject({ name_th: 'A', highlights: 'x|y', is_demo: 'yes' });
    const b = parseFile('b.json', JSON.stringify({ province_pcode: 'TH20', places: [{ key: 'k1', name_th: 'B' }] }));
    expect(b.records[0]).toMatchObject({ name_th: 'B', province: 'TH20' });
    expect(b.unknown).toEqual([]); // "key" is allowed in seed files
  });
  it('invalid JSON shapes throw', () => {
    expect(() => parseFile('x.json', '{not json')).toThrow();
    expect(() => parseFile('x.json', '{"a":1}')).toThrow();
    expect(() => parseFile('x.json', '[1,2]')).toThrow();
  });
});

describe('analyze', () => {
  it('a valid new row resolves province (English name), district (prefix) and category (slug)', () => {
    const [r] = run('name_th,province,district,category,lat,lng\nวัดใหม่,Chonburi,อำเภอบางละมุง,temple,12.95,100.89',
      [{ provincePcode: 'TH20', districtPcode: 'TH2004' }]);
    expect(r.errors).toEqual([]);
    expect(r.kind).toBe('new');
    expect(r.input?.province_id).toBe('P20');
    expect(r.input?.district_id).toBe('D4');
    expect(r.input?.category_id).toBe('C1');
  });

  it('province can be derived from coordinates', () => {
    const [r] = run('name_th,category,lat,lng\nที่ไหนสักแห่ง,temple,13.1,100.95', [{ provincePcode: 'TH20', districtPcode: 'TH2001' }]);
    expect(r.kind).toBe('new');
    expect(r.input?.province_id).toBe('P20');
    expect(r.input?.district_id).toBe('D1');
    expect(r.warnings.join()).toContain('จากพิกัด');
  });

  it('coordinates in another province than the stated one are an error', () => {
    const [r] = run('name_th,province,category,lat,lng\nวัด,ระยอง,temple,13.1,100.95', [{ provincePcode: 'TH20', districtPcode: null }]);
    expect(r.kind).toBe('error');
    expect(r.errors.join()).toContain('พิกัดอยู่ใน');
  });

  it('reports every problem of a bad row at once', () => {
    const [r] = run('name_th,province,category,lat,lng,fee_thai,best_months,has_toilet,verification,source_url\nที่ผิด,ภูเก็ตฝัน,xyz,40,-70,abc,13,maybe,bad,ftp://x');
    expect(r.kind).toBe('error');
    expect(r.errors.length).toBeGreaterThanOrEqual(6);
    expect(r.input).toBeNull();
  });

  it('detects duplicates of existing places (same name in the same province)', () => {
    const [r] = run('name_th,province,category\nหาดพัทยา,ชลบุรี,beach');
    expect(r.kind).toBe('match');
    expect(r.matchId).toBe(ID1);
    expect(r.matchReason).toContain('ชื่อซ้ำ');
  });

  it('detects duplicates by coordinates + similar name', () => {
    const [r] = run('name_th,province,category,lat,lng\nหาดพัทยา (เหนือ),ชลบุรี,beach,12.9301,100.8801', [{ provincePcode: 'TH20', districtPcode: null }]);
    // normalised names differ ("หาดพัทยา(เหนือ)" contains "หาดพัทยา") and the point is < 100 m away
    expect(r.kind).toBe('match');
    expect(r.matchReason).toContain('พิกัดใกล้');
  });

  it('matches by id (Export round trip) and builds a partial patch of filled columns only', () => {
    const [r] = run(`id,name_th,fee_thai,phone\n${ID1},หาดพัทยา,50,`);
    expect(r.kind).toBe('match');
    expect(Object.keys(r.patch).sort()).toEqual(['fee_thai', 'name_th']); // blank "phone" must NOT erase existing data
    expect(r.patch.fee_thai).toBe(50);
  });

  it('unknown id is an error; malformed id is an error', () => {
    expect(run('id,name_th,province,category\n22222222-2222-4222-8222-222222222222,x,ชลบุรี,temple')[0].errors.join()).toContain('ไม่พบสถานที่ตาม id');
    expect(run('id,name_th,province,category\nnope,x,ชลบุรี,temple')[0].errors.join()).toContain('UUID');
  });

  it('duplicate rows inside one file are an error on the second row', () => {
    const rows = run('name_th,province,category\nวัดซ้ำ,ชลบุรี,temple\nวัดซ้ำ,ชลบุรี,temple');
    expect(rows[0].kind).toBe('new');
    expect(rows[1].kind).toBe('error');
    expect(rows[1].errors.join()).toContain('ซ้ำกับแถว 2');
  });

  it('"verified" without any source is downgraded to pending; with a source it is kept', () => {
    const [a] = run('name_th,province,category,verification\nA,ชลบุรี,temple,verified');
    expect(a.input?.verification).toBe('pending');
    expect(a.warnings.join()).toContain('verified');
    const [b] = run('name_th,province,category,verification,source_url,source_type,source_checked_at\nB,ชลบุรี,temple,verified,https://example.org/a,osm,2026-01-02');
    expect(b.input?.verification).toBe('verified');
    expect(b.source).toEqual({ source_url: 'https://example.org/a', source_name: null, source_type: 'osm', checked_at: '2026-01-02' });
  });

  it('source rules: http(s) only, valid type, no future date', () => {
    expect(run('name_th,province,category,source_url\nA,ชลบุรี,temple,javascript:alert(1)')[0].errors.join()).toContain('source_url');
    expect(run('name_th,province,category,source_url,source_type\nA,ชลบุรี,temple,https://x.org,weird')[0].errors.join()).toContain('source_type');
    expect(run('name_th,province,category,source_url,source_checked_at\nA,ชลบุรี,temple,https://x.org,2999-01-01')[0].errors.join()).toContain('source_checked_at');
  });

  it('facilities: yes/no/blank', () => {
    const [r] = run('name_th,province,category,has_toilet,wheelchair,kid_friendly\nA,ชลบุรี,temple,yes,no,');
    expect(r.facilities).toEqual({ has_toilet: true, wheelchair: false });
  });

  it('summarize counts per mode', () => {
    const rows = run('name_th,province,category\nใหม่,ชลบุรี,temple\nหาดพัทยา,ชลบุรี,beach\nผิด,ไม่มี,temple');
    expect(summarize(rows, 'new_only')).toMatchObject({ total: 3, insert: 1, skip: 1, update: 0, error: 1 });
    expect(summarize(rows, 'merge')).toMatchObject({ insert: 1, update: 1, skip: 0, error: 1 });
  });
});
