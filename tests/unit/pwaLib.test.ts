import { describe, expect, it } from 'vitest';
import {
  PRECACHE_FAIL_BYTES, PRECACHE_WARN_BYTES, applyPlaceholders, computeBuildId, configSiteUrl, fixPublicLinks, linkHref, manifestProblems, metaContent, normalizeBase,
  ogImageWarnings, ogProblems, pickOgImage, pwaEnabled, readBuildIdFromSw, readImageSize, readPrecacheFromSw, renderSw, selectPrecache, selfDestructSw, siteUrlFrom,
} from '../../scripts/pwa-lib.mjs';

describe('normalizeBase / siteUrlFrom', () => {
  it('base path always starts and ends with a slash', () => {
    expect([normalizeBase('/thai77/'), normalizeBase('thai77'), normalizeBase(''), normalizeBase('/'), normalizeBase(undefined), normalizeBase('//a//b')]).toEqual(['/thai77/', '/thai77/', '/', '/', '/', '/a/b/']);
  });
  it('GitHub repository -> https://owner.github.io/repo/ (owner is lower-cased, repo keeps its case)', () => {
    expect(siteUrlFrom({ repository: 'BenzBulakorn-AISIN/thai77' })).toBe('https://benzbulakorn-aisin.github.io/thai77/');
    expect(siteUrlFrom({ repository: 'me/My_App.v2' })).toBe('https://me.github.io/My_App.v2/');
  });
  it('a repository called <owner>.github.io is served from the root', () => {
    expect(siteUrlFrom({ repository: 'me/me.github.io' })).toBe('https://me.github.io/');
    expect(siteUrlFrom({ repository: 'ME/me.GitHub.io' })).toBe('https://me.github.io/');
  });
  it('SITE_URL wins, gets a trailing slash, loses query and hash, must be https', () => {
    expect(siteUrlFrom({ siteUrl: 'https://trips.example.com/app', repository: 'a/b' })).toBe('https://trips.example.com/app/');
    expect(siteUrlFrom({ siteUrl: 'https://x.io/?a=1#h' })).toBe('https://x.io/');
    expect(siteUrlFrom({ siteUrl: 'http://x.io/' })).toBeNull();
    expect(siteUrlFrom({ siteUrl: 'javascript:alert(1)' })).toBeNull();
    expect(siteUrlFrom({ siteUrl: 'garbage' })).toBeNull();
  });
  it('unknown / odd repositories -> null (never a wrong address)', () => {
    for (const r of [undefined, '', 'noslash', 'a/b/c', '/b', 'a/', 'a b/c', 'a/<x>', '-bad/x']) expect(siteUrlFrom({ repository: r as string })).toBeNull();
    expect(siteUrlFrom()).toBeNull();
  });
});

describe('pwaEnabled (the emergency switch)', () => {
  it('reads enabled true / false', () => {
    expect(pwaEnabled('{"enabled": true}')).toEqual({ enabled: true, warning: null });
    expect(pwaEnabled('{"enabled": false, "_note": "x"}')).toEqual({ enabled: false, warning: null });
  });
  it('missing file, broken JSON or a wrong type NEVER switch the app off by accident', () => {
    expect(pwaEnabled(null).enabled).toBe(true);
    expect(pwaEnabled(undefined).enabled).toBe(true);
    for (const bad of ['{not json', '', '[]', '{"enabled": "false"}', '{"enabled": 0}', '{}', 'null']) {
      const r = pwaEnabled(bad);
      expect(r.enabled).toBe(true);
      expect(typeof r.warning).toBe('string');
    }
  });
});

describe('configSiteUrl (custom domain from pwa.config.json)', () => {
  it('a valid https address -> with trailing slash; empty / missing / odd -> null (so the github.io address is used)', () => {
    expect(configSiteUrl('{"siteUrl": "https://trips.example.com/app"}')).toBe('https://trips.example.com/app/');
    for (const bad of ['{"siteUrl": ""}', '{"siteUrl": "  "}', '{}', '{"siteUrl": 5}', '{"siteUrl": "http://x.io"}', '{"siteUrl": "garbage"}', '{not json', '', null, undefined]) {
      expect(configSiteUrl(bad as string)).toBeNull();
    }
  });
});

const png = (w: number, h: number) => { const b = Buffer.alloc(32); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpeg = (w: number, h: number, withExif = true) => {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (withExif) parts.push(Buffer.from([0xff, 0xe1, 0x00, 0x08, 1, 2, 3, 4, 5, 6]));            // APP1 (length 8 = 2 + 6)
  parts.push(Buffer.from([0xff, 0xc4, 0x00, 0x04, 0, 0]));                                      // DHT must be skipped, not mistaken for the size
  const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.alloc(8));
  return Buffer.concat(parts);
};

