// Sanity checks on the production build.   Run after `npm run build`:  node scripts/check-build.mjs [dist]
//   VITE_BASE=/thai77/            -> absolute asset URLs must start with this (GitHub Pages sub-path)
//   VITE_SUPABASE_URL=...         -> must be baked into the bundle (else the site shows the red "not configured" banner)
//   REQUIRE_SUPABASE_ENV=1        -> fail instead of warn when the Supabase variables are missing
// Every failure is also printed as a GitHub annotation, so the reason shows on the run's Summary page.
import fs from 'node:fs';
import path from 'node:path';
import {
  PRECACHE_FAIL_BYTES, PRECACHE_WARN_BYTES, linkHref, manifestProblems, metaContent, normalizeBase, ogProblems, pickOgImage, readBuildIdFromSw,
  readImageSize, readPrecacheFromSw,
} from './pwa-lib.mjs';

const DIST = path.resolve(process.argv[2] || 'dist');
const BASE = process.env.VITE_BASE || '/';
const URL_ENV = process.env.VITE_SUPABASE_URL || '';
const KEY_ENV = process.env.VITE_SUPABASE_ANON_KEY || '';
const REQUIRE = process.env.REQUIRE_SUPABASE_ENV === '1';
const JS_FAIL = 2 * 1024 * 1024;
const JS_WARN = 800 * 1024;

const fails = [];
const warns = [];
const ok = [];
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function files(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)])) : [];
}
const jwtRole = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role; } catch { return null; } };

// 1) index.html
const indexPath = path.join(DIST, 'index.html');
let html = '';
if (!fs.existsSync(indexPath)) {
  fails.push(`ไม่พบ ${indexPath} — Build ไม่สำเร็จหรือโฟลเดอร์ผิด`);
} else {
  html = fs.readFileSync(indexPath, 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:|\/\/)/.test(u));
  const absolute = urls.filter((u) => u.startsWith('/'));
  const relative = urls.filter((u) => !u.startsWith('/'));
  const bad = absolute.filter((u) => !u.startsWith(BASE));
  if (bad.length) fails.push(`ลิงก์ไฟล์ใน index.html ไม่ขึ้นต้นด้วย base "${BASE}": ${bad.slice(0, 3).join(', ')} (ตั้ง VITE_BASE ผิด → เว็บจะหน้าขาวบน GitHub Pages)`);
  else ok.push(`base path ถูกต้อง (${BASE}) · ${absolute.length} ลิงก์`);
  // "./file" links still work (resolved relative to the page), so they are only a warning
  if (relative.length) warns.push(`index.html มีลิงก์แบบ relative: ${relative.slice(0, 3).join(', ')} — ใช้งานได้ แต่แนะนำให้ใช้ /ชื่อไฟล์ (เช่น /favicon.svg) เพื่อให้ Vite ใส่ base ให้`);
  if (!/<html[^>]*lang="th"/.test(html)) warns.push('index.html ไม่มี lang="th"');
}

// 2) bundle size
const all = files(DIST);
const js = all.filter((f) => f.endsWith('.js') && path.basename(f) !== 'sw.js').map((f) => ({ f, n: fs.statSync(f).size }));
const css = all.filter((f) => f.endsWith('.css'));
if (!js.length) fails.push('ไม่พบไฟล์ .js ใน dist/assets');
if (!css.length) fails.push('ไม่พบไฟล์ .css ใน dist/assets');
for (const { f, n } of js) {
  if (n > JS_FAIL) fails.push(`${path.relative(DIST, f)} ใหญ่เกินไป (${kb(n)} > ${kb(JS_FAIL)})`);
  else if (n > JS_WARN) warns.push(`${path.relative(DIST, f)} ค่อนข้างใหญ่ (${kb(n)}) — พิจารณา lazy-load`);
}
if (js.length) ok.push(`JS ${js.length} ไฟล์ รวม ${kb(js.reduce((s, x) => s + x.n, 0))}`);

// 3) secrets in the bundle (the service worker is included: it must not carry any)
let leaked = false;
for (const f of all.filter((x) => /\.(js|css|html|json|map|webmanifest)$/.test(x))) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    if (jwtRole(m[0]) === 'service_role') { fails.push(`พบ service_role key ใน ${path.relative(DIST, f)} — ห้ามเผยแพร่!`); leaked = true; }
  }
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(t)) { fails.push(`พบ sb_secret_ key ใน ${path.relative(DIST, f)}`); leaked = true; }
}
if (!leaked) ok.push('ไม่พบ Secret Key ในไฟล์ที่ Build');

