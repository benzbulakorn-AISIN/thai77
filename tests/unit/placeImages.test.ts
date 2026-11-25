import { describe, expect, it, vi } from 'vitest';
import {
  LICENSE_CHOICES, OWN_LICENSE, chooseCover, creditText, imageAlt, isWikimediaUploadUrl, orderWithCoverFirst, placeImagePath,
  resolveImageUrl, safeHttpsUrl, sortImages, validateImageMeta, type PlaceImage,
} from '../../src/features/placeImages/imageModel';
import {
  classifyLicense, commonsApiUrl, htmlToText, parseCommonsResponse, parseCommonsTitle,
} from '../../src/features/placeImages/commons';
import {
  automaticCoverArticleTitles, commonsApiUrlForWikipediaPageImage, commonsInfoAsPlaceImage,
  fetchAutomaticCommonsCover, parseWikidataImageResponse, parseWikipediaLeadImageResponse,
  wikidataImageApiUrl, wikipediaLeadImageApiUrl,
} from '../../src/features/placeImages/autoCovers';
import { joinPendingBatch } from '../../src/features/placeImages/sharedPending';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const img = (over: Partial<PlaceImage> = {}): PlaceImage => ({
  id: U(1), place_id: U(100), storage_path: null, external_url: null, license: 'CC BY-SA 4.0', author: 'สมชาย', source_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
  alt_th: null, sort_order: 0, ...over,
});
const pub = (p: string) => `https://cdn.example/${p}`;

describe('automatic-cover request coordination', () => {
  it('lets a StrictMode remount join an in-flight batch instead of losing its update', async () => {
    const pending = new Map<string, Promise<void>>();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const start = vi.fn(async () => gate);
    let firstAlive = true;
    let firstUpdates = 0;
    let remountedUpdates = 0;

    const first = joinPendingBatch(pending, ['place-1'], start)
      .then(() => { if (firstAlive) firstUpdates += 1; });
    firstAlive = false; // React StrictMode cleanup
    const remounted = joinPendingBatch(pending, ['place-1'], start)
      .then(() => { remountedUpdates += 1; });

    expect(start).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, remounted]);
    expect(firstUpdates).toBe(0);
    expect(remountedUpdates).toBe(1);
    expect(pending.size).toBe(0);
  });
});

describe('cover choice', () => {
  const a = img({ id: U(3), sort_order: 2 }), b = img({ id: U(2), sort_order: 1 }), c = img({ id: U(4), sort_order: 1 });
  it('sorts by sort_order then id', () => {
    expect(sortImages([a, c, b]).map((x) => x.id)).toEqual([U(2), U(4), U(3)]);
  });
  it('uses the chosen cover, else the first picture, else null', () => {
    expect(chooseCover([a, b, c], U(3))?.id).toBe(U(3));
    expect(chooseCover([a, b, c], 'deleted')?.id).toBe(U(2));
    expect(chooseCover([a, b, c], null)?.id).toBe(U(2));
    expect(chooseCover([], U(3))).toBeNull();
  });
  it('orderWithCoverFirst puts the cover first and keeps the rest in order', () => {
    expect(orderWithCoverFirst([a, b, c], U(3)).map((x) => x.id)).toEqual([U(3), U(2), U(4)]);
    expect(orderWithCoverFirst([a, b, c], null).map((x) => x.id)).toEqual([U(2), U(4), U(3)]);
    expect(orderWithCoverFirst([], null)).toEqual([]);
  });
  it('does not change the input array', () => {
    const arr = [a, b, c];
    sortImages(arr);
    orderWithCoverFirst(arr, U(3));
    expect(arr.map((x) => x.id)).toEqual([U(3), U(2), U(4)]);
  });
});

