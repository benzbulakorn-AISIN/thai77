import { Link } from 'react-router-dom';
import { Clock, Navigation, Wallet } from 'lucide-react';
import { CategoryIcon } from './categoryIcons';
import { VerificationBadge } from './VerificationBadge';
import { StatusControl } from './StatusControl';
import type { Category, MyPlaceState, Place, UserStatus } from './types';

type Props = {
  place: Place;
  category?: Category;
  districtName?: string;
  distanceKm?: number | null;
  state: MyPlaceState;
  signedIn: boolean;
  onStatus: (s: UserStatus) => Promise<void>;
  onFavorite: () => Promise<boolean>;
  highlighted?: boolean;
};

const baht = (n: number) => `฿${n.toLocaleString('th-TH')}`;

export function PlaceCard({ place, category, districtName, distanceKm, state, signedIn, onStatus, onFavorite, highlighted }: Props) {
  const color = category?.color ?? '#64748B';
  const cost = place.est_cost_per_person ?? place.fee_thai;
  return (
    <article id={`place-${place.id}`}
      className={`rounded-2xl border bg-surface p-3 transition ${highlighted ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
      <Link to={`/place/${place.id}`} className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
          <CategoryIcon name={category?.icon} size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{place.name_th}</h3>
          <p className="truncate text-xs text-muted">
            {category?.name_th ?? 'ไม่ระบุหมวด'}{districtName ? ` · ${districtName}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {place.suggested_minutes != null && <span className="inline-flex items-center gap-1"><Clock size={12} /> ~{place.suggested_minutes} นาที</span>}
            {cost != null && <span className="inline-flex items-center gap-1"><Wallet size={12} /> {cost === 0 ? 'ฟรี' : baht(cost)}</span>}
            {distanceKm != null && <span className="inline-flex items-center gap-1"><Navigation size={12} /> ~{distanceKm.toFixed(0)} กม. (เส้นตรง)</span>}
            <VerificationBadge place={place} small />
          </div>
        </div>
      </Link>
      {place.short_description && <p className="mt-2 line-clamp-2 text-sm">{place.short_description}</p>}
      <div className="mt-3">
        <StatusControl compact state={state} signedIn={signedIn} onStatus={onStatus} onFavorite={onFavorite} />
      </div>
    </article>
  );
}
