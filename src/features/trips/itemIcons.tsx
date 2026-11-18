import { BedDouble, Coffee, Flag, Hourglass, MapPin, Navigation, Sparkles, UtensilsCrossed, Fuel, type LucideIcon } from 'lucide-react';
import type { TripItemType } from './types';

const ICON: Record<TripItemType, LucideIcon> = {
  place: MapPin, meal: UtensilsCrossed, cafe: Coffee, lodging: BedDouble, rest_stop: Fuel,
  custom: Sparkles, free_time: Hourglass, depart: Navigation, arrive: Flag,
};
export const ITEM_COLOR: Record<TripItemType, string> = {
  place: '#0369A1', meal: '#DC2626', cafe: '#78350F', lodging: '#0F766E', rest_stop: '#475569',
  custom: '#9333EA', free_time: '#CA8A04', depart: '#334155', arrive: '#334155',
};
export function ItemIcon({ type, size = 18 }: { type: TripItemType; size?: number }) {
  const I = ICON[type] ?? MapPin;
  return <I size={size} />;
}
