// Runs the policy block of the REAL scripts/sw.template.js (the same text that ships in sw.js).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(process.cwd(), 'scripts', 'sw.template.js'), 'utf8');
const block = /\/\/ <policy>([\s\S]*?)\/\/ <\/policy>/.exec(src);
if (!block) throw new Error('policy block not found in sw.template.js');
// eslint-disable-next-line no-new-func
const POLICY = new Function(`${block[1]}; return POLICY;`)() as {
  classify(i: unknown, c: unknown): string; isCacheable(r: unknown): boolean; overflow(k: unknown[], m: number): unknown[]; staleCaches(n: string[], k: string[]): string[];
};

const CTX = { origin: 'https://x.test', base: '/thai77/' };
const get = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', mode: 'cors', range: false, ...extra });

describe('classify', () => {
  it('our hashed build files are "immutable"', () => {
    expect(POLICY.classify(get('https://x.test/thai77/assets/index-Ab12.js'), CTX)).toBe('immutable');
    expect(POLICY.classify(get('https://x.test/thai77/assets/noto-400-x.woff2?v=1'), CTX)).toBe('immutable');
  });
  it('map data, icons, pictures', () => {
    expect(POLICY.classify(get('https://x.test/thai77/geo/provinces.geojson'), CTX)).toBe('geo');
    expect(POLICY.classify(get('https://x.test/thai77/geo/districts/TH20.geojson'), CTX)).toBe('geo');
    for (const p of ['favicon.svg', 'manifest.webmanifest', 'offline.html', 'icons/icon-192.png', 'img/regions/east.webp', 'img/og.jpg']) {
      expect(POLICY.classify(get(`https://x.test/thai77/${p}`), CTX)).toBe('static');
    }
  });
  it('page loads (only the app page itself)', () => {
    for (const u of ['https://x.test/thai77/', 'https://x.test/thai77/index.html', 'https://x.test/thai77/?a=1']) {
      expect(POLICY.classify(get(u, { mode: 'navigate' }), CTX)).toBe('navigate');
    }
    expect(POLICY.classify(get('https://x.test/thai77/whatever', { mode: 'navigate' }), CTX)).toBe('bypass');
    expect(POLICY.classify(get('https://x.test/other/', { mode: 'navigate' }), CTX)).toBe('bypass');
  });
  it('everything else is left to the browser', () => {
    const bypass = [
      get('https://abc.supabase.co/rest/v1/trips'), get('https://tile.openstreetmap.org/1/2/3.png'), get('https://upload.wikimedia.org/a.jpg'),
      get('https://x.test:8443/thai77/assets/a.js'), get('http://x.test/thai77/assets/a.js'), get('https://x.test/thai77/sw.js'), get('https://x.test/thai77/build.json'),
      get('https://x.test/thai77/secret.txt'), get('https://x.test/thai77'), get('https://x.test/assets/a.js'), get('https://x.test/thai778/assets/a.js'),
      get('https://x.test/thai77/assets/a.js', { method: 'POST' }), get('https://x.test/thai77/assets/a.js', { method: 'HEAD' }),
      get('https://x.test/thai77/assets/a.js', { range: true }), get('not a url'), null, undefined,
    ];
    for (const i of bypass) expect(POLICY.classify(i, CTX)).toBe('bypass');
  });
  it('path tricks do not escape the rules', () => {
    expect(POLICY.classify(get('https://x.test/thai77/assets/../secret.txt'), CTX)).toBe('bypass');       // the URL parser resolves ".." first
    expect(POLICY.classify(get('https://x.test/thai77/%61ssets/a.js'), CTX)).toBe('bypass');              // encoded names are not "assets/"
    expect(POLICY.classify(get('https://x.test.evil.test/thai77/assets/a.js'), CTX)).toBe('bypass');
    expect(POLICY.classify(get('https://x.test@evil.test/thai77/assets/a.js'), CTX)).toBe('bypass');
  });
  it('works for a site served from the root', () => {
    const root = { origin: 'https://me.github.io', base: '/' };
    expect(POLICY.classify(get('https://me.github.io/assets/a.js'), root)).toBe('immutable');
    expect(POLICY.classify(get('https://me.github.io/', { mode: 'navigate' }), root)).toBe('navigate');
    expect(POLICY.classify(get('https://other.io/assets/a.js'), root)).toBe('bypass');
  });
});

describe('isCacheable', () => {
  const res = (o: Partial<{ status: number; type: string; cc: string | null }> = {}) => ({
    status: o.status ?? 200, type: o.type ?? 'basic', headers: { get: (k: string) => (k === 'cache-control' ? o.cc ?? null : null) },
  });
  it('only complete, same-origin, successful answers', () => {
    expect(POLICY.isCacheable(res())).toBe(true);
    expect(POLICY.isCacheable(res({ cc: 'max-age=600' }))).toBe(true);
    for (const bad of [res({ status: 404 }), res({ status: 500 }), res({ status: 206 }), res({ status: 304 }), res({ type: 'opaque' }), res({ type: 'cors' }), res({ type: 'error' }),
      res({ cc: 'no-store' }), res({ cc: 'private, NO-STORE' })]) {
      expect(POLICY.isCacheable(bad)).toBe(false);
    }
    expect(POLICY.isCacheable(null)).toBe(false);
    expect(POLICY.isCacheable(undefined)).toBe(false);
  });
});

describe('overflow / staleCaches', () => {
  it('the oldest keys beyond the limit', () => {
    expect(POLICY.overflow([1, 2, 3, 4, 5], 3)).toEqual([1, 2]);
    expect(POLICY.overflow([1, 2, 3], 3)).toEqual([]);
    expect(POLICY.overflow([], 3)).toEqual([]);
    expect(POLICY.overflow([1, 2], 0)).toEqual([1, 2]);
  });
  it('only OUR old caches are listed; other projects on the same address are never touched', () => {
    const names = ['thai77-app-old', 'thai77-app-new', 'thai77-geo-v1', 'thai77-static-v1', 'workbox-precache-v2', 'shift-matcher-cache', 'thai77', 'Thai77-app-x'];
    expect(POLICY.staleCaches(names, ['thai77-app-new', 'thai77-geo-v1', 'thai77-static-v1'])).toEqual(['thai77-app-old']);
    expect(POLICY.staleCaches([], ['a'])).toEqual([]);
  });
});
