import { useState } from 'react';
import { AutoCover } from './AutoCover';
import { REGION_ICONS, regionImageUrl } from '../../features/explore/regionImages';

type Props = { code: string; name: string; color: string; /** no rounded corners (inside a card that already clips) */ square?: boolean; className?: string };

/** Region illustration from public/img/regions (webp -> jpg -> png), or a generated cover when the file is missing. */
export function RegionImage({ code, name, color, square = false, className = '' }: Props) {
  const [attempt, setAttempt] = useState(0);
  const url = regionImageUrl(import.meta.env.BASE_URL, code, attempt);
  if (!url) {
    return <AutoCover seed={`region:${code}`} color={color} icon={REGION_ICONS[code] ?? 'MapPin'} ratio="16/9" rounded={!square} className={className} />;
  }
  return (
    <div className={`relative aspect-video overflow-hidden bg-surface-2 ${square ? '' : 'rounded-xl'} ${className}`}>
      <img src={url} alt={`ภาพประกอบ ภาค${name.replace(/^ภาค/, '')}`} loading="lazy" decoding="async"
        onError={() => setAttempt((a) => a + 1)} className="h-full w-full object-cover" />
      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">ภาพประกอบ</span>
    </div>
  );
}
