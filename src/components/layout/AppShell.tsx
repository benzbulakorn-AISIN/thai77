import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MapPinned, WifiOff } from 'lucide-react';
import { NAV_ITEMS } from './navItems';
import { t } from '../../i18n/th';
import { env } from '../../lib/env';
import { useCart } from '../../features/cart/CartProvider';
import { CartBar } from '../../features/cart/CartBar';

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

const Badge = ({ n }: { n: number }) =>
  n > 0 ? <span className="absolute -right-2 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{n}</span> : null;

export function AppShell() {
  const online = useOnline();
  const { items } = useCart();
  return (
    <div className="min-h-dvh bg-bg text-fg lg:flex">
      {/* Desktop side nav */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface p-4 lg:block">
        <div className="mb-6 flex items-center gap-2 text-lg font-bold text-primary">
          <MapPinned /> {t.appName}
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-3 ${isActive ? 'bg-primary text-on-primary' : 'hover:bg-surface-2'}`}>
              <span className="relative"><Icon size={20} />{to === '/trips' && <Badge n={items.length} />}</span> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[500] flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <MapPinned className="text-primary" size={22} />
          <span className="font-bold">{t.appName}</span>
        </header>
        {!online && (
          <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm text-black">
            <WifiOff size={16} /> {t.common.offline}
          </div>
        )}
        {!env.isConfigured && (
          <div className="bg-red-600 px-4 py-2 text-sm text-white">
            ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
          </div>
        )}
        <main className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-4 lg:pb-8 ${items.length ? 'pb-44 lg:pb-24' : 'pb-28'}`}>
          <Outlet />
        </main>
      </div>

      <CartBar />

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-[500] grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'text-primary' : 'text-muted')}>
            <span className="flex h-16 flex-col items-center justify-center gap-1 text-xs">
              <span className="relative"><Icon size={22} />{to === '/trips' && <Badge n={items.length} />}</span> {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
