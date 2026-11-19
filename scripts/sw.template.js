/* thai77 service worker — template. scripts/finalize-pwa.mjs writes it to dist/sw.js and fills in
   __BUILD_ID__ and __PRECACHE__.  Written by hand (no library) so every rule is visible here.

   WHAT IS KEPT ON THE DEVICE          WHAT IS NEVER TOUCHED (the browser handles it normally)
   - the app files (JS / CSS)          - everything from another website: Supabase (trips, budgets, memories,
   - map data (geo/), icons, pictures    share links), private photos, OpenStreetMap, Wikimedia
     of the app itself                 - every request that is not a plain GET
   Nothing personal is ever stored by this file, so a shared computer leaks nothing through it.

   UPDATING: a new version waits until the user taps "update" (we never swap versions in the middle of use).
   EMERGENCY: set "enabled": false in pwa.config.json and deploy -> a self-removing worker replaces this one. */
'use strict';

const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;

// <policy>
// Pure decision logic (no browser APIs): tested one-to-one by tests/unit/swPolicy.test.ts
var POLICY = (function () {
  var NAV_TIMEOUT_MS = 4000;
  var MAX_GEO_ENTRIES = 120;
  var MAX_STATIC_ENTRIES = 80;

  /** info: { url, method, mode, range }   ctx: { origin, base }  -> 'bypass' | 'navigate' | 'immutable' | 'geo' | 'static' */
  function classify(info, ctx) {
    if (!info || info.method !== 'GET' || info.range) return 'bypass';
    var u;
    try { u = new URL(info.url); } catch (e) { return 'bypass'; }
    if (u.origin !== ctx.origin) return 'bypass';              // other websites: never touched
    var p = u.pathname;
    if (p.indexOf(ctx.base) !== 0) return 'bypass';            // other projects on the same github.io address
    var rel = p.slice(ctx.base.length);
    if (info.mode === 'navigate') return rel === '' || rel === 'index.html' ? 'navigate' : 'bypass';
    if (rel === 'sw.js' || rel === 'build.json') return 'bypass'; // must always come from the network
    if (rel.indexOf('assets/') === 0) return 'immutable';      // file names contain a content hash
    if (rel.indexOf('geo/') === 0) return 'geo';
    if (rel === 'favicon.svg' || rel === 'manifest.webmanifest' || rel === 'offline.html' ||
        rel.indexOf('icons/') === 0 || rel.indexOf('img/') === 0) return 'static';
    return 'bypass';
  }

  /** only complete, same-origin, successful answers are stored (not partial / opaque / error / "no-store") */
  function isCacheable(res) {
    if (!res || res.status !== 200 || res.type !== 'basic') return false;
    var cc = res.headers && res.headers.get ? res.headers.get('cache-control') : null;
    return !(cc && /no-store/i.test(cc));
  }

  /** the oldest keys to delete so that at most `max` remain (keys are in insertion order) */
  function overflow(keys, max) {
    return keys.length > max ? keys.slice(0, keys.length - max) : [];
  }

  /** caches of this app that are not in the keep list (other projects' caches are never touched) */
  function staleCaches(names, keep) {
    var out = [];
    for (var i = 0; i < names.length; i++) if (names[i].indexOf('thai77-') === 0 && keep.indexOf(names[i]) < 0) out.push(names[i]);
    return out;
  }

  return { NAV_TIMEOUT_MS: NAV_TIMEOUT_MS, MAX_GEO_ENTRIES: MAX_GEO_ENTRIES, MAX_STATIC_ENTRIES: MAX_STATIC_ENTRIES,
           classify: classify, isCacheable: isCacheable, overflow: overflow, staleCaches: staleCaches };
})();
// </policy>

const SCOPE = self.registration.scope;                  // e.g. <origin>/thai77/
const CTX = { origin: new URL(SCOPE).origin, base: new URL(SCOPE).pathname };
const APP_CACHE = 'thai77-app-' + BUILD_ID;             // one cache per build: replaced as a whole on update
const GEO_CACHE = 'thai77-geo-v1';                      // map data: kept across updates (refreshed in the background)
const STATIC_CACHE = 'thai77-static-v1';
const INDEX_URL = SCOPE + 'index.html';
const OFFLINE_URL = SCOPE + 'offline.html';

self.addEventListener('install', (event) => {
  // No skipWaiting here: when an older version is running, the new one waits for the user's OK (message below).
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.all(PRECACHE.map(async (rel) => {
      const url = new URL(rel, SCOPE).href;
      // cache: 'reload' skips the browser's own HTTP cache (GitHub Pages lets browsers keep files for 10 minutes)
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error('precache failed: ' + rel + ' (' + res.status + ')'); // the whole install fails -> old version stays
      await cache.put(rel === '' ? INDEX_URL : url, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, GEO_CACHE, STATIC_CACHE];
    for (const name of POLICY.staleCaches(await caches.keys(), keep)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ buildId: BUILD_ID });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const kind = POLICY.classify({ url: req.url, method: req.method, mode: req.mode, range: req.headers.has('range') }, CTX);
  if (kind === 'bypass') return;                         // not calling respondWith = the browser does exactly what it would do without us
  if (kind === 'navigate') event.respondWith(handleNavigate());
  else if (kind === 'immutable') event.respondWith(cacheFirst(req));
  else event.respondWith(staleWhileRevalidate(event, req, kind === 'geo' ? GEO_CACHE : STATIC_CACHE, kind === 'geo' ? POLICY.MAX_GEO_ENTRIES : POLICY.MAX_STATIC_ENTRIES));
});

/** Pages: the network first (so a new deploy shows up at once), the saved copy only when there is no network.
 *  The saved index.html is never overwritten by a page load: it must stay the one that belongs to the saved JS / CSS. */
async function handleNavigate() {
  const cache = await caches.open(APP_CACHE);
  const saved = await cache.match(INDEX_URL);
  const network = fetch(SCOPE, { cache: 'no-cache', credentials: 'same-origin' });
  try {
    const res = saved
      ? await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), POLICY.NAV_TIMEOUT_MS))])
      : await network;                                   // first visit ever: just wait for the network
    if (res.status >= 500 && saved) return saved;        // the host is having trouble: the saved copy is better
    return await withoutRedirect(res);
  } catch (e) {
    network.catch(() => {});                             // a slow request may still fail later: ignore it
    if (saved) return saved;
    return (await cache.match(OFFLINE_URL)) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

/** a page request must not be answered with a redirected response (some browsers refuse it) */
async function withoutRedirect(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Hashed build files: the saved copy is always right. */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (POLICY.isCacheable(res)) (await caches.open(APP_CACHE)).put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

/** Map data / pictures: show the saved copy at once, refresh it in the background. */
async function staleWhileRevalidate(event, req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(new Request(req, { cache: 'no-cache' }))
    .then(async (res) => {
      if (POLICY.isCacheable(res)) {
        await cache.put(req, res.clone());
        for (const k of POLICY.overflow(await cache.keys(), max)) await cache.delete(k);
      }
      return res;
    })
    .catch(() => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  const res = await refresh;
  return res || new Response('', { status: 504, statusText: 'offline' });
}
