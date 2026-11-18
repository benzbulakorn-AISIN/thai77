// Build simplified province/district boundaries + seed SQL from OCHA COD-AB (Thailand).
// Usage: node scripts/build-geo.mjs <folder-with-unzipped-cod-ab>
// Output:
//   public/geo/provinces.geojson          (77 provinces)
//   public/geo/districts/<TH##>.geojson   (districts of one province, lazy-loaded)
//   public/geo/meta.json, public/geo/ATTRIBUTION.md
//   supabase/seed_geo.sql                 (provinces + districts, idempotent)
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || '.geo-src';
const OUT = 'public/geo';
const TMP = '.geo-tmp';
const SKIP_SIMPLIFY = process.env.SKIP_SIMPLIFY === '1'; // for local tests only

// ---------- 6-region grouping by province code (TH##) ----------
function regionOf(code) {
  const n = Number(code);
  if (n >= 50 && n <= 58) return 'north';
  if (n >= 30 && n <= 49) return 'northeast';
  if ([20, 21, 22, 23, 24, 25, 27].includes(n)) return 'east';
  if ([63, 70, 71, 76, 77].includes(n)) return 'west';
  if ((n >= 80 && n <= 86) || (n >= 90 && n <= 96)) return 'south';
  if ((n >= 10 && n <= 19) || n === 26 || (n >= 60 && n <= 67) || (n >= 72 && n <= 75)) return 'central';
  return null;
}

// ---------- locate source files ----------
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(SRC).filter((f) => /\.(geo)?json$/i.test(f));
function findLevel(level) {
  const re = new RegExp(`adm(in)?(bnda_adm)?_?${level}(?![0-9])`, 'i');
  const bad = /(bndl|bndp|line|point|_pt|_em)/i;
  const hits = files.filter((f) => re.test(path.basename(f)) && !bad.test(path.basename(f)));
  if (!hits.length) throw new Error(`Admin level ${level} file not found. Files: ${files.join(', ')}`);
  hits.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return hits[0];
}
const adm1File = findLevel(1);
const adm2File = findLevel(2);
console.log('ADM1:', adm1File, '\nADM2:', adm2File);

// ---------- simplify with mapshaper ----------
fs.mkdirSync(TMP, { recursive: true });
async function simplify(input, output, interval) {
  if (SKIP_SIMPLIFY) { fs.copyFileSync(input, output); return; }
  const mapshaper = (await import('mapshaper')).default;
  await mapshaper.runCommands(
    `-i "${input}" -simplify interval=${interval} keep-shapes -o "${output}" format=geojson precision=0.0001`,
  );
}
await simplify(adm1File, `${TMP}/adm1.json`, 250);
await simplify(adm2File, `${TMP}/adm2.json`, 80);
const adm1 = JSON.parse(fs.readFileSync(`${TMP}/adm1.json`, 'utf8'));
const adm2 = JSON.parse(fs.readFileSync(`${TMP}/adm2.json`, 'utf8'));

// ---------- property helpers (works with old ADM1_TH and new adm1_name1 schemas) ----------
const THAI = /[\u0E00-\u0E7F]/;
function pick(props, level) {
  const keys = Object.keys(props);
  const pcodeKey = keys.find((k) => k.toLowerCase() === `adm${level}_pcode`);
  const nameVals = keys
    .filter((k) => new RegExp(`^adm${level}_(name\\d?|th|en)$`, 'i').test(k))
    .map((k) => props[k])
    .filter((v) => typeof v === 'string' && v.trim());
  return {
    pcode: pcodeKey ? String(props[pcodeKey]).trim() : '',
    th: (nameVals.find((v) => THAI.test(v)) || '').trim(),
    en: (nameVals.find((v) => !THAI.test(v)) || '').trim(),
  };
}
function bboxCenter(geom) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    } else c.forEach(visit);
  };
  visit(geom.coordinates);
  return { lat: +((minY + maxY) / 2).toFixed(6), lng: +((minX + maxX) / 2).toFixed(6) };
}
const digits = (pcode) => pcode.replace(/\D/g, '');
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- provinces ----------
const provinces = [];
const usedSlugs = new Set();
const provFeatures = [];
for (const f of adm1.features) {
  if (!f.geometry) continue;
  const { pcode, th, en } = pick(f.properties || {}, 1);
  const code = digits(pcode);
  const region = regionOf(code);
  if (!pcode || !th || !region) throw new Error(`Bad province row: ${JSON.stringify(f.properties)}`);
  let slug = slugify(en || pcode);
  if (usedSlugs.has(slug)) slug = `${slug}-${code}`;
  usedSlugs.add(slug);
  const c = bboxCenter(f.geometry);
  provinces.push({ pcode, slug, th, en: en || th, region, ...c });
  provFeatures.push({ type: 'Feature', properties: { pcode, name_th: th, name_en: en || th }, geometry: f.geometry });
}
if (provinces.length !== 77) {
  throw new Error(`Expected 77 provinces, got ${provinces.length}`);
}
const provSet = new Set(provinces.map((p) => p.pcode));

