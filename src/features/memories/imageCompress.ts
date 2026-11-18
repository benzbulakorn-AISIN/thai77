// Client-side image compression. Re-encoding through <canvas> also drops EXIF (incl. GPS location).
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_INPUT = 25 * 1024 * 1024;
export const MAX_OUTPUT = 5 * 1024 * 1024; // must match bucket limit + memory_photos.size_bytes check

export type Compressed = { blob: Blob; width: number; height: number; mime: 'image/webp' | 'image/jpeg' };

type Decoded = { src: CanvasImageSource; w: number; h: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((res) => c.toBlob(res, type, q));

/** Resize to max 1600 px (long side), encode WebP (JPEG fallback), guarantee <= 5 MB. */
export async function compressImage(file: File, maxSide = 1600): Promise<Compressed> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ');
  if (file.size > MAX_INPUT) throw new Error('รูปใหญ่เกิน 25 MB');
  let d: Decoded;
  try {
    d = await decode(file);
  } catch {
    throw new Error('เปิดรูปนี้ไม่ได้ (ลองใช้รูป JPG หรือ PNG)');
  }
  try {
    let side = maxSide;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, side / Math.max(d.w, d.h));
      const w = Math.max(1, Math.round(d.w * scale));
      const h = Math.max(1, Math.round(d.h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
      ctx.drawImage(d.src, 0, 0, w, h);
      const q = attempt === 0 ? 0.8 : 0.7;
      let blob = await toBlob(canvas, 'image/webp', q);
      let mime: Compressed['mime'] = 'image/webp';
      if (!blob || blob.type !== 'image/webp') {
        blob = await toBlob(canvas, 'image/jpeg', q + 0.05);
        mime = 'image/jpeg';
      }
      if (blob && blob.size > 0 && blob.size <= MAX_OUTPUT) return { blob, width: w, height: h, mime };
      side = Math.round(side * 0.75);
    }
    throw new Error('ย่อรูปไม่สำเร็จ');
  } finally {
    d.close();
  }
}
