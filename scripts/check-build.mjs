// Sanity checks on the production build.   Run after `npm run build`:  node scripts/check-build.mjs [dist]
//   VITE_BASE=/thai77/            -> asset URLs must start with this (GitHub Pages sub-path)
//   VITE_SUPABASE_URL=...         -> must be baked into the bundle (else the site shows the red "not configured" banner)
//   REQUIRE_SUPABASE_ENV=1        -> fail instead of warn when the Supabase variables are missing
import fs from 'node:fs';
import path from 'node:path';

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
if (!fs.existsSync(indexPath)) {
  fails.push(`ไม่พบ ${indexPath} — Build ไม่สำเร็จหรือโฟลเดอร์ผิด`);
} else {
  const html = fs.readFileSync(indexPath, 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));
  const bad = urls.filter((u) => !u.startsWith(BASE));
  if (bad.length) fails.push(`ลิงก์ไฟล์ใน index.html ไม่ขึ้นต้นด้วย base "${BASE}": ${bad.slice(0, 3).join(', ')} (ตั้ง VITE_BASE ผิด → เว็บจะหน้าขาวบน GitHub Pages)`);
  else ok.push(`base path ถูกต้อง (${BASE}) · ${urls.length} ลิงก์`);
  if (!/<html[^>]*lang="th"/.test(html)) warns.push('index.html ไม่มี lang="th"');
}

// 2) bundle size
const all = files(DIST);
const js = all.filter((f) => f.endsWith('.js')).map((f) => ({ f, n: fs.statSync(f).size }));
const css = all.filter((f) => f.endsWith('.css'));
if (!js.length) fails.push('ไม่พบไฟล์ .js ใน dist/assets');
if (!css.length) fails.push('ไม่พบไฟล์ .css ใน dist/assets');
for (const { f, n } of js) {
  if (n > JS_FAIL) fails.push(`${path.relative(DIST, f)} ใหญ่เกินไป (${kb(n)} > ${kb(JS_FAIL)})`);
  else if (n > JS_WARN) warns.push(`${path.relative(DIST, f)} ค่อนข้างใหญ่ (${kb(n)}) — พิจารณา lazy-load`);
}
if (js.length) ok.push(`JS ${js.length} ไฟล์ รวม ${kb(js.reduce((s, x) => s + x.n, 0))}`);

// 3) secrets in the bundle
let leaked = false;
for (const f of all.filter((x) => /\.(js|css|html|json|map)$/.test(x))) {
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
  (REQUIRE ? fails : warns).push('ยังไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (GitHub → Settings → Secrets and variables → Actions → Variables)');
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

for (const m of ok) console.log(`✓ ${m}`);
for (const m of warns) console.log(`⚠ ${m}`);
for (const m of fails) console.error(`✗ ${m}`);
if (fails.length) { console.error(`\nตรวจ Build ไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
console.log('\nตรวจ Build ผ่าน');