// ---------- districts ----------
const districts = [];
const byProvince = new Map();
for (const f of adm2.features) {
  if (!f.geometry) continue;
  const props = f.properties || {};
  const d = pick(props, 2);
  const parent = pick(props, 1).pcode;
  if (!d.pcode || !d.th || !provSet.has(parent)) throw new Error(`Bad district row: ${JSON.stringify(props)}`);
  districts.push({ pcode: d.pcode, parent, th: d.th, en: d.en || d.th });
  if (!byProvince.has(parent)) byProvince.set(parent, []);
  byProvince.get(parent).push({
    type: 'Feature',
    properties: { pcode: d.pcode, province_pcode: parent, name_th: d.th, name_en: d.en || d.th },
    geometry: f.geometry,
  });
}
if (districts.length < 900) throw new Error(`Too few districts: ${districts.length}`);

// ---------- write geo files ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/districts`, { recursive: true });
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
fs.writeFileSync(`${OUT}/provinces.geojson`, fc(provFeatures));
for (const [pcode, feats] of byProvince) fs.writeFileSync(`${OUT}/districts/${pcode}.geojson`, fc(feats));

const meta = {
  source: 'OCHA COD-AB Thailand (Royal Thai Survey Department)',
  sourceUrl: process.env.SOURCE_URL || 'https://data.humdata.org/dataset/cod-ab-tha',
  sourceModified: process.env.SOURCE_MODIFIED || null,
  license: 'CC BY 3.0 IGO (verify on HDX)',
  simplified: true,
  builtAt: new Date().toISOString(),
  provinces: provinces.length,
  districts: districts.length,
};
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));
fs.writeFileSync(`${OUT}/ATTRIBUTION.md`,
  `# Boundary data\n\nSource: ${meta.source}\nURL: ${meta.sourceUrl}\nLicense: ${meta.license}\n\n` +
  'Geometries were simplified for web display and are not legal/survey boundaries.\n');

// ---------- seed SQL ----------
const provRows = provinces.map((p) =>
  `  (${sq(p.pcode)}, ${sq(p.slug)}, ${sq(p.th)}, ${sq(p.en)}, ${sq(p.region)}, ${p.lat}, ${p.lng})`).join(',\n');
const distRows = districts.map((d) =>
  `  (${sq(d.pcode)}, ${sq(d.parent)}, ${sq(d.th)}, ${sq(d.en)})`).join(',\n');
const sql = `-- GENERATED by scripts/build-geo.mjs from ${meta.source}
-- ${meta.sourceUrl}  (built ${meta.builtAt})
-- Safe to run more than once.

insert into public.provinces (pcode, slug, name_th, name_en, region_id, center_lat, center_lng)
select v.pcode, v.slug, v.name_th, v.name_en, r.id, v.lat::numeric, v.lng::numeric
from (values
${provRows}
) as v(pcode, slug, name_th, name_en, region, lat, lng)
join public.regions r on r.code = v.region
on conflict (pcode) do update set
  slug = excluded.slug, name_th = excluded.name_th, name_en = excluded.name_en,
  region_id = excluded.region_id, center_lat = excluded.center_lat, center_lng = excluded.center_lng;

insert into public.districts (pcode, province_id, name_th, name_en)
select v.pcode, p.id, v.name_th, v.name_en
from (values
${distRows}
) as v(pcode, province_pcode, name_th, name_en)
join public.provinces p on p.pcode = v.province_pcode
on conflict (pcode) do update set
  province_id = excluded.province_id, name_th = excluded.name_th, name_en = excluded.name_en;

-- check: expect 77 | ${districts.length}
select (select count(*) from public.provinces) as provinces, (select count(*) from public.districts) as districts;
`;
fs.mkdirSync('supabase', { recursive: true });
fs.writeFileSync('supabase/seed_geo.sql', sql);
fs.rmSync(TMP, { recursive: true, force: true });

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`OK: ${provinces.length} provinces, ${districts.length} districts`);
console.log(`provinces.geojson ${kb(`${OUT}/provinces.geojson`)} KB`);