// 4) Supabase env injected?
const bundle = js.map((x) => fs.readFileSync(x.f, 'utf8')).join('\n');
if (!URL_ENV || !KEY_ENV) {
  (REQUIRE ? fails : warns).push('ยังไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (GitHub → Settings → Secrets and variables → Actions → แท็บ Variables)');
} else {
  if (!bundle.includes(URL_ENV)) fails.push('VITE_SUPABASE_URL ไม่ได้ถูกฝังใน Build — เว็บจะขึ้นแถบแดง "ยังไม่ได้ตั้งค่า"');
  else ok.push('VITE_SUPABASE_URL ถูกฝังใน Build แล้ว');
  if (jwtRole(KEY_ENV) === 'service_role' || KEY_ENV.startsWith('sb_secret_')) fails.push('VITE_SUPABASE_ANON_KEY เป็น secret/service_role key — ใช้ anon หรือ publishable key เท่านั้น!');
  else if (!bundle.includes(KEY_ENV)) fails.push('VITE_SUPABASE_ANON_KEY ไม่ได้ถูกฝังใน Build');
}

// 5) map data + static files
const prov = path.join(DIST, 'geo', 'provinces.geojson');
if (!fs.existsSync(prov)) fails.push('ไม่พบ geo/provinces.geojson — รัน workflow "Build Geo Data" ก่อน');
else {
  try {
    const n = JSON.parse(fs.readFileSync(prov, 'utf8')).features.length;
    if (n !== 77) fails.push(`provinces.geojson มี ${n} จังหวัด (ต้อง 77)`); else ok.push('แผนที่ 77 จังหวัดครบ');
  } catch { fails.push('provinces.geojson อ่านไม่ได้'); }
  const d = all.filter((f) => /geo[\\/]districts[\\/]TH\d+\.geojson$/.test(f)).length;
  if (d < 77) warns.push(`ไฟล์อำเภอมี ${d}/77 จังหวัด`); else ok.push(`ไฟล์อำเภอ ${d} จังหวัด`);
}
if (!fs.existsSync(path.join(DIST, 'favicon.svg'))) warns.push('ไม่พบ favicon.svg');

// 6) PWA: manifest, icons, service worker, version, link preview
const rels = new Set(all.map((f) => path.relative(DIST, f).split(path.sep).join('/')));
const baseN = normalizeBase(BASE);
const manifestPath = path.join(DIST, 'manifest.webmanifest');
if (!fs.existsSync(manifestPath)) {
  fails.push('ไม่พบ manifest.webmanifest (public/manifest.webmanifest) — ติดตั้งลงหน้าจอหลักไม่ได้');
} else {
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* reported below */ }
  const problems = manifestProblems(manifest, {
    base: baseN,
    files: rels,
    size: (rel) => { try { return readImageSize(fs.readFileSync(path.join(DIST, rel))); } catch { return null; } },
  });
  if (problems.length) problems.forEach((p) => fails.push(`manifest: ${p}`)); else ok.push('manifest ถูกต้อง (ชื่อ, scope, ไอคอน 192/512 + maskable)');
  const href = linkHref(html, 'manifest');
  if (!href) fails.push('index.html ไม่มี <link rel="manifest">');
  else if (href.startsWith('/') && !href.startsWith(baseN)) fails.push(`<link rel="manifest"> ไม่ขึ้นต้นด้วย base "${baseN}" (ตอนนี้ ${href})`);
  const touch = linkHref(html, 'apple-touch-icon');
  if (!touch) warns.push('ไม่มี apple-touch-icon — iPhone จะใช้ตัวอักษรแรกของชื่อเว็บเป็นไอคอน');
  else if (touch.startsWith('/') && !rels.has(touch.slice(baseN.length))) fails.push(`apple-touch-icon ชี้ไปไฟล์ที่ไม่มี: ${touch}`);
}

