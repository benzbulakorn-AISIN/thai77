// Pure helpers for the PWA build step (finalize-pwa.mjs) and the build check (check-build.mjs).
// No file or network access in here (callers pass data in), so everything is unit-testable.
import { createHash } from 'node:crypto';

export const PLACEHOLDERS = {
  site: 'https://__thai77_site__/',
  ogImage: '__OG_IMAGE__',
  ogW: '__OG_W__',
  ogH: '__OG_H__',
  pwa: '__PWA_STATE__',
};
const LEFTOVER_RE = /__thai77_site__|__OG_IMAGE__|__OG_W__|__OG_H__|__PWA_STATE__/;

export const PRECACHE_WARN_BYTES = 5 * 1024 * 1024;
export const PRECACHE_FAIL_BYTES = 15 * 1024 * 1024;
export const OG_MAX_BYTES = 1024 * 1024;

export const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- site / base

/** "/thai77/" , "thai77" , "" -> "/thai77/" , "/thai77/" , "/" */
export function normalizeBase(raw) {
  let b = String(raw ?? '/').trim();
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b.replace(/\/{2,}/g, '/');
}

/**
 * Public address of the site (with a trailing slash), or null when it cannot be known.
 *   SITE_URL (explicit) wins; otherwise GITHUB_REPOSITORY "owner/repo" -> https://owner.github.io/repo/
 *   a repo called "<owner>.github.io" is served from the root.
 */
export function siteUrlFrom({ siteUrl, repository } = {}) {
  const s = String(siteUrl ?? '').trim();
  if (s) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') return null;
      u.hash = '';
      u.search = '';
      const href = u.href;
      return href.endsWith('/') ? href : `${href}/`;
    } catch {
      return null;
    }
  }
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(String(repository ?? '').trim());
  if (!m) return null;
  const owner = m[1].toLowerCase();
  const repo = m[2];
  if (repo.toLowerCase() === `${owner}.github.io`) return `https://${owner}.github.io/`;
  return `https://${owner}.github.io/${repo}/`;
}

// ---------------------------------------------------------------- config (kill switch)

/** pwa.config.json -> { enabled, warning }. Missing / unreadable file = enabled (never silently switch the app off). */
export function pwaEnabled(configText) {
  if (configText === null || configText === undefined) return { enabled: true, warning: null };
  try {
    const j = JSON.parse(configText);
    if (j && typeof j === 'object' && typeof j.enabled === 'boolean') return { enabled: j.enabled, warning: null };
    return { enabled: true, warning: 'pwa.config.json: ไม่พบ "enabled": true/false — ใช้ค่าเริ่มต้น (เปิด)' };
  } catch {
    return { enabled: true, warning: 'pwa.config.json อ่านไม่ได้ (JSON ผิดรูปแบบ) — ใช้ค่าเริ่มต้น (เปิด)' };
  }
}

