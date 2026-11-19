import { describe, expect, it } from 'vitest';
import { FakeCaches, PRECACHE, SCOPE, boot, ok, reply, swText, text } from '../helpers/swEnv';

const REAL_FILES: Record<string, string> = {
  '': 'INDEX-111', 'offline.html': 'OFFLINE', 'manifest.webmanifest': '{}', 'assets/app-AAA.js': 'JS', 'assets/app-BBB.css': 'CSS',
};
/** a server that has every precache file */
const serverWithFiles = (url: string | Request) => {
  const u = new URL(typeof url === 'string' ? url : url.url);
  const rel = u.pathname.replace('/thai77/', '');
  return rel in REAL_FILES ? ok(REAL_FILES[rel]) : reply(404, 'nope');
};

describe('install', () => {
  it('keeps every listed file, fetched past the browser\'s own HTTP cache, and index.html under .../index.html', async () => {
    const w = boot();
    w.state.handler = serverWithFiles;
    await w.run('install');
    expect(w.calls.map((c) => c.url).sort()).toEqual(PRECACHE.map((r) => new URL(r, SCOPE).href).sort());
    expect(w.calls.every((c) => c.cache === 'reload')).toBe(true);
    const cache = w.caches.stores.get('thai77-app-build111111')!;
    expect([...cache.items.keys()].sort()).toEqual([...PRECACHE.map((r) => (r === '' ? `${SCOPE}index.html` : new URL(r, SCOPE).href))].sort());
    expect(await text(await cache.match(`${SCOPE}index.html`))).toBe('INDEX-111');
  });
  it('does NOT take over by itself (the user is asked first)', async () => {
    const w = boot();
    w.state.handler = serverWithFiles;
    await w.run('install');
    expect(w.flags.skipWaiting).toBe(0);
  });
  it('one missing file fails the whole install, so the old version stays in charge', async () => {
    const w = boot();
    w.state.handler = (u) => (String((u as Request).url ?? u).endsWith('app-BBB.css') ? reply(404, '') : serverWithFiles(u as Request));
    await expect(w.run('install')).rejects.toBeTruthy();
  });
  it('a network error during install fails it too', async () => {
    const w = boot();
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    await expect(w.run('install')).rejects.toBeTruthy();
  });
});

describe('activate / messages', () => {
  it('deletes the app caches of OLD builds only; keeps map/picture caches and other projects\' caches; then claims the pages', async () => {
    const caches = new FakeCaches();
    for (const n of ['thai77-app-OLD', 'thai77-app-build111111', 'thai77-geo-v1', 'thai77-static-v1', 'thai77-legacy', 'another-project-cache']) await caches.open(n);
    const w = boot({ caches });
    await w.run('activate');
    expect(await caches.keys()).toEqual(['thai77-app-build111111', 'thai77-geo-v1', 'thai77-static-v1', 'another-project-cache']);
    expect(w.flags.claim).toBe(1);
  });
  it('SKIP_WAITING (sent when the user taps update) takes over; other messages do nothing', () => {
    const w = boot();
    w.message({ type: 'SKIP_WAITING' });
    expect(w.flags.skipWaiting).toBe(1);
    w.message({ type: 'WHATEVER' }); w.message(null); w.message(undefined);
    expect(w.flags.skipWaiting).toBe(1);
  });
  it('GET_VERSION answers with the build id', () => {
    const w = boot({ buildId: 'abcdef1234' });
    const got: unknown[] = [];
    w.message({ type: 'GET_VERSION' }, { postMessage: (v) => got.push(v) });
    expect(got).toEqual([{ buildId: 'abcdef1234' }]);
  });
});