describe('readImageSize / pickOgImage / ogImageWarnings', () => {
  it('PNG and JPEG sizes (JPEG with EXIF and other segments in front)', () => {
    expect(readImageSize(png(1200, 630))).toEqual({ type: 'png', width: 1200, height: 630 });
    expect(readImageSize(jpeg(1200, 630))).toEqual({ type: 'jpeg', width: 1200, height: 630 });
    expect(readImageSize(jpeg(800, 600, false))).toEqual({ type: 'jpeg', width: 800, height: 600 });
  });
  it('anything else is null', () => {
    for (const b of [Buffer.alloc(0), Buffer.from('hello world, not an image at all'), Buffer.from([0xff, 0xd8]), Buffer.alloc(40), null, undefined]) {
      expect(readImageSize(b as Buffer)).toBeNull();
    }
  });
  it('the owner\'s og.jpg wins over og.png, which wins over the generated default', () => {
    expect(pickOgImage(['img/og.jpg', 'img/og.png', 'img/og-default.png'])).toEqual({ path: 'img/og.jpg', custom: true });
    expect(pickOgImage(['img/og.png', 'img/og-default.png'])).toEqual({ path: 'img/og.png', custom: true });
    expect(pickOgImage(['img/og-default.png', 'img/og.webp'])).toEqual({ path: 'img/og-default.png', custom: false });
    expect(pickOgImage([])).toEqual({ path: 'img/og-default.png', custom: false });
  });
  it('warnings: right size is silent; 16:9 is accepted; 3:2, tiny and huge are flagged', () => {
    expect(ogImageWarnings({ width: 1200, height: 630 }, 90_000)).toEqual([]);
    expect(ogImageWarnings({ width: 1200, height: 675 }, 90_000).some((w) => w.includes('1.91'))).toBe(false);      // 16:9 is fine on its ratio
    expect(ogImageWarnings({ width: 1536, height: 1024 }, 90_000).some((w) => w.includes('1.91'))).toBe(true);      // 3:2 would be cropped
    expect(ogImageWarnings({ width: 400, height: 210 }, 9_000).some((w) => w.includes('400'))).toBe(true);
    expect(ogImageWarnings({ width: 1200, height: 630 }, 2 * 1024 * 1024).some((w) => w.includes('MB'))).toBe(true);
    expect(ogImageWarnings(null, 10)).toHaveLength(1);
  });
});

const TEMPLATE = `<html><head>
<link rel="icon" href="/favicon.svg" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
<meta name="thai77-pwa" content="__PWA_STATE__" />
<meta property="og:url" content="https://__thai77_site__/" />
<meta property="og:image" content="https://__thai77_site__/__OG_IMAGE__" />
<meta property="og:image:width" content="__OG_W__" />
<meta property="og:image:height" content="__OG_H__" />
</head></html>`;
const fill = (o: Record<string, unknown> = {}) => applyPlaceholders(TEMPLATE, { site: 'https://me.github.io/thai77/', base: '/thai77/', ogImage: 'img/og.jpg', ogSize: { width: 1200, height: 630 }, enabled: true, ...o } as never);

