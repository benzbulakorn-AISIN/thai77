import { useEffect, useState } from 'react';
import { fetchCategories } from '../places/placesApi';
import type { Category } from '../places/types';
import { formatCoords, type LatLng } from '../explore/pin';
import { createMyPlace, type UserPlace } from './userPlacesApi';
import { UserPlaceSheet } from './UserPlaceSheet';

type Props = {
  open: boolean;
  /** the point tapped on the map */
  point: LatLng | null;
  userId: string;
  onClose: () => void;
  onSaved: (place: UserPlace) => void;
};

/** "ปักหมุดเอง": the personal-place form with the tapped coordinates already filled in. */
export function PinPlaceSheet({ open, point, userId, onClose, onSaved }: Props) {
  // loaded up-front (not on open) so the form is not reset while the user is typing
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => { fetchCategories().then(setCats).catch(() => setCats([])); }, []);

  return (
    <UserPlaceSheet
      open={open}
      place={null}
      categories={cats}
      initialCoords={point ? formatCoords(point) : undefined}
      onClose={onClose}
      onSave={async (v) => { onSaved(await createMyPlace(userId, v)); }}
      onDelete={async () => undefined}
    />
  );
}
