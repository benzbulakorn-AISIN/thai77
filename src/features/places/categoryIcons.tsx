import {
  Building2, Camera, Castle, Coffee, Droplets, FerrisWheel, Flower2, Footprints, Landmark, Leaf, MapPin, Moon,
  MoonStar, Mountain, Palette, Palmtree, Sailboat, Ship, Sparkles, Store, Tractor, Trees, Users, UtensilsCrossed, Waves,
  type LucideIcon,
} from 'lucide-react';

// Static map keeps the bundle small (no "import * as icons").
const ICONS: Record<string, LucideIcon> = {
  Building2, Camera, Castle, Coffee, Droplets, FerrisWheel, Flower2, Footprints, Landmark, Leaf, MapPin, Moon,
  MoonStar, Mountain, Palette, Palmtree, Sailboat, Ship, Sparkles, Store, Tractor, Trees, Users, UtensilsCrossed, Waves,
};
export const ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, size = 18, className }: { name?: string | null; size?: number; className?: string }) {
  const I = (name && ICONS[name]) || MapPin;
  return <I size={size} className={className} />;
}
