// Wikimedia Commons: file-page URL -> API request -> checked license / credit (pure, no network here).
import { isWikimediaUploadUrl } from './imageModel';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeDecode(s: string): string | null {
  try { return decodeURIComponent(s); } catch { return null; }
}

/** "https://commons.wikimedia.org/wiki/File:X.jpg" | "File:X.jpg" -> "File:X.jpg" (null when it is not a JPG/PNG/WebP file page on Commons) */
export function parseCommonsTitle(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > 600) return null;
  let full: string | null = null;
  if (/^file:/i.test(raw)) {
    full = raw;
  } else {
    let u: URL;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.hostname !== 'commons.wikimedia.org' && u.hostname !== 'commons.m.wikimedia.org') return null;
    if (u.pathname.startsWith('/wiki/')) full = safeDecode(u.pathname.slice(6));
    else if (u.pathname === '/w/index.php') full = u.searchParams.get('title');
  }
  if (!full || !/^file:/i.test(full)) return null;
  const name = full.slice(5).replace(/_/g, ' ').trim();
  if (!/^[^\n\r<>#|[\]{}]{1,200}\.(jpe?g|png|webp)$/i.test(name)) return null;
  return `File:${name}`;
}

/** public API (no key). `origin=*` lets the browser call it from our site. */
export function commonsApiUrl(title: string, width = 960): string {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata', iiurlwidth: String(width), titles: title,
  });
  return `https://commons.wikimedia.org/w/api.php?${p.toString()}`;
}

/** Search Commons' File namespace and return thumbnail + licence metadata in one request. */
export function commonsSearchApiUrl(query: string, width = 720, limit = 10): string {
  const clean = query.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
    gsrnamespace: '6', gsrsearch: clean, gsrlimit: String(Math.max(1, Math.min(20, Math.round(limit)))),
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(Math.max(320, Math.min(1600, Math.round(width)))),
  });
  return `https://commons.wikimedia.org/w/api.php?${p.toString()}`;
}

export type LicenseKind = 'cc0' | 'pd' | 'cc-by' | 'cc-by-sa';
export type LicenseVerdict = { allowed: true; kind: LicenseKind } | { allowed: false; reason: string };

