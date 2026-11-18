import { useMemo, useState } from 'react';
import { AutoCover } from '../../components/ui/AutoCover';
import { regionColor } from '../covers/regionColors';
import { REGION_ICONS } from '../explore/regionImages';
import { useReference } from '../provinces/useGeoData';
import { dominantRegion } from './tripCoverModel';

type Props = {
  tripId: string;
  name: string;
  provinceIds: string[];
  /** signed URL of the chosen cover picture; null = automatic cover */
  url: string | null;
  ratio?: '1/1' | '16/9';
  className?: string;
};

/** Trip cover: the picture the owner chose, otherwise a generated cover coloured by the trip's main region. */
export function TripCover({ tripId, name, provinceIds, url, ratio = '1/1', className = '' }: Props) {
  const { provinces, regions } = useReference();
  const [failed, setFailed] = useState<string | null>(null);
  const code = useMemo(() => dominantRegion(provinceIds, provinces, regions), [provinceIds, provinces, regions]);

  if (url && failed !== url) {
    return (
      <div style={{ aspectRatio: ratio === '1/1' ? '1 / 1' : '16 / 9' }} className={`relative isolate w-full overflow-hidden rounded-xl bg-surface-2 ${className}`}>
        <img src={url} alt={`ภาพปกทริป ${name}`} loading="lazy" decoding="async" onError={() => setFailed(url)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <AutoCover seed={`trip:${tripId}`} color={code ? regionColor(code) : null} icon={code ? REGION_ICONS[code] ?? 'MapPin' : 'MapPin'}
      title={undefined} ratio={ratio} className={`rounded-xl ${className}`} />
  );
}
