import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRY_DAYS, EXPIRY_OPTIONS, MAX_ACTIVE_LINKS, MESSAGE_MAX, NAME_MAX, SHARER_MAX, activeShares, buildShareUrl, canCreateMore,
  cleanMessage, cleanShareText, defaultShareForm, messageCount, optionLabels, parseShareToken, shareErrorText, shareStatus, sortShares, tokenTail,
  validateShareForm, type ShareForm, type ShareRow,
} from '../../src/features/share/shareModel';

const TRIP = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'abcdef01-2345-4678-89ab-cdef01234567';
const NOW = Date.parse('2026-11-19T10:00:00Z');
const form = (o: Partial<ShareForm> = {}): ShareForm => ({ ...defaultShareForm('ทริปชลบุรี'), ...o });
const row = (o: Partial<ShareRow> = {}): ShareRow => ({
  id: 'r1', trip_id: TRIP, token: TOKEN, display_name: 'x', sharer_name: null, message: null, show_dates: true, show_lodging_names: false,
  show_custom_titles: false, expires_at: null, revoked_at: null, created_at: '2026-11-01T00:00:00Z', ...o,
});

describe('defaults agreed for Part 7.8', () => {
  it('dates shown, lodging and typed titles hidden, 30 days, name = trip name', () => {
    expect(defaultShareForm('ทริปชลบุรี')).toEqual({
      displayName: 'ทริปชลบุรี', sharerName: '', message: '', expiresDays: 30, showDates: true, showLodgingNames: false, showCustomTitles: false,
    });
    expect(DEFAULT_EXPIRY_DAYS).toBe(30);
  });
  it('expiry choices: 7 / 30 / 90 / never, and the default is one of them', () => {
    expect(EXPIRY_OPTIONS.map((o) => o.days)).toEqual([7, 30, 90, null]);
    expect(EXPIRY_OPTIONS.some((o) => o.days === DEFAULT_EXPIRY_DAYS)).toBe(true);
  });
  it('a missing trip name does not crash', () => {
    expect(defaultShareForm(undefined as unknown as string).displayName).toBe('');
  });
});

describe('cleanShareText (mirrors public.share_clean_text)', () => {
  it('control characters become spaces; newlines only survive in messages', () => {
    expect(cleanShareText('a\u0007b')).toBe('a b');
    expect(cleanShareText('a\nb')).toBe('a b');
    expect(cleanShareText('a\nb', true)).toBe('a\nb');
    expect(cleanShareText('a\tb', true)).toBe('a b');
    expect(cleanShareText('a\rb', true)).toBe('a b');          // CR is a control char for the database too
    expect(cleanShareText('a\u007fb')).toBe('a b');
  });
  it('trims SPACES only (like btrim): a trailing newline in a message stays', () => {
    expect(cleanShareText('  ทริป  ')).toBe('ทริป');
    expect(cleanShareText('ข้อความ\n', true)).toBe('ข้อความ\n');
    expect(cleanShareText('\tx\t')).toBe('x');                  // tab -> space -> trimmed
  });
  it('empty / blank / null -> null; Thai text and emoji are untouched', () => {
    for (const v of ['', '   ', null, undefined, '\u0007\u0008']) expect(cleanShareText(v as string)).toBeNull();
    expect(cleanShareText('เที่ยว🏝️ไทย')).toBe('เที่ยว🏝️ไทย');
  });
});

describe('cleanMessage', () => {
  it('trims all whitespace at both ends, keeps inner line breaks, blank -> null', () => {
    expect(cleanMessage('\n  สวัสดี\nครับ \n\n')).toBe('สวัสดี\nครับ');
    expect(cleanMessage('\n\n  \n')).toBeNull();
    expect(cleanMessage('')).toBeNull();
    expect(cleanMessage(null)).toBeNull();
    expect(cleanMessage('a\u0007b')).toBe('a b');
  });
});