/** Accept only licences that allow free reuse with a credit line: CC0, public domain, CC BY, CC BY-SA. */
export function classifyLicense(shortName: string): LicenseVerdict {
  const s = (shortName ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { allowed: false, reason: 'ไม่พบข้อมูล License ของไฟล์นี้' };
  const tokens = s.split(' ');
  if (tokens.includes('nc')) return { allowed: false, reason: 'License นี้ห้ามใช้เชิงพาณิชย์ (NC)' };
  if (tokens.includes('nd')) return { allowed: false, reason: 'License นี้ห้ามดัดแปลง (ND) — เราต้องย่อ/ครอบรูป' };
  if (/\b(fair use|non free|all rights reserved|copyrighted)\b/.test(s)) return { allowed: false, reason: 'ไฟล์นี้ไม่ใช่เนื้อหาเสรี' };
  if (/^cc0\b|^cc zero\b/.test(s)) return { allowed: true, kind: 'cc0' };
  if (/\bpublic domain\b|^pd\b/.test(s)) return { allowed: true, kind: 'pd' };
  if (/^cc by sa \d/.test(s)) return { allowed: true, kind: 'cc-by-sa' };
  if (/^cc by \d/.test(s)) return { allowed: true, kind: 'cc-by' };
  if (tokens.includes('gfdl')) return { allowed: false, reason: 'GFDL ต้องแนบข้อความสัญญาอนุญาตเต็ม — ยังไม่รองรับ' };
  return { allowed: false, reason: `License “${shortName.trim().slice(0, 60)}” ไม่อยู่ในรายการที่รับ (CC0, Public domain, CC BY, CC BY-SA)` };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => codePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'").replace(/&amp;/gi, '&');
}
function codePoint(n: number): string {
  return Number.isFinite(n) && n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
}

/** HTML from the API -> plain text (React escapes it again when shown) */
export function htmlToText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type CommonsInfo = {
  title: string;
  thumbUrl: string;
  fileUrl: string | null;
  pageUrl: string;
  mime: string;
  license: string;
  licenseKind: LicenseKind;
  licenseUrl: string | null;
  author: string;
  description: string;
  restrictions: string[];
  warnings: string[];
};
export type CommonsResult = { ok: true; info: CommonsInfo } | { ok: false; error: string; license?: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads the API answer (formatversion 1 or 2). Never trusts it: URLs must be https Wikimedia, licence must be allowed. */
export function parseCommonsResponse(json: unknown): CommonsResult {
  const pagesRaw = isObj(json) && isObj(json.query) ? json.query.pages : undefined;
  const pages: Obj[] = Array.isArray(pagesRaw) ? pagesRaw.filter(isObj) : isObj(pagesRaw) ? Object.values(pagesRaw).filter(isObj) : [];
  const page = pages[0];
  if (!page) return { ok: false, error: 'ไม่พบข้อมูลไฟล์ จาก Commons' };
  const infos = page.imageinfo;
  const info = Array.isArray(infos) && isObj(infos[0]) ? infos[0] : null;
  if (!info) return { ok: false, error: 'missing' in page ? 'ไม่พบไฟล์นี้บน Commons (ตรวจชื่อไฟล์)' : 'ไม่พบข้อมูลภาพ' };

  const mime = typeof info.mime === 'string' ? info.mime : '';
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: 'รองรับเฉพาะไฟล์ภาพ JPG / PNG / WebP' };

  const thumbUrl = typeof info.thumburl === 'string' ? info.thumburl : typeof info.url === 'string' ? info.url : '';
  const pageUrl = typeof info.descriptionurl === 'string' ? info.descriptionurl : '';
  if (!isWikimediaUploadUrl(thumbUrl) || !/^https:\/\/commons\.wikimedia\.org\//.test(pageUrl)) {
    return { ok: false, error: 'ข้อมูลที่ได้จาก Commons ไม่ถูกต้อง' };
  }

  const ext = isObj(info.extmetadata) ? info.extmetadata : {};
  const val = (k: string): unknown => (isObj(ext[k]) ? (ext[k] as Obj).value : undefined);
  const licenseName = htmlToText(val('LicenseShortName')) || htmlToText(val('UsageTerms'));
  const verdict = classifyLicense(licenseName);
  if (!verdict.allowed) return { ok: false, error: verdict.reason, license: licenseName || undefined };

  const restrictions = htmlToText(val('Restrictions')).split(/[|,]/).map((x) => x.trim()).filter(Boolean);
  const author = htmlToText(val('Artist')).slice(0, 200);
  const licenseUrlRaw = htmlToText(val('LicenseUrl'));
  const warnings: string[] = [];
  if (!author) warnings.push('ไม่พบชื่อผู้ถ่ายในข้อมูล Commons — กรอกเองก่อนเพิ่มรูป');
  if (restrictions.length) warnings.push(`มีข้อจำกัดเพิ่มเติมตามกฎหมายอื่น: ${restrictions.join(', ')} — ตรวจหน้าไฟล์ก่อนใช้`);
  warnings.push('Wikimedia ไม่รับประกันความถูกต้องของ License — เปิดหน้าไฟล์ตรวจอีกครั้ง');

  return {
    ok: true,
    info: {
      title: typeof page.title === 'string' ? page.title : '',
      thumbUrl,
      fileUrl: typeof info.url === 'string' && isWikimediaUploadUrl(info.url) ? info.url : null,
      pageUrl,
      mime,
      license: licenseName.slice(0, 80),
      licenseKind: verdict.kind,
      licenseUrl: /^https:\/\/[^\s<>"']+$/i.test(licenseUrlRaw) ? licenseUrlRaw : null,
      author,
      description: htmlToText(val('ImageDescription')).slice(0, 200),
      restrictions,
      warnings,
    },
  };
}

function normalizedSearchText(value: string): string {
  return value.toLocaleLowerCase('th').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a generator=search answer and keep only reusable JPG/PNG/WebP files.
 * Search order is respected, with a small deterministic relevance boost for
 * file titles/descriptions containing the requested place name.
 */
export function parseCommonsSearchResponse(json: unknown, query: string): CommonsInfo[] {
  const pagesRaw = isObj(json) && isObj(json.query) ? json.query.pages : undefined;
  const pages: Obj[] = Array.isArray(pagesRaw) ? pagesRaw.filter(isObj) : isObj(pagesRaw) ? Object.values(pagesRaw).filter(isObj) : [];
  const q = normalizedSearchText(query);
  const tokens = q.split(' ').filter((x) => x.length >= 3 && !['thailand', 'thai', 'province'].includes(x));
  const seen = new Set<string>();
  return pages
    .map((page, index) => {
      const parsed = parseCommonsResponse({ query: { pages: [page] } });
      if (!parsed.ok || seen.has(parsed.info.pageUrl)) return null;
      seen.add(parsed.info.pageUrl);
      const title = normalizedSearchText(parsed.info.title.replace(/^file:/i, ''));
      const description = normalizedSearchText(parsed.info.description);
      let score = -index; // preserve Commons relevance order when scores tie
      if (q && title.includes(q)) score += 100;
      for (const token of tokens) {
        if (title.includes(token)) score += 12;
        else if (description.includes(token)) score += 3;
      }
      return { info: parsed.info, score };
    })
    .filter((x): x is { info: CommonsInfo; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.info);
}