describe('requests the worker must NOT touch', () => {
  const cases: [string, any][] = [
    ['Supabase (trips, budgets, share links)', new Request('https://abc.supabase.co/rest/v1/trips?select=*')],
    ['Supabase auth', new Request('https://abc.supabase.co/auth/v1/token', { method: 'POST', body: '{}' })],
    ['a private photo (signed storage URL)', new Request('https://abc.supabase.co/storage/v1/object/sign/memory-photos/x.webp?token=t')],
    ['OpenStreetMap tiles', new Request('https://tile.openstreetmap.org/5/25/14.png')],
    ['Wikimedia pictures', new Request('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg')],
    ['another project on the same github.io address', new Request('https://example.test/other-project/assets/app.js')],
    ['a POST to our own address', new Request(`${SCOPE}assets/app-AAA.js`, { method: 'POST', body: 'x' })],
    ['the worker file itself (must always come from the network)', new Request(`${SCOPE}sw.js`)],
    ['build.json (version check)', new Request(`${SCOPE}build.json`)],
    ['a range request', new Request(`${SCOPE}assets/app-AAA.js`, { headers: { Range: 'bytes=0-9' } })],
    ['an unknown file of ours', new Request(`${SCOPE}secret.txt`)],
  ];
  for (const [name, req] of cases) {
    it(`bypass: ${name}`, async () => {
      const w = boot();
      w.state.handler = serverWithFiles;
      const r = await w.doFetch(req);
      expect(r.handled).toBe(false);
      expect(w.calls).toEqual([]);
      expect([...w.caches.stores.values()].every((c) => c.items.size === 0)).toBe(true);
    });
  }
});

describe('opening the app (navigation)', () => {
  const installed = async () => {
    const w = boot();
    w.state.handler = serverWithFiles;
    await w.run('install');
    w.calls.length = 0;
    return w;
  };
  it('online: the network answer is used and asked with "revalidate" (a new deploy shows at once)', async () => {
    const w = await installed();
    w.state.handler = () => ok('INDEX-NEW');
    const r = await w.doFetch(w.nav());
    expect(await text(r.res)).toBe('INDEX-NEW');
    expect(w.calls).toEqual([{ url: SCOPE, cache: 'no-cache' }]);
  });
  it('the saved index.html is NEVER overwritten by a page load (it must keep matching the saved JS / CSS)', async () => {
    const w = await installed();
    w.state.handler = () => ok('INDEX-NEW');
    await w.doFetch(w.nav());
    const cache = w.caches.stores.get('thai77-app-build111111')!;
    expect(await text(await cache.match(`${SCOPE}index.html`))).toBe('INDEX-111');
  });
  it('offline: the saved page opens', async () => {
    const w = await installed();
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    expect(await text((await w.doFetch(w.nav())).res)).toBe('INDEX-111');
  });
  it('the host answers with an error (5xx): the saved page opens', async () => {
    const w = await installed();
    w.state.handler = () => reply(502, 'bad gateway');
    expect(await text((await w.doFetch(w.nav())).res)).toBe('INDEX-111');
  });
  it('a 404 from the host is shown as it is (not hidden behind the saved page)', async () => {
    const w = await installed();
    w.state.handler = () => reply(404, 'not found');
    const r = (await w.doFetch(w.nav())).res!;
    expect([r.status, await r.text()]).toEqual([404, 'not found']);
  });
  it('a very slow network falls back to the saved page after the timeout', async () => {
    const w = boot({ tweak: (s) => s.replace('var NAV_TIMEOUT_MS = 4000;', 'var NAV_TIMEOUT_MS = 40;') });
    w.state.handler = serverWithFiles;
    await w.run('install');
    w.state.handler = () => new Promise<Response>((res) => setTimeout(() => res(ok('TOO-LATE')), 400)) as unknown as Response;
    const t0 = Date.now();
    expect(await text((await w.doFetch(w.nav())).res)).toBe('INDEX-111');
    expect(Date.now() - t0).toBeLessThan(300);
  });
  it('first visit ever (nothing saved) waits for the network instead of timing out', async () => {
    const w = boot({ tweak: (s) => s.replace('var NAV_TIMEOUT_MS = 4000;', 'var NAV_TIMEOUT_MS = 20;') });
    w.state.handler = () => new Promise<Response>((res) => setTimeout(() => res(ok('FIRST')), 120)) as unknown as Response;
    expect(await text((await w.doFetch(w.nav())).res)).toBe('FIRST');
  });
  it('offline and no saved page: the small offline page; if even that is missing, a plain 503', async () => {
    const w = boot();
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    expect((await w.doFetch(w.nav())).res!.status).toBe(503);
    const cache = await w.caches.open('thai77-app-build111111');
    await cache.put(`${SCOPE}offline.html`, ok('OFFLINE'));
    const r = (await w.doFetch(w.nav())).res!;
    expect([r.status, await r.text()]).toEqual([200, 'OFFLINE']);
  });
  it('a redirected answer is rebuilt (browsers refuse redirected answers for page requests)', async () => {
    const w = await installed();
    const redirected = ok('AFTER-REDIRECT');
    Object.defineProperty(redirected, 'redirected', { value: true });
    w.state.handler = () => redirected;
    const r = (await w.doFetch(w.nav())).res!;
    expect(r.redirected).toBe(false);
    expect(await r.text()).toBe('AFTER-REDIRECT');
  });
  it('query strings / index.html paths are treated as the app page', async () => {
    const w = await installed();
    w.state.handler = () => ok('X');
    for (const u of [`${SCOPE}index.html`, `${SCOPE}?utm=1`]) expect((await w.doFetch({ url: u, method: 'GET', mode: 'navigate', headers: { has: () => false } })).handled).toBe(true);
    expect((await w.doFetch({ url: `${SCOPE}some/other/page`, method: 'GET', mode: 'navigate', headers: { has: () => false } })).handled).toBe(false);
  });
});