describe('applyPlaceholders / fixPublicLinks', () => {
  it('fills everything with a full URL', () => {
    const h = fill();
    expect(metaContent(h, 'og:url')).toBe('https://me.github.io/thai77/');
    expect(metaContent(h, 'og:image')).toBe('https://me.github.io/thai77/img/og.jpg');
    expect([metaContent(h, 'og:image:width'), metaContent(h, 'og:image:height'), metaContent(h, 'thai77-pwa')]).toEqual(['1200', '630', 'on']);
  });
  it('switch off -> "off"; unknown site -> the base path (a relative URL, flagged later by the build check)', () => {
    expect(metaContent(fill({ enabled: false }), 'thai77-pwa')).toBe('off');
    expect(metaContent(fill({ site: null }), 'og:image')).toBe('/thai77/img/og.jpg');
  });
  it('nothing is left over, and unusual characters cannot break out of the attribute', () => {
    expect(/__thai77_site__|__OG_|__PWA_/.test(fill())).toBe(false);
    const h = fill({ ogImage: 'img/a"b<c.jpg' });
    expect(h.includes('a"b')).toBe(false);
    expect(h.includes('&quot;')).toBe(true);
  });
  it('a placeholder that cannot be filled (typo in index.html) stops the build instead of shipping a broken page', () => {
    const o = { site: 'https://a.b/', base: '/', ogImage: 'x', ogSize: { width: 1, height: 1 }, enabled: true } as never;
    expect(() => applyPlaceholders('<meta content="__thai77_site__x">', o)).toThrow();          // not the full "https://__thai77_site__/" form
    expect(() => applyPlaceholders('<meta content="https://__thai77_site__">', o)).toThrow();   // slash missing
    expect(() => applyPlaceholders('<meta content="https://__thai77_site__/">', o)).not.toThrow();
  });
  it('fixPublicLinks adds the base to root-absolute manifest / icon links, only once, and leaves everything else alone', () => {
    const once = fixPublicLinks(TEMPLATE, '/thai77/');
    expect(linkHref(once, 'manifest')).toBe('/thai77/manifest.webmanifest');
    expect(linkHref(once, 'apple-touch-icon')).toBe('/thai77/icons/apple-touch-icon-180.png');
    expect(linkHref(once, 'icon')).toBe('/thai77/favicon.svg');
    expect(fixPublicLinks(once, '/thai77/')).toBe(once);                      // idempotent
    expect(fixPublicLinks(TEMPLATE, '/')).toBe(TEMPLATE);                      // root site: nothing to do
    const other = '<link rel="stylesheet" href="/x.css"><link rel="manifest" href="https://cdn.test/m.json"><link rel="manifest" href="//cdn.test/m.json"><link rel="manifest" href="m.json">';
    expect(fixPublicLinks(other, '/thai77/')).toBe(other);
  });
});

describe('selectPrecache / computeBuildId', () => {
  const files = [
    { path: 'index.html', size: 3000 }, { path: 'offline.html', size: 800 }, { path: 'manifest.webmanifest', size: 900 }, { path: 'favicon.svg', size: 100 },
    { path: 'icons/icon-192.png', size: 12_000 }, { path: 'icons/apple-touch-icon-180.png', size: 11_000 },
    { path: 'assets/index-A.js', size: 500_000 }, { path: 'assets/index-B.css', size: 40_000 }, { path: 'assets/font-thai-400.woff2', size: 30_000 },
    { path: 'assets/index-A.js.map', size: 900_000 }, { path: 'geo/provinces.geojson', size: 5_000_000 }, { path: 'geo/districts/TH20.geojson', size: 90_000 },
    { path: 'img/og.jpg', size: 80_000 }, { path: 'img/regions/east.webp', size: 70_000 }, { path: 'sw.js', size: 5000 }, { path: 'build.json', size: 200 },
  ];
  it('keeps the app shell; leaves fonts, map data, pictures, source maps, sw.js and build.json out', () => {
    const s = selectPrecache(files);
    expect(s.entries.map((e) => e.rel)).toEqual(['', 'assets/index-A.js', 'assets/index-B.css', 'favicon.svg', 'icons/apple-touch-icon-180.png', 'icons/icon-192.png', 'manifest.webmanifest', 'offline.html']);
    expect(s.bytes).toBe(3000 + 800 + 900 + 100 + 12_000 + 11_000 + 500_000 + 40_000);
    expect(s.level).toBe('ok');
  });
  it('index.html is listed as "" (the page address) and never twice', () => {
    expect(selectPrecache(files).entries.filter((e) => e.rel === '' || e.path === 'index.html')).toHaveLength(1);
  });
  it('budget levels', () => {
    expect(selectPrecache([{ path: 'assets/a.js', size: PRECACHE_WARN_BYTES + 1 }]).level).toBe('warn');
    expect(selectPrecache([{ path: 'assets/a.js', size: PRECACHE_FAIL_BYTES + 1 }]).level).toBe('fail');
    expect(selectPrecache([]).level).toBe('ok');
  });
  it('the build id changes when ANY kept file or the worker code changes, and not otherwise', () => {
    const items = [{ rel: '', sha: 'aaa' }, { rel: 'assets/x.js', sha: 'bbb' }];
    const id = computeBuildId(items, 'tplhash');
    expect(id).toMatch(/^[0-9a-f]{10}$/);
    expect(computeBuildId([...items].reverse(), 'tplhash')).toBe(id);                       // order does not matter
    expect(computeBuildId([{ rel: '', sha: 'aaa' }, { rel: 'assets/x.js', sha: 'bbc' }], 'tplhash')).not.toBe(id);
    expect(computeBuildId([...items, { rel: 'offline.html', sha: 'c' }], 'tplhash')).not.toBe(id);
    expect(computeBuildId(items, 'tplhash2')).not.toBe(id);
    expect(computeBuildId([{ rel: '', sha: 'bbb' }, { rel: 'assets/x.js', sha: 'aaa' }], 'tplhash')).not.toBe(id); // same hashes on other files
  });
});

