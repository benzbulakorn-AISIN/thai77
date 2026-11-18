import { Camera, Compass, Luggage, Map, User } from 'lucide-react';
import { t } from '../../i18n/th';

export const NAV_ITEMS = [
  { to: '/', label: t.nav.home, Icon: Map },
  { to: '/explore', label: t.nav.explore, Icon: Compass },
  { to: '/trips', label: t.nav.trips, Icon: Luggage },
  { to: '/memories', label: t.nav.memories, Icon: Camera },
  { to: '/profile', label: t.nav.profile, Icon: User },
] as const;
