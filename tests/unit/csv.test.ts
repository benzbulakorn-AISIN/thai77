import { describe, expect, it } from 'vitest';
import { decodeText, parseCsv, toCsv } from '../../src/features/admin/csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines inside cells', () => {
    const rows = parseCsv('a,b\r\n"x, ""y""","line1\nline2"\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
  });
  it('strips BOM, skips blank lines, keeps Thai text', () => {
    expect(parseCsv('\uFEFFชื่อ,จังหวัด\n\nวัด,ชลบุรี\n')).toEqual([['ชื่อ', 'จังหวัด'], ['วัด', 'ชลบุรี']]);
  });
  it('detects ; and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('last row without trailing newline and empty cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});

describe('toCsv', () => {
  it('writes BOM + CRLF and quotes when needed', () => {
    const s = toCsv([['a', 'b,c'], [1, null]]);
    expect(s.startsWith('\uFEFF')).toBe(true);
    expect(s).toContain('a,"b,c"\r\n1,\r\n');
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    const rows = parseCsv(toCsv([['v'], ['=SUM(A1)'], ['+1'], ['@x'], ['-5'], ['-abc']]));
    expect(rows.map((r) => r[0])).toEqual(['v', "'=SUM(A1)", "'+1", "'@x", '-5', "'-abc"]);
  });
  it('round-trips awkward Thai text', () => {
    const data = [['ชื่อ', 'หมายเหตุ'], ['วัด "ใหญ่", ชลบุรี', 'บรรทัด1\nบรรทัด2']];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
});

describe('decodeText', () => {
  it('reads UTF-8', () => {
    const bytes = new TextEncoder().encode('ชลบุรี');
    expect(decodeText(bytes.buffer as ArrayBuffer)).toEqual({ text: 'ชลบุรี', encoding: 'utf-8' });
  });
  it('falls back to Thai Windows (ANSI) when the bytes are not UTF-8', () => {
    // "กข" in windows-874 = A1 A2
    const r = decodeText(new Uint8Array([0xa1, 0xa2]).buffer as ArrayBuffer);
    expect(r.encoding).toBe('windows-874');
    expect(r.text).toBe('กข');
  });
});
