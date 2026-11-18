// Place images: types + pure rules (no React / Supabase) — easy to test.
export const PLACE_IMAGE_BUCKET = 'place-images';
export const MAX_IMAGES_PER_PLACE = 12;
export const OWN_LICENSE = 'ภาพถ่ายของเราเอง';

export type PlaceImage = {
  id: string;
  place_id: string;
  storage_path: string | null;
  external_url: string | null;
  license: string;
  author: string | null;
  source_url: string | null;
  alt_th: string | null;
  sort_order: number;
};

/** License choices for pictures we upload ourselves (Wikimedia pictures take their license from Commons). */
export const LICENSE_CHOICES: { value: string; label: string }[] = [
  { value: OWN_LICENSE, label: 'ภาพถ่ายของเราเอง' },
  { value: 'CC0 1.0', label: 'CC0 (ไม่สงวนสิทธิ์)' },
  { value: 'Public domain', label: 'Public domain' },
  { value: 'CC BY 4.0', label: 'CC BY 4.0 (ต้องให้เครดิต)' },
  { value: 'CC BY-SA 4.0', label: 'CC BY-SA 4.0 (ต้องให้เครดิต)' },
  { value: 'ได้รับอนุญาตเป็นลายลักษณ์อักษร', label: 'ได้รับอนุญาตเป็นลายลักษณ์อักษร' },
];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const STORAGE_PATH_RE = new RegExp(`^${UUID}/${UUID}\\.(webp|jpg|png)$`, 'i');

export const sortImages = (images: PlaceImage[]): PlaceImage[] =>
  [...images].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

/** the chosen cover if it still exists, otherwise the first picture */
export function chooseCover(images: PlaceImage[], coverId: string | null): PlaceImage | null {
  const sorted = sortImages(images);
  return sorted.find((i) => i.id === coverId) ?? sorted[0] ?? null;
}

/** cover first, then the rest in their order */
export function orderWithCoverFirst(images: PlaceImage[], coverId: string | null): PlaceImage[] {
  const cover = chooseCover(images, coverId);
  if (!cover) return [];
  return [cover, ...sortImages(images).filter((i) => i.id !== cover.id)];
}

export function isWikimediaUploadUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && x.hostname === 'upload.wikimedia.org';
  } catch {
    return false;
  }
}

/** https link without spaces / quotes (used for "source" links shown to everyone) */
export function safeHttpsUrl(u: string | null | undefined): string | null {
  const t = (u ?? '').trim();
  return /^https:\/\/[^\s<>"']+$/i.test(t) && t.length <= 1000 ? t : null;
}

/**
 * Where to load a picture from. Only our own Storage paths and Wikimedia upload URLs are ever used —
 * pictures from any other site are never displayed.
 */
export function resolveImageUrl(img: PlaceImage, publicUrl: (path: string) => string): string | null {
  if (img.storage_path) return STORAGE_PATH_RE.test(img.storage_path) ? publicUrl(img.storage_path) : null;
  return isWikimediaUploadUrl(img.external_url) ? (img.external_url as string) : null;
}

export const imageAlt = (img: Pick<PlaceImage, 'alt_th'>, placeName: string) => img.alt_th?.trim() || `ภาพ ${placeName}`;

/** credit line shown under a picture */
export function creditText(img: Pick<PlaceImage, 'author' | 'license'>): string {
  const author = (img.author ?? '').trim();
  const license = (img.license ?? '').trim();
  if (license === OWN_LICENSE) return author ? `ภาพ: ${author}` : 'ภาพถ่ายของเรา';
  return `ภาพ: ${author || 'ไม่ระบุผู้ถ่าย'}${license ? ` · ${license}` : ''}`;
}

const extOf = (mime: string) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg');

/** {place_id}/{uuid}.ext inside the public bucket (admin-only write) */
export function placeImagePath(placeId: string, rand: string, mime: string): string {
  if (!UUID_RE.test(placeId) || !UUID_RE.test(rand)) throw new Error('invalid id');
  return `${placeId}/${rand}.${extOf(mime)}`;
}

export type ImageMetaInput = { license: string; author: string; source_url: string; alt_th: string };
export type ImageMetaValue = { license: string; author: string; source_url: string | null; alt_th: string | null };

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** license + photographer are always required; the source link is required unless it is our own photo */
export function validateImageMeta(m: ImageMetaInput): { ok: true; value: ImageMetaValue } | { ok: false; error: string } {
  const license = clean(m.license ?? '');
  const author = clean(m.author ?? '');
  const alt = clean(m.alt_th ?? '');
  const sourceRaw = (m.source_url ?? '').trim();
  if (!license) return { ok: false, error: 'ระบุ License ของรูป' };
  if (license.length > 80) return { ok: false, error: 'ชื่อ License ยาวเกิน 80 ตัวอักษร' };
  if (!author) return { ok: false, error: 'ระบุชื่อผู้ถ่าย' };
  if (author.length > 200) return { ok: false, error: 'ชื่อผู้ถ่ายยาวเกิน 200 ตัวอักษร' };
  if (alt.length > 200) return { ok: false, error: 'คำอธิบายรูปยาวเกิน 200 ตัวอักษร' };
  let source: string | null = null;
  if (sourceRaw) {
    source = safeHttpsUrl(sourceRaw);
    if (!source) return { ok: false, error: 'ลิงก์ที่มาต้องขึ้นต้นด้วย https:// และไม่มีช่องว่าง' };
  } else if (license !== OWN_LICENSE) {
    return { ok: false, error: 'ระบุลิงก์ที่มาของรูป (ยกเว้นภาพถ่ายของเราเอง)' };
  }
  return { ok: true, value: { license, author, source_url: source, alt_th: alt || null } };
}