describe('renderSw / selfDestructSw / readers', () => {
  const tpl = "const BUILD_ID = '__BUILD_ID__';\nconst PRECACHE = __PRECACHE__;\n";
  it('fills the template and the check-build readers can read it back', () => {
    const sw = renderSw(tpl, { buildId: 'abcdef0123', precache: ['', 'assets/a-1.js'] });
    expect(readBuildIdFromSw(sw)).toBe('abcdef0123');
    expect(readPrecacheFromSw(sw)).toEqual(['', 'assets/a-1.js']);
  });
  it('a template without its placeholders is refused', () => {
    expect(() => renderSw('nothing here', { buildId: 'x', precache: [] })).toThrow();
    expect(() => renderSw('const BUILD_ID = "__BUILD_ID__";', { buildId: 'x', precache: [] })).toThrow();
  });
  it('readers return null for damaged input', () => {
    expect(readPrecacheFromSw('const PRECACHE = [1,2];')).toBeNull();
    expect(readPrecacheFromSw('const PRECACHE = [not json];')).toBeNull();
    expect(readPrecacheFromSw('')).toBeNull();
    expect(readBuildIdFromSw("const BUILD_ID = '__BUILD_ID__';")).toBeNull();
  });
  it('the self-destructing worker removes only our caches, unregisters itself and reloads the pages', () => {
    const s = selfDestructSw();
    expect(s).toContain("indexOf('thai77-') === 0");
    expect(s).toContain('registration.unregister()');
    expect(s).toContain('skipWaiting');
    expect(s).toContain('c.navigate(c.url)');
    expect(() => new Function(s)).not.toThrow();                                     // valid JavaScript
    expect(/https?:\/\//.test(s)).toBe(false);
  });
});

const goodManifest = () => ({
  name: 'เที่ยวไทย 77 จังหวัด', short_name: 'เที่ยวไทย 77', display: 'standalone', start_url: './', scope: './', background_color: '#F0F9FF', theme_color: '#0369A1',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [{ name: 'สำรวจ', url: './#/explore' }],
});
const mctx = (over: Record<string, unknown> = {}) => ({
  base: '/thai77/', files: new Set(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']),
  size: (rel: string) => ({ width: /192/.test(rel) ? 192 : 512, height: /192/.test(rel) ? 192 : 512 }), ...over,
});

describe('manifestProblems', () => {
  it('a good manifest has no problems, under any base path', () => {
    expect(manifestProblems(goodManifest(), mctx())).toEqual([]);
    expect(manifestProblems(goodManifest(), mctx({ base: '/' }))).toEqual([]);
    expect(manifestProblems(goodManifest(), mctx({ base: '/deep/er/' }))).toEqual([]);
  });
  it('scope must be the base path (otherwise the installed app is not controlled / opens in the browser)', () => {
    expect(manifestProblems({ ...goodManifest(), scope: '/' }, mctx()).join()).toContain('scope');
    expect(manifestProblems({ ...goodManifest(), scope: '../' }, mctx()).join()).toContain('scope');
  });
  it('start_url must stay inside the scope', () => {
    expect(manifestProblems({ ...goodManifest(), start_url: '../other/' }, mctx()).join()).toContain('start_url');
  });
  it('display, names, colours', () => {
    expect(manifestProblems({ ...goodManifest(), display: 'browser' }, mctx()).join()).toContain('display');
    expect(manifestProblems({ ...goodManifest(), name: '' }, mctx()).join()).toContain('name');
    expect(manifestProblems({ ...goodManifest(), short_name: '' }, mctx()).join()).toContain('short_name');
    expect(manifestProblems({ ...goodManifest(), short_name: 'ชื่อสั้นที่ยาวเกินกว่าสิบหกตัวอักษรแน่นอน' }, mctx()).join()).toContain('16');
    expect(manifestProblems({ ...goodManifest(), theme_color: 'blue' }, mctx()).join()).toContain('theme_color');
  });
  it('icons: must exist, match their declared size, and cover 192 / 512 / maskable 512', () => {
    expect(manifestProblems(goodManifest(), mctx({ files: new Set(['icons/icon-192.png']) })).join()).toContain('ไม่พบไฟล์ไอคอน');
    expect(manifestProblems(goodManifest(), mctx({ size: () => ({ width: 100, height: 100 }) })).join()).toContain('ประกาศ');
    expect(manifestProblems(goodManifest(), mctx({ size: () => null })).join()).toContain('อ่านขนาด');
    const noMask = { ...goodManifest(), icons: goodManifest().icons.slice(0, 2) };
    expect(manifestProblems(noMask, mctx()).join()).toContain('maskable');
    expect(manifestProblems({ ...goodManifest(), icons: [] }, mctx()).join()).toContain('192');
    expect(manifestProblems({ ...goodManifest(), icons: [{ src: '/elsewhere/i.png', sizes: '512x512' }] }, mctx()).join()).toContain('นอก base');
  });
  it('shortcuts must stay in scope', () => {
    expect(manifestProblems({ ...goodManifest(), shortcuts: [{ name: 'x', url: '../x' }] }, mctx()).join()).toContain('shortcut');
  });
  it('not a manifest at all', () => {
    for (const bad of [null, undefined, 'x', 5]) expect(manifestProblems(bad as never, mctx())).toEqual(['manifest.webmanifest อ่านไม่ได้']);
  });
});

describe('ogProblems', () => {
  const page = (over: Record<string, string | null> = {}) => {
    const tags: Record<string, string | null> = {
      'og:title': 'ชื่อ', 'og:description': 'คำอธิบาย', 'og:url': 'https://me.github.io/thai77/', 'og:type': 'website', 'og:image': 'https://me.github.io/thai77/img/og.jpg',
      'og:image:width': '1200', 'og:image:height': '630', 'twitter:card': 'summary_large_image', 'twitter:image': 'https://me.github.io/thai77/img/og.jpg', ...over,
    };
    return `<head>${Object.entries(tags).filter(([, v]) => v !== null).map(([k, v]) => (k.startsWith('twitter') ? `<meta name="${k}" content="${v}">` : `<meta property="${k}" content="${v}">`)).join('')}</head>`;
  };
  it('complete tags: no problems', () => {
    expect(ogProblems(page(), { requireAbsolute: true })).toEqual({ problems: [], warnings: [] });
  });
  it('missing tags are problems', () => {
    for (const k of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'twitter:card']) {
      expect(ogProblems(page({ [k]: null }), { requireAbsolute: true }).problems.join()).toContain(k);
    }
    expect(ogProblems(page({ 'og:title': '  ' }), { requireAbsolute: false }).problems.join()).toContain('og:title');
  });
  it('relative image / url: a problem on GitHub (requireAbsolute), only a warning locally', () => {
    const rel = page({ 'og:image': '/thai77/img/og.jpg' });
    expect(ogProblems(rel, { requireAbsolute: true }).problems.join()).toContain('URL แบบเต็ม');
    const local = ogProblems(rel, { requireAbsolute: false });
    expect(local.problems).toEqual([]);
    expect(local.warnings.join()).toContain('URL แบบเต็ม');
    expect(ogProblems(page({ 'og:image': 'http://x.test/a.jpg' }), { requireAbsolute: true }).problems.join()).toContain('https');
  });
  it('leftover placeholders and bad sizes', () => {
    expect(ogProblems(page({ 'og:url': 'https://__thai77_site__/' }), { requireAbsolute: true }).problems.join()).toContain('placeholder');
    expect(ogProblems(page({ 'og:image:width': '__OG_W__' }), { requireAbsolute: true }).problems.join()).toContain('og:image:width');
    expect(ogProblems(page({ 'twitter:card': 'summary' }), { requireAbsolute: true }).warnings.join()).toContain('summary_large_image');
  });
});

describe('metaContent / linkHref', () => {
  it('reads tags in any attribute order and quoting; null when absent', () => {
    expect(metaContent('<meta content="a b" name="x">', 'x')).toBe('a b');
    expect(metaContent("<meta property='og:title' content='ชื่อ'>", 'og:title')).toBe('ชื่อ');
    expect(metaContent('<meta name="x" content="">', 'x')).toBe('');
    expect(metaContent('<meta name="y" content="1">', 'x')).toBeNull();
    expect(linkHref('<link href="/m.json" rel="manifest">', 'manifest')).toBe('/m.json');
    expect(linkHref('<link rel="icon" href="/f.svg">', 'manifest')).toBeNull();
    expect(linkHref('<link rel="shortcut icon" href="/f.ico">', 'icon')).toBe('/f.ico');
  });
});
