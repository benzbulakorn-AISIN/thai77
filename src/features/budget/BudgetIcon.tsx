import {
  BedDouble, Bus, Car, Coffee, Fuel, Gift, Milestone, ShieldAlert, SquareParking, Tent, Ticket, UtensilsCrossed, Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  BedDouble, Bus, Car, Coffee, Fuel, Gift, Milestone, ShieldAlert, SquareParking, Tent, Ticket, UtensilsCrossed, Wallet,
};

export function BudgetIcon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const I = (name && ICONS[name]) || Wallet;
  return <I size={size} />;
}
