import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Luggage } from 'lucide-react';
import { useCart } from './CartProvider';

/** Floating bar above the bottom nav while the cart has items. */
export function CartBar() {
  const { items } = useCart();
  const { pathname } = useLocation();
  if (!items.length || pathname.startsWith('/cart') || pathname.startsWith('/trips/') || pathname.startsWith('/auth')) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[550] px-3 pb-2 lg:bottom-4 lg:left-60">
      <Link to="/cart"
        className="pointer-events-auto mx-auto flex min-h-12 max-w-md items-center gap-3 rounded-2xl bg-primary px-4 text-on-primary shadow-lg">
        <Luggage size={20} />
        <span className="flex-1 font-medium">ในตะกร้า {items.length} แห่ง</span>
        <span className="inline-flex items-center gap-1 text-sm">ดูตะกร้า <ArrowRight size={16} /></span>
      </Link>
    </div>
  );
}
