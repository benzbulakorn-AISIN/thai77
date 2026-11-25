import { useState } from 'react';
import { AutoCover } from '../../components/ui/AutoCover';
import { creditText, imageAlt, resolveImageUrl, safeHttpsUrl, type PlaceImage } from './imageModel';
import { publicUrlOf } from './placeImagesApi';

const RATIO = { '16/9': '16 / 9', '4/3': '4 / 3', '1/1': '1 / 1', '3/1': '3 / 1' } as const;

type Props = {
  image: PlaceImage | null | undefined;
  placeName: string;
  /** Stable id so the local fallback illustration looks the same every time. */
  seed: string;
  color?: string | null;
  icon?: string | null;
  ratio?: keyof typeof RATIO;
  rounded?: boolean;
  /** first picture on the page: load now instead of lazily */
  eager?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
};

/** A real picture (lazy-loaded, fixed ratio, Thai alt text) or, when there is none / it fails to load, the generated cover. */
export function PlaceImageView({
  image, placeName, seed, color, icon, ratio = '16/9', rounded = true, eager = false, title, subtitle, className = '',
}: Props) {
  const url = image ? resolveImageUrl(image, publicUrlOf) : null;
  const [failed, setFailed] = useState<string | null>(null);

  if (!image || !url || failed === url) {
    return <AutoCover seed={seed} color={color} icon={icon} title={title} subtitle={subtitle} ratio={ratio} rounded={rounded} badge className={className} />;
  }
  return (
    <div style={{ aspectRatio: RATIO[ratio] }} className={`relative isolate w-full overflow-hidden bg-surface-2 ${rounded ? 'rounded-2xl' : ''} ${className}`}>
      <img
        src={url}
        alt={imageAlt(image, placeName)}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(url)}
        className="h-full w-full object-cover"
      />
      {(title || subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
          {title && <p className="truncate text-lg font-bold leading-tight">{title}</p>}
          {subtitle && <p className="truncate text-sm text-white/90">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

/** "ภาพ: ผู้ถ่าย · License" — linked to the source page when there is one */
export function ImageCredit({ image, className = '' }: { image: PlaceImage | null | undefined; className?: string }) {
  if (!image) return null;
  const link = safeHttpsUrl(image.source_url);
  const text = creditText(image);
  return (
    <p className={`text-[11px] leading-snug text-muted ${className}`}>
      {link ? <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="underline">{text}</a> : text}
    </p>
  );
}

/** small square-ish thumbnail (admin list, gallery strip) */
export function PlaceThumb({ image, className = '' }: { image: PlaceImage; className?: string }) {
  const url = resolveImageUrl(image, publicUrlOf);
  return url ? (
    <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <span aria-hidden="true" className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-muted">ไม่มีรูป</span>
  );
}
