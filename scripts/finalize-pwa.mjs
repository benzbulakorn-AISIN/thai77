// Runs after `vite build` (see package.json "build"):  node scripts/finalize-pwa.mjs [dist]
//   1. fills the link-preview (Open Graph) placeholders in dist/index.html with the real site address
//   2. writes dist/sw.js (the service worker, with the list of files to keep) and dist/build.json (version info)
// Needs NO change of the GitHub workflow: the address comes from GITHUB_REPOSITORY, which GitHub sets for every job.
//   SITE_URL=https://example.com/app/   -> use this address instead (custom domain)
//   VITE_BASE                            -> the base path the site was built for (the workflow already sets it)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRECACHE_FAIL_BYTES, PRECACHE_WARN_BYTES, applyPlaceholders, computeBuildId, configSiteUrl, fixPublicLinks, normalizeBase, ogImageWarnings,
  pickOgImage, pwaEnabled, readImageSize, renderSw, selectPrecache, selfDestructSw, sha256Hex, siteUrlFrom,
} from './pwa-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const BASE = normalizeBase(process.env.VITE_BASE || '/');
const gh = process.env.GITHUB_ACTIONS === 'true';
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const warn = (m) => { console.log(`⚠ ${m}`); if (gh) console.log(`::warning title=PWA::${esc(m)}`); };
const die = (m) => { console.error(`✗ ${m}`); if (gh) console.log(`::error title=PWA::${esc(m)}`); process.exit(1); };

function walk(dir, rel = '') {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]))
    : [];
}

const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) die(`ไม่พบ ${indexPath} — ต้อง Build ก่อน`);

// ---------- config + site address ----------
const cfgPath = path.join(ROOT, 'pwa.config.json');
const cfgText = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : null;
const cfg = pwaEnabled(cfgText);
if (cfg.warning) warn(cfg.warning);
// address precedence: SITE_URL (environment) > "siteUrl" in pwa.config.json (custom domain) > GITHUB_REPOSITORY (github.io)
const site = siteUrlFrom({ siteUrl: process.env.SITE_URL || configSiteUrl(cfgText) || '', repository: process.env.GITHUB_REPOSITORY });
if (!site) warn('ไม่ทราบที่อยู่เว็บ (ไม่มี GITHUB_REPOSITORY / SITE_URL) — แท็กภาพตัวอย่างลิงก์จะเป็น path ไม่ใช่ URL เต็ม (ไม่เป็นไรสำหรับ Build ในเครื่อง)');

// ---------- link preview picture ----------
const allFiles = walk(DIST);
const og = pickOgImage(allFiles);
const ogBuf = fs.readFileSync(path.join(DIST, og.path));
const ogSize = readImageSize(ogBuf);
ogImageWarnings(ogSize, ogBuf.length).forEach((w) => warn(`${og.path}: ${w}`));
console.log(`✓ ภาพตัวอย่างลิงก์: ${og.path}${og.custom ? ' (ของคุณ)' : ' (ภาพมาตรฐานจากโค้ด)'} · ${ogSize ? `${ogSize.width}×${ogSize.height}` : '?'}`);

let html = fs.readFileSync(indexPath, 'utf8');
html = fixPublicLinks(html, BASE);
html = applyPlaceholders(html, { site, base: BASE, ogImage: og.path, ogSize, enabled: cfg.enabled });
fs.writeFileSync(indexPath, html);
console.log(`✓ index.html: ${site ?? '(ไม่มีที่อยู่เว็บ)'} · Service Worker ${cfg.enabled ? 'เปิด' : 'ปิด (สวิตช์ฉุกเฉิน)'}`);

// ---------- service worker + version ----------
const sizes = allFiles.filter((f) => f !== 'sw.js').map((f) => ({ path: f, size: fs.statSync(path.join(DIST, f)).size }));
const swPath = path.join(DIST, 'sw.js');
const builtAt = new Date().toISOString();

if (!cfg.enabled) {
  fs.writeFileSync(swPath, selfDestructSw());
  fs.writeFileSync(path.join(DIST, 'build.json'), `${JSON.stringify({ id: 'off', builtAt, pwa: false, site }, null, 2)}\n`);
  console.log('✓ sw.js = ตัวถอดตัวเอง (pwa.config.json enabled=false)');
  process.exit(0);
}

const templatePath = path.join(HERE, 'sw.template.js');
if (!fs.existsSync(templatePath)) die('ไม่พบ scripts/sw.template.js');
const template = fs.readFileSync(templatePath, 'utf8');

// index.html was just rewritten: take its hash from the FINAL file
const sel = selectPrecache(sizes.map((f) => (f.path === 'index.html' ? { ...f, size: fs.statSync(indexPath).size } : f)));
if (!sel.entries.some((e) => e.rel === '')) die('index.html ไม่อยู่ในรายการแคช');
if (!sel.entries.some((e) => e.rel === 'offline.html')) die('ไม่พบ offline.html (public/offline.html)');
const items = sel.entries.map((e) => ({ rel: e.rel, sha: sha256Hex(fs.readFileSync(path.join(DIST, e.path))) }));
const buildId = computeBuildId(items, sha256Hex(template));
fs.writeFileSync(swPath, renderSw(template, { buildId, precache: sel.entries.map((e) => e.rel) }));
fs.writeFileSync(path.join(DIST, 'build.json'), `${JSON.stringify({ id: buildId, builtAt, pwa: true, site, precache: { files: sel.entries.length, bytes: sel.bytes } }, null, 2)}\n`);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`✓ sw.js: build ${buildId} · เก็บไว้ในเครื่อง ${sel.entries.length} ไฟล์ (${kb(sel.bytes)})`);
const geo = sizes.filter((f) => f.path.startsWith('geo/'));
if (geo.length) console.log(`  แผนที่ (geo/): ${geo.length} ไฟล์ รวม ${kb(geo.reduce((s, f) => s + f.size, 0))} — เก็บเมื่อเปิดดูเท่านั้น (ไม่ดาวน์โหลดล่วงหน้า)`);
if (sel.level === 'warn') warn(`ไฟล์ที่เก็บล่วงหน้ารวม ${kb(sel.bytes)} เกิน ${kb(PRECACHE_WARN_BYTES)} — ครั้งแรกที่เปิดเว็บจะโหลดนานขึ้น`);
if (sel.level === 'fail') die(`ไฟล์ที่เก็บล่วงหน้ารวม ${kb(sel.bytes)} เกิน ${kb(PRECACHE_FAIL_BYTES)} — ตรวจว่าไม่มีไฟล์ใหญ่หลุดเข้า assets/`);