describe('validateShareForm', () => {
  it('a normal form -> the database parameters', () => {
    const r = validateShareForm(TRIP, form({ sharerName: ' เบนซ์ ', message: 'ดูแผนได้เลย', expiresDays: 7, showDates: false, showLodgingNames: true }));
    expect(r).toEqual({
      ok: true,
      params: {
        p_trip: TRIP, p_display_name: 'ทริปชลบุรี', p_sharer_name: 'เบนซ์', p_message: 'ดูแผนได้เลย', p_expires_days: 7,
        p_show_dates: false, p_show_lodging_names: true, p_show_custom_titles: false,
      },
    });
  });
  it('blank optional fields are sent as null; a blank name lets the database use the trip name', () => {
    const r = validateShareForm(TRIP, form({ displayName: '  ', sharerName: '', message: '\n\n' }));
    expect(r.ok && [r.params.p_display_name, r.params.p_sharer_name, r.params.p_message]).toEqual([null, null, null]);
  });
  it('never expires -> null days', () => {
    const r = validateShareForm(TRIP, form({ expiresDays: null }));
    expect(r.ok && r.params.p_expires_days).toBeNull();
  });
  it('limits are counted in characters, exactly like the database', () => {
    expect(validateShareForm(TRIP, form({ message: 'ก'.repeat(MESSAGE_MAX) })).ok).toBe(true);
    const m = validateShareForm(TRIP, form({ message: 'ก'.repeat(MESSAGE_MAX + 1) }));
    expect(m.ok === false && m.field).toBe('message');
    expect(validateShareForm(TRIP, form({ displayName: 'ก'.repeat(NAME_MAX) })).ok).toBe(true);
    const n = validateShareForm(TRIP, form({ displayName: 'ก'.repeat(NAME_MAX + 1) }));
    expect(n.ok === false && n.field).toBe('displayName');
    expect(validateShareForm(TRIP, form({ sharerName: 'ก'.repeat(SHARER_MAX) })).ok).toBe(true);
    const s = validateShareForm(TRIP, form({ sharerName: 'ก'.repeat(SHARER_MAX + 1) }));
    expect(s.ok === false && s.field).toBe('sharerName');
  });
  it('emoji count as one character each (not two UTF-16 units)', () => {
    expect(validateShareForm(TRIP, form({ sharerName: '😀'.repeat(SHARER_MAX) })).ok).toBe(true);
    expect(validateShareForm(TRIP, form({ sharerName: '😀'.repeat(SHARER_MAX + 1) })).ok).toBe(false);
  });
  it('control characters are cleaned BEFORE counting (so a padded text is not rejected)', () => {
    expect(validateShareForm(TRIP, form({ message: `  ${'ก'.repeat(MESSAGE_MAX)}  ` })).ok).toBe(true);
    expect(validateShareForm(TRIP, form({ message: `${'ก'.repeat(MESSAGE_MAX)}\u0007` })).ok).toBe(true);      // becomes a trailing space, trimmed
    expect(validateShareForm(TRIP, form({ message: `${'ก'.repeat(MESSAGE_MAX)}\n\n` })).ok).toBe(true);        // blank lines at the end are trimmed before sending
    expect(validateShareForm(TRIP, form({ message: `${'ก'.repeat(MESSAGE_MAX)}\nก` })).ok).toBe(false);        // a real 282nd character is still refused
  });
  it('expiry must be 1–365 whole days (or null)', () => {
    for (const d of [0, -1, 366, 1.5, NaN, Infinity]) {
      const r = validateShareForm(TRIP, form({ expiresDays: d }));
      expect(r.ok === false && r.field).toBe('expiresDays');
    }
    for (const d of [1, 7, 365]) expect(validateShareForm(TRIP, form({ expiresDays: d })).ok).toBe(true);
  });
  it('messageCount shows what will be counted', () => {
    expect(messageCount('  สวัสดี  ')).toBe(6);
    expect(messageCount('')).toBe(0);
    expect(messageCount('a\nb')).toBe(3);
  });
});

describe('links: status, limit, order', () => {
  it('active / expired / revoked', () => {
    expect(shareStatus(row(), NOW)).toBe('active');
    expect(shareStatus(row({ expires_at: '2026-11-20T00:00:00Z' }), NOW)).toBe('active');
    expect(shareStatus(row({ expires_at: '2026-11-19T09:59:59Z' }), NOW)).toBe('expired');
    expect(shareStatus(row({ expires_at: '2026-11-19T10:00:00Z' }), NOW)).toBe('expired');   // exactly now = expired (like the database)
    expect(shareStatus(row({ revoked_at: '2026-11-10T00:00:00Z' }), NOW)).toBe('revoked');
    expect(shareStatus(row({ revoked_at: '2026-11-10T00:00:00Z', expires_at: '2020-01-01T00:00:00Z' }), NOW)).toBe('revoked');
    expect(shareStatus(row({ expires_at: 'garbage' }), NOW)).toBe('active');
  });
  it('the limit counts only active links', () => {
    const five = Array.from({ length: MAX_ACTIVE_LINKS }, (_, i) => row({ id: `a${i}` }));
    expect(canCreateMore(five.slice(0, 4), NOW)).toBe(true);
    expect(canCreateMore(five, NOW)).toBe(false);
    expect(canCreateMore([...five.slice(0, 4), row({ id: 'x', revoked_at: '2026-11-01T00:00:00Z' }), row({ id: 'y', expires_at: '2026-01-01T00:00:00Z' })], NOW)).toBe(true);
    expect(activeShares([...five, row({ id: 'z', revoked_at: '2026-11-01T00:00:00Z' })], NOW)).toHaveLength(5);
    expect(canCreateMore([], NOW)).toBe(true);
  });
  it('sorted: active first, then newest first', () => {
    const rows = [
      row({ id: 'old-active', created_at: '2026-11-01T00:00:00Z' }),
      row({ id: 'revoked-new', created_at: '2026-11-18T00:00:00Z', revoked_at: '2026-11-18T01:00:00Z' }),
      row({ id: 'new-active', created_at: '2026-11-17T00:00:00Z' }),
    ];
    expect(sortShares(rows, NOW).map((r) => r.id)).toEqual(['new-active', 'old-active', 'revoked-new']);
    expect(rows.map((r) => r.id)).toEqual(['old-active', 'revoked-new', 'new-active']);   // input untouched
  });
  it('option labels and the token tail', () => {
    expect(optionLabels(row())).toEqual([]);
    expect(optionLabels(row({ show_dates: false, show_lodging_names: true, show_custom_titles: true }))).toEqual(['ซ่อนวันที่', 'แสดงชื่อที่พัก', 'แสดงชื่อที่พิมพ์เอง']);
    expect(tokenTail(TOKEN)).toBe('…4567');
  });
});