/** optional "siteUrl" in pwa.config.json (a custom domain, without touching the GitHub workflow); empty / odd values -> null */
export function configSiteUrl(configText) {
  try {
    const j = JSON.parse(configText ?? '');
    return j && typeof j.siteUrl === 'string' && j.siteUrl.trim() ? siteUrlFrom({ siteUrl: j.siteUrl }) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- images

/** pixel size of a PNG or JPEG file (null when it is neither) */
export function readImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      let marker = buf[i + 1];
      while (marker === 0xff && i + 2 < buf.length) { i++; marker = buf[i + 1]; } // fill bytes
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/** which picture is used for the link preview: the owner's og.jpg / og.png, else the generated default */
export function pickOgImage(files) {
  const set = new Set(files);
  for (const name of ['img/og.jpg', 'img/og.png']) if (set.has(name)) return { path: name, custom: true };
  return { path: 'img/og-default.png', custom: false };
}

/** warnings about the preview picture (the page still builds) */
export function ogImageWarnings(size, bytes) {
  const out = [];
  if (!size) { out.push('อ่านขนาดรูป OG ไม่ได้ (ต้องเป็นไฟล์ JPG หรือ PNG จริง)'); return out; }
  const ratio = size.width / size.height;
  if (size.width < 600) out.push(`รูป OG กว้างแค่ ${size.width}px — LINE/Facebook จะแสดงเป็นภาพเล็ก ควรเป็น 1200×630`);
  else if (size.width !== 1200 || size.height !== 630) out.push(`รูป OG ขนาด ${size.width}×${size.height} — แนะนำ 1200×630`);
  // 16:9 (1.78) from an ordinary photo editor is fine; 3:2 (1.5) would lose its top and bottom
  if (Math.abs(ratio - 1200 / 630) > 0.15) out.push('สัดส่วนรูป OG ไม่ใช่ประมาณ 1.91:1 (16:9 ก็ใช้ได้) — ขอบรูปอาจถูกตัดตอนแชร์');
  if (bytes > OG_MAX_BYTES) out.push(`รูป OG ใหญ่ ${(bytes / 1024).toFixed(0)} KB — ควรไม่เกิน 1 MB (ไฟล์ใหญ่บางครั้งไม่แสดงตัวอย่าง)`);
  return out;
}

// ---------------------------------------------------------------- html

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Fills the placeholders of index.html.
 *  site:    "https://owner.github.io/repo/" or null (then the base path is used: not a full URL, fine for local builds)
 *  ogImage: path inside dist, e.g. "img/og.jpg";  ogSize: { width, height };  enabled: boolean
 */
export function applyPlaceholders(html, { site, base, ogImage, ogSize, enabled }) {
  const siteText = site ?? normalizeBase(base);
  const out = String(html)
    .split(PLACEHOLDERS.site).join(esc(siteText))
    .split(PLACEHOLDERS.ogImage).join(esc(ogImage))
    .split(PLACEHOLDERS.ogW).join(String(ogSize?.width ?? 1200))
    .split(PLACEHOLDERS.ogH).join(String(ogSize?.height ?? 630))
    .split(PLACEHOLDERS.pwa).join(enabled ? 'on' : 'off');
  if (LEFTOVER_RE.test(out)) throw new Error('index.html ยังมี placeholder ที่ไม่ได้แทนค่า');
  return out;
}

/**
 * <link rel="manifest|apple-touch-icon|icon" href="/x"> -> href="<base>x" (only root-absolute paths that do not already start
 * with the base). Vite normally does this itself; doing it here too makes the build independent of that detail. Idempotent.
 */
export function fixPublicLinks(html, base) {
  const b = normalizeBase(base);
  if (b === '/') return html;
  return String(html).replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["'](?:manifest|apple-touch-icon|icon)["']/i.test(tag)) return tag;
    return tag.replace(/\bhref\s*=\s*(["'])(\/(?!\/)[^"']*)\1/i, (m, q, path) => (path.startsWith(b) ? m : `href=${q}${b}${path.slice(1)}${q}`));
  });
}

/** content of <meta ... name|property="key" content="..."> (first match) or null */
export function metaContent(html, key) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const k = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (k && k[1].toLowerCase() === key.toLowerCase()) {
      const c = /\bcontent\s*=\s*(["'])(.*?)\1/is.exec(tag);
      return c ? c[2] : '';
    }
  }
  return null;
}

/** href of <link rel="<rel>"> (first match) or null */
export function linkHref(html, rel) {
  const tags = String(html).match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const r = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (r && r[1].toLowerCase().split(/\s+/).includes(rel)) {
      const h = /\bhref\s*=\s*(["'])(.*?)\1/is.exec(tag);
      return h ? h[2] : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- precache

/**
 * Which files the service worker keeps (installed together, so the app works offline as one consistent build).
 *   files: [{ path, size }]  (paths relative to dist, "/" separators)
 * Kept: index.html (as ""), offline.html, manifest, favicon, icons/*.png, assets/*.js, assets/*.css
 * Not kept here (fetched on first use instead): fonts, map data (geo/), pictures (img/), sw.js, source maps.
 */
export function selectPrecache(files) {
  const keep = [];
  for (const f of files) {
    const p = f.path;
    if (p === 'index.html') keep.push({ rel: '', path: p, size: f.size });
    else if (p === 'offline.html' || p === 'manifest.webmanifest' || p === 'favicon.svg') keep.push({ rel: p, path: p, size: f.size });
    else if (/^icons\/[^/]+\.png$/.test(p)) keep.push({ rel: p, path: p, size: f.size });
    else if (/^assets\/[^/]+\.(?:js|css)$/.test(p)) keep.push({ rel: p, path: p, size: f.size });
  }
  keep.sort((a, b) => a.rel.localeCompare(b.rel));
  const bytes = keep.reduce((s, f) => s + (Number.isFinite(f.size) ? f.size : 0), 0);
  return { entries: keep, bytes, level: bytes > PRECACHE_FAIL_BYTES ? 'fail' : bytes > PRECACHE_WARN_BYTES ? 'warn' : 'ok' };
}

/** short id of a build: changes when ANY precached file (or the service-worker code) changes */
export function computeBuildId(items, extra = '') {
  const lines = [...items].map((i) => `${i.rel}:${i.sha}`).sort();
  return sha256Hex(`${lines.join('\n')}\n--\n${extra}`).slice(0, 10);
}

/** the self-destructing worker: replaces a broken one in every browser that has it, clears the caches, reloads the pages */
export function selfDestructSw() {
  return `/* thai77 service worker — SWITCHED OFF (pwa.config.json enabled=false). Removes itself and clears the app caches. */
'use strict';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      for (const k of await caches.keys()) if (k.indexOf('thai77-') === 0) await caches.delete(k);
    } catch (e) { /* ignore */ }
    try { await self.registration.unregister(); } catch (e) { /* ignore */ }
    try {
      const all = await self.clients.matchAll({ type: 'window' });
      for (const c of all) { try { c.navigate(c.url); } catch (e) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  })());
});
`;
}

/** template + build data -> sw.js text */
export function renderSw(template, { buildId, precache }) {
  if (!/__BUILD_ID__/.test(template) || !/__PRECACHE__/.test(template)) throw new Error('sw.template.js ไม่มี placeholder ที่ต้องการ');
  const out = template.split('__BUILD_ID__').join(buildId).split('__PRECACHE__').join(JSON.stringify(precache));
  if (/__BUILD_ID__|__PRECACHE__/.test(out)) throw new Error('sw.js ยังมี placeholder เหลือ');
  return out;
}

// ---------------------------------------------------------------- checks used by check-build.mjs

/**
 * manifest -> list of problems (strings).  ctx: { base, files:Set, size(path)->{width,height}|null }
 * All URLs inside the manifest are resolved against the manifest's own address, like a browser does.
 */
export function manifestProblems(manifest, ctx) {
  const out = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest.webmanifest อ่านไม่ได้'];
  const base = normalizeBase(ctx.base);
  const mUrl = new URL(`${base}manifest.webmanifest`, 'https://example.test');
  const scope = (() => { try { return new URL(manifest.scope ?? './', mUrl); } catch { return null; } })();
  const start = (() => { try { return new URL(manifest.start_url ?? './', mUrl); } catch { return null; } })();
  if (!manifest.name) out.push('manifest ไม่มี name');
  if (!manifest.short_name) out.push('manifest ไม่มี short_name');
  else if ([...String(manifest.short_name)].length > 16) out.push('short_name ยาวเกิน 16 ตัวอักษร (ชื่อใต้ไอคอนจะถูกตัด)');
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) out.push('display ต้องเป็น standalone (ไม่งั้นติดตั้งแล้วยังเปิดในเบราว์เซอร์)');
  if (!scope) out.push('scope ไม่ถูกต้อง');
  else if (scope.pathname !== base) out.push(`scope (${scope.pathname}) ต้องเท่ากับ base path (${base})`);
  if (!start) out.push('start_url ไม่ถูกต้อง');
  else if (scope && !start.pathname.startsWith(scope.pathname)) out.push('start_url อยู่นอก scope');
  for (const k of ['background_color', 'theme_color']) {
    if (typeof manifest[k] !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(manifest[k])) out.push(`${k} ต้องเป็นสีแบบ #RRGGBB`);
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const found = { any192: false, any512: false, mask512: false };
  for (const ic of icons) {
    if (!ic || typeof ic.src !== 'string') { out.push('มี icon ที่ไม่มี src'); continue; }
    let u;
    try { u = new URL(ic.src, mUrl); } catch { out.push(`icon src ไม่ถูกต้อง: ${ic.src}`); continue; }
    if (!u.pathname.startsWith(base)) { out.push(`icon อยู่นอก base path: ${ic.src}`); continue; }
    const rel = u.pathname.slice(base.length);
    if (!ctx.files.has(rel)) { out.push(`ไม่พบไฟล์ไอคอน: ${rel}`); continue; }
    const m = /^(\d+)x(\d+)$/.exec(String(ic.sizes ?? ''));
    const real = ctx.size(rel);
    if (!real) out.push(`อ่านขนาดไอคอนไม่ได้: ${rel}`);
    else if (m && (real.width !== Number(m[1]) || real.height !== Number(m[2]))) out.push(`ไอคอน ${rel} ประกาศ ${ic.sizes} แต่ไฟล์จริงคือ ${real.width}x${real.height}`);
    const purpose = String(ic.purpose ?? 'any');
    if (m && real) {
      if (purpose.includes('any') && Number(m[1]) === 192) found.any192 = true;
      if (purpose.includes('any') && Number(m[1]) === 512) found.any512 = true;
      if (purpose.includes('maskable') && Number(m[1]) === 512) found.mask512 = true;
    }
  }
  if (!found.any192) out.push('ไม่มีไอคอน 192×192 (purpose any)');
  if (!found.any512) out.push('ไม่มีไอคอน 512×512 (purpose any)');
  if (!found.mask512) out.push('ไม่มีไอคอน 512×512 แบบ maskable (Android จะครอปไอคอนเป็นวงกลมไม่สวย)');
  for (const s of Array.isArray(manifest.shortcuts) ? manifest.shortcuts : []) {
    try {
      const u = new URL(s.url, mUrl);
      if (scope && !u.pathname.startsWith(scope.pathname)) out.push(`shortcut อยู่นอก scope: ${s.url}`);
    } catch { out.push(`shortcut url ไม่ถูกต้อง: ${s?.url}`); }
  }
  return out;
}

/** link-preview tags of index.html -> { problems, warnings } */
export function ogProblems(html, { requireAbsolute }) {
  const problems = [];
  const warnings = [];
  for (const k of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'twitter:card']) {
    const v = metaContent(html, k);
    if (v === null || v.trim() === '') problems.push(`ไม่มีแท็ก ${k}`);
  }
  if (LEFTOVER_RE.test(html)) problems.push('index.html ยังมี placeholder (__thai77_site__ ฯลฯ) ที่ไม่ได้แทนค่า');
  for (const k of ['og:image', 'og:url', 'twitter:image']) {
    const v = metaContent(html, k);
    if (v && !/^https:\/\//i.test(v)) {
      (requireAbsolute ? problems : warnings).push(`${k} ต้องเป็น URL แบบเต็ม (https://…) ไม่งั้น LINE/Facebook จะไม่แสดงภาพ — ตอนนี้เป็น “${v}”`);
    }
  }
  for (const k of ['og:image:width', 'og:image:height']) {
    const v = metaContent(html, k);
    if (v !== null && !/^\d{2,5}$/.test(v)) problems.push(`${k} ต้องเป็นตัวเลข (ตอนนี้ “${v}”)`);
  }
  if (metaContent(html, 'twitter:card') !== null && metaContent(html, 'twitter:card') !== 'summary_large_image') warnings.push('twitter:card ควรเป็น summary_large_image');
  return { problems, warnings };
}

/** the PRECACHE array written into sw.js, or null */
export function readPrecacheFromSw(swText) {
  const m = /const PRECACHE = (\[[^\n]*?\]);/.exec(String(swText));
  if (!m) return null;
  try { const v = JSON.parse(m[1]); return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null; } catch { return null; }
}
export const readBuildIdFromSw = (swText) => /const BUILD_ID = '([0-9a-f]{6,64})';/.exec(String(swText))?.[1] ?? null;