describe('where a picture may come from', () => {
  it('only https upload.wikimedia.org counts as Wikimedia', () => {
    expect(isWikimediaUploadUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg')).toBe(true);
    for (const bad of ['http://upload.wikimedia.org/x.jpg', 'https://evil.example/x.jpg', 'https://upload.wikimedia.org.evil.com/x.jpg',
      'https://commons.wikimedia.org/x.jpg', 'javascript:alert(1)', '', null, undefined, 'not a url']) {
      expect(isWikimediaUploadUrl(bad as string)).toBe(false);
    }
  });
  const ok = `${U(100)}/${U(5)}.webp`;
  it('own storage path -> public URL; odd paths are refused', () => {
    expect(resolveImageUrl(img({ storage_path: ok }), pub)).toBe(`https://cdn.example/${ok}`);
    for (const bad of ['../x.webp', 'a/b.webp', `${U(100)}/${U(5)}.svg`, `${U(100)}/../${U(5)}.webp`, `https://evil/x.webp`]) {
      expect(resolveImageUrl(img({ storage_path: bad }), pub)).toBeNull();
    }
  });
  it('external pictures only from Wikimedia; any other host is never shown', () => {
    expect(resolveImageUrl(img({ external_url: 'https://upload.wikimedia.org/a.jpg' }), pub)).toBe('https://upload.wikimedia.org/a.jpg');
    expect(resolveImageUrl(img({ external_url: 'https://lh3.googleusercontent.com/a.jpg' }), pub)).toBeNull();
    expect(resolveImageUrl(img({ external_url: 'https://scontent.fbcdn.net/a.jpg' }), pub)).toBeNull();
    expect(resolveImageUrl(img(), pub)).toBeNull();
  });
  it('storage path wins when both are set', () => {
    expect(resolveImageUrl(img({ storage_path: ok, external_url: 'https://upload.wikimedia.org/a.jpg' }), pub)).toBe(`https://cdn.example/${ok}`);
  });
  it('placeImagePath builds {place}/{uuid}.ext and rejects bad ids', () => {
    expect(placeImagePath(U(100), U(5), 'image/webp')).toBe(`${U(100)}/${U(5)}.webp`);
    expect(placeImagePath(U(100), U(5), 'image/png')).toBe(`${U(100)}/${U(5)}.png`);
    expect(placeImagePath(U(100), U(5), 'image/jpeg')).toBe(`${U(100)}/${U(5)}.jpg`);
    expect(() => placeImagePath('../x', U(5), 'image/webp')).toThrow();
    expect(() => placeImagePath(U(100), 'x/y', 'image/webp')).toThrow();
  });
  it('safeHttpsUrl', () => {
    expect(safeHttpsUrl(' https://a.b/c?d=1 ')).toBe('https://a.b/c?d=1');
    for (const bad of ['http://a.b', 'javascript:alert(1)', 'https://a b', 'https://a.b/"x', '', null, undefined]) expect(safeHttpsUrl(bad as string)).toBeNull();
  });
});

describe('credit + alt text', () => {
  it('credit line shows photographer and licence', () => {
    expect(creditText({ author: 'สมชาย', license: 'CC BY-SA 4.0' })).toBe('ภาพ: สมชาย · CC BY-SA 4.0');
    expect(creditText({ author: ' ', license: 'CC0 1.0' })).toBe('ภาพ: ไม่ระบุผู้ถ่าย · CC0 1.0');
    expect(creditText({ author: null, license: 'Public domain' })).toBe('ภาพ: ไม่ระบุผู้ถ่าย · Public domain');
  });
  it('own photos only show the photographer', () => {
    expect(creditText({ author: 'เบนซ์', license: OWN_LICENSE })).toBe('ภาพ: เบนซ์');
    expect(creditText({ author: '', license: OWN_LICENSE })).toBe('ภาพถ่ายของเรา');
  });
  it('alt text falls back to the place name', () => {
    expect(imageAlt({ alt_th: ' วัดตอนเช้า ' }, 'วัด')).toBe('วัดตอนเช้า');
    expect(imageAlt({ alt_th: null }, 'วัดพระแก้ว')).toBe('ภาพ วัดพระแก้ว');
    expect(imageAlt({ alt_th: '  ' }, 'วัดพระแก้ว')).toBe('ภาพ วัดพระแก้ว');
  });
});

describe('validateImageMeta', () => {
  const base = { license: 'CC BY 4.0', author: 'สมชาย', source_url: 'https://example.org/p', alt_th: '' };
  const err = (m: Partial<typeof base>) => { const r = validateImageMeta({ ...base, ...m }); return r.ok ? null : r.error; };
  it('accepts a complete record and normalises it', () => {
    const r = validateImageMeta({ license: '  CC BY 4.0 ', author: ' สมชาย  ใจดี ', source_url: ' https://example.org/p ', alt_th: ' ภาพวัด ' });
    expect(r).toEqual({ ok: true, value: { license: 'CC BY 4.0', author: 'สมชาย ใจดี', source_url: 'https://example.org/p', alt_th: 'ภาพวัด' } });
  });
  it('licence + photographer are always required', () => {
    expect(err({ license: '  ' })).toContain('License');
    expect(err({ author: '' })).toContain('ผู้ถ่าย');
    expect(err({ license: 'x'.repeat(81) })).toContain('80');
    expect(err({ author: 'x'.repeat(201) })).toContain('200');
    expect(err({ alt_th: 'x'.repeat(201) })).toContain('200');
  });
  it('source link is required unless it is our own photo, and must be https', () => {
    expect(err({ source_url: '' })).toContain('ลิงก์ที่มา');
    expect(err({ source_url: 'http://example.org' })).toContain('https');
    expect(err({ source_url: 'javascript:alert(1)' })).toContain('https');
    const own = validateImageMeta({ license: OWN_LICENSE, author: 'เบนซ์', source_url: '', alt_th: '' });
    expect(own).toEqual({ ok: true, value: { license: OWN_LICENSE, author: 'เบนซ์', source_url: null, alt_th: null } });
    expect(validateImageMeta({ license: OWN_LICENSE, author: 'เบนซ์', source_url: 'http://x', alt_th: '' }).ok).toBe(false);
  });
  it('control characters are stripped', () => {
    const r = validateImageMeta({ ...base, author: 'ส\u0000ม\nชาย' });
    expect(r.ok && r.value.author).toBe('ส ม ชาย');
  });
  it('the licence list offers our own photos first and never an NC/ND licence', () => {
    expect(LICENSE_CHOICES[0].value).toBe(OWN_LICENSE);
    for (const l of LICENSE_CHOICES) expect(/\b(nc|nd)\b/i.test(l.value)).toBe(false);
  });
});

describe('Commons: file page URL -> title', () => {
  it('accepts file pages (desktop / mobile / index.php / bare title)', () => {
    expect(parseCommonsTitle('https://commons.wikimedia.org/wiki/File:Wat_Phra_That.jpg')).toBe('File:Wat Phra That.jpg');
    expect(parseCommonsTitle('https://commons.m.wikimedia.org/wiki/File:Doi%20Inthanon.JPG?uselang=th')).toBe('File:Doi Inthanon.JPG');
    expect(parseCommonsTitle('https://commons.wikimedia.org/w/index.php?title=File:A_b.png')).toBe('File:A b.png');
    expect(parseCommonsTitle('File:Pha_Taem.webp')).toBe('File:Pha Taem.webp');
    expect(parseCommonsTitle('  file:lower.jpeg ')).toBe('File:lower.jpeg');
  });
  it('decodes Thai file names', () => {
    expect(parseCommonsTitle('https://commons.wikimedia.org/wiki/File:%E0%B8%A7%E0%B8%B1%E0%B8%94.jpg')).toBe('File:วัด.jpg');
  });
  it('rejects other sites, other wikis, non-images and junk', () => {
    for (const bad of [
      '', '   ', 'https://en.wikipedia.org/wiki/File:X.jpg', 'https://commons.wikimedia.org.evil.com/wiki/File:X.jpg',
      'https://commons.wikimedia.org/wiki/Category:Thailand', 'https://commons.wikimedia.org/wiki/File:Logo.svg',
      'https://commons.wikimedia.org/wiki/File:Movie.ogv', 'https://commons.wikimedia.org/wiki/File:Doc.pdf', 'https://example.org/File:X.jpg',
      'ftp://commons.wikimedia.org/wiki/File:X.jpg', 'File:', 'File:.jpg', 'File:a<b>.jpg', 'File:a|b.jpg', 'https://commons.wikimedia.org/wiki/File:%E0%A4%A.jpg',
      'x'.repeat(601),
    ]) expect(parseCommonsTitle(bad)).toBeNull();
  });
  it('builds the API URL (no key, CORS-enabled, requested thumbnail width)', () => {
    const u = new URL(commonsApiUrl('File:A b.jpg', 800));
    expect(u.origin + u.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(u.searchParams.get('titles')).toBe('File:A b.jpg');
    expect(u.searchParams.get('origin')).toBe('*');
    expect(u.searchParams.get('iiurlwidth')).toBe('800');
    expect(u.searchParams.get('prop')).toBe('imageinfo');
    expect(u.searchParams.get('iiprop')).toBe('url|mime|extmetadata');
  });
});

describe('Commons: licence rules', () => {
  it('accepts CC0, public domain, CC BY, CC BY-SA (any version)', () => {
    for (const [s, kind] of [
      ['CC0', 'cc0'], ['CC0 1.0', 'cc0'], ['Public domain', 'pd'], ['PD-old-100', 'pd'], ['Public Domain Mark 1.0', 'pd'],
      ['CC BY 4.0', 'cc-by'], ['CC BY 2.0', 'cc-by'], ['CC-BY-3.0', 'cc-by'], ['CC BY-SA 4.0', 'cc-by-sa'], ['cc-by-sa-3.0', 'cc-by-sa'],
      ['CC BY-SA 3.0 de', 'cc-by-sa'], ['CC BY-SA 2.5', 'cc-by-sa'],
    ] as const) {
      const v = classifyLicense(s);
      expect(v).toEqual({ allowed: true, kind });
    }
  });
  it('rejects NC / ND, GFDL-only, fair use, unknown and empty', () => {
    for (const s of ['CC BY-NC 4.0', 'CC BY-NC-SA 3.0', 'CC BY-ND 4.0', 'CC BY-NC-ND 2.0', 'GFDL 1.2', 'GFDL', 'Fair use', 'Non-free', 'All rights reserved',
      'Attribution', 'Copyrighted free use', 'MIT', 'OGL', '', '   ']) {
      expect(classifyLicense(s).allowed).toBe(false);
    }
    const nc = classifyLicense('CC BY-NC 4.0');
    expect(!nc.allowed && nc.reason).toContain('เชิงพาณิชย์');
    const nd = classifyLicense('CC BY-ND 4.0');
    expect(!nd.allowed && nd.reason).toContain('ดัดแปลง');
  });
});

describe('Commons: html -> text', () => {
  it('strips tags, decodes entities, collapses spaces', () => {
    expect(htmlToText('<a href="//commons.wikimedia.org/wiki/User:Somchai">Somchai&nbsp;Jaidee</a> &amp; <b>friends</b>')).toBe('Somchai Jaidee & friends');
    expect(htmlToText('A<br/>B<br>C')).toBe('A B C');
    expect(htmlToText('&#3623;&#3633;&#3604; &#x0E0A;&#x0E25;')).toBe('วัด ชล');
    expect(htmlToText('&quot;q&quot; &#39;s&#39; &lt;x&gt;')).toBe(`"q" 's' <x>`);
  });
  it('is safe with scripts, control codes and non-strings', () => {
    expect(htmlToText('<script>alert(1)</script>ok')).toBe('alert(1) ok'); // tags removed; React escapes the rest
    expect(htmlToText('a\u0000b&#0;c&#1114112;d')).toBe('a b c d');
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText(42)).toBe('');
  });
});

// Shape of the MediaWiki "imageinfo + extmetadata" answer (formatversion=2). Hand-written fixture, not a live capture.
const answer = (over: Record<string, unknown> = {}, ext: Record<string, unknown> = {}) => ({
  batchcomplete: true,
  query: {
    pages: [{
      pageid: 123, ns: 6, title: 'File:Wat Phra That Doi Suthep.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wat_Phra_That_Doi_Suthep.jpg/960px-Wat_Phra_That_Doi_Suthep.jpg',
        thumbwidth: 960, thumbheight: 640,
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Wat_Phra_That_Doi_Suthep.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Wat_Phra_That_Doi_Suthep.jpg',
        mime: 'image/jpeg',
        extmetadata: {
          LicenseShortName: { value: 'CC BY-SA 4.0', source: 'commonsmetadata-0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
          Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Somchai">Somchai Jaidee</a>' },
          ImageDescription: { value: 'Temple on the mountain &amp; garden' },
          Restrictions: { value: '' },
          ...ext,
        },
        ...over,
      }],
    }],
  },
});