describe('tokens and URLs', () => {
  it('parseShareToken accepts a UUID in any case / with spaces, nothing else', () => {
    expect(parseShareToken(TOKEN)).toBe(TOKEN);
    expect(parseShareToken(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(parseShareToken(`  ${TOKEN} `)).toBe(TOKEN);
    expect(parseShareToken(encodeURIComponent(TOKEN))).toBe(TOKEN);
    for (const bad of ['', 'abc', TOKEN + 'x', TOKEN.slice(1), `${TOKEN}/../x`, "'; drop table--", '%E0%A4%A', 'ก'.repeat(36), null, undefined]) {
      expect(parseShareToken(bad as string)).toBeNull();
    }
  });
  it('buildShareUrl puts the token after "#" (never sent to a server)', () => {
    expect(buildShareUrl('https://benzbulakorn-aisin.github.io', '/thai77/', TOKEN)).toBe(`https://benzbulakorn-aisin.github.io/thai77/#/s/${TOKEN}`);
    expect(buildShareUrl('https://x.io/', '/thai77', TOKEN)).toBe(`https://x.io/thai77/#/s/${TOKEN}`);
    expect(buildShareUrl('https://x.io', '/thai77/index.html', TOKEN)).toBe(`https://x.io/thai77/#/s/${TOKEN}`);
    expect(buildShareUrl('http://localhost:5173', '/', TOKEN)).toBe(`http://localhost:5173/#/s/${TOKEN}`);
    expect(buildShareUrl('https://x.io', '', TOKEN)).toBe(`https://x.io/#/s/${TOKEN}`);
  });
  it('an invalid token gives no URL', () => {
    expect(buildShareUrl('https://x.io', '/', 'nope')).toBeNull();
    expect(buildShareUrl('https://x.io', '/', `${TOKEN}#x`)).toBeNull();
  });
  it('the URL round-trips through parseShareToken', () => {
    const u = buildShareUrl('https://x.io', '/thai77/', TOKEN)!;
    expect(parseShareToken(u.split('#/s/')[1])).toBe(TOKEN);
  });
});

describe('shareErrorText', () => {
  it('maps the database codes to Thai text', () => {
    expect(shareErrorText({ code: '42501' })).toContain('เจ้าของทริป');
    expect(shareErrorText({ code: '54000' })).toContain('ครบ 5 ลิงก์');
    expect(shareErrorText({ code: '22023' })).toContain('ไม่ถูกต้อง');
    expect(shareErrorText({ code: 'PGRST202', message: 'x' })).toContain('Migration 009 / 010');
    expect(shareErrorText({ code: '42883' })).toContain('Migration 009 / 010');
    expect(shareErrorText({ message: 'Could not find the function public.preview_trip_share' })).toContain('Migration');
  });
  it('network and unknown errors', () => {
    expect(shareErrorText(new TypeError('Failed to fetch'))).toContain('เชื่อมต่อไม่ได้');
    expect(shareErrorText({ message: 'NetworkError when attempting to fetch resource.' })).toContain('เชื่อมต่อไม่ได้');
    for (const odd of [null, undefined, 'x', 5, {}, { code: 'XX000', message: 'boom' }]) expect(shareErrorText(odd)).toBe('ไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
  it('never echoes the raw database message to the user', () => {
    expect(shareErrorText({ code: 'XX000', message: 'secret internals: relation trip_shares' })).not.toContain('trip_shares');
  });
});