describe('build files (assets/…): saved copy is always right', () => {
  it('served from the saved copy without touching the network', async () => {
    const w = boot();
    w.state.handler = serverWithFiles;
    await w.run('install');
    w.calls.length = 0;
    const r = await w.doFetch(w.asset('assets/app-AAA.js'));
    expect(await text(r.res)).toBe('JS');
    expect(w.calls).toEqual([]);
  });
  it('a file that was not saved (e.g. a font) is fetched once, saved, then served from the saved copy', async () => {
    const w = boot();
    w.state.handler = () => ok('FONT-BYTES');
    expect(await text((await w.doFetch(w.asset('assets/noto-thai-400-AbC.woff2'))).res)).toBe('FONT-BYTES');
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    expect(await text((await w.doFetch(w.asset('assets/noto-thai-400-AbC.woff2'))).res)).toBe('FONT-BYTES');
  });
  it('failures, partial and error answers are not saved', async () => {
    const w = boot();
    for (const res of [reply(404), reply(500), reply(206)]) {
      w.state.handler = () => res;
      await w.doFetch(w.asset('assets/zzz-1.js'));
    }
    expect([...w.caches.stores.values()].every((c) => c.items.size === 0)).toBe(true);
    w.state.handler = () => ok('x', { headers: { 'Cache-Control': 'no-store' } });
    await w.doFetch(w.asset('assets/zzz-2.js'));
    expect([...w.caches.stores.values()].every((c) => c.items.size === 0)).toBe(true);
  });
  it('offline and not saved: an error answer (not an exception)', async () => {
    const w = boot();
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    expect((await w.doFetch(w.asset('assets/not-saved.js'))).res!.status).toBe(504);
  });
  it('after a deploy the OLD worker still has the OLD build files (nothing breaks while the page is open)', async () => {
    const old = new FakeCaches();
    const a = boot({ buildId: 'oldbuild00', caches: old });
    a.state.handler = serverWithFiles;
    await a.run('install');
    a.state.handler = () => reply(404, 'gone'); // the server no longer has the old hashed files
    expect(await text((await a.doFetch(a.asset('assets/app-AAA.js'))).res)).toBe('JS');
  });
});

