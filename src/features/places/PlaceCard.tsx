import { Link } from 'react-router-dom';
import { Clock, Navigation, Wallet } from 'lucide-react';
import { CategoryIcon } from './categoryIcons';
import { VerificationBadge } from './VerificationBadge';
import { StatusControl } from './StatusControl';
import { CartButton } from '../cart/CartButton';
import { ImageCredit, PlaceImageView } from '../placeImages/PlaceImage';
import type { PlaceImage } from '../placeImages/imageModel';
import type { Category, MyPlaceState, Place, UserStatus } from './types';

type Props = {
  place: Place;
  category?: Category;
  districtName?: string;
  distanceKm?: number | null;
  /** cover picture (undefined / null = generated cover) */
  cover?: PlaceImage | null;
  state: MyPlaceState;
  signedIn: boolean;
  onStatus: (s: UserStatus) => Promise<void>;
  onFavorite: () => Promise<boolean>;
  highlighted?: boolean;
};

const baht = (n: number) => `฿${n.toLocaleString('th-TH')}`;

export function PlaceCard({ place, category, districtName, distanceKm, cover, state, signedIn, onStatus, onFavorite, highlighted }: Props) {
  const cost = place.est_cost_per_person ?? place.fee_thai;
  return (
    <article id={`place-${place.id}`}
      className={`overflow-hidden rounded-2xl border bg-surface transition ${highlighted ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
      <Link to={`/place/${place.id}`} tabIndex={-1} aria-hidden="true" className="block">
        <PlaceImageView image={cover} placeName={place.name_th} seed={place.id} color={category?.color} icon={category?.icon} ratio="16/9" rounded={false} />
      </Link>
      {cover && <ImageCredit image={cover} className="px-3 pt-1" />}
      <div className="p-3">
        {place.is_landmark && place.landmark_status === 'published' && (
          <p className="mb-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
            Landmark หลัก · อันดับ {place.landmark_rank ?? 1}
          </p>
        )}
        <div className="flex items-start gap-3">
          <Link to={`/place/${place.id}`} className="min-w-0 flex-1">
            <h3 className="font-semibold leading-snug">{place.name_th}</h3>
            <p className="flex items-center gap-1 text-xs text-muted">
              <span style={{ color: category?.color }}><CategoryIcon name={category?.icon} size={13} /></span>
              <span className="truncate">{category?.name_th ?? 'ไม่ระบุหมวด'}{districtName ? ` · ${districtName}` : ''}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {place.suggested_minutes != null && <span className="inline-flex items-center gap-1"><Clock size={12} /> ~{place.suggested_minutes} นาที</span>}
              {cost != null && <span className="inline-flex items-center gap-1"><Wallet size={12} /> {cost === 0 ? 'ฟรี' : baht(cost)}</span>}
              {distanceKm != null && <span className="inline-flex items-center gap-1"><Navigation size={12} /> ~{distanceKm.toFixed(0)} กม. (เส้นตรง)</span>}
              <VerificationBadge place={place} small />
            </div>
          </Link>
          <CartButton place={place} compact />
        </div>
        {place.short_description && <p className="mt-2 line-clamp-2 text-sm">{place.short_description}</p>}
        <div className="mt-3">
          <StatusControl compact state={state} signedIn={signedIn} onStatus={onStatus} onFavorite={onFavorite} />
        </div>
      </div>
    </article>
  );
}
