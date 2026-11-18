// Fails (exit 1) when the repository contains something that looks like a secret.
// Run:  node scripts/check-secrets.mjs [folder]      (CI runs it before every build)
// The Supabase *anon / publishable* key is meant to be public and is allowed; service_role / secret keys are not.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.harness-run', 'coverage', 'playwright-report', 'test-results']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.zip', '.woff', '.woff2', '.ttf', '.pdf', '.geojson']);
const MAX_BYTES = 2 * 1024 * 1024;

const findings = [];
let scanned = 0;

function jwtRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

const isPlaceholder = (s) => /[\[<{$]|YOUR|PASSWORD|password|xxxx|\*\*\*/.test(s);

function scanText(rel, text) {
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    if (jwtRole(m[0]) === 'service_role') findings.push([rel, 'Supabase service_role JWT']);
  }
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) findings.push([rel, 'Supabase secret key (sb_secret_…)']);
  if (/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[A-Za-z0-9_.-]{20,}/.test(text)) findings.push([rel, 'SERVICE_ROLE_KEY assigned a literal value']);
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(text)) findings.push([rel, 'private key block']);
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]{3,})@/g)) {
    if (!isPlaceholder(m[2])) findings.push([rel, 'database connection string with a password']);
  }
  if (/\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/.test(text)) findings.push([rel, 'GitHub token']);
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
      continue;
    }
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (/^\.env(\..+)?$/.test(e.name) && e.name !== '.env.example') findings.push([rel, 'environment file must not be committed']);
    if (SKIP_EXT.has(path.extname(e.name).toLowerCase())) continue;
    const st = fs.statSync(full);
    if (st.size > MAX_BYTES) continue;
    scanned++;
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    scanText(rel, text);
  }
}

walk(ROOT);

if (findings.length) {
  console.error(`✗ พบข้อมูลที่อาจเป็นความลับ ${findings.length} จุด:`);
  for (const [f, why] of findings) console.error(`  - ${f}: ${why}`);
  console.error('\nลบออกจาก repo ทันที และ "Rotate" key ที่ Supabase (Project Settings → API Keys) เพราะประวัติ Git ยังเก็บค่าเดิมไว้');
  process.exit(1);
}
console.log(`✓ ไม่พบ Secret Key ในโค้ด (ตรวจ ${scanned} ไฟล์)`);