describe('Wikipedia/Wikidata: automatic cover selection', () => {
  it('tries exact English/verified article titles before the Thai title', () => {
    expect(automaticCoverArticleTitles({
      id: U(1), nameTh: 'ปราสาทสัจธรรม', nameEn: 'Sanctuary of Truth', provinceTh: 'ชลบุรี', provinceEn: 'Chon Buri',
    })).toEqual([
      'Sanctuary of Truth', 'The Sanctuary of Truth', 'Prasat Sut Ja-Tum', 'Prasat Satchatham', 'ปราสาทสัจธรรม',
    ]);
    expect(automaticCoverArticleTitles({ id: U(1), nameTh: 'วัดอรุณ', nameEn: null })).toEqual(['วัดอรุณ']);
  });
  it('builds a CORS-enabled exact-title Wikipedia query for a free lead image', () => {
    const u = new URL(wikipediaLeadImageApiUrl('en', '  Sanctuary   of Truth  '));
    expect(u.origin + u.pathname).toBe('https://en.wikipedia.org/w/api.php');
    expect(u.searchParams.get('origin')).toBe('*');
    expect(u.searchParams.get('titles')).toBe('Sanctuary of Truth');
    expect(u.searchParams.get('redirects')).toBe('1');
    expect(u.searchParams.get('prop')).toBe('pageimages|pageprops');
    expect(u.searchParams.get('piprop')).toBe('name');
    expect(u.searchParams.get('pilicense')).toBe('free');
    expect(u.searchParams.has('generator')).toBe(false);
    expect(u.searchParams.has('gsrsearch')).toBe(false);
  });
  it('uses Thai Wikipedia for an exact Thai article title', () => {
    const u = new URL(wikipediaLeadImageApiUrl('th', 'ปราสาทสัจธรรม'));
    expect(u.origin + u.pathname).toBe('https://th.wikipedia.org/w/api.php');
    expect(u.searchParams.get('titles')).toBe('ปราสาทสัจธรรม');
    expect(u.searchParams.has('generator')).toBe(false);
  });
  it('parses the exact article lead image and linked Wikidata item', () => {
    expect(parseWikipediaLeadImageResponse({ query: { pages: [{
      pageid: 123, ns: 0, title: 'Sanctuary of Truth', pageimage: 'Sanctuary_of_Truth_2018.jpg',
      pageprops: { wikibase_item: 'Q1135255' },
    }] } }, 'en')).toEqual({
      language: 'en', articleTitle: 'Sanctuary of Truth',
      fileTitle: 'File:Sanctuary of Truth 2018.jpg', wikidataId: 'Q1135255',
    });
  });
  it('turns Wikipedia pageimage filenames into exact Commons metadata requests', () => {
    const u = new URL(commonsApiUrlForWikipediaPageImage('Santuaryoftruth2.jpg') ?? '');
    expect(u.origin + u.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(u.searchParams.get('titles')).toBe('File:Santuaryoftruth2.jpg');
    expect(u.searchParams.get('prop')).toBe('imageinfo');
    expect(u.searchParams.get('iiprop')).toBe('url|mime|extmetadata');
    expect(u.searchParams.get('iiurlwidth')).toBe('1600');
  });
  it('continues from a Wikipedia pageimage to Commons metadata and returns the checked image', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://en.wikipedia.org/')) {
        return {
          ok: true,
          json: async () => ({ query: { pages: [{
            pageid: 15229884, ns: 0, title: 'Sanctuary of Truth', pageimage: 'Santuaryoftruth2.jpg',
            pageprops: { wikibase_item: 'Q262459' },
          }] } }),
        } as Response;
      }
      if (url.startsWith('https://commons.wikimedia.org/')) {
        return { ok: true, json: async () => answer() } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const image = await fetchAutomaticCommonsCover({
        id: U(901), nameTh: 'ปราสาทสัจธรรม', nameEn: 'Sanctuary of Truth',
        provinceTh: 'ชลบุรี', provinceEn: 'Chon Buri',
      });
      expect(calls).toHaveLength(2);
      expect(new URL(calls[0]).hostname).toBe('en.wikipedia.org');
      const commonsRequest = new URL(calls[1]);
      expect(commonsRequest.hostname).toBe('commons.wikimedia.org');
      expect(commonsRequest.searchParams.get('titles')).toBe('File:Santuaryoftruth2.jpg');
      expect(image?.external_url).toContain('upload.wikimedia.org');
      expect(image?.license).toBe('CC BY-SA 4.0');
      expect(image?.author).toBe('Somchai Jaidee');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('falls back to the exact linked Wikidata P18 when the Wikipedia pageimage is unavailable on Commons', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://en.wikipedia.org/')) {
        return { ok: true, json: async () => ({ query: { pages: [{
          pageid: 15229884, ns: 0, title: 'Sanctuary of Truth', pageimage: 'Local_only.jpg',
          pageprops: { wikibase_item: 'Q262459' },
        }] } }) } as Response;
      }
      if (url.includes('titles=File%3ALocal+only.jpg')) {
        return { ok: true, json: async () => ({ query: { pages: [{ ns: 6, title: 'File:Local only.jpg', missing: true }] } }) } as Response;
      }
      if (url.startsWith('https://www.wikidata.org/')) {
        return { ok: true, json: async () => ({ claims: { P18: [{
          rank: 'preferred', mainsnak: { snaktype: 'value', datavalue: { value: 'Sanctuary of Truth.jpg' } },
        }] } }) } as Response;
      }
      if (url.includes('titles=File%3ASanctuary+of+Truth.jpg')) {
        return { ok: true, json: async () => answer() } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const image = await fetchAutomaticCommonsCover({
        id: U(902), nameTh: 'ปราสาทสัจธรรม', nameEn: 'Sanctuary of Truth',
      });
      expect(calls.map((url) => new URL(url).hostname)).toEqual([
        'en.wikipedia.org', 'commons.wikimedia.org', 'www.wikidata.org', 'commons.wikimedia.org',
      ]);
      expect(image?.external_url).toContain('upload.wikimedia.org');
      expect(image?.license).toBe('CC BY-SA 4.0');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('reuses a successful automatic cover by place id across card and detail request shapes', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://en.wikipedia.org/')) {
        return { ok: true, json: async () => ({ query: { pages: [{
          pageid: 15229884, ns: 0, title: 'Sanctuary of Truth', pageimage: 'Santuaryoftruth2.jpg',
          pageprops: { wikibase_item: 'Q262459' },
        }] } }) } as Response;
      }
      if (url.startsWith('https://commons.wikimedia.org/')) return { ok: true, json: async () => answer() } as Response;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const card = await fetchAutomaticCommonsCover({
        id: U(903), nameTh: 'ปราสาทสัจธรรม', nameEn: 'Sanctuary of Truth',
        provinceTh: 'ชลบุรี', provinceEn: 'Chon Buri',
      });
      const detail = await fetchAutomaticCommonsCover({ id: U(903), nameTh: 'ปราสาทสัจธรรม' });
      expect(detail).toEqual(card);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('allows a linked Wikidata item when Wikipedia has no lead image', () => {
    expect(parseWikipediaLeadImageResponse({ query: { pages: [{
      pageid: 123, ns: 0, title: 'Example place', pageprops: { wikibase_item: 'Q42' },
    }] } }, 'en')).toEqual({
      language: 'en', articleTitle: 'Example place', fileTitle: null, wikidataId: 'Q42',
    });
  });
  it('rejects missing, non-article, disambiguation, and image-less unlinked pages', () => {
    for (const page of [
      { ns: 0, title: 'Missing', missing: true },
      { ns: 6, title: 'File:X.jpg', pageimage: 'X.jpg' },
      { ns: 0, title: 'Ambiguous', pageimage: 'X.jpg', pageprops: { disambiguation: '' } },
      { ns: 0, title: 'No image or item' },
    ]) expect(parseWikipediaLeadImageResponse({ query: { pages: [page] } }, 'en')).toBeNull();
  });
  it('builds the exact P18 Wikidata query and picks the preferred valid image', () => {
    const u = new URL(wikidataImageApiUrl('Q1135255'));
    expect(u.origin + u.pathname).toBe('https://www.wikidata.org/w/api.php');
    expect(u.searchParams.get('entity')).toBe('Q1135255');
    expect(u.searchParams.get('property')).toBe('P18');
    expect(() => wikidataImageApiUrl('P18')).toThrow();
    expect(parseWikidataImageResponse({ claims: { P18: [
      { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: 'Other.jpg' } } },
      { rank: 'preferred', mainsnak: { snaktype: 'value', datavalue: { value: 'Sanctuary of Truth.jpg' } } },
    ] } })).toBe('File:Sanctuary of Truth.jpg');
  });
  it('returns null for missing or unusable Wikidata P18 claims', () => {
    for (const data of [null, {}, { claims: {} }, { claims: { P18: [] } }, { claims: { P18: [
      { rank: 'normal', mainsnak: { snaktype: 'novalue' } },
    ] } }]) expect(parseWikidataImageResponse(data)).toBeNull();
  });
  it('turns a checked Commons result into a display-only place image with credit', () => {
    const parsed = parseCommonsResponse(answer());
    if (!parsed.ok) throw new Error('unexpected fixture');
    const image = commonsInfoAsPlaceImage(U(100), 'วัดพระธาตุดอยสุเทพ', parsed.info);
    expect(image.place_id).toBe(U(100));
    expect(image.external_url).toContain('upload.wikimedia.org');
    expect(image.source_url).toContain('commons.wikimedia.org');
    expect(image.license).toBe('CC BY-SA 4.0');
    expect(image.alt_th).toBe('ภาพวัดพระธาตุดอยสุเทพ');
  });
});

describe('Commons: parse the API answer', () => {
  it('good answer -> checked info', () => {
    const r = parseCommonsResponse(answer());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.license).toBe('CC BY-SA 4.0');
    expect(r.info.licenseKind).toBe('cc-by-sa');
    expect(r.info.author).toBe('Somchai Jaidee');
    expect(r.info.description).toBe('Temple on the mountain & garden');
    expect(r.info.pageUrl).toBe('https://commons.wikimedia.org/wiki/File:Wat_Phra_That_Doi_Suthep.jpg');
    expect(r.info.thumbUrl).toContain('960px-');
    expect(r.info.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0');
    expect(r.info.restrictions).toEqual([]);
    expect(r.info.warnings.some((w) => w.includes('ไม่รับประกัน'))).toBe(true);
  });
  it('the old (formatversion=1) page map works too', () => {
    const v2 = answer();
    const v1 = { query: { pages: { '123': (v2.query.pages as unknown[])[0] } } };
    expect(parseCommonsResponse(v1).ok).toBe(true);
  });
  it('missing file / no imageinfo / empty answer', () => {
    const m = parseCommonsResponse({ query: { pages: [{ ns: 6, title: 'File:Nope.jpg', missing: true }] } });
    expect(!m.ok && m.error).toContain('ไม่พบไฟล์');
    const m1 = parseCommonsResponse({ query: { pages: { '-1': { title: 'File:Nope.jpg', missing: '' } } } });
    expect(m1.ok).toBe(false);
    for (const bad of [null, undefined, 'x', 5, {}, { query: {} }, { query: { pages: [] } }, { query: { pages: [{ title: 'x' }] } }]) {
      expect(parseCommonsResponse(bad).ok).toBe(false);
    }
  });
  it('non-free licences are refused, with the licence name for the screen', () => {
    const r = parseCommonsResponse(answer({}, { LicenseShortName: { value: 'CC BY-NC 4.0' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.license).toBe('CC BY-NC 4.0'); expect(r.error).toContain('เชิงพาณิชย์'); }
    expect(parseCommonsResponse(answer({}, { LicenseShortName: undefined, UsageTerms: { value: 'Creative Commons Attribution 3.0' } })).ok).toBe(false);
  });
  it('falls back to UsageTerms when LicenseShortName is missing', () => {
    const r = parseCommonsResponse(answer({}, { LicenseShortName: undefined, UsageTerms: { value: 'Public domain' } }));
    expect(r.ok && r.info.licenseKind).toBe('pd');
  });
  it('only JPG / PNG / WebP', () => {
    for (const mime of ['image/svg+xml', 'image/gif', 'image/tiff', 'application/pdf', 'video/webm', '', undefined]) {
      expect(parseCommonsResponse(answer({ mime })).ok).toBe(false);
    }
    expect(parseCommonsResponse(answer({ mime: 'image/png' })).ok).toBe(true);
    expect(parseCommonsResponse(answer({ mime: 'image/webp' })).ok).toBe(true);
  });
  it('never trusts URLs: thumbnail must be https upload.wikimedia.org, page must be https commons', () => {
    expect(parseCommonsResponse(answer({ thumburl: 'https://evil.example/x.jpg' })).ok).toBe(false);
    expect(parseCommonsResponse(answer({ thumburl: 'http://upload.wikimedia.org/x.jpg' })).ok).toBe(false);
    expect(parseCommonsResponse(answer({ descriptionurl: 'https://evil.example/File:X.jpg' })).ok).toBe(false);
    expect(parseCommonsResponse(answer({ descriptionurl: 'javascript:alert(1)' })).ok).toBe(false);
    // no thumburl at all -> falls back to the original file URL (still must be Wikimedia)
    expect(parseCommonsResponse(answer({ thumburl: undefined })).ok).toBe(true);
    expect(parseCommonsResponse(answer({ thumburl: undefined, url: 'https://evil.example/x.jpg' })).ok).toBe(false);
  });
  it('missing author -> warning to type it in; restrictions -> warning; odd licence URL dropped', () => {
    const r = parseCommonsResponse(answer({}, { Artist: undefined, Restrictions: { value: 'personality|trademarked' }, LicenseUrl: { value: 'javascript:alert(1)' } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.author).toBe('');
    expect(r.info.restrictions).toEqual(['personality', 'trademarked']);
    expect(r.info.licenseUrl).toBeNull();
    expect(r.info.warnings.some((w) => w.includes('ชื่อผู้ถ่าย'))).toBe(true);
    expect(r.info.warnings.some((w) => w.includes('personality'))).toBe(true);
  });
  it('the author is plain text even if the HTML is hostile, and is length-capped', () => {
    const r = parseCommonsResponse(answer({}, { Artist: { value: '<img src=x onerror=alert(1)>' + 'A'.repeat(500) } }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.info.author.includes('<')).toBe(false); expect(r.info.author.length).toBeLessThanOrEqual(200); }
  });
});

describe('end to end: a checked Commons picture passes the metadata rules', () => {
  it('Commons info -> validateImageMeta', () => {
    const r = parseCommonsResponse(answer());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = validateImageMeta({ license: r.info.license, author: r.info.author, source_url: r.info.pageUrl, alt_th: 'ภาพวัด' });
    expect(m.ok).toBe(true);
  });
  it('without an author the form must be filled in first', () => {
    const r = parseCommonsResponse(answer({}, { Artist: undefined }));
    if (!r.ok) throw new Error('unexpected');
    expect(validateImageMeta({ license: r.info.license, author: r.info.author, source_url: r.info.pageUrl, alt_th: '' }).ok).toBe(false);
  });
});