describe('map data and pictures: show the saved copy, refresh in the background', () => {
  it('first time: network, then saved', async () => {
    const w = boot();
    w.state.handler = () => ok('GEO-1');
    expect(await text((await w.doFetch(w.asset('geo/provinces.geojson'))).res)).toBe('GEO-1');
    expect([...w.caches.stores.get('thai77-geo-v1')!.items.keys()]).toEqual([`${SCOPE}geo/provinces.geojson`]);
  });
  it('next time: the saved copy at once, and the saved copy is refreshed (asked with "revalidate")', async () => {
    const w = boot();
    w.state.handler = () => ok('GEO-1');
    await w.doFetch(w.asset('geo/provinces.geojson'));
    w.calls.length = 0;
    w.state.handler = () => ok('GEO-2');
    expect(await text((await w.doFetch(w.asset('geo/provinces.geojson'))).res)).toBe('GEO-1');
    expect(w.calls).toEqual([{ url: `${SCOPE}geo/provinces.geojson`, cache: 'no-cache' }]);
    expect(await text(await w.caches.stores.get('thai77-geo-v1')!.match(`${SCOPE}geo/provinces.geojson`))).toBe('GEO-2');
  });
  it('offline: the saved copy; nothing saved: an error answer', async () => {
    const w = boot();
    w.state.handler = () => ok('GEO-1');
    await w.doFetch(w.asset('geo/districts/TH20.geojson'));
    w.state.handler = () => { throw new TypeError('Failed to fetch'); };
    expect(await text((await w.doFetch(w.asset('geo/districts/TH20.geojson'))).res)).toBe('GEO-1');
    expect((await w.doFetch(w.asset('geo/districts/TH99.geojson'))).res!.status).toBe(504);
  });
  it('a failed refresh keeps the old saved copy', async () => {
    const w = boot();
    w.state.handler = () => ok('GEO-1');
    await w.doFetch(w.asset('geo/provinces.geojson'));
    w.state.handler = () => reply(500, '');
    await w.doFetch(w.asset('geo/provinces.geojson'));
    expect(await text(await w.caches.stores.get('thai77-geo-v1')!.match(`${SCOPE}geo/provinces.geojson`))).toBe('GEO-1');
  });
  it('the number of saved map files is limited (oldest dropped first)', async () => {
    const w = boot({ tweak: (s) => s.replace('var MAX_GEO_ENTRIES = 120;', 'var MAX_GEO_ENTRIES = 3;') });
    w.state.handler = () => ok('G');
    for (let i = 1; i <= 6; i++) await w.doFetch(w.asset(`geo/districts/TH${i}.geojson`));
    expect([...w.caches.stores.get('thai77-geo-v1')!.items.keys()].map((u) => u.split('/').pop())).toEqual(['TH4.geojson', 'TH5.geojson', 'TH6.geojson']);
  });
  it('icons, pictures and region images go to the static cache', async () => {
    const w = boot();
    w.state.handler = () => ok('IMG');
    for (const rel of ['icons/icon-192.png', 'img/regions/east.webp', 'img/og-default.png', 'favicon.svg']) await w.doFetch(w.asset(rel));
    expect(w.caches.stores.get('thai77-static-v1')!.items.size).toBe(4);
  });
});

describe('nothing personal is ever stored', () => {
  it('after a realistic session the caches hold only files of the app (no API, no auth, no photo URLs)', async () => {
    const w = boot();
    w.state.handler = serverWithFiles;
    await w.run('install');
    w.state.handler = () => ok('x');
    const traffic = [
      new Request('https://abc.supabase.co/rest/v1/trips?select=*'), new Request('https://abc.supabase.co/auth/v1/user'),
      new Request('https://abc.supabase.co/storage/v1/object/sign/memory-photos/u/p.webp?token=SECRET'),
      new Request('https://tile.openstreetmap.org/5/25/14.png'), new Request(`${SCOPE}geo/provinces.geojson`), w.asset('assets/app-AAA.js'),
    ];
    for (const r of traffic) await w.doFetch(r);
    const all = [...w.caches.stores.values()].flatMap((c) => [...c.items.keys()]);
    expect(all.every((u) => u.startsWith(SCOPE))).toBe(true);
    expect(all.some((u) => /supabase|token=|openstreetmap|memory-photos/i.test(u))).toBe(false);
  });
});

describe('the generated sw.js', () => {
  it('has the build id and the list filled in, and no placeholder left', () => {
    const s = swText({ buildId: 'f00dbabe12', precache: ['', 'offline.html'] });
    expect(s).toContain("const BUILD_ID = 'f00dbabe12';");
    expect(s).toContain('const PRECACHE = ["","offline.html"];');
    expect(/__BUILD_ID__|__PRECACHE__/.test(s)).toBe(false);
  });
  it('contains no web address at all (it must never talk to another site)', () => {
    expect(/https?:\/\/[a-z0-9.-]+/i.test(swText())).toBe(false);
  });
});
