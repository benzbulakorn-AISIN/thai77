import { Check, Plus } from 'lucide-react';
import { useCart } from './CartProvider';
import { useToast } from '../../components/ui/Toast';
import type { Place } from '../places/types';

/** "+ ใส่ทริป" toggle used on place cards and the place detail page. */
export function CartButton({ place, compact = false, iconOnly = false }: { place: Place; compact?: boolean; iconOnly?: boolean }) {
  const cart = useCart();
  const toast = useToast();
  const inCart = cart.has(place.id);
  return (
    <button type="button" aria-pressed={inCart}
      onClick={(e) => {
        e.stopPropagation();
        const on = cart.toggle(place);
        toast(on ? `ใส่ทริปแล้ว (${cart.items.length + 1})` : 'เอาออกจากตะกร้าแล้ว', on ? 'success' : 'info');
        if (on && place.lat == null) toast('สถานที่นี้ยังไม่มีพิกัด จะจัดเส้นทางให้ไม่ได้', 'info');
      }}
      aria-label={inCart ? 'เอาออกจากทริป' : 'ใส่ทริป'}
      title={inCart ? 'เอาออกจากทริป' : 'ใส่ทริป'}
      className={`inline-flex ${iconOnly ? 'h-9 w-9 p-0' : compact ? 'min-h-10 px-3 text-xs' : 'min-h-12 px-4 text-sm'} shrink-0 items-center justify-center gap-1 rounded-xl border font-medium
        ${inCart ? 'border-green-600 bg-green-600 text-white' : 'border-primary text-primary'}`}>
      {inCart ? <Check size={compact ? 16 : 18} /> : <Plus size={compact ? 16 : 18} />}
      {!iconOnly && (inCart ? 'ในทริป' : 'ใส่ทริป')}
    </button>
  );
}