const swPath = path.join(DIST, 'sw.js');
const buildJsonPath = path.join(DIST, 'build.json');
const pwaMeta = metaContent(html, 'thai77-pwa');
if (!fs.existsSync(swPath)) {
  fails.push('ไม่พบ sw.js — ขั้น finalize-pwa ไม่ได้ทำงาน (npm run build ต้องจบด้วย node scripts/finalize-pwa.mjs)');
} else {
  const sw = fs.readFileSync(swPath, 'utf8');
  let buildJson = null;
  try { buildJson = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8')); } catch { fails.push('ไม่พบหรืออ่าน build.json ไม่ได้'); }
  if (pwaMeta === 'off') {
    if (!/unregister\(\)/.test(sw)) fails.push('pwa.config.json ปิดอยู่ แต่ sw.js ไม่ใช่ตัวถอดตัวเอง');
    else warns.push('Service Worker ถูกปิดด้วยสวิตช์ฉุกเฉิน (pwa.config.json) — เว็บจะไม่ทำงานออฟไลน์จนกว่าจะเปิดกลับ');
  } else {
    if (pwaMeta !== 'on') fails.push('index.html ไม่มี <meta name="thai77-pwa" content="on">');
    if (/__BUILD_ID__|__PRECACHE__/.test(sw)) fails.push('sw.js ยังมี placeholder ที่ไม่ได้แทนค่า');
    const list = readPrecacheFromSw(sw);
    const id = readBuildIdFromSw(sw);
    if (!list) fails.push('อ่านรายการไฟล์ที่แคชจาก sw.js ไม่ได้');
    else {
      const missing = list.filter((r) => !rels.has(r === '' ? 'index.html' : r));
      if (missing.length) fails.push(`sw.js ให้แคชไฟล์ที่ไม่มีใน dist: ${missing.slice(0, 4).join(', ')} (ติดตั้ง Service Worker จะล้มเหลวทุกครั้ง)`);
      const bytes = list.reduce((s, r) => s + (fs.existsSync(path.join(DIST, r === '' ? 'index.html' : r)) ? fs.statSync(path.join(DIST, r === '' ? 'index.html' : r)).size : 0), 0);
      if (bytes > PRECACHE_FAIL_BYTES) fails.push(`ไฟล์ที่แคชล่วงหน้ารวม ${kb(bytes)} เกิน ${kb(PRECACHE_FAIL_BYTES)}`);
      else if (bytes > PRECACHE_WARN_BYTES) warns.push(`ไฟล์ที่แคชล่วงหน้ารวม ${kb(bytes)} (เกิน ${kb(PRECACHE_WARN_BYTES)})`);
      if (!missing.length && bytes <= PRECACHE_FAIL_BYTES) ok.push(`Service Worker: เก็บ ${list.length} ไฟล์ (${kb(bytes)}) ครบทุกไฟล์ใน dist`);
      if (!list.includes('') || !list.includes('offline.html')) fails.push('sw.js ไม่ได้แคช index.html และ offline.html');
    }
    if (buildJson && id && buildJson.id !== id) fails.push(`build.json (${buildJson.id}) ไม่ตรงกับเลขเวอร์ชันใน sw.js (${id})`);
    const ext = /https?:\/\/[a-z0-9.-]+/i.exec(sw);
    if (ext) fails.push(`sw.js มี URL ภายนอกอยู่ในโค้ด (${ext[0]}) — Service Worker ต้องไม่ยุ่งกับคำขอข้ามเว็บ`);
  }
}

if (html) {
  const og = ogProblems(html, { requireAbsolute: process.env.GITHUB_ACTIONS === 'true' });
  og.problems.forEach((p) => fails.push(`ภาพตัวอย่างลิงก์: ${p}`));
  og.warnings.forEach((w) => warns.push(`ภาพตัวอย่างลิงก์: ${w}`));
  if (!og.problems.length) {
    ok.push('แท็กภาพตัวอย่างลิงก์ (Open Graph) ครบ');
    const v = metaContent(html, 'og:image');
    if (v) {
      const pick = pickOgImage([...rels]);
      const hit = v.includes(pick.path) ? pick.path : null;
      if (!hit) warns.push(`og:image (${v}) ไม่ตรงกับไฟล์ที่เลือกไว้ (${pick.path})`);
      else if (!rels.has(hit)) fails.push(`og:image ชี้ไปไฟล์ที่ไม่มีใน dist: ${hit}`);
    }
  }
  if (metaContent(html, 'robots') !== 'noindex,nofollow') warns.push('ไม่มี <meta name="robots" content="noindex,nofollow"> — เสิร์ชเอนจินอาจเก็บเว็บนี้');
}
if (!rels.has('offline.html')) fails.push('ไม่พบ offline.html');

const gh = process.env.GITHUB_ACTIONS === 'true';
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
for (const m of ok) console.log(`✓ ${m}`);
for (const m of warns) { console.log(`⚠ ${m}`); if (gh) console.log(`::warning title=ตรวจ Build::${esc(m)}`); }
for (const m of fails) { console.error(`✗ ${m}`); if (gh) console.log(`::error title=ตรวจ Build ไม่ผ่าน::${esc(m)}`); }
if (fails.length) { console.error(`\nตรวจ Build ไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
console.log('\nตรวจ Build ผ่าน');
