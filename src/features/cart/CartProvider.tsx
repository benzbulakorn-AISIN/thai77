import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Place } from '../places/types';

/** Snapshot of a place kept in the Trip Cart (localStorage, works for guests too). */
export type CartItem = {
  id: string;
  name_th: string;
  province_id: string;
  category_id: string;
  lat: number | null;
  lng: number | null;
  suggested_minutes: number | null;
  opening_hours_text: string | null;
  est_cost: number | null;
};

type Ctx = {
  items: CartItem[];
  has: (id: string) => boolean;
  add: (p: Place) => void;
  remove: (id: string) => void;
  toggle: (p: Place) => boolean;
  move: (from: number, to: number) => void;
  clear: () => void;
};

const KEY = 'thai77.cart.v1';
const CartCtx = createContext<Ctx | null>(null);

const read = (): CartItem[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.name_th === 'string') : [];
  } catch {
    return [];
  }
};

export const toCartItem = (p: Place): CartItem => ({
  id: p.id,
  name_th: p.name_th,
  province_id: p.province_id,
  category_id: p.category_id,
  lat: p.lat,
  lng: p.lng,
  suggested_minutes: p.suggested_minutes,
  opening_hours_text: p.opening_hours_text,
  est_cost: p.est_cost_per_person ?? p.fee_thai,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(read);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);
  // sync between tabs
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setItems(read()); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);
  const add = useCallback((p: Place) => setItems((s) => (s.some((i) => i.id === p.id) ? s : [...s, toCartItem(p)].slice(0, 60))), []);
  const remove = useCallback((id: string) => setItems((s) => s.filter((i) => i.id !== id)), []);
  const toggle = useCallback((p: Place) => {
    const on = !items.some((i) => i.id === p.id);
    if (on) add(p); else remove(p.id);
    return on;
  }, [items, add, remove]);
  const move = useCallback((from: number, to: number) => setItems((s) => {
    if (to < 0 || to >= s.length) return s;
    const n = [...s];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    return n;
  }), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, has, add, remove, toggle, move, clear }), [items, has, add, remove, toggle, move, clear]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error('useCart must be inside CartProvider');
  return c;
}
